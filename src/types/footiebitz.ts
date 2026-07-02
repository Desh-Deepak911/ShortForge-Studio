import type { AudioFirstGenerationResult, FootieScript } from "@/features/story/types";
import type {
  CreatorTemplateId,
  CreatorTemplatePromptHints,
} from "@/features/creator-templates/creator-template.types";

export type Tone = "dramatic" | "funny" | "tactical" | "news" | "emotional";

export type QualityMode = "cheap" | "balanced" | "best";

export type ScriptMode =
  | "story"
  | "tactical_review"
  | "match_preview"
  | "match_recap"
  | "player_analysis"
  | "top_5"
  | "historical_explainer"
  | "opinion_debate";

export const SCRIPT_MODES: ScriptMode[] = [
  "story",
  "tactical_review",
  "match_preview",
  "match_recap",
  "player_analysis",
  "top_5",
  "historical_explainer",
  "opinion_debate",
];

export const DEFAULT_SCRIPT_MODE: ScriptMode = "story";

export const SCRIPT_MODE_OPTIONS: { value: ScriptMode; label: string; description: string }[] = [
  { value: "story", label: "Story", description: "General football narrative" },
  { value: "tactical_review", label: "Tactical Review", description: "Formations, patterns, and decisions" },
  { value: "match_preview", label: "Match Preview", description: "Build-up and stakes before kick-off" },
  { value: "match_recap", label: "Match Recap", description: "Key moments and result in review" },
  { value: "player_analysis", label: "Player Analysis", description: "Focus on one player’s impact" },
  { value: "top_5", label: "Top 5", description: "Ranked list with a clear arc" },
  { value: "historical_explainer", label: "Historical Explainer", description: "Context, legacy, and backstory" },
  { value: "opinion_debate", label: "Opinion / Debate", description: "Take, tension, and contrasting views" },
];

export function resolveScriptMode(value: unknown): ScriptMode {
  if (typeof value === "string" && SCRIPT_MODES.includes(value as ScriptMode)) {
    return value as ScriptMode;
  }
  return DEFAULT_SCRIPT_MODE;
}

/** Script modes that default to football research enabled on /create. */
export const RESEARCH_DEFAULT_ENABLED_SCRIPT_MODES: ScriptMode[] = [
  "tactical_review",
  "match_preview",
  "match_recap",
  "player_analysis",
  "top_5",
];

export function isResearchDefaultEnabledForScriptMode(mode: ScriptMode): boolean {
  return RESEARCH_DEFAULT_ENABLED_SCRIPT_MODES.includes(mode);
}

export const MIN_SCENE_COUNT = 3;
export const MAX_SCENE_COUNT = 12;
export const DEFAULT_SCENE_COUNT = 6;

export function resolveSceneCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SCENE_COUNT;
  }
  return Math.max(MIN_SCENE_COUNT, Math.min(MAX_SCENE_COUNT, Math.round(parsed)));
}

export interface GenerateScriptResearchPreview {
  /** Intelligence query id from Research Preview — server resolves full pipeline from store. */
  queryId: string;
  topic: string;
  mode: ScriptMode;
}

export interface GenerateScriptRequest {
  topic: string;
  tone: Tone;
  duration: number;
  scriptMode?: ScriptMode;
  /** Optional match stats, formations, events, or extra context for the script. */
  context?: string;
  /** When true, enrich script-only generation with API-Football research server-side. */
  enableResearch?: boolean;
  /** Reuse a successful /create Research Preview for the same topic + mode. */
  researchPreview?: GenerateScriptResearchPreview;
  /** @deprecated Use `enableResearch`. */
  footballResearch?: boolean;
  qualityMode?: QualityMode;
  sceneCount?: number;
  /** When true, responds with NDJSON progress events followed by a complete payload. */
  stream?: boolean;
  /**
   * Generation mode:
   * - `full` (default): script → voiceover → scenes (legacy one-shot)
   * - `script-only`: narration script without voiceover or scenes
   * - `scenes-only`: scenes from reviewed script + measured voiceover duration
   */
  mode?: GenerateScriptMode;
  /** Reviewed copy — required for `scenes-only`. */
  title?: string;
  narration?: string;
  voiceoverDurationMs?: number;
  /** Opt-in Studio Intelligence scene planning — requires env kill switch. Defaults to false. */
  useStudioIntelligenceScenes?: boolean;
  /** Creator template metadata — optional until Prompt Intelligence consumes it. */
  templateId?: CreatorTemplateId;
  templatePromptHints?: CreatorTemplatePromptHints;
}

export type GenerateScriptMode = "full" | "script-only" | "scenes-only";

export type ScenePlanSource = "studio_intelligence" | "ai_fallback";

/** Dev/staging only — omitted from production API responses and UI. */
export interface ScenePlanDevDebug {
  source: ScenePlanSource;
  densityAdapted: boolean;
}

export const GENERATION_LOADING_STEPS = [
  "Writing your story...",
  "Creating narration...",
  "Preparing your scenes...",
  "Building storyboard...",
] as const;

export type GenerationLoadingStep = 1 | 2 | 3 | 4;

export type GenerateScriptProgressEvent = {
  type: "progress";
  step: GenerationLoadingStep;
  label: (typeof GENERATION_LOADING_STEPS)[number];
};

export type GenerateScriptStreamCompleteEvent = GenerateScriptResponse & {
  type: "complete";
  usedFallback?: boolean;
};

export type GenerateScriptStreamErrorEvent = {
  type: "error";
  error: string;
};

export type GenerateScriptStreamEvent =
  | GenerateScriptProgressEvent
  | GenerateScriptStreamCompleteEvent
  | GenerateScriptStreamErrorEvent;

export interface GenerateScriptResponse {
  success: boolean;
  data?: FootieScript;
  /** Structured audio-first pipeline output when available. */
  audioFirst?: AudioFirstGenerationResult;
  /** Base64-encoded MP3 when the audio-first pipeline succeeds. */
  voiceoverAudioBase64?: string;
  /** True when scene timings were fitted to measured voiceover duration. */
  audioFirstApplied?: boolean;
  /** Final merged context sent to the script prompt (manual + research). */
  generationContext?: string;
  /** True when API-Football research contributed to generationContext. */
  researchApplied?: boolean;
  /** Non-fatal research failure — script may still succeed without enriched stats. */
  researchWarning?: string;
  /** Non-fatal script length budget warning after generation or compression. */
  scriptLengthWarning?: string;
  /** Dev/staging only — how storyboard scenes were planned. */
  scenePlanDevDebug?: ScenePlanDevDebug;
  /** Optional Asset Intelligence planning snapshot for client cache hydration. */
  assetPlanningSnapshot?: import("@/features/editor/creator-asset-planning/creator-asset-planning.types").CreatorAssetPlanningSnapshot;
  error?: string;
}
