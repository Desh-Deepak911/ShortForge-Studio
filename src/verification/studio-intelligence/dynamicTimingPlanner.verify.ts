/**
 * Dynamic timing planner verification
 * (run: npm run test:studio-intelligence-dynamic-timing).
 */
import assert from "node:assert/strict";

import type {
  SceneBlueprint,
  SceneBlueprintCollection,
  SceneImportanceScore,
  StudioIntelligenceInput,
} from "@/features/studio-intelligence";
import { createEmptySceneBlueprintCollection } from "@/features/studio-intelligence/scene-blueprint.utils";
import {
  applyDynamicTiming,
  calculateTargetDurationMs,
  enforceTimingBounds,
} from "@/features/studio-intelligence/dynamic-timing-planner";

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
    title: "Scene",
    summary: "Sample summary.",
    importance: makeImportance(0.6),
    timing: {
      suggestedDurationMs: 3000,
      minDurationMs: 2000,
      maxDurationMs: 4500,
      pacing: "normal",
    },
    visual: {
      visualIntentType: "neutral_broll",
    },
    asset: {
      assetRequirementType: "placeholder",
      preferredOrientation: "landscape",
      imageCount: 1,
    },
    motion: {
      suggestedMotion: "static",
      intensity: "low",
    },
    caption: {
      emphasis: "none",
      highlightWords: [],
      captionStyleHint: "default",
    },
    source: "scene_planner",
    confidence: 0.75,
    ...partial,
  };
}

function makeCollection(blueprints: SceneBlueprint[]): SceneBlueprintCollection {
  return {
    blueprints,
    sourceArcIds: ["arc-1"],
    totalSuggestedDurationMs: blueprints.reduce(
      (total, blueprint) => total + blueprint.timing.suggestedDurationMs,
      0,
    ),
    averageImportance: 0.7,
    confidence: 0.78,
    warnings: [],
  };
}

function cloneCollection(collection: SceneBlueprintCollection): SceneBlueprintCollection {
  return JSON.parse(JSON.stringify(collection)) as SceneBlueprintCollection;
}

const input: StudioIntelligenceInput = {
  topic: "Haaland form",
  narration: "Haaland scored again.",
  targetDurationSec: 30,
  targetDurationMs: 30_000,
};

console.log("studio-intelligence-dynamic-timing");

test("hook scene becomes concise", () => {
  const collection = makeCollection([
    makeBlueprint({
      id: "blueprint-1",
      role: "intro",
      kind: "hook_opener",
      importance: makeImportance(0.88),
    }),
    makeBlueprint({
      id: "blueprint-2",
      role: "context",
      kind: "neutral_broll",
      importance: makeImportance(0.5),
    }),
  ]);

  const timed = applyDynamicTiming(collection, input);

  assert.equal(timed.blueprints[0]?.timing.pacing, "punchy");
  assert.ok((timed.blueprints[0]?.timing.suggestedDurationMs ?? 0) < (timed.blueprints[1]?.timing.suggestedDurationMs ?? 0));
});

test("critical/reveal scene receives more duration than low-importance context scene", () => {
  const collection = makeCollection([
    makeBlueprint({
      id: "blueprint-3",
      role: "context",
      kind: "neutral_broll",
      importance: makeImportance(0.38),
    }),
    makeBlueprint({
      id: "blueprint-4",
      role: "climax",
      kind: "match_highlight",
      importance: makeImportance(0.92),
    }),
  ]);

  const timed = applyDynamicTiming(collection, input);

  assert.ok(
    (timed.blueprints[1]?.timing.suggestedDurationMs ?? 0) >
      (timed.blueprints[0]?.timing.suggestedDurationMs ?? 0),
  );
});

test("cta stays short", () => {
  const collection = makeCollection([
    makeBlueprint({
      id: "blueprint-5",
      role: "payoff",
      kind: "closing_moment",
      importance: makeImportance(0.84),
    }),
    makeBlueprint({
      id: "blueprint-6",
      role: "cta",
      kind: "cta_card",
      importance: makeImportance(0.55),
    }),
  ]);

  const timed = applyDynamicTiming(collection, input);

  assert.equal(timed.blueprints[1]?.timing.pacing, "punchy");
  assert.ok((timed.blueprints[1]?.timing.suggestedDurationMs ?? 0) < (timed.blueprints[0]?.timing.suggestedDurationMs ?? 0));
});

test("total suggested duration approaches targetDurationMs", () => {
  const collection = makeCollection([
    makeBlueprint({ id: "blueprint-7", role: "intro", kind: "hook_opener", importance: makeImportance(0.9) }),
    makeBlueprint({ id: "blueprint-8", role: "evidence", kind: "stat_moment", importance: makeImportance(0.72) }),
    makeBlueprint({ id: "blueprint-9", role: "payoff", kind: "closing_moment", importance: makeImportance(0.86) }),
    makeBlueprint({ id: "blueprint-10", role: "cta", kind: "cta_card", importance: makeImportance(0.55) }),
  ]);

  const target = calculateTargetDurationMs(input, collection);
  const timed = applyDynamicTiming(collection, input);
  const total = timed.totalSuggestedDurationMs;

  assert.equal(target, 30_000);
  assert.ok(Math.abs(total - target) <= 500);
});

test("durations respect min/max bounds", () => {
  const collection = makeCollection([
    makeBlueprint({ id: "blueprint-11", role: "evidence", kind: "stat_moment", importance: makeImportance(0.7) }),
  ]);

  const timed = applyDynamicTiming(collection, input);
  const timing = timed.blueprints[0]?.timing;

  assert.ok(timing);
  assert.ok(timing.suggestedDurationMs >= timing.minDurationMs);
  assert.ok(timing.suggestedDurationMs <= timing.maxDurationMs);

  const enforced = enforceTimingBounds({
    suggestedDurationMs: 50,
    minDurationMs: 100,
    maxDurationMs: 5000,
    pacing: "fast",
  });

  assert.ok(enforced.suggestedDurationMs >= enforced.minDurationMs);
  assert.ok(enforced.suggestedDurationMs <= enforced.maxDurationMs);
});

test("empty collection returns valid empty collection", () => {
  const empty = createEmptySceneBlueprintCollection();
  const timed = applyDynamicTiming(empty, input);

  assert.deepEqual(timed, empty);
});

test("original collection is not mutated", () => {
  const collection = makeCollection([
    makeBlueprint({ id: "blueprint-12", role: "intro", kind: "hook_opener", importance: makeImportance(0.88) }),
    makeBlueprint({ id: "blueprint-13", role: "climax", kind: "match_highlight", importance: makeImportance(0.9) }),
  ]);
  const before = cloneCollection(collection);

  applyDynamicTiming(collection, input);

  assert.deepEqual(collection, before);
});

console.log("All dynamic timing planner checks passed.");
