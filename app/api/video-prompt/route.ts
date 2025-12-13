import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { Region } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI is not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const recipeText = (body?.recipeText ?? "").trim();
  const people = (body?.people ?? "").trim();
  const region = body?.region as Region | undefined;

  if (!recipeText || !people || !region) {
    return NextResponse.json(
      { error: "recipeText, people, and region are required" },
      { status: 400 },
    );
  }

  const regionalFlavor =
    region === "US"
      ? "Use slightly faster pacing and bolder on-screen text."
      : region === "Europe"
        ? "Use balanced pacing and a subtle, warm aesthetic."
        : "Use slightly faster cuts and dynamic plating shots.";

  const systemPrompt = `
You are a precise video director crafting a cooking video prompt for a HelloFresh-style brand.
- Initially show a HelloFresh-like green lemon logo.
- Then show all ingredients laid out on one table.
- Then show the cooking steps clearly with minimal cuts.
- At the end show happy, fulfilled people enjoying the meal.
- Match the exact ingredients and steps from the provided recipe.
- Region: ${region}. ${regionalFlavor}
- Keep tone upbeat, vivid, and food-forward. Output only the video prompt text.`;

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Recipe:\n${recipeText}\n\nPeople to show: ${people}\nRegion: ${region}`,
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_PROMPT_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      messages,
    });

    const videoPrompt = completion.choices[0]?.message?.content?.trim();

    if (!videoPrompt) {
      return NextResponse.json(
        { error: "Failed to generate video prompt" },
        { status: 500 },
      );
    }

    return NextResponse.json({ videoPrompt });
  } catch (error: any) {
    console.error("video-prompt error", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to generate video prompt" },
      { status: 500 },
    );
  }
}
