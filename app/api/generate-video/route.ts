import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServer";
import { Region, VideoStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_POLL_INTERVAL_MS = 2000;
const VIDEO_POLL_TIMEOUT_MS = 3 * 60 * 1000;

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

  if (!recipeText || !people || !region || !videoPrompt) {
    return NextResponse.json(
      { error: "recipeText, people, region, and videoPrompt are required" },
      { status: 400 },
    );
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "openai-hellofresh";
  const videoModel = process.env.OPENAI_VIDEO_MODEL ?? "sora-2";
  const videoSize = process.env.OPENAI_VIDEO_SIZE ?? "1280x720";
  // API expects enumerated seconds; default to 12 if not set.
  const videoSeconds = Number(process.env.OPENAI_VIDEO_SECONDS ?? "12");
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

    const contentRes = await fetch(
      `https://api.openai.com/v1/videos/${openaiVideoId}/content`,
      { headers },
    );
    const downloadRes =
      contentRes.ok || !videoUrl
        ? contentRes
        : await fetch(videoUrl).catch(() => contentRes); // fallback to provided URL if any

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
