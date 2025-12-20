import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!supabaseServerClient) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit")) || 5));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { count, error: countError } = await supabaseServerClient
    .from("video_generations")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json(
      { error: countError.message ?? "Failed to fetch history count" },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseServerClient
    .from("video_generations")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to fetch history" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { history: data ?? [], total: count ?? data?.length ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(req: NextRequest) {
  if (!supabaseServerClient) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const id = (body?.id ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 },
    );
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "openai-hellofresh";

  const { data: row, error: selectError } = await supabaseServerClient
    .from("video_generations")
    .select("supabase_path")
    .eq("id", id)
    .single();

  if (selectError) {
    return NextResponse.json(
      { error: selectError.message ?? "Failed to find row" },
      { status: 404 },
    );
  }

  if (row?.supabase_path) {
    const { error: removeError } = await supabaseServerClient.storage
      .from(bucket)
      .remove([row.supabase_path]);
    if (removeError) {
      console.error("Storage remove failed", removeError);
    }
  }

  const { error: deleteError } = await supabaseServerClient
    .from("video_generations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message ?? "Failed to delete history entry" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
