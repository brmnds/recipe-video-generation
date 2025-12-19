/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  GenerateVideoResponse,
  HistoryResponse,
  Region,
  VideoGenerationRow,
} from "@/lib/types";

type StepState = "idle" | "loading" | "done";

const regions: Region[] = ["US", "Europe", "Asia"];
const MAX_VIDEO_SECONDS = 200;
const HISTORY_PAGE_SIZE = 5;

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
  const [title, setTitle] = useState("Untitled Recipe");
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
  const [showRecipeModal, setShowRecipeModal] = useState<{
    open: boolean;
    title: string;
    recipe: string;
  }>({ open: false, title: "", recipe: "" });
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [editHistory, setEditHistory] = useState<boolean>(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchHistory(1);
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

  async function fetchHistory(page = historyPage) {
    try {
      const res = await fetch(
        `/api/history?limit=${HISTORY_PAGE_SIZE}&page=${page}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data: HistoryResponse = await res.json();
      setHistory(data.history ?? []);
      setHistoryTotal(data.total ?? data.history?.length ?? 0);
      setHistoryPage(page);
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
      if (data.title) setTitle(data.title);
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
        body: JSON.stringify({ recipeText, people, region, videoPrompt, title }),
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
        title,
        recipe_text: recipeText,
        people,
        region,
        video_prompt: videoPrompt,
        openai_video_id: data.openaiVideoId,
        status: data.status ?? "completed",
        error_message: null,
        supabase_path: data.supabasePath,
        video_url: data.videoUrl,
      };
      setHistory((prev) => {
        const withoutDupes = prev.filter((p) => p.id !== data.dbId);
        return [optimisticRow, ...withoutDupes].slice(0, HISTORY_PAGE_SIZE);
      });
      setHistoryTotal((prev) => prev + 1);
      setHistoryPage(1);
      await fetchHistory(1);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Video generation failed.");
      setElapsedSeconds(0);
      setGenerationStartedAt(null);
      setSteps((prev) => ({ ...prev, generating: "idle" }));
    } finally {
      setLoadingVideo(false);
      void fetchHistory(historyPage);
    }
  }

  function handleSelectHistory(item: VideoGenerationRow) {
    setSelectedHistoryId(item.id);
    setTitle(item.title ?? "Untitled Recipe");
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

  async function handleDeleteHistory(id: string) {
    try {
      setPendingDeleteIds((prev) => new Set(prev).add(id));
      const res = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { my  = eval { decode_json(do { local ; <STDIN> }); }; }
      const newTotal = Math.max(0, historyTotal - 1);
      const maxPage = Math.max(1, Math.ceil(newTotal / HISTORY_PAGE_SIZE));
      const nextPage = Math.min(historyPage, maxPage);
      setHistoryTotal(newTotal);
      await fetchHistory(nextPage);
    } catch (err) {
      console.error(err);
      setError("Could not delete history entry.");
    } finally {
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  function canGoPrev() {
    return historyPage > 1;
  }

  function canGoNext() {
    return historyPage < totalPages;
  }

  function handlePageChange(next: number) {
    const clamped = Math.min(Math.max(1, next), totalPages);
    void fetchHistory(clamped);
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
          🍃
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-hfDark/70">HEALTHYFRESH</p>
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void fetchHistory(historyPage)}
                  className="text-sm text-hfGreen font-semibold"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setEditHistory((prev) => !prev)}
                  className="text-sm text-hfGreen font-semibold flex items-center gap-1"
                >
                  ✏️ {editHistory ? "Done" : "Edit"}
                </button>
              </div>
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
                    <div className="mt-1">
                      <button
                        className="text-xs text-hfGreen font-semibold underline"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowRecipeModal({
                            open: true,
                            title: item.title ?? "Recipe",
                            recipe: item.recipe_text,
                          });
                        }}
                      >
                        Show recipe
                      </button>
                      {editHistory && (
                        <button
                          className="ml-3 text-xs text-red-600 font-semibold underline disabled:opacity-60"
                          type="button"
                          disabled={pendingDeleteIds.has(item.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteHistory(item.id);
                          }}
                        >
                          {pendingDeleteIds.has(item.id) ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between text-sm text-hfDark/80">
              <div>
                Page {historyPage} / {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary px-3 py-1 text-sm"
                  disabled={!canGoPrev()}
                  onClick={() => handlePageChange(historyPage - 1)}
                >
                  Prev
                </button>
                <button
                  className="btn-secondary px-3 py-1 text-sm"
                  disabled={!canGoNext()}
                  onClick={() => handlePageChange(historyPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
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
      {showRecipeModal.open && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="card p-6 w-full max-w-2xl relative">
            <h3 className="text-lg font-semibold text-hfDark mb-3">{showRecipeModal.title}</h3>
            <div className="text-sm whitespace-pre-wrap text-hfDark/80 max-h-[50vh] overflow-auto border border-gray-200 rounded-xl p-3 bg-hfLight/60">
              {showRecipeModal.recipe}
            </div>
            <div className="flex justify-end mt-4">
              <button
                className="btn-secondary"
                onClick={() => setShowRecipeModal({ open: false, title: "", recipe: "" })}
              >
                Close
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
