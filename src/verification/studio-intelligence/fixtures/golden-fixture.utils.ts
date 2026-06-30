import type { BlueprintAdapterResult } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import type { FootieScriptMaterializerResult } from "@/features/studio-intelligence/footie-script-materializer/footie-script-materializer.types";
import type { StudioIntelligenceResult } from "@/features/studio-intelligence/studio-intelligence.types";
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT } from "@/types/footiebitz";
import { subtitlesWithinWordCap } from "@/features/studio-intelligence/footie-script-materializer/footie-script-materializer.utils";

import type {
  GoldenFixtureTimingTolerance,
  StudioIntelligenceGoldenFixture,
} from "./golden-fixture.types";
import {
  ACCEPTABLE_GOLDEN_WARNING_CODES,
  ACCEPTABLE_MATERIALIZER_GOLDEN_WARNING_CODES,
  GOLDEN_FIXTURE_TIMING_TOLERANCE,
} from "./golden-fixtures.registry";

export interface GoldenFixtureValidationResult {
  fixtureName: string;
  passed: boolean;
  failures: string[];
}

function cloneInput<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Computes narration excerpt coverage across mapped scenes. */
export function calculateNarrationCoverage(result: BlueprintAdapterResult): number {
  if (result.mappedScenes.length === 0) {
    return 0;
  }

  const covered = result.mappedScenes.filter((scene) => scene.narrationExcerpt.trim().length > 0).length;
  return covered / result.mappedScenes.length;
}

/** Returns whether adapter timing is within tolerance of the target duration. */
export function isTimingWithinTolerance(
  totalDurationMs: number,
  targetDurationMs: number,
  tolerance: GoldenFixtureTimingTolerance = GOLDEN_FIXTURE_TIMING_TOLERANCE,
): boolean {
  const drift = Math.abs(totalDurationMs - targetDurationMs);
  const allowedDrift = Math.max(tolerance.maxDriftMs, Math.round(targetDurationMs * tolerance.maxDriftRatio));
  return drift <= allowedDrift;
}

/** Validates warnings are non-critical and use acceptable codes. */
export function hasAcceptableWarnings(result: BlueprintAdapterResult): boolean {
  if (result.warnings.some((warning) => warning.severity === "error")) {
    return false;
  }

  return result.warnings.every(
    (warning) => ACCEPTABLE_GOLDEN_WARNING_CODES.has(warning.code) || warning.severity === "info",
  );
}

/** Validates a golden fixture against planning + adapter pipeline output. */
export function validateGoldenFixtureRun(options: {
  fixture: StudioIntelligenceGoldenFixture;
  intelligence: StudioIntelligenceResult;
  adapter: BlueprintAdapterResult;
  inputBefore: StudioIntelligenceGoldenFixture["input"];
  inputAfter: StudioIntelligenceGoldenFixture["input"];
}): GoldenFixtureValidationResult {
  const { fixture, intelligence, adapter, inputBefore, inputAfter } = options;
  const failures: string[] = [];
  const targetDurationMs =
    fixture.input.targetDurationMs ?? Math.max(1, fixture.input.targetDurationSec) * 1000;

  if (JSON.stringify(inputBefore) !== JSON.stringify(inputAfter)) {
    failures.push("input was mutated during pipeline execution");
  }

  if (intelligence.strategyId !== fixture.expectedStrategyId) {
    failures.push(
      `strategyId expected ${fixture.expectedStrategyId} but received ${intelligence.strategyId}`,
    );
  }

  if (intelligence.beats.length < fixture.expectedMinimumBeats) {
    failures.push(
      `beats expected >= ${fixture.expectedMinimumBeats} but received ${intelligence.beats.length}`,
    );
  }

  if (intelligence.arcs.length < fixture.expectedMinimumArcs) {
    failures.push(
      `arcs expected >= ${fixture.expectedMinimumArcs} but received ${intelligence.arcs.length}`,
    );
  }

  if (intelligence.sceneBlueprintCollection.blueprints.length < fixture.expectedMinimumScenes) {
    failures.push(
      `scene blueprints expected >= ${fixture.expectedMinimumScenes} but received ${intelligence.sceneBlueprintCollection.blueprints.length}`,
    );
  }

  if (adapter.mappedScenes.length < fixture.expectedMinimumScenes) {
    failures.push(
      `mapped scenes expected >= ${fixture.expectedMinimumScenes} but received ${adapter.mappedScenes.length}`,
    );
  }

  const blueprints = intelligence.sceneBlueprintCollection.blueprints;

  for (const [index, scene] of adapter.mappedScenes.entries()) {
    if (!Array.isArray(scene.sourceBeatIds)) {
      failures.push(`mapped scene ${scene.id} missing sourceBeatIds`);
      continue;
    }

    if (scene.sourceBeatIds.length === 0) {
      failures.push(`mapped scene ${scene.id} has empty sourceBeatIds`);
    }

    const sourceBlueprint = blueprints[index];
    if (!sourceBlueprint) {
      failures.push(`mapped scene ${scene.id} missing source blueprint at index ${index}`);
      continue;
    }

    if (scene.sourceBlueprintId !== sourceBlueprint.id) {
      failures.push(
        `mapped scene ${scene.id} sourceBlueprintId expected ${sourceBlueprint.id} but received ${scene.sourceBlueprintId}`,
      );
    }

    if (scene.sourceArcId !== sourceBlueprint.arcId) {
      failures.push(
        `mapped scene ${scene.id} sourceArcId expected ${sourceBlueprint.arcId ?? "undefined"} but received ${scene.sourceArcId ?? "undefined"}`,
      );
    }

    if (JSON.stringify(scene.sourceBeatIds) !== JSON.stringify(sourceBlueprint.beatIds)) {
      failures.push(`mapped scene ${scene.id} sourceBeatIds do not match source blueprint beatIds`);
    }
  }

  const narrationCoverage = calculateNarrationCoverage(adapter);
  if (narrationCoverage < fixture.expectedNarrationCoverage) {
    failures.push(
      `narration coverage expected >= ${fixture.expectedNarrationCoverage} but received ${narrationCoverage.toFixed(2)}`,
    );
  }

  if (adapter.statistics.visualIntentCoverage < fixture.expectedVisualIntentCoverage) {
    failures.push(
      `visual intent coverage expected >= ${fixture.expectedVisualIntentCoverage} but received ${adapter.statistics.visualIntentCoverage.toFixed(2)}`,
    );
  }

  if (adapter.statistics.assetQueryCoverage < fixture.expectedAssetQueryCoverage) {
    failures.push(
      `asset query coverage expected >= ${fixture.expectedAssetQueryCoverage} but received ${adapter.statistics.assetQueryCoverage.toFixed(2)}`,
    );
  }

  if (!isTimingWithinTolerance(adapter.statistics.totalDurationMs, targetDurationMs)) {
    failures.push(
      `timing drift too high: total ${adapter.statistics.totalDurationMs}ms vs target ${targetDurationMs}ms`,
    );
  }

  if (!adapter.success) {
    failures.push("adapter result success=false");
  }

  if (!hasAcceptableWarnings(adapter)) {
    failures.push("adapter emitted critical or unexpected warnings");
  }

  if (adapter.mappedScenes.some((scene) => !scene.narrationExcerpt.trim())) {
    failures.push("one or more mapped scenes missing narration excerpts");
  }

  return {
    fixtureName: fixture.name,
    passed: failures.length === 0,
    failures,
  };
}

/** Clones fixture input for mutation checks. */
export function cloneGoldenFixtureInput(
  input: StudioIntelligenceGoldenFixture["input"],
): StudioIntelligenceGoldenFixture["input"] {
  return cloneInput(input);
}

export interface MaterializerGoldenFixtureValidationResult {
  fixtureName: string;
  passed: boolean;
  failures: string[];
  sceneCount: number;
  warnings: readonly { code: string; severity: string; message: string }[];
}

/** Returns whether materializer warnings are non-critical and use acceptable codes. */
export function hasAcceptableMaterializerWarnings(
  result: FootieScriptMaterializerResult,
): boolean {
  if (result.warnings.some((warning) => warning.severity === "error")) {
    return false;
  }

  return result.warnings.every(
    (warning) =>
      ACCEPTABLE_MATERIALIZER_GOLDEN_WARNING_CODES.has(warning.code) || warning.severity === "info",
  );
}

function assertContiguousSceneTiming(
  scenes: { startMs?: number; endMs?: number; durationMs?: number }[],
  failures: string[],
): void {
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (scene.startMs == null || scene.endMs == null || scene.durationMs == null) {
      failures.push(`scene ${index} missing ms timing fields`);
      continue;
    }

    if (scene.endMs - scene.startMs !== scene.durationMs) {
      failures.push(`scene ${index} durationMs does not match start/end window`);
    }

    if (index > 0 && scenes[index - 1]?.endMs !== scene.startMs) {
      failures.push(`scene ${index} is not contiguous with previous scene`);
    }
  }
}

/** Validates runtime → adapter → materializer golden pipeline output. */
export function validateMaterializerGoldenFixtureRun(options: {
  fixture: StudioIntelligenceGoldenFixture;
  intelligence: StudioIntelligenceResult;
  adapter: BlueprintAdapterResult;
  materializer: FootieScriptMaterializerResult;
  inputBefore: StudioIntelligenceGoldenFixture["input"];
  inputAfter: StudioIntelligenceGoldenFixture["input"];
  voiceoverDurationMs: number;
}): MaterializerGoldenFixtureValidationResult {
  const { fixture, intelligence, adapter, materializer, inputBefore, inputAfter, voiceoverDurationMs } =
    options;
  const failures: string[] = [];

  const adapterValidation = validateGoldenFixtureRun({
    fixture,
    intelligence,
    adapter,
    inputBefore,
    inputAfter,
  });

  failures.push(...adapterValidation.failures);

  if (!materializer.success) {
    failures.push("materializer result success=false");
  }

  if (materializer.footieScenes.length === 0) {
    failures.push("materializer produced no footieScenes");
  }

  if (materializer.scenes.length !== materializer.footieScenes.length) {
    failures.push("materializer scenes and footieScenes length mismatch");
  }

  const sceneCount = materializer.footieScenes.length;
  if (sceneCount < fixture.expectedMinimumScenes) {
    failures.push(
      `scene count expected >= ${fixture.expectedMinimumScenes} but received ${sceneCount}`,
    );
  }

  if (sceneCount < MIN_SCENE_COUNT || sceneCount > MAX_SCENE_COUNT) {
    failures.push(
      `scene count ${sceneCount} outside production range ${MIN_SCENE_COUNT}-${MAX_SCENE_COUNT}`,
    );
  }

  const uniqueIds = new Set(materializer.footieScenes.map((scene) => scene.id));
  if (uniqueIds.size !== materializer.footieScenes.length) {
    failures.push("duplicate production scene ids detected");
  }

  assertContiguousSceneTiming(materializer.footieScenes, failures);

  const totalDurationMs = materializer.footieScenes.at(-1)?.endMs ?? 0;
  if (voiceoverDurationMs > 0 && totalDurationMs !== voiceoverDurationMs) {
    failures.push(
      `materialized timeline ${totalDurationMs}ms does not match voiceover ${voiceoverDurationMs}ms`,
    );
  }

  for (const [index, draft] of materializer.scenes.entries()) {
    const scene = draft.scene;

    if (!scene.narration?.trim()) {
      failures.push(`scene ${index} missing narration`);
    }

    if (!scene.subtitle?.trim()) {
      failures.push(`scene ${index} missing subtitle`);
    }

    if (scene.subtitle && !subtitlesWithinWordCap(scene.subtitle, 12)) {
      failures.push(`scene ${index} subtitle exceeds 12-word cap`);
    }

    if (!draft.lineage.sourceBlueprintId?.trim()) {
      failures.push(`scene ${index} missing lineage sourceBlueprintId`);
    }

    if (!draft.lineage.adapterSceneId?.trim()) {
      failures.push(`scene ${index} missing lineage adapterSceneId`);
    }

    if (draft.lineage.sourceBeatIds.length === 0) {
      failures.push(`scene ${index} missing lineage sourceBeatIds`);
    }

    if (scene.image?.url) {
      failures.push(`scene ${index} unexpectedly set image.url`);
    }

    const hasVisualMetadata =
      draft.metadata.visualIntentType != null ||
      Boolean(draft.metadata.visualHints.visualIntentType);
    const hasAssetMetadata =
      Boolean(draft.metadata.assetSearchQuery?.trim()) ||
      Boolean(draft.metadata.mediaHints.searchQuery?.trim());
    const hasMotionMetadata =
      draft.metadata.motionHints.suggestedMotion != null ||
      draft.metadata.defaultImageMotion != null;

    if (!hasVisualMetadata) {
      failures.push(`scene ${index} missing visual metadata hints`);
    }

    if (!hasAssetMetadata) {
      failures.push(`scene ${index} missing asset metadata hints`);
    }

    if (!hasMotionMetadata) {
      failures.push(`scene ${index} missing motion metadata hints`);
    }
  }

  if (!hasAcceptableMaterializerWarnings(materializer)) {
    failures.push("materializer emitted critical or unexpected warnings");
  }

  return {
    fixtureName: fixture.name,
    passed: failures.length === 0,
    failures,
    sceneCount,
    warnings: materializer.warnings.map((warning) => ({
      code: warning.code,
      severity: warning.severity,
      message: warning.message,
    })),
  };
}

/** Summarizes warning codes across materializer golden runs. */
export function summarizeMaterializerGoldenWarnings(
  results: readonly MaterializerGoldenFixtureValidationResult[],
): Readonly<Partial<Record<string, number>>> {
  const counts: Partial<Record<string, number>> = {};

  for (const result of results) {
    for (const warning of result.warnings) {
      counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    }
  }

  return counts;
}
