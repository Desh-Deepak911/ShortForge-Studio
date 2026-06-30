import type { BlueprintAdapterDiagnostics } from "../blueprint-adapter/blueprint-adapter.types";
import type { BlueprintMappedScene } from "../blueprint-adapter/blueprint-adapter.types";
import type {
  BlueprintSceneMediaHints,
  BlueprintSceneMotionHints,
  BlueprintSceneVisualHints,
} from "../blueprint-adapter/blueprint-adapter.types";
import type { VisualIntentType } from "../studio-intelligence.types";
import type { FootieScene, SceneImageMotion } from "@/features/story/types";

/** Semantic version for the FootieScript materializer contract. */
export type FootieScriptMaterializerVersion = string;

/** Severity for materialization warnings. */
export type MaterializationWarningSeverity = "info" | "warning" | "error";

/** Lineage preserved from adapter output through materialization. */
export interface MaterializedSceneLineage {
  sourceBlueprintId: string;
  sourceArcId?: string;
  sourceBeatIds: readonly string[];
  /** Adapter-assigned mapped scene id before production id regeneration. */
  adapterSceneId: string;
  /** Normalized materialization confidence in `[0, 1]`. */
  materializerConfidence: number;
}

/** Planning hints retained as metadata — not written to persisted FootieScript fields in v1. */
export interface MaterializedScenePlanningMetadata {
  visualIntentType: VisualIntentType;
  visualHints: BlueprintSceneVisualHints;
  mediaHints: BlueprintSceneMediaHints;
  motionHints: BlueprintSceneMotionHints;
  assetSearchQuery?: string;
  fallbackAssetQuery?: string;
  /** Default motion to apply when a scene image is added later. */
  defaultImageMotion?: SceneImageMotion;
}

/** Production scene draft with planning sidecar. */
export interface MaterializedSceneDraft {
  scene: FootieScene;
  lineage: MaterializedSceneLineage;
  metadata: MaterializedScenePlanningMetadata;
}

/** Structured warning emitted during materialization without failing the run when recoverable. */
export interface MaterializationWarning {
  code: string;
  message: string;
  severity: MaterializationWarningSeverity;
  mappedSceneId?: string;
  field?: string;
}

/** Diagnostics metadata for a materializer pass. */
export interface MaterializationDiagnostics {
  materializationVersion: FootieScriptMaterializerVersion;
  processedSceneCount: number;
  skippedSceneCount: number;
  totalDurationMs: number;
  /** Normalized aggregate confidence in `[0, 1]`. */
  confidence: number;
  fallbacksUsed: readonly string[];
  warningsByType: Readonly<Partial<Record<string, number>>>;
}

/** Input to the FootieScript materializer — adapter output plus story timing context. */
export interface FootieScriptMaterializerInput {
  mappedScenes: readonly BlueprintMappedScene[];
  /** Full story narration for validation and subtitle fallbacks. */
  narration: string;
  /** Measured voiceover duration used to distribute contiguous scene timing. */
  voiceoverDurationMs?: number;
  /** Optional correlation id for a Studio Intelligence run. */
  intelligenceRunId?: string;
  /** Optional adapter diagnostics for traceability. */
  adapterDiagnostics?: BlueprintAdapterDiagnostics;
  options?: {
    /** Max words for generated subtitles (default 12). */
    maxSubtitleWords?: number;
  };
}

/** Output of the FootieScript materializer. */
export interface FootieScriptMaterializerResult {
  scenes: MaterializedSceneDraft[];
  /** Production-shaped scenes ready for syncFootieScript (caller-owned orchestration). */
  footieScenes: FootieScene[];
  warnings: MaterializationWarning[];
  diagnostics: MaterializationDiagnostics;
  success: boolean;
}
