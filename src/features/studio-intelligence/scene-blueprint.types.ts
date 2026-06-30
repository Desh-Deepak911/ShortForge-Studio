import type { AssetRequirementType, SceneImportanceScore, VisualIntentType } from "./studio-intelligence.types";

/** Planned narrative role for a scene blueprint before FootieScript mapping. */
export type SceneBlueprintRole =
  | "intro"
  | "context"
  | "evidence"
  | "conflict"
  | "climax"
  | "payoff"
  | "transition"
  | "ending"
  | "cta";

/** Visual/story shape of a scene blueprint — finer than role. */
export type SceneBlueprintKind =
  | "hook_opener"
  | "player_spotlight"
  | "stat_moment"
  | "match_highlight"
  | "debate_split"
  | "ranked_reveal"
  | "text_card"
  | "archive_broll"
  | "comparison"
  | "closing_moment"
  | "cta_card"
  | "neutral_broll";

/** Origin module that produced a scene blueprint. */
export type SceneBlueprintSource =
  | "narrative_arc"
  | "narrative_beat"
  | "mode_strategy"
  | "heuristic"
  | "manual"
  | "scene_planner";

/** Relative pacing intent for a blueprint scene. */
export type TimingBlueprintPacing = "slow" | "normal" | "fast" | "punchy";

/** Relative motion intensity for a blueprint scene. */
export type MotionBlueprintIntensity = "low" | "medium" | "high";

/** Suggested camera/motion treatment for a blueprint scene. */
export type MotionBlueprintSuggestion =
  | "static"
  | "ken_burns"
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "push_in";

/** Preferred asset orientation for search/placement planning. */
export type AssetBlueprintOrientation = "landscape" | "portrait" | "square" | "any";

/** Caption emphasis level for on-screen text planning. */
export type CaptionBlueprintEmphasis = "none" | "word" | "phrase" | "stat";

/** Caption styling hint for future renderer/editor mapping. */
export type CaptionBlueprintStyleHint =
  | "default"
  | "bold_hook"
  | "stat_highlight"
  | "debate"
  | "cta";

/** Timing contract for a planned scene blueprint. */
export interface TimingBlueprint {
  suggestedDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  pacing: TimingBlueprintPacing;
  reason?: string;
}

/** Visual direction contract for a planned scene blueprint. */
export interface VisualBlueprint {
  visualIntentType: VisualIntentType;
  composition?: string;
  subject?: string;
  emotion?: string;
  textOverlaySuggestion?: string;
  reason?: string;
}

/** Asset search/placement contract for a planned scene blueprint. */
export interface AssetBlueprint {
  assetRequirementType: AssetRequirementType;
  searchQuery?: string;
  fallbackQuery?: string;
  preferredOrientation: AssetBlueprintOrientation;
  imageCount: number;
  reason?: string;
}

/** Motion contract for a planned scene blueprint. */
export interface MotionBlueprint {
  suggestedMotion: MotionBlueprintSuggestion;
  intensity: MotionBlueprintIntensity;
  reason?: string;
}

/** Caption contract for a planned scene blueprint. */
export interface CaptionBlueprint {
  emphasis: CaptionBlueprintEmphasis;
  highlightWords: string[];
  captionStyleHint: CaptionBlueprintStyleHint;
  reason?: string;
}

/** Stable scene planning contract between intelligence modules and FootieScript mapping. */
export interface SceneBlueprint {
  id: string;
  arcId?: string;
  beatIds: string[];
  role: SceneBlueprintRole;
  kind: SceneBlueprintKind;
  title: string;
  summary: string;
  importance: SceneImportanceScore;
  timing: TimingBlueprint;
  visual: VisualBlueprint;
  asset: AssetBlueprint;
  motion: MotionBlueprint;
  caption: CaptionBlueprint;
  source: SceneBlueprintSource;
  /** Normalized planning confidence in `[0, 1]`. */
  confidence: number;
}

/** Aggregated blueprint output for one intelligence planning pass. */
export interface SceneBlueprintCollection {
  blueprints: SceneBlueprint[];
  sourceArcIds: string[];
  totalSuggestedDurationMs: number;
  averageImportance: number;
  /** Normalized collection confidence in `[0, 1]`. */
  confidence: number;
  warnings: string[];
}
