import type {
  AssetBlueprintOrientation,
  CaptionBlueprintEmphasis,
  CaptionBlueprintStyleHint,
  MotionBlueprintIntensity,
  MotionBlueprintSuggestion,
  SceneBlueprintCollection,
  SceneBlueprintKind,
  SceneBlueprintRole,
  TimingBlueprintPacing,
} from "../scene-blueprint.types";
import type { StoryStrategyId } from "../story-strategy/story-strategy.types";
import type {
  AssetRequirementType,
  SceneImportanceScore,
  ScenePlanRole,
  VisualIntentType,
} from "../studio-intelligence.types";

/** Semantic version for the blueprint adapter mapping contract. */
export type BlueprintAdapterMappingVersion = string;

/** Severity for adapter warnings surfaced during mapping. */
export type BlueprintAdapterWarningSeverity = "info" | "warning" | "error";

/** Method used when translating a blueprint field to a mapped scene field. */
export type SceneMappingMethod = "direct" | "fallback" | "default" | "omitted";

/** Visual hints derived from a blueprint visual sub-contract. */
export interface BlueprintSceneVisualHints {
  visualIntentType: VisualIntentType;
  composition?: string;
  subject?: string;
  emotion?: string;
  textOverlaySuggestion?: string;
}

/** Media hints derived from a blueprint asset sub-contract. */
export interface BlueprintSceneMediaHints {
  assetRequirementType: AssetRequirementType;
  searchQuery?: string;
  fallbackQuery?: string;
  preferredOrientation: AssetBlueprintOrientation;
  imageCount: number;
}

/** Motion hints derived from a blueprint motion sub-contract. */
export interface BlueprintSceneMotionHints {
  suggestedMotion: MotionBlueprintSuggestion;
  intensity: MotionBlueprintIntensity;
}

/** Caption hints derived from a blueprint caption sub-contract. */
export interface BlueprintSceneCaptionHints {
  emphasis: CaptionBlueprintEmphasis;
  highlightWords: readonly string[];
  captionStyleHint: CaptionBlueprintStyleHint;
  captionText?: string;
}

/** Timing metadata preserved alongside clamped scene duration. */
export interface BlueprintSceneTimingMetadata {
  suggestedDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  pacing: TimingBlueprintPacing;
}

/** Strategy used to derive narration for a mapped scene. */
export type BlueprintSceneNarrationStrategy =
  | "blueprint_summary"
  | "proportional_sentences"
  | "topic_fallback";

/** Overall narration slicing strategy for an adapter pass. */
export type NarrationSlicingStrategy =
  | "none"
  | "blueprint_summary"
  | "proportional_sentences"
  | "topic_fallback"
  | "mixed";

/** Narration slicing metadata attached to a mapped scene. */
export interface BlueprintSceneNarrationMetadata {
  /** Character index in normalized narration where the excerpt begins, when known. */
  narrationStartIndex: number;
  /** Inclusive sentence index range in normalized narration. */
  sentenceRange: {
    start: number;
    end: number;
  };
  slicingStrategy: BlueprintSceneNarrationStrategy;
  /** Normalized narration assignment confidence in `[0, 1]`. */
  narrationConfidence: number;
}

/**
 * Input to the Blueprint Adapter — planning metadata only.
 * Does not include FootieScript or generation pipeline types.
 */
export interface BlueprintAdapterInput {
  /** Scene blueprints produced by Studio Intelligence planners. */
  collection: SceneBlueprintCollection;
  /** Optional resolved strategy identifier from the intelligence run. */
  strategyId?: StoryStrategyId;
  /** Optional topic label for traceability and future narration slicing. */
  topic?: string;
  /** Optional normalized narration for excerpt derivation in later phases. */
  normalizedNarration?: string;
  /** Optional duration target override in milliseconds. */
  targetDurationMs?: number;
  /** Optional opaque correlation id for a Studio Intelligence run. */
  intelligenceRunId?: string;
}

/**
 * Intermediate mapped scene plan — adapter output contract before FootieScript materialization.
 * Defined without FootieScript imports; 3.4B+ will map this shape to production scene types.
 */
export interface BlueprintMappedScene {
  id: string;
  order: number;
  sourceBlueprintId: string;
  /** Narrative arc id from the source blueprint, when present. */
  sourceArcId?: string;
  /** Beat ids from the source blueprint preserved for downstream materialization. */
  sourceBeatIds: readonly string[];
  blueprintRole: SceneBlueprintRole;
  blueprintKind: SceneBlueprintKind;
  /** Proposed editor/generation scene role — maps to FootieScript `sceneType` in a later phase. */
  proposedSceneType: ScenePlanRole;
  title: string;
  narrationExcerpt: string;
  durationMs: number;
  importance: SceneImportanceScore;
  visualIntentType: VisualIntentType;
  motionSuggestion: MotionBlueprintSuggestion;
  captionText?: string;
  assetSearchQuery?: string;
  fallbackAssetQuery?: string;
  visualHints: BlueprintSceneVisualHints;
  mediaHints: BlueprintSceneMediaHints;
  motionHints: BlueprintSceneMotionHints;
  captionHints: BlueprintSceneCaptionHints;
  timingMetadata: BlueprintSceneTimingMetadata;
  narrationMetadata: BlueprintSceneNarrationMetadata;
  /** Normalized mapping confidence in `[0, 1]`. */
  confidence: number;
  mappingDecisions: readonly SceneMappingDecision[];
}

/** Per-field mapping trace for one blueprint → mapped scene translation. */
export interface SceneMappingDecision {
  blueprintId: string;
  field: string;
  sourceValue: string;
  mappedValue: string;
  method: SceneMappingMethod;
  /** Normalized decision confidence in `[0, 1]`. */
  confidence: number;
  reason?: string;
}

/** Structured warning emitted by the adapter without failing the run. */
export interface BlueprintAdapterWarning {
  code: string;
  message: string;
  severity: BlueprintAdapterWarningSeverity;
  blueprintId?: string;
  field?: string;
}

/** Diagnostics metadata for a blueprint adapter pass. */
export interface BlueprintAdapterDiagnostics {
  mappingVersion: BlueprintAdapterMappingVersion;
  /** Blueprint or mapped-scene fields that could not be translated in this phase. */
  unmappedFields: readonly string[];
  /** Aggregate mapping confidence in `[0, 1]`. */
  confidence: number;
  /** Fallback rules or default paths applied during mapping. */
  fallbacksUsed: readonly string[];
  processedBlueprintCount: number;
  skippedBlueprintCount: number;
  /** Primary narration slicing strategy applied across the adapter pass. */
  narrationSlicingStrategy: NarrationSlicingStrategy;
  /** Mapped scene ids with confidence below adapter threshold. */
  lowConfidenceSceneIds: readonly string[];
  /** Warning counts grouped by warning code. */
  warningCountsByType: Readonly<Partial<Record<string, number>>>;
}

/** Aggregate statistics for a blueprint adapter pass. */
export interface AdapterStatistics {
  sceneCount: number;
  totalDurationMs: number;
  averageSceneDurationMs: number;
  minSceneDurationMs: number;
  maxSceneDurationMs: number;
  averageConfidence: number;
  /** Ratio of scenes with enriched visual intent in `[0, 1]`. */
  visualIntentCoverage: number;
  /** Ratio of scenes with asset search queries in `[0, 1]`. */
  assetQueryCoverage: number;
  /** Ratio of scenes with non-static motion hints in `[0, 1]`. */
  motionCoverage: number;
  /** Ratio of scenes with caption text or highlights in `[0, 1]`. */
  captionCoverage: number;
  mappedVisualIntents: Readonly<Partial<Record<VisualIntentType, number>>>;
  mappedMotions: Readonly<Partial<Record<MotionBlueprintSuggestion, number>>>;
}

/** Output of the Blueprint Adapter — contract only at 3.4A. */
export interface BlueprintAdapterResult {
  mappedScenes: BlueprintMappedScene[];
  warnings: BlueprintAdapterWarning[];
  diagnostics: BlueprintAdapterDiagnostics;
  statistics: AdapterStatistics;
  success: boolean;
}
