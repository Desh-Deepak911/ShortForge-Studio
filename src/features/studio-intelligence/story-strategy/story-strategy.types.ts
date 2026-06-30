import type { ScriptMode } from "@/types/footiebitz";

import type { StoryStructureArcId } from "../studio-intelligence.types";

/** Canonical story strategy identifiers for Studio Intelligence planning. */
export type StoryStrategyId =
  | "default"
  | "history"
  | "debate"
  | "comparison"
  | "countdown"
  | "biography"
  | "match_preview"
  | "tactical_analysis"
  | "news";

/** Hook planning bias for a story strategy. */
export interface StoryStrategyHookStrategy {
  emphasis: "punchy" | "question" | "stakes" | "cold_open";
  maxOpeningBeats: number;
  timingWeight: number;
  preferPortraitVisual: boolean;
}

/** Narrative arc planning bias for a story strategy. */
export interface StoryStrategyArcStrategy {
  preferredArcSequence: readonly string[];
  prioritizeConflictArc: boolean;
  prioritizeDevelopmentArc: boolean;
  endingArcWeight: number;
}

/** Scene density guidance for planners. */
export interface StoryStrategySceneDensity {
  minScenesPerArc: number;
  maxScenesPerArc: number;
  isolateHighImportanceBeats: boolean;
  groupLowImportanceBeats: boolean;
}

/** Timing allocation bias for planners. */
export interface StoryStrategyTimingBias {
  hookMultiplier: number;
  evidenceMultiplier: number;
  climaxMultiplier: number;
  ctaMultiplier: number;
  preferredPacing: "slow" | "normal" | "fast" | "punchy";
}

/** Visual intent bias for planners. */
export interface StoryStrategyVisualBias {
  primaryIntent: string;
  secondaryIntent?: string;
  favorComparisonSplit: boolean;
  favorStatOverlay: boolean;
  favorArchiveFootage: boolean;
}

/** Motion treatment bias for planners. */
export interface StoryStrategyMotionBias {
  defaultIntensity: "low" | "medium" | "high";
  boostHighImportance: boolean;
  preferPushInOnHook: boolean;
}

/** Asset search/placement bias for planners. */
export interface StoryStrategyAssetBias {
  preferredAssetTypes: readonly string[];
  preferredOrientation: "landscape" | "portrait" | "square" | "any";
  favorEntityQueries: boolean;
}

/** Caption styling bias for planners. */
export interface StoryStrategyCaptionBias {
  defaultEmphasis: "none" | "word" | "phrase" | "stat";
  styleHint: "default" | "bold_hook" | "stat_highlight" | "debate" | "cta";
  highlightStats: boolean;
}

/** Immutable configuration consumed by Studio Intelligence planners. */
export interface StoryStrategy {
  readonly id: StoryStrategyId;
  readonly displayName: string;
  readonly preferredStructure: StoryStructureArcId;
  readonly hookStrategy: StoryStrategyHookStrategy;
  readonly arcStrategy: StoryStrategyArcStrategy;
  readonly sceneDensity: StoryStrategySceneDensity;
  readonly timingBias: StoryStrategyTimingBias;
  readonly visualBias: StoryStrategyVisualBias;
  readonly motionBias: StoryStrategyMotionBias;
  readonly assetBias: StoryStrategyAssetBias;
  readonly captionBias: StoryStrategyCaptionBias;
  readonly plannerHints: readonly string[];
  /** Optional script modes that map to this strategy. */
  readonly scriptModes?: readonly ScriptMode[];
}

/** Input accepted by the story strategy resolver. */
export type StoryStrategyModeInput = StoryStrategyId | ScriptMode | string | undefined | null;
