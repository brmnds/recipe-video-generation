# HelloFresh Cooking Video POC

A minimal Next.js (App Router) app that turns a pasted recipe into a generated cooking video via OpenAI Video (Sora) and stores results in Supabase (DB + Storage). HelloFresh-inspired styling with prompt review modal, step tracker, preview, and history.

## Quickstart

1) **Install**
```bash
npm install
```

2) **Configure env**
```bash
cp .env.local.example .env.local
# Fill: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
```

3) **Supabase setup**
- In Supabase SQL editor, run `supabase/schema.sql`.
- Create Storage bucket `openai-hellofresh` and set it to public (no RLS for POC).

4) **Run**
```bash
npm run dev
```
Visit http://localhost:3000 and:
- Paste a recipe, set people + region.
- Click "Generate cooking video" → review/edit prompt → confirm.
- Wait for processing; video will upload to Supabase and appear in preview/history.

## Tech
- Next.js 14 (App Router) + TypeScript + Tailwind.
- OpenAI (text prompt + Sora video) via official API.
- Supabase (Postgres + Storage) using service role server-side only.

## Key Routes
- `POST /api/video-prompt` — builds region-aware video prompt from recipe + people.
- `POST /api/generate-video` — inserts DB row, calls OpenAI Video, polls, downloads MP4, uploads to Supabase Storage, updates row, returns URL.
- `GET /api/history` — last 5 videos for the History panel.

## Files to Note
- `app/page.tsx` — UI with form, modal, step tracker, preview, history.
- `app/api/video-prompt/route.ts` — prompt generation logic.
- `app/api/generate-video/route.ts` — full video pipeline (OpenAI Video → download → Supabase upload).
- `lib/supabaseServer.ts` — server-side Supabase client (service role).
- `lib/openai.ts` — OpenAI client (server only).
- `supabase/schema.sql` — DB schema and indexes.
- `docs/design.md` — HelloFresh-style design guide.
- `docs/db-schema.md` — schema reference.
- `docs/build-plan.md` — condensed build steps.

## Notes & Assumptions
- Bucket `openai-hellofresh` must exist and be public for POC. Add lifecycle rules later if desired.
- Uses `OPENAI_VIDEO_MODEL=sora-2` by default (override via env).
- API routes are long-running; Next API route `maxDuration` set to 300s for video generation.
- Service role key is used only on the server; never exposed to the client.
