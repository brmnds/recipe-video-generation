## Build Plan: HEALTHYFRESH Cooking Video POC

1) **Environment & Install**
- Copy `.env.local.example` to `.env.local`, fill keys (OpenAI, Supabase service role, etc.).
- `npm install`

2) **Database & Storage**
- In Supabase SQL editor, run `supabase/schema.sql`.
- Create public storage bucket `openai-hellofresh` (no RLS for POC).

3) **App Scaffolding**
- Next.js App Router with Tailwind (HEALTHYFRESH-inspired theme).
- Core libs: `lib/openai.ts`, `lib/supabaseServer.ts`, `lib/types.ts`.

4) **APIs**
- `/api/video-prompt`: turns recipe + people + region into a Sora-ready prompt (region-aware guardrails).
- `/api/generate-video`: inserts DB row, calls OpenAI Video, polls, downloads MP4, uploads to Supabase Storage, updates DB, returns public URL.
- `/api/history`: returns last 5 rows for the History panel.

5) **UI**
- One-page layout, left inputs / right status + preview + history, modal for prompt review/edit, optimistic step tracker, HEALTHYFRESH-inspired styling.

6) **Test & Run**
- `npm run dev` locally.
- Dry-run forms, generate prompt, confirm, wait for video; verify Supabase row + bucket upload + history reload.
