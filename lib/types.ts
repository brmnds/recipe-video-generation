export type Region = "US" | "Europe" | "Asia";

export type VideoStatus =
  | "queued"
  | "prompt_ready"
  | "generating"
  | "uploading"
  | "completed"
  | "failed";

export interface VideoGenerationRow {
  id: string;
  created_at: string;
  completed_at: string | null;
  recipe_text: string;
  people: string;
  region: Region;
  video_prompt: string;
  openai_video_id: string | null;
  status: VideoStatus;
  error_message: string | null;
  supabase_path: string | null;
  video_url: string | null;
}

export interface VideoPromptResponse {
  videoPrompt: string;
}

export interface GenerateVideoResponse {
  dbId: string;
  status: VideoStatus;
  videoUrl: string | null;
  openaiVideoId: string | null;
  supabasePath: string | null;
}
