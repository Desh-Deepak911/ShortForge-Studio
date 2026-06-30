/**
 * Blueprint adapter architecture verification
 * (run: npm run test:studio-intelligence-blueprint-adapter).
 */
import assert from "node:assert/strict";

import type { SceneBlueprintCollection } from "@/features/studio-intelligence/scene-blueprint.types";
import { createEmptySceneBlueprintCollection } from "@/features/studio-intelligence/scene-blueprint.utils";
import {
  BLUEPRINT_ADAPTER_VERSION,
  clampAdapterConfidence,
  cloneBlueprintAdapterInput,
  createBlueprintAdapterWarning,
  createEmptyBlueprintAdapterResult,
  isValidBlueprintAdapterInput,
  isValidBlueprintAdapterResult,
} from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.utils";
import type {
  BlueprintAdapterInput,
  BlueprintAdapterResult,
  BlueprintMappedScene,
  SceneMappingDecision,
} from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function createSampleInput(blueprintCount = 0): BlueprintAdapterInput {
  const collection: SceneBlueprintCollection = {
    ...createEmptySceneBlueprintCollection(),
    blueprints: [],
    sourceArcIds: blueprintCount > 0 ? ["arc-1"] : [],
  };

  return {
    collection,
    strategyId: "default",
    topic: "Adapter architecture",
    normalizedNarration: "Sample narration for contract tests.",
    targetDurationMs: 30_000,
    intelligenceRunId: "si-run-contract-test",
  };
}

console.log("studio-intelligence-blueprint-adapter");

test("adapter types accept planning-only input and result shapes", () => {
  const input: BlueprintAdapterInput = createSampleInput();
  const result: BlueprintAdapterResult = createEmptyBlueprintAdapterResult(input);

  assert.equal(input.strategyId, "default");
  assert.equal(result.mappedScenes.length, 0);
  assert.equal(result.success, true);
  assert.equal(result.diagnostics.mappingVersion, BLUEPRINT_ADAPTER_VERSION);
});

test("BlueprintMappedScene and SceneMappingDecision compile as contract shapes", () => {
  const decision: SceneMappingDecision = {
    blueprintId: "bp-1",
    field: "role",
    sourceValue: "intro",
    mappedValue: "intro",
    method: "direct",
    confidence: 1,
  };

  const mappedScene: BlueprintMappedScene = {
    id: "mapped-1",
    order: 0,
    sourceBlueprintId: "bp-1",
    sourceArcId: "arc-1",
    sourceBeatIds: ["beat-hook"],
    blueprintRole: "intro",
    blueprintKind: "hook_opener",
    proposedSceneType: "intro",
    title: "Opening",
    narrationExcerpt: "Hook line.",
    durationMs: 3_000,
    importance: { value: 0.9, tier: "critical" },
    visualIntentType: "player_portrait",
    motionSuggestion: "ken_burns",
    confidence: 0.95,
    visualHints: {
      visualIntentType: "player_portrait",
    },
    mediaHints: {
      assetRequirementType: "image",
      preferredOrientation: "portrait",
      imageCount: 1,
    },
    motionHints: {
      suggestedMotion: "ken_burns",
      intensity: "medium",
    },
    captionHints: {
      emphasis: "none",
      highlightWords: [],
      captionStyleHint: "default",
    },
    timingMetadata: {
      suggestedDurationMs: 3000,
      minDurationMs: 1500,
      maxDurationMs: 4000,
      pacing: "normal",
    },
    narrationMetadata: {
      narrationStartIndex: 0,
      sentenceRange: { start: 0, end: 0 },
      slicingStrategy: "blueprint_summary",
      narrationConfidence: 0.95,
    },
    mappingDecisions: [decision],
  };

  assert.equal(mappedScene.proposedSceneType, "intro");
  assert.equal(mappedScene.mappingDecisions.length, 1);
});

test("isValidBlueprintAdapterInput validates collection presence", () => {
  assert.equal(isValidBlueprintAdapterInput(createSampleInput()), true);
  assert.equal(isValidBlueprintAdapterInput(null), false);
  assert.equal(
    isValidBlueprintAdapterInput({
      collection: undefined as unknown as SceneBlueprintCollection,
    }),
    false,
  );
  assert.equal(
    isValidBlueprintAdapterInput({
      collection: createEmptySceneBlueprintCollection(),
      targetDurationMs: -1,
    }),
    false,
  );
});

test("createEmptyBlueprintAdapterResult returns valid contract shell", () => {
  const input = createSampleInput(2);
  input.collection.blueprints = [{ id: "bp-1" }, { id: "bp-2" }] as BlueprintAdapterInput["collection"]["blueprints"];
  const result = createEmptyBlueprintAdapterResult(input);

  assert.ok(isValidBlueprintAdapterResult(result));
  assert.equal(result.statistics.sceneCount, 0);
  assert.equal(result.diagnostics.processedBlueprintCount, 2);
  assert.equal(result.diagnostics.skippedBlueprintCount, 0);
  assert.deepEqual(result.statistics.mappedVisualIntents, {});
  assert.deepEqual(result.statistics.mappedMotions, {});
});

test("clampAdapterConfidence enforces normalized bounds", () => {
  assert.equal(clampAdapterConfidence(1.5), 1);
  assert.equal(clampAdapterConfidence(-0.2), 0);
  assert.equal(clampAdapterConfidence(Number.NaN), 0);
  assert.equal(clampAdapterConfidence(0.72), 0.72);
});

test("cloneBlueprintAdapterInput does not share blueprint array reference", () => {
  const input = createSampleInput();
  const clone = cloneBlueprintAdapterInput(input);

  clone.collection.blueprints.push({ id: "bp-new" } as BlueprintAdapterInput["collection"]["blueprints"][number]);

  assert.equal(input.collection.blueprints.length, 0);
  assert.equal(clone.collection.blueprints.length, 1);
});

test("createBlueprintAdapterWarning builds structured warnings", () => {
  const warning = createBlueprintAdapterWarning(
    "UNMAPPED_FIELD",
    "Caption emphasis not mapped in 3.4A.",
    "info",
    "bp-1",
    "caption.emphasis",
  );

  assert.equal(warning.code, "UNMAPPED_FIELD");
  assert.equal(warning.severity, "info");
  assert.equal(warning.blueprintId, "bp-1");
});

test("architecture phase exposes adapter contract utilities", () => {
  assert.equal(BLUEPRINT_ADAPTER_VERSION, "0.3.0");
  assert.equal(typeof createEmptyBlueprintAdapterResult, "function");
  assert.equal(typeof isValidBlueprintAdapterResult, "function");
});

console.log("All blueprint adapter architecture checks passed.");
