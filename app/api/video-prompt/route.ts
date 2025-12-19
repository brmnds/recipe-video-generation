import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { Region } from "@/lib/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

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
You are a precise video director crafting a cooking video prompt for a HEALTHYFRESH-style brand AND a concise recipe title.
- Initially show a HEALTHYFRESH-like green leaf logo.
- Then show all ingredients laid out on one table.
- Then show the cooking steps clearly with minimal cuts.
- At the end show happy, fulfilled people enjoying the meal.
- Match the exact ingredients and steps from the provided recipe.
- Region: ${region}. ${regionalFlavor}
- Keep tone upbeat, vivid, and food-forward.
Output two fields as plain text:
Title: <a short 3-8 word recipe title>
Prompt: <the full video prompt text>`;

  const messages: ChatCompletionMessageParam[] = [
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

    const content = completion.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "Failed to generate video prompt" },
        { status: 500 },
      );
    }

    const title = content.match(/Title:\s*(.+)/i)?.[1]?.trim() ?? "Untitled Recipe";
    const promptMatch = content.match(/Prompt:\s*([\s\S]+)/i);
    const videoPrompt = (promptMatch?.[1] ?? content).trim();

    return NextResponse.json({ videoPrompt, title });
  } catch (error: any) {
    console.error("video-prompt error", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to generate video prompt" },
      { status: 500 },
    );
  }
}
