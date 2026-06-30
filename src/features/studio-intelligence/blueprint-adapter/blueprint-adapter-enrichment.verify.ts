/**
 * Blueprint adapter enrichment verification
 * (run: npm run test:studio-intelligence-blueprint-adapter-enrichment).
 */
import assert from "node:assert/strict";

import type { SceneBlueprint, SceneBlueprintCollection, SceneImportanceScore } from "@/features/studio-intelligence";
import { createEmptySceneBlueprintCollection } from "@/features/studio-intelligence/scene-blueprint.utils";
import {
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
} from "@/features/studio-intelligence/studio-intelligence.constants";
import type { BlueprintAdapterInput } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import {
  cloneBlueprintAdapterInput,
  LOW_CONFIDENCE_THRESHOLD,
} from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.utils";
import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";

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
    beatIds: partial.beatIds ?? ["beat-1"],
    title: partial.title ?? "Scene",
    summary: partial.summary ?? "This is a meaningful blueprint summary for narration mapping.",
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
      highlightWords: ["Haaland"],
      captionStyleHint: "bold_hook",
    },
    source: "scene_planner",
    confidence: 0.82,
    ...partial,
  };
}

function makeInput(
  blueprints: SceneBlueprint[],
  overrides?: Partial<BlueprintAdapterInput>,
): BlueprintAdapterInput {
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
    normalizedNarration:
      "This is insane. Haaland scored again. The league noticed. Ultimately he changed the title race.",
    targetDurationMs: 30_000,
    ...overrides,
  };
}

console.log("studio-intelligence-blueprint-adapter-enrichment");

test("narration splits across mapped scenes", () => {
  const blueprints = [
    makeBlueprint({
      id: "bp-1",
      role: "intro",
      kind: "hook_opener",
      summary: "Short",
      beatIds: [],
    }),
    makeBlueprint({
      id: "bp-2",
      role: "climax",
      kind: "match_highlight",
      summary: "Short",
      beatIds: [],
    }),
  ];

  const result = mapBlueprintsToScenes(makeInput(blueprints));
  const excerpts = result.mappedScenes.map((scene) => scene.narrationExcerpt);

  assert.equal(result.mappedScenes.length, 2);
  assert.ok(excerpts.every((excerpt) => excerpt.length > 0));
  assert.notEqual(excerpts[0], excerpts[1]);
  assert.equal(result.mappedScenes[0]?.narrationMetadata.slicingStrategy, "proportional_sentences");
  assert.equal(result.mappedScenes[1]?.narrationMetadata.slicingStrategy, "proportional_sentences");
  assert.ok(result.mappedScenes[0]?.narrationMetadata.sentenceRange.start >= 0);
});

test("empty narration creates fallback warning", () => {
  const blueprints = [
    makeBlueprint({ id: "bp-1", role: "intro", kind: "hook_opener", summary: "Short", beatIds: [] }),
  ];

  const result = mapBlueprintsToScenes(
    makeInput(blueprints, {
      normalizedNarration: "   ",
    }),
  );

  assert.ok(result.warnings.some((warning) => warning.code === "MISSING_NARRATION"));
  assert.ok(
    result.warnings.some(
      (warning) => warning.code === "NARRATION_SLICE_FALLBACK" || warning.code === "MISSING_NARRATION",
    ),
  );
});

test("statistics calculate duration min/max/average", () => {
  const blueprints = [
    makeBlueprint({ id: "bp-1", role: "intro", kind: "hook_opener", timing: { suggestedDurationMs: 2000, minDurationMs: 1000, maxDurationMs: 3000, pacing: "normal" } }),
    makeBlueprint({ id: "bp-2", role: "climax", kind: "match_highlight", timing: { suggestedDurationMs: 4000, minDurationMs: 2000, maxDurationMs: 6000, pacing: "fast" } }),
  ];

  const result = mapBlueprintsToScenes(makeInput(blueprints));

  assert.equal(result.statistics.sceneCount, 2);
  assert.equal(result.statistics.totalDurationMs, 6000);
  assert.equal(result.statistics.averageSceneDurationMs, 3000);
  assert.equal(result.statistics.minSceneDurationMs, 2000);
  assert.equal(result.statistics.maxSceneDurationMs, 4000);
});

test("coverage metrics calculate correctly", () => {
  const blueprints = [
    makeBlueprint({ id: "bp-1", role: "intro", kind: "hook_opener" }),
    makeBlueprint({
      id: "bp-2",
      role: "context",
      kind: "neutral_broll",
      summary: "",
      visual: { visualIntentType: "neutral_broll" },
      asset: { assetRequirementType: "placeholder", preferredOrientation: "landscape", imageCount: 1 },
      motion: { suggestedMotion: "static", intensity: "low" },
      caption: { emphasis: "none", highlightWords: [], captionStyleHint: "default" },
    }),
  ];

  const result = mapBlueprintsToScenes(makeInput(blueprints));

  assert.equal(result.statistics.visualIntentCoverage, 0.5);
  assert.equal(result.statistics.assetQueryCoverage, 0.5);
  assert.equal(result.statistics.motionCoverage, 0.5);
  assert.equal(result.statistics.captionCoverage, 0.5);
});

test("diagnostics record fallbacks and warning counts", () => {
  const blueprints = [
    makeBlueprint({
      id: "bp-clamp",
      role: "evidence",
      kind: "stat_moment",
      timing: {
        suggestedDurationMs: STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS + 5000,
        minDurationMs: 1000,
        maxDurationMs: STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
        pacing: "fast",
      },
      asset: { assetRequirementType: "image", preferredOrientation: "landscape", imageCount: 1 },
    }),
  ];

  const result = mapBlueprintsToScenes(makeInput(blueprints));

  assert.equal(result.diagnostics.processedBlueprintCount, 1);
  assert.ok(result.diagnostics.fallbacksUsed.includes("timing.clamp_bounds"));
  assert.ok((result.diagnostics.warningCountsByType.DURATION_OUT_OF_BOUNDS ?? 0) >= 1);
  assert.ok(Object.keys(result.diagnostics.warningCountsByType).length > 0);
});

test("low confidence scene IDs recorded", () => {
  const blueprints = [
    makeBlueprint({
      id: "bp-low",
      role: "context",
      kind: "neutral_broll",
      confidence: 0.1,
      visual: {} as SceneBlueprint["visual"],
      asset: { assetRequirementType: "placeholder", preferredOrientation: "landscape", imageCount: 1 },
      motion: {} as SceneBlueprint["motion"],
      caption: {} as SceneBlueprint["caption"],
      timing: { suggestedDurationMs: 0, minDurationMs: 1000, maxDurationMs: 3000, pacing: "normal" },
    }),
  ];

  const result = mapBlueprintsToScenes(makeInput(blueprints, { normalizedNarration: "" }));

  assert.ok(result.diagnostics.lowConfidenceSceneIds.includes("mapped:bp-low"));
  assert.ok(result.mappedScenes[0]?.confidence < LOW_CONFIDENCE_THRESHOLD);
});

test("input is not mutated during enriched mapping", () => {
  const blueprints = [makeBlueprint({ id: "bp-1", role: "intro", kind: "hook_opener" })];
  const input = makeInput(blueprints);
  const before = cloneBlueprintAdapterInput(input);

  mapBlueprintsToScenes(input);

  assert.deepEqual(input, before);
});

test("meaningful blueprint summaries use summary slicing strategy", () => {
  const blueprints = [
    makeBlueprint({
      id: "bp-summary",
      role: "intro",
      kind: "hook_opener",
      summary: "Haaland scored again and the league finally noticed his impact.",
      beatIds: ["beat-hook"],
    }),
  ];

  const result = mapBlueprintsToScenes(makeInput(blueprints));

  assert.equal(result.mappedScenes[0]?.narrationMetadata.slicingStrategy, "blueprint_summary");
  assert.equal(result.diagnostics.narrationSlicingStrategy, "blueprint_summary");
  assert.ok(result.mappedScenes[0]?.narrationMetadata.narrationConfidence >= 0.9);
});

console.log("All blueprint adapter enrichment checks passed.");
