/**
 * Visual planner verification
 * (run: npm run test:studio-intelligence-visual-planner).
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
  createMotionBlueprintForScene,
  createVisualBlueprintForScene,
  enrichBlueprintsWithVisuals,
  inferVisualIntentFromRole,
} from "@/features/studio-intelligence/visual-planner";

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
    summary: partial.summary ?? "Sample summary.",
    importance: makeImportance(0.7),
    timing: {
      suggestedDurationMs: 2500,
      minDurationMs: 1500,
      maxDurationMs: 4000,
      pacing: "normal",
    },
    visual: {
      visualIntentType: "neutral_broll",
      reason: "placeholder",
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
    confidence: 0.7,
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
    confidence: 0.75,
    warnings: [],
  };
}

function cloneCollection(collection: SceneBlueprintCollection): SceneBlueprintCollection {
  return JSON.parse(JSON.stringify(collection)) as SceneBlueprintCollection;
}

const input: StudioIntelligenceInput = {
  topic: "Erling Haaland title race",
  narration: "Haaland scored again.",
  targetDurationSec: 45,
  mode: "player_analysis",
  entities: ["Erling Haaland", "Manchester City"],
};

console.log("studio-intelligence-visual-planner");

test("hook blueprint gets subject-focused visual intent", () => {
  const blueprint = makeBlueprint({
    id: "blueprint-1",
    role: "intro",
    kind: "hook_opener",
    summary: "This is insane. Haaland just broke another record.",
    importance: makeImportance(0.9),
  });

  const visual = createVisualBlueprintForScene(blueprint, input);

  assert.equal(visual.visualIntentType, "player_portrait");
  assert.match(visual.composition ?? "", /close-up/i);
  assert.ok(visual.subject?.toLowerCase().includes("haaland") || visual.subject?.toLowerCase().includes("insane"));
});

test("evidence/stat blueprint gets stat/supporting asset requirement", () => {
  const blueprint = makeBlueprint({
    id: "blueprint-2",
    role: "evidence",
    kind: "stat_moment",
    summary: "He scored 30 goals with a 92% shot conversion record.",
    importance: makeImportance(0.72),
  });

  const visual = createVisualBlueprintForScene(blueprint, input);
  const enriched = enrichBlueprintsWithVisuals(makeCollection([blueprint]), input).blueprints[0];

  assert.equal(inferVisualIntentFromRole("evidence", "stat_moment", blueprint.summary), "stat_overlay");
  assert.equal(visual.visualIntentType, "stat_overlay");
  assert.equal(enriched?.asset.assetRequirementType, "stat_card");
});

test("debate/conflict blueprint gets comparison/text-card style visual", () => {
  const blueprint = makeBlueprint({
    id: "blueprint-3",
    role: "conflict",
    kind: "debate_split",
    summary: "Some say he is overrated, however critics argue the stats disagree.",
    importance: makeImportance(0.74),
  });

  const visual = createVisualBlueprintForScene(blueprint, input);

  assert.ok(["comparison_split", "text_card"].includes(visual.visualIntentType));
  assert.match(visual.composition ?? "", /split|text-card|comparison/i);
});

test("ending blueprint gets closing/emotional visual", () => {
  const blueprint = makeBlueprint({
    id: "blueprint-4",
    role: "payoff",
    kind: "closing_moment",
    summary: "Ultimately, that legacy impact proves he changed the title race.",
    importance: makeImportance(0.86),
  });

  const visual = createVisualBlueprintForScene(blueprint, input);

  assert.ok(["archive_footage", "crowd_atmosphere"].includes(visual.visualIntentType));
});

test("motion intensity follows importance", () => {
  const highBlueprint = makeBlueprint({
    id: "blueprint-5",
    role: "climax",
    kind: "match_highlight",
    importance: makeImportance(0.92),
  });
  const lowBlueprint = makeBlueprint({
    id: "blueprint-6",
    role: "context",
    kind: "neutral_broll",
    importance: makeImportance(0.38),
  });

  const highVisual = createVisualBlueprintForScene(highBlueprint, input);
  const lowVisual = createVisualBlueprintForScene(lowBlueprint, input);
  const highMotion = createMotionBlueprintForScene(highBlueprint, highVisual);
  const lowMotion = createMotionBlueprintForScene(lowBlueprint, lowVisual);

  assert.equal(highMotion.intensity, "high");
  assert.notEqual(highMotion.suggestedMotion, "static");
  assert.equal(lowMotion.intensity, "low");
  assert.equal(lowMotion.suggestedMotion, "static");
});

test("search query uses topic and entities when provided", () => {
  const blueprint = makeBlueprint({
    id: "blueprint-7",
    role: "intro",
    kind: "player_spotlight",
    summary: "Haaland dominates again.",
  });

  const enriched = enrichBlueprintsWithVisuals(makeCollection([blueprint]), input).blueprints[0];

  assert.ok(enriched?.asset.searchQuery.includes("haaland"));
  assert.ok(enriched?.asset.searchQuery.includes("erling"));
  assert.ok(enriched?.asset.fallbackQuery.includes("haaland") || enriched?.asset.fallbackQuery.includes("title race"));
});

test("enrichment does not mutate original collection", () => {
  const collection = makeCollection([
    makeBlueprint({
      id: "blueprint-8",
      role: "evidence",
      kind: "stat_moment",
      summary: "20 goals in 24 matches.",
    }),
  ]);
  const before = cloneCollection(collection);

  enrichBlueprintsWithVisuals(collection, input);

  assert.deepEqual(collection, before);
});

test("empty collection returns valid empty collection", () => {
  const empty = createEmptySceneBlueprintCollection();
  const enriched = enrichBlueprintsWithVisuals(empty, input);

  assert.deepEqual(enriched, empty);
});

console.log("All visual planner checks passed.");
