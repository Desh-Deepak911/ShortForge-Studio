/**
 * Blueprint mapper verification
 * (run: npm run test:studio-intelligence-blueprint-mapper).
 */
import assert from "node:assert/strict";

import type { SceneBlueprint, SceneBlueprintCollection, SceneImportanceScore } from "@/features/studio-intelligence";
import { createEmptySceneBlueprintCollection } from "@/features/studio-intelligence/scene-blueprint.utils";
import {
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
} from "@/features/studio-intelligence/studio-intelligence.constants";
import type { BlueprintAdapterInput } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import { cloneBlueprintAdapterInput } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.utils";
import {
  collectBlueprintMapperWarnings,
  mapBlueprintAssetToMediaHints,
  mapBlueprintCaptionToCaptionHints,
  mapBlueprintKindToSceneType,
  mapBlueprintMotionToMotionPreset,
  mapBlueprintRoleToSceneRole,
  mapBlueprintsToScenes,
  mapBlueprintTimingToSceneDuration,
  mapBlueprintToScene,
  mapBlueprintVisualToSceneHints,
} from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeImportance(value: number): SceneImportanceScore {
  return {
    value,
    tier: value >= 0.85 ? "critical" : value >= 0.65 ? "high" : value >= 0.35 ? "medium" : "low",
  };
}

function makeBlueprint(partial: Partial<SceneBlueprint> & Pick<SceneBlueprint, "id" | "role" | "kind">): SceneBlueprint {
  return {
    arcId: "arc-1",
    beatIds: ["beat-1"],
    title: partial.title ?? "Scene",
    summary: partial.summary ?? "Haaland scored again and changed the title race.",
    importance: makeImportance(0.72),
    timing: {
      suggestedDurationMs: 2500,
      minDurationMs: 1500,
      maxDurationMs: 4000,
      pacing: "normal",
    },
    visual: {
      visualIntentType: "player_portrait",
      composition: "Close-up portrait framing.",
      subject: "Erling Haaland",
      emotion: "intense",
    },
    asset: {
      assetRequirementType: "image",
      searchQuery: "Erling Haaland portrait action",
      fallbackQuery: "football striker highlights",
      preferredOrientation: "portrait",
      imageCount: 1,
    },
    motion: {
      suggestedMotion: "ken_burns",
      intensity: "medium",
    },
    caption: {
      emphasis: "phrase",
      highlightWords: ["Haaland", "title race"],
      captionStyleHint: "bold_hook",
    },
    source: "scene_planner",
    confidence: 0.82,
    ...partial,
  };
}

function makeInput(blueprints: SceneBlueprint[]): BlueprintAdapterInput {
  const collection: SceneBlueprintCollection = {
    ...createEmptySceneBlueprintCollection(),
    blueprints,
    sourceArcIds: ["arc-1"],
    totalSuggestedDurationMs: blueprints.reduce(
      (total, blueprint) => total + (blueprint.timing?.suggestedDurationMs ?? 0),
      0,
    ),
    averageImportance: 0.72,
    confidence: 0.8,
    warnings: [],
  };

  return {
    collection,
    strategyId: "default",
    topic: "Haaland form",
    normalizedNarration: "Haaland scored again and changed the title race.",
    targetDurationMs: 30_000,
  };
}

console.log("studio-intelligence-blueprint-mapper");

test("single blueprint maps to BlueprintMappedScene", () => {
  const blueprint = makeBlueprint({ id: "bp-hook", role: "intro", kind: "hook_opener" });
  const mapped = mapBlueprintToScene(blueprint);

  assert.equal(mapped.sourceBlueprintId, "bp-hook");
  assert.equal(mapped.sourceArcId, "arc-1");
  assert.deepEqual(mapped.sourceBeatIds, ["beat-1"]);
  assert.equal(mapped.id, "mapped:bp-hook");
  assert.equal(mapped.proposedSceneType, "intro");
  assert.equal(mapped.blueprintRole, "intro");
  assert.equal(mapped.narrationExcerpt, blueprint.summary);
  assert.ok(mapped.mappingDecisions.length >= 3);
});

test("timing maps and clamps to safe bounds", () => {
  const blueprint = makeBlueprint({
    id: "bp-timing",
    role: "evidence",
    kind: "stat_moment",
    timing: {
      suggestedDurationMs: 50_000,
      minDurationMs: 1000,
      maxDurationMs: 20_000,
      pacing: "fast",
    },
  });

  const { durationMs, timingMetadata } = mapBlueprintTimingToSceneDuration(blueprint);
  assert.equal(durationMs, STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS);
  assert.equal(timingMetadata.suggestedDurationMs, 50_000);
  assert.equal(timingMetadata.pacing, "fast");

  const lowBlueprint = makeBlueprint({
    id: "bp-low-timing",
    role: "context",
    kind: "neutral_broll",
    timing: {
      suggestedDurationMs: 0,
      minDurationMs: 1000,
      maxDurationMs: 4000,
      pacing: "normal",
    },
  });
  const lowTiming = mapBlueprintTimingToSceneDuration(lowBlueprint);
  assert.equal(lowTiming.durationMs, STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS);
});

test("visual hints map from blueprint visual sub-contract", () => {
  const blueprint = makeBlueprint({ id: "bp-visual", role: "intro", kind: "hook_opener" });
  const hints = mapBlueprintVisualToSceneHints(blueprint);

  assert.equal(hints.visualIntentType, "player_portrait");
  assert.equal(hints.composition, "Close-up portrait framing.");
  assert.equal(hints.subject, "Erling Haaland");
  assert.equal(hints.emotion, "intense");
});

test("asset hints map from blueprint asset sub-contract", () => {
  const blueprint = makeBlueprint({ id: "bp-asset", role: "evidence", kind: "stat_moment" });
  const hints = mapBlueprintAssetToMediaHints(blueprint);

  assert.equal(hints.assetRequirementType, "image");
  assert.equal(hints.searchQuery, "Erling Haaland portrait action");
  assert.equal(hints.fallbackQuery, "football striker highlights");
  assert.equal(hints.preferredOrientation, "portrait");
  assert.equal(hints.imageCount, 1);
});

test("motion hints map from blueprint motion sub-contract", () => {
  const blueprint = makeBlueprint({ id: "bp-motion", role: "climax", kind: "match_highlight" });
  const hints = mapBlueprintMotionToMotionPreset(blueprint);

  assert.equal(hints.suggestedMotion, "ken_burns");
  assert.equal(hints.intensity, "medium");
  assert.equal(mapBlueprintRoleToSceneRole(blueprint), "match");
  assert.equal(mapBlueprintKindToSceneType(blueprint), "match");
});

test("caption hints map from blueprint caption sub-contract", () => {
  const blueprint = makeBlueprint({ id: "bp-caption", role: "intro", kind: "hook_opener" });
  const hints = mapBlueprintCaptionToCaptionHints(blueprint);

  assert.equal(hints.emphasis, "phrase");
  assert.deepEqual(hints.highlightWords, ["Haaland", "title race"]);
  assert.equal(hints.captionStyleHint, "bold_hook");
  assert.equal(hints.captionText, "Haaland title race");
});

test("low confidence warning emitted for sparse blueprint", () => {
  const blueprint = makeBlueprint({
    id: "bp-low-confidence",
    role: "context",
    kind: "neutral_broll",
    confidence: 0.1,
    visual: {} as SceneBlueprint["visual"],
    asset: {
      assetRequirementType: "placeholder",
      preferredOrientation: "landscape",
      imageCount: 1,
    },
    motion: {} as SceneBlueprint["motion"],
    caption: {} as SceneBlueprint["caption"],
    timing: {
      suggestedDurationMs: 0,
      minDurationMs: 1000,
      maxDurationMs: 3000,
      pacing: "normal",
    },
  });

  const warnings = collectBlueprintMapperWarnings(blueprint);
  assert.ok(warnings.some((warning) => warning.code === "LOW_CONFIDENCE"));
  assert.ok(warnings.some((warning) => warning.code === "MISSING_TIMING"));
  assert.ok(warnings.some((warning) => warning.code === "MISSING_VISUAL"));
  assert.ok(warnings.some((warning) => warning.code === "MISSING_ASSET_QUERY"));
});

test("empty collection returns mappedScenes=[] with warning and success=false", () => {
  const result = mapBlueprintsToScenes(makeInput([]));

  assert.deepEqual(result.mappedScenes, []);
  assert.equal(result.success, false);
  assert.ok(result.warnings.some((warning) => warning.code === "EMPTY_BLUEPRINT_COLLECTION"));
  assert.equal(result.diagnostics.processedBlueprintCount, 0);
});

test("input is not mutated during batch mapping", () => {
  const blueprint = makeBlueprint({ id: "bp-mutation", role: "payoff", kind: "closing_moment" });
  const input = makeInput([blueprint]);
  const before = cloneBlueprintAdapterInput(input);

  mapBlueprintsToScenes(input);

  assert.deepEqual(input.collection.blueprints, before.collection.blueprints);
  assert.deepEqual(input, before);
});

test("batch mapping produces statistics and diagnostics", () => {
  const blueprints = [
    makeBlueprint({ id: "bp-1", role: "intro", kind: "hook_opener" }),
    makeBlueprint({ id: "bp-2", role: "climax", kind: "match_highlight" }),
  ];
  const result = mapBlueprintsToScenes(makeInput(blueprints));

  assert.equal(result.mappedScenes.length, 2);
  assert.equal(result.statistics.sceneCount, 2);
  assert.equal(result.diagnostics.processedBlueprintCount, 2);
  assert.equal(result.diagnostics.skippedBlueprintCount, 0);
  assert.ok(result.statistics.totalDurationMs > 0);
  assert.equal(result.success, true);
  assert.equal(result.mappedScenes[0]?.order, 0);
  assert.equal(result.mappedScenes[1]?.order, 1);
});

console.log("All blueprint mapper checks passed.");
