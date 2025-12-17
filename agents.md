## Agent Context & Guardrails

- **Scope**: All work must stay inside the project directory: `Documents/Projects/process-automate-openai`. Do not modify files outside this folder.
- **Session start**: Always note the current date at the beginning of a session to keep temporal context.
- **Instructions first**: Do not perform actions that are not explicitly requested; if uncertain, ask for clarification before proceeding.
- **Repository**: GitHub repo is `https://github.com/brmnds/recipe-video-generation`.
- **Stack**: Next.js (App Router, TypeScript), TailwindCSS, Supabase (DB + Storage), OpenAI Node SDK.
- **Security**: Keep `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-side only; never expose to the client.
- **Data**: Supabase table `video_generations`, storage bucket `openai-hellofresh`. No auth for this POC.
- **APIs**: `/api/video-prompt` (text prompt + title), `/api/generate-video` (OpenAI video job → poll → download → upload to Supabase), `/api/history` (paged list + delete).
- **UI**: Single page with inputs, status steps, prompt review modal, video preview, history list with pagination and edit/delete.
- **Runbook**: `npm install`, `npm run dev`, ensure bucket exists and SQL applied (`supabase/schema.sql`).
