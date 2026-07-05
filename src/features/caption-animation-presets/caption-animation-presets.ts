import type {
  CaptionAnimation,
  CaptionAnimationDirection,
  CaptionAnimationEasing,
  CaptionAnimationPreset,
} from "@/features/caption-animation/caption-animation.types";

export type CaptionMotionPresetCategory =
  | "minimal"
  | "social"
  | "sports"
  | "news"
  | "gaming"
  | "cinematic";

export interface CaptionMotionPresetConfig {
  preset: CaptionAnimationPreset;
  durationMs?: number;
  delayMs?: number;
  easing?: CaptionAnimationEasing;
  direction?: CaptionAnimationDirection;
  intensity?: number;
}

export interface CaptionMotionPresetDefinition {
  id: string;
  label: string;
  category: CaptionMotionPresetCategory;
  config: CaptionMotionPresetConfig;
}

export const CAPTION_MOTION_PRESET_CATEGORY_LABELS: Record<CaptionMotionPresetCategory, string> = {
  minimal: "Minimal",
  social: "Social",
  sports: "Sports",
  news: "News",
  gaming: "Gaming",
  cinematic: "Cinematic",
};

export const CAPTION_MOTION_PRESET_CATEGORY_ORDER: CaptionMotionPresetCategory[] = [
  "minimal",
  "social",
  "sports",
  "news",
  "gaming",
  "cinematic",
];

/** Built-in motion preset library — configuration profiles for the Caption Animation Engine. */
export const CAPTION_MOTION_PRESETS: CaptionMotionPresetDefinition[] = [
  // Minimal
  {
    id: "minimal-fade",
    label: "Fade",
    category: "minimal",
    config: { preset: "fade", durationMs: 500, easing: "ease_out", intensity: 100 },
  },
  {
    id: "minimal-clean",
    label: "Clean",
    category: "minimal",
    config: { preset: "fade", durationMs: 400, easing: "ease_out", intensity: 85 },
  },
  {
    id: "minimal-classic",
    label: "Classic",
    category: "minimal",
    config: { preset: "fade", durationMs: 600, easing: "ease_in_out", intensity: 100 },
  },
  {
    id: "minimal-documentary",
    label: "Documentary",
    category: "minimal",
    config: { preset: "fade", durationMs: 800, delayMs: 100, easing: "ease_out", intensity: 70 },
  },
  // Social
  {
    id: "social-tiktok",
    label: "TikTok",
    category: "social",
    config: { preset: "typewriter", durationMs: 1200, easing: "ease_out", intensity: 100 },
  },
  {
    id: "social-instagram-reels",
    label: "Instagram Reels",
    category: "social",
    config: { preset: "typewriter", durationMs: 1000, easing: "ease_in_out", intensity: 90 },
  },
  {
    id: "social-youtube-shorts",
    label: "YouTube Shorts",
    category: "social",
    config: { preset: "highlight", durationMs: 800, easing: "ease_out", intensity: 100 },
  },
  {
    id: "social-snapchat",
    label: "Snapchat",
    category: "social",
    config: { preset: "fade", durationMs: 300, easing: "ease_in", intensity: 100 },
  },
  // Sports
  {
    id: "sports-broadcast",
    label: "Sports Broadcast",
    category: "sports",
    config: { preset: "highlight", durationMs: 1500, easing: "ease_out", intensity: 100 },
  },
  {
    id: "sports-football-highlight",
    label: "Football Highlight",
    category: "sports",
    config: { preset: "highlight", durationMs: 1200, easing: "ease_in_out", intensity: 95 },
  },
  {
    id: "sports-matchday",
    label: "Matchday",
    category: "sports",
    config: { preset: "typewriter", durationMs: 1400, easing: "ease_out", intensity: 85 },
  },
  {
    id: "sports-espn-style",
    label: "ESPN Style",
    category: "sports",
    config: { preset: "highlight", durationMs: 1000, easing: "linear", intensity: 100 },
  },
  // News
  {
    id: "news-breaking",
    label: "Breaking News",
    category: "news",
    config: { preset: "highlight", durationMs: 600, easing: "ease_in", intensity: 100 },
  },
  {
    id: "news-cnn",
    label: "CNN",
    category: "news",
    config: { preset: "highlight", durationMs: 900, easing: "ease_out", intensity: 90 },
  },
  {
    id: "news-bbc",
    label: "BBC",
    category: "news",
    config: { preset: "fade", durationMs: 700, easing: "ease_in_out", intensity: 80 },
  },
  {
    id: "news-financial",
    label: "Financial",
    category: "news",
    config: { preset: "typewriter", durationMs: 1600, easing: "linear", intensity: 75 },
  },
  // Gaming
  {
    id: "gaming-esports",
    label: "Esports",
    category: "gaming",
    config: { preset: "typewriter", durationMs: 800, easing: "ease_out", intensity: 100 },
  },
  {
    id: "gaming-streamer",
    label: "Streamer",
    category: "gaming",
    config: { preset: "highlight", durationMs: 700, easing: "ease_in_out", intensity: 100 },
  },
  {
    id: "gaming-cyber",
    label: "Cyber",
    category: "gaming",
    config: { preset: "typewriter", durationMs: 900, easing: "ease_in", intensity: 90 },
  },
  {
    id: "gaming-neon",
    label: "Neon",
    category: "gaming",
    config: { preset: "highlight", durationMs: 1100, easing: "ease_out", intensity: 100 },
  },
  // Cinematic
  {
    id: "cinematic-movie",
    label: "Movie",
    category: "cinematic",
    config: { preset: "fade", durationMs: 1200, easing: "ease_in_out", intensity: 60 },
  },
  {
    id: "cinematic-trailer",
    label: "Trailer",
    category: "cinematic",
    config: { preset: "typewriter", durationMs: 1800, easing: "ease_out", intensity: 100 },
  },
  {
    id: "cinematic-drama",
    label: "Drama",
    category: "cinematic",
    config: { preset: "fade", durationMs: 1500, easing: "ease_in", intensity: 50 },
  },
  {
    id: "cinematic-premium",
    label: "Premium",
    category: "cinematic",
    config: { preset: "fade", durationMs: 900, easing: "ease_in_out", intensity: 85 },
  },
];

export type CaptionMotionPresetId = (typeof CAPTION_MOTION_PRESETS)[number]["id"];

/** Partial animation config contributed by a motion preset (excludes motionPresetId). */
export type CaptionMotionPresetAnimationConfig = Omit<CaptionAnimation, "version" | "motionPresetId">;
