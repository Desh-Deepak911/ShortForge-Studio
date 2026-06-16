export type Tone = "dramatic" | "funny" | "tactical" | "news" | "emotional";

export interface FootieScene {
  id: string;
  duration: number;
  subtitle: string;
  imagePrompt: string;
  uploadedImage?: string;
}

export interface FootieScript {
  title: string;
  hook: string;
  scenes: FootieScene[];
  caption: string;
  hashtags: string[];
}

export interface GenerateScriptRequest {
  topic: string;
  tone: Tone;
  duration: number;
}

export interface GenerateScriptResponse {
  success: boolean;
  data?: FootieScript;
  error?: string;
}
