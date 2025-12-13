## Database Schema (Supabase)

Table: `video_generations`

- `id uuid` PK default `gen_random_uuid()`
- `created_at timestamptz` default `now()`
- `completed_at timestamptz` nullable
- `recipe_text text` not null (full recipe input)
- `people text` not null (who to show)
- `region text` not null check in (`US`,`Europe`,`Asia`)
- `video_prompt text` not null (final prompt sent to OpenAI Video)
- `openai_video_id text` nullable (OpenAI job id)
- `status text` not null default `queued` check in (`queued`,`prompt_ready`,`generating`,`uploading`,`completed`,`failed`)
- `error_message text` nullable
- `supabase_path text` nullable (storage path `{id}/{openai_id}.mp4`)
- `video_url text` nullable (public URL)

Indexes
- `video_generations_created_at_idx` on `created_at desc`
- `video_generations_status_idx` on `status`

RLS
- Disabled for this POC. For production, enable RLS and create policies for reads/writes per user.
