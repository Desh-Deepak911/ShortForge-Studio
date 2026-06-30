import type { SceneBlueprintCollection } from "../scene-blueprint.types";

/** Semantic version for the scene density adapter contract. */
export type SceneDensityAdapterVersion = string;

/** Strategy applied during a density adaptation pass. */
export type SceneDensityAdaptationStrategy = "none" | "merge" | "split" | "mixed";

/** Record of one merge or split operation. */
export interface SceneDensityAdaptationStep {
  action: "merge" | "split";
  sourceBlueprintIds: readonly string[];
  resultBlueprintIds: readonly string[];
  reason: string;
}

/** Diagnostics for a scene density adaptation pass. */
export interface SceneDensityAdaptationDiagnostics {
  adapterVersion: SceneDensityAdapterVersion;
  inputSceneCount: number;
  requestedSceneCount: number;
  outputSceneCount: number;
  strategy: SceneDensityAdaptationStrategy;
  mergeCount: number;
  splitCount: number;
  originalTotalDurationMs: number;
  adaptedTotalDurationMs: number;
  originalAverageImportance: number;
  adaptedAverageImportance: number;
  originalConfidence: number;
  adaptedConfidence: number;
  steps: readonly SceneDensityAdaptationStep[];
}

/** Output of the scene density adapter. */
export interface SceneDensityAdaptationResult {
  success: boolean;
  collection: SceneBlueprintCollection;
  diagnostics: SceneDensityAdaptationDiagnostics;
  /** Present when adaptation fails or is a no-op rejection. */
  reason?: string;
}
