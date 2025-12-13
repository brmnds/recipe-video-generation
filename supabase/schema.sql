-- Table: video_generations
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.video_generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  completed_at timestamptz null,
  recipe_text text not null,
  people text not null,
  region text not null check (region in ('US', 'Europe', 'Asia')),
  video_prompt text not null,
  openai_video_id text null,
  status text not null default 'queued' check (status in ('queued','prompt_ready','generating','uploading','completed','failed')),
  error_message text null,
  supabase_path text null,
  video_url text null
);

create index if not exists video_generations_created_at_idx on public.video_generations (created_at desc);
create index if not exists video_generations_status_idx on public.video_generations (status);

-- RLS disabled for POC. Enable and add policies for production use.
alter table public.video_generations disable row level security;
