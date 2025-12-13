import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseServerClient) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseServerClient
    .from("video_generations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to fetch history" },
      { status: 500 },
    );
  }

  return NextResponse.json({ history: data });
}
