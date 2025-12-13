/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  GenerateVideoResponse,
  Region,
  VideoGenerationRow,
} from "@/lib/types";

type StepState = "idle" | "loading" | "done";

const regions: Region[] = ["US", "Europe", "Asia"];
const MAX_VIDEO_SECONDS = 150;

const initialSteps = {
  prompt: "idle" as StepState,
  generating: "idle" as StepState,
  uploading: "idle" as StepState,
  done: "idle" as StepState,
};

export default function Home() {
  const [recipeText, setRecipeText] = useState("");
  const [people, setPeople] = useState("Couple cooking");
  const [region, setRegion] = useState<Region>("US");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [steps, setSteps] = useState(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<VideoGenerationRow[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    void fetchHistory();
  }, []);

  useEffect(() => {
    if (!generationStartedAt) {
      setElapsedSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSeconds(
        Math.min(MAX_VIDEO_SECONDS, Math.floor((Date.now() - generationStartedAt) / 1000)),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [generationStartedAt]);

  const canGeneratePrompt = useMemo(
    () => recipeText.trim().length > 0 && people.trim().length > 0 && !loadingPrompt,
    [recipeText, people, loadingPrompt],
  );

  const canGenerateVideo = useMemo(
    () => videoPrompt.trim().length > 0 && !loadingVideo,
    [videoPrompt, loadingVideo],
  );

  async function fetchHistory() {
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch (err) {
      console.error("history fetch failed", err);
    }
  }

  async function handleGeneratePrompt() {
    if (!canGeneratePrompt) return;
    setError(null);
    setLoadingPrompt(true);
    setSteps({ ...initialSteps, prompt: "loading" });

    try {
      const res = await fetch("/api/video-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeText, people, region }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "Failed to generate prompt");
      }

      const data = await res.json();
      setVideoPrompt(data.videoPrompt);
      setSteps((prev) => ({ ...prev, prompt: "done" }));
      setShowPromptModal(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Something went wrong generating the prompt.");
      setSteps(initialSteps);
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function handleConfirmGenerate() {
    if (!canGenerateVideo) return;
    setError(null);
    setShowPromptModal(false);
    setLoadingVideo(true);
    setGenerationStartedAt(Date.now());
    setSteps({
      prompt: "done",
      generating: "loading",
      uploading: "idle",
      done: "idle",
    });

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeText, people, region, videoPrompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "Video generation failed");
      }

      const data: GenerateVideoResponse = await res.json();
      setSteps({
        prompt: "done",
        generating: "done",
        uploading: "done",
        done: "done",
      });
      setElapsedSeconds(0);
      setGenerationStartedAt(null);
      setCurrentVideoUrl(data.videoUrl);
      setSelectedHistoryId(data.dbId);
      const optimisticRow: VideoGenerationRow = {
        id: data.dbId,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        recipe_text: recipeText,
        people,
        region,
        video_prompt: videoPrompt,
        openai_video_id: data.openaiVideoId,
        status: "completed",
        error_message: null,
        supabase_path: data.supabasePath,
        video_url: data.videoUrl,
      };
      setHistory((prev) => {
        const withoutDupes = prev.filter((p) => p.id !== data.dbId);
        return [optimisticRow, ...withoutDupes].slice(0, 5);
      });
      await fetchHistory();
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Video generation failed.");
      setSteps((prev) => ({ ...prev, generating: "idle" }));
    } finally {
      setLoadingVideo(false);
    }
  }

  function handleSelectHistory(item: VideoGenerationRow) {
    setSelectedHistoryId(item.id);
    setRecipeText(item.recipe_text);
    setPeople(item.people);
    setRegion(item.region as Region);
    setVideoPrompt(item.video_prompt);
    setCurrentVideoUrl(item.video_url);
    setSteps({
      prompt: "done",
      generating: item.status === "completed" ? "done" : "idle",
      uploading: item.status === "completed" ? "done" : "idle",
      done: item.status === "completed" ? "done" : "idle",
    });
  }

  function statusBadge(state: StepState) {
    if (state === "done") {
      return <span className="text-hfGreen">●</span>;
    }
    if (state === "loading") {
      return <span className="animate-pulse text-hfDark">●</span>;
    }
    return <span className="text-gray-300">●</span>;
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-hfGreen/90 shadow-soft flex items-center justify-center text-white font-bold">
          🍋
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-hfDark/70">HelloFresh</p>
          <h1 className="text-3xl font-bold text-hfDark">
            Cooking Video POC
          </h1>
        </div>
      </header>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-hfDark">Recipe Inputs</h2>
          <div className="space-y-2">
            <label className="text-sm text-hfDark/80">Recipe (full text)</label>
            <textarea
              className="w-full min-h-[180px] rounded-xl border border-gray-200 bg-hfLight/60 px-3 py-3 focus:outline-none focus:ring-2 focus:ring-hfGreen"
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
              placeholder="Paste the full recipe including ingredients and steps..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-hfDark/80">Who should be shown</label>
            <input
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-hfGreen"
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              placeholder="e.g., couple cooking, family cooking"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-hfDark/80">Region</label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-hfGreen"
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleGeneratePrompt}
              disabled={!canGeneratePrompt}
              className="btn-primary"
            >
              {loadingPrompt ? "Creating prompt..." : "Generate cooking video"}
            </button>
            {error && (
              <span className="text-sm text-red-600 self-center">{error}</span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-hfDark mb-4">Status</h2>
            <div className="space-y-3">
              <Step label="Prompt created" state={steps.prompt} badge={statusBadge(steps.prompt)} />
              <Step
                label="Video generating"
                state={steps.generating}
                badge={statusBadge(steps.generating)}
              />
              <Step
                label="Uploading"
                state={steps.uploading}
                badge={statusBadge(steps.uploading)}
              />
              <Step label="Done" state={steps.done} badge={statusBadge(steps.done)} />
            </div>
            {(steps.generating === "loading" || steps.uploading === "loading") && (
              <div className="mt-4 flex items-center gap-3 p-3 border border-hfGreen/30 rounded-xl bg-hfLight">
                <div className="spinner" />
                <div>
                  <p className="font-semibold text-hfDark">
                    Video generation in progress (up to {MAX_VIDEO_SECONDS}s)
                  </p>
                  <p className="text-xs text-gray-600">
                    Elapsed: {elapsedSeconds}s — we’ll poll until ready; you can keep this page open.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold text-hfDark mb-3">Preview</h2>
            {currentVideoUrl ? (
              <video
                controls
                className="w-full rounded-xl border border-gray-200"
                src={currentVideoUrl}
              />
            ) : (
              <p className="text-sm text-hfDark/70">
                Generate a video to see it here.
              </p>
            )}
          </div>

          <div className="card p-6">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-semibold text-hfDark">History</h2>
              <button
                onClick={() => void fetchHistory()}
                className="text-sm text-hfGreen font-semibold"
              >
                Refresh
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-hfDark/70">No videos yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectHistory(item)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                      selectedHistoryId === item.id
                        ? "border-hfGreen bg-hfLight"
                        : "border-gray-200 hover:bg-hfLight/60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{item.people}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      {item.region} · {item.status}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {showPromptModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="card p-6 w-full max-w-2xl relative">
            <h3 className="text-lg font-semibold text-hfDark mb-3">
              Review video prompt
            </h3>
            <textarea
              className="w-full min-h-[220px] rounded-xl border border-gray-200 bg-hfLight/60 px-3 py-3 focus:outline-none focus:ring-2 focus:ring-hfGreen"
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowPromptModal(false);
                }}
                disabled={loadingVideo}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => void handleConfirmGenerate()}
                disabled={!canGenerateVideo}
              >
                {loadingVideo ? "Generating video..." : "Confirm and generate video"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Step({
  label,
  state,
  badge,
}: {
  label: string;
  state: StepState;
  badge: ReactNode;
}) {
  const subtitle =
    state === "loading"
      ? "In progress..."
      : state === "done"
        ? "Completed"
        : "Waiting";

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
      <div>
        <p className="font-semibold text-hfDark">{label}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="text-lg">{badge}</div>
    </div>
  );
}
