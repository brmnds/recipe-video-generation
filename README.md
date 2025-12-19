# HEALTHYFRESH Cooking Video POC

A one-page Next.js app that turns a pasted recipe into a generated cooking video via OpenAI Video (Sora) and stores results in Supabase (DB + Storage). Features prompt review, step tracker with spinner + elapsed timer, preview, and history (immediate optimistic insert + refresh).

## What it does
- Accepts recipe text, “who should be shown”, and region (US/Europe/Asia).
- Generates a region-aware video prompt (OpenAI text model) and lets you edit/confirm it.
- Creates a Sora video job (size/seconds per API limits), polls until complete, downloads the MP4, uploads to Supabase Storage, and writes a DB row.
- Shows status with spinner and elapsed seconds (up to 150s), then plays the video and lists it in History (last 5, clickable to reload).

## Prerequisites
- Supabase project with bucket `openai-hellofresh` set to public.
- Run `supabase/schema.sql` in Supabase to create the table/indexes.
- Node.js 18+ recommended.

## Setup
1) Install deps  
```bash
npm install
```

2) Configure env  
```bash
cp .env.local.example .env.local
# Fill: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
# Optional: OPENAI_VIDEO_SIZE (720x1280 | 1280x720 | 1024x1792 | 1792x1024)
# Optional: OPENAI_VIDEO_SECONDS (4 | 8 | 12)
```

3) Run dev server  
```bash
npm run dev
```
Visit http://localhost:3000, enter inputs, generate prompt → confirm → wait for video.

## Tech stack
- Next.js 14 (App Router) + TypeScript + TailwindCSS
- OpenAI Node SDK (video + chat)
- Supabase: Postgres + Storage (service role server-side only)

## API routes
- `POST /api/video-prompt` — builds the region-aware video prompt.
- `POST /api/generate-video` — inserts DB row, calls OpenAI Video with `{model, prompt, size, seconds}`, polls `/v1/videos/{id}`, retries download from `/v1/videos/{id}/content`, uploads MP4 to Supabase, updates row, returns URLs/ids.
- `GET /api/history` — fetches last 5 rows for the History list.

## Key files
- `app/page.tsx` — UI, status/timer, preview, history (optimistic update).
- `app/api/video-prompt/route.ts` — prompt creation.
- `app/api/generate-video/route.ts` — video job create → poll → download (with retry) → Supabase upload.
- `lib/openai.ts`, `lib/supabaseServer.ts`, `lib/types.ts`
- `supabase/schema.sql` — DB schema/indexes (no RLS for POC).
- Docs: `docs/design.md`, `docs/db-schema.md`, `docs/build-plan.md`, `agents.md`.

## Notes & limits
- OpenAI Video API: `seconds` must be one of {4, 8, 12}; `size` must be one of {720x1280, 1280x720, 1024x1792, 1792x1024}. Defaults: 12s, 1280x720.
- Long-running route: `maxDuration` set to 300s.
- History shows the new video immediately (optimistic) and refreshes from Supabase; selecting a history item reloads its video/inputs.
