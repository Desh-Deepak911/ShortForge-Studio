/**
 * Scene blueprint architecture verification
 * (run: npm run test:studio-intelligence-blueprints).
 */
import assert from "node:assert/strict";

import type { SceneBlueprint, SceneImportanceScore } from "@/features/studio-intelligence";
import {
  calculateBlueprintCollectionStats,
  clampBlueprintConfidence,
  createEmptySceneBlueprintCollection,
  createSceneBlueprintId,
  mapImportanceToMotionIntensity,
  mapVisualIntentToAssetRequirement,
  normalizeAssetSearchQuery,
  refreshBlueprintCollectionStats,
} from "@/features/studio-intelligence/scene-blueprint.utils";

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

function makeBlueprint(partial: Partial<SceneBlueprint> & Pick<SceneBlueprint, "id">): SceneBlueprint {
  return {
    arcId: "arc-1",
    beatIds: ["beat-1"],
    role: "intro",
    kind: "hook_opener",
    title: "Opening hook",
    summary: "Grab attention with a punchy opener.",
    importance: makeImportance(0.8),
    timing: {
      suggestedDurationMs: 2500,
      minDurationMs: 1500,
      maxDurationMs: 4000,
      pacing: "punchy",
      reason: "Short hook pacing.",
    },
    visual: {
      visualIntentType: "player_portrait",
      subject: "Haaland",
      reason: "Player-led opener.",
    },
    asset: {
      assetRequirementType: "image",
      searchQuery: "erling haaland portrait",
      fallbackQuery: "manchester city striker",
      preferredOrientation: "portrait",
      imageCount: 1,
      reason: "Portrait-led hook.",
    },
    motion: {
      suggestedMotion: "push_in",
      intensity: "high",
      reason: "High-importance opener.",
    },
    caption: {
      emphasis: "phrase",
      highlightWords: ["insane"],
      captionStyleHint: "bold_hook",
      reason: "Hook emphasis.",
    },
    source: "narrative_arc",
    confidence: 0.82,
    ...partial,
  };
}

console.log("studio-intelligence-blueprints");

test("empty blueprint collection is valid", () => {
  const collection = createEmptySceneBlueprintCollection();

  assert.deepEqual(collection.blueprints, []);
  assert.deepEqual(collection.sourceArcIds, []);
  assert.equal(collection.totalSuggestedDurationMs, 0);
  assert.equal(collection.averageImportance, 0);
  assert.equal(collection.confidence, 1);
  assert.deepEqual(collection.warnings, []);
});

test("blueprint stats calculate total duration and average importance", () => {
  const blueprints = [
    makeBlueprint({
      id: createSceneBlueprintId(0),
      arcId: "arc-1",
      timing: {
        suggestedDurationMs: 2000,
        minDurationMs: 1500,
        maxDurationMs: 3000,
        pacing: "fast",
      },
      importance: makeImportance(0.8),
      confidence: 0.9,
    }),
    makeBlueprint({
      id: createSceneBlueprintId(1),
      arcId: "arc-2",
      timing: {
        suggestedDurationMs: 3000,
        minDurationMs: 2000,
        maxDurationMs: 4500,
        pacing: "normal",
      },
      importance: makeImportance(0.6),
      confidence: 0.7,
    }),
  ];

  const stats = calculateBlueprintCollectionStats(blueprints);

  assert.equal(stats.totalSuggestedDurationMs, 5000);
  assert.equal(stats.averageImportance, 0.7);
  assert.equal(stats.confidence, 0.8);
  assert.deepEqual(stats.sourceArcIds.sort(), ["arc-1", "arc-2"]);

  const refreshed = refreshBlueprintCollectionStats({
    ...createEmptySceneBlueprintCollection(),
    blueprints,
    warnings: ["sample warning"],
  });

  assert.equal(refreshed.totalSuggestedDurationMs, 5000);
  assert.equal(refreshed.averageImportance, 0.7);
  assert.deepEqual(refreshed.warnings, ["sample warning"]);
});

test("visual intent maps to reasonable asset requirement", () => {
  assert.equal(mapVisualIntentToAssetRequirement("player_portrait"), "image");
  assert.equal(mapVisualIntentToAssetRequirement("match_action"), "video_clip");
  assert.equal(mapVisualIntentToAssetRequirement("stat_overlay"), "stat_card");
  assert.equal(mapVisualIntentToAssetRequirement("team_crest"), "logo");
  assert.equal(mapVisualIntentToAssetRequirement("text_card"), "generated_graphic");
});

test("importance maps to motion intensity", () => {
  assert.equal(mapImportanceToMotionIntensity(makeImportance(0.9)), "high");
  assert.equal(mapImportanceToMotionIntensity(makeImportance(0.7)), "medium");
  assert.equal(mapImportanceToMotionIntensity(makeImportance(0.4)), "low");
  assert.equal(mapImportanceToMotionIntensity(0.88), "high");
});

test("search query normalization works", () => {
  assert.equal(normalizeAssetSearchQuery("  Erling   Haaland!!!  "), "erling haaland");
  assert.equal(normalizeAssetSearchQuery(""), "");
  assert.equal(normalizeAssetSearchQuery(null), "");
});

test("confidence clamps between 0 and 1", () => {
  assert.equal(clampBlueprintConfidence(1.4), 1);
  assert.equal(clampBlueprintConfidence(-0.2), 0);
  assert.equal(clampBlueprintConfidence(Number.NaN), 0);
  assert.equal(clampBlueprintConfidence(0.4567), 0.457);
});

console.log("All scene blueprint architecture checks passed.");
