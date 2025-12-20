import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServer";
import { Region, VideoStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_POLL_INTERVAL_MS = 2000;
const VIDEO_POLL_TIMEOUT_MS = 4 * 60 * 1000; // allow a bit more time for long renders
const VIDEO_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000; // wait longer for content endpoint to become ready
const VIDEO_DOWNLOAD_RETRY_MS = 5000;

type UpdateFields = Partial<{
  status: VideoStatus;
  openai_video_id: string | null;
  supabase_path: string | null;
  video_url: string | null;
  error_message: string | null;
  completed_at: string | null;
}>;

async function updateRow(id: string, fields: UpdateFields) {
  if (!supabaseServerClient) return;
  await supabaseServerClient
    .from("video_generations")
    .update(fields)
    .eq("id", id);
}

export async function POST(req: NextRequest) {
  if (!supabaseServerClient) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const recipeText = (body?.recipeText ?? "").trim();
  const people = (body?.people ?? "").trim();
  const region = body?.region as Region | undefined;
  const videoPrompt = (body?.videoPrompt ?? "").trim();
  const title = (body?.title ?? "").trim();

  if (!recipeText || !people || !region || !videoPrompt || !title) {
    return NextResponse.json(
      { error: "recipeText, people, region, title, and videoPrompt are required" },
      { status: 400 },
    );
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "openai-hellofresh";
  const videoModel = process.env.OPENAI_VIDEO_MODEL ?? "sora-2";

  const allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"] as const;
  const allowedSeconds = ["4", "8", "12"] as const;
  const envSize = process.env.OPENAI_VIDEO_SIZE;
  const envSeconds = process.env.OPENAI_VIDEO_SECONDS;
  const videoSize = allowedSizes.includes(envSize as any) ? envSize! : "1280x720";
  const videoSeconds = allowedSeconds.includes(envSeconds as any) ? envSeconds! : "12";
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is missing" },
      { status: 500 },
    );
  }

  const { data: insertData, error: insertError } = await supabaseServerClient
    .from("video_generations")
    .insert({
      recipe_text: recipeText,
      people,
      region,
      video_prompt: videoPrompt,
      title,
      status: "queued",
    })
    .select()
    .single();

  if (insertError || !insertData) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to insert row" },
      { status: 500 },
    );
  }

  const dbId = insertData.id as string;

  const headers = {
    Authorization: `Bearer ${openaiApiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const createRes = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: videoModel,
        prompt: videoPrompt,
        size: videoSize,
        seconds: videoSeconds,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("OpenAI video create failed", {
        status: createRes.status,
        body: errText,
      });
      await updateRow(dbId, { status: "failed", error_message: errText });
      return NextResponse.json(
        { error: "OpenAI video creation failed", details: errText },
        { status: 500 },
      );
    }

    const createJson = await createRes.json();
    const openaiVideoId = createJson.id as string | undefined;

    if (!openaiVideoId) {
      await updateRow(dbId, {
        status: "failed",
        error_message: "OpenAI did not return a video id",
      });
      return NextResponse.json(
        { error: "OpenAI did not return a video id" },
        { status: 500 },
      );
    }

    await updateRow(dbId, { status: "generating", openai_video_id: openaiVideoId });

    const start = Date.now();
    let videoUrl: string | null = null;
    let lastStatus: string | undefined = undefined;
    let errorMessage: string | undefined = undefined;

    while (Date.now() - start < VIDEO_POLL_TIMEOUT_MS) {
      const pollRes = await fetch(
        `https://api.openai.com/v1/videos/${openaiVideoId}`,
        { headers },
      );

      if (!pollRes.ok) {
        errorMessage = await pollRes.text();
        console.error("OpenAI video poll failed", {
          status: pollRes.status,
          body: errorMessage,
        });
        lastStatus = "failed";
        break;
      }

      const pollJson = await pollRes.json();
      lastStatus = pollJson?.status;

      if (lastStatus === "completed") {
        videoUrl =
          pollJson?.video?.url ??
          pollJson?.output?.[0]?.url ??
          pollJson?.output_url ??
          pollJson?.url ??
          null;
        break;
      }

      if (lastStatus === "failed") {
        errorMessage =
          pollJson?.error?.message ?? "OpenAI video generation failed.";
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
    }

    if (!videoUrl && lastStatus === "completed") {
      console.warn("Video completed but URL missing; will try content endpoint directly.");
    }

    // Try to download; if content endpoint returns not ready (e.g., 404), retry for up to the timeout.
    let downloadRes: Response | null = null;
    const downloadStart = Date.now();
    while (Date.now() - downloadStart < VIDEO_DOWNLOAD_TIMEOUT_MS) {
      const contentRes = await fetch(
        `https://api.openai.com/v1/videos/${openaiVideoId}/content`,
        { headers },
      );
      if (contentRes.ok) {
        downloadRes = contentRes;
        break;
      }
      // If content endpoint not ready, try provided videoUrl (if any)
      if (videoUrl) {
        const fallback = await fetch(videoUrl).catch(() => null);
        if (fallback?.ok) {
          downloadRes = fallback;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, VIDEO_DOWNLOAD_RETRY_MS));
    }

    if (!downloadRes) {
      const waitedSeconds = Math.round((Date.now() - downloadStart) / 1000);
      const msg = `Video download not ready after waiting ${waitedSeconds}s. The job may still be processing—please try again shortly.`;
      await updateRow(dbId, { status: "failed", error_message: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    if (!downloadRes.ok) {
      const errText = await downloadRes.text();
      console.error("Video download failed", {
        status: downloadRes.status,
        body: errText,
      });
      await updateRow(dbId, { status: "failed", error_message: errText });
      return NextResponse.json(
        { error: "Failed to download video", details: errText },
        { status: 500 },
      );
    }
    const buffer = Buffer.from(await downloadRes.arrayBuffer());

    await updateRow(dbId, { status: "uploading" });
    const path = `${dbId}/${openaiVideoId}.mp4`;
    const { error: uploadError } = await supabaseServerClient.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      await updateRow(dbId, { status: "failed", error_message: uploadError.message });
      return NextResponse.json(
        { error: "Failed to upload video to Supabase", details: uploadError.message },
        { status: 500 },
      );
    }

    const publicUrl = supabaseServerClient.storage
      .from(bucket)
      .getPublicUrl(path).data.publicUrl;

    await updateRow(dbId, {
      status: "completed",
      supabase_path: path,
      video_url: publicUrl,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      dbId,
      status: "completed",
      videoUrl: publicUrl,
      openaiVideoId,
      supabasePath: path,
    });
  } catch (error: any) {
    console.error("generate-video error", error);
    await updateRow(dbId, { status: "failed", error_message: error?.message });
    return NextResponse.json(
      { error: error?.message ?? "Video generation failed" },
      { status: 500 },
    );
  }
}
