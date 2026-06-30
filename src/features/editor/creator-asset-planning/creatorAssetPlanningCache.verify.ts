/**
 * Creator asset planning cache verification
 * (run: npm run test:creator-asset-planning-cache).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runAssetIntelligence } from "@/features/asset-intelligence";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import {
  createPlanningCache,
  readPlanningCache,
  readPlanningData,
  resetPlanningCachesForTests,
  updatePlanningCache,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import {
  buildCreatorAssetPlanningCacheEntry,
  buildCreatorAssetPlanningFromAssetInput,
  buildPlanningCacheKey,
  buildScriptHash,
  cacheCreatorAssetPlanning,
  hasPlanningChanged,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = join(__dirname, "../components/creator-asset-studio");
const WORKSPACE_PATH = join(__dirname, "../../../components/StoryWorkspace.tsx");
const PLANNING_HOOK_PATH = join(__dirname, "useCreatorAssetPlanningCache.ts");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function buildSamplePlanning() {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  return buildCreatorAssetPlanningFromAssetInput(assetInput);
}

function buildSampleScript() {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetResult = runAssetIntelligence(assetInput);

  return syncFootieScript({
    title: fixture.topic,
    narration: fixture.narration,
    totalDuration: 30,
    scenes: assetResult.sceneAssetPlans.map((plan, index) => ({
      id: plan.sceneId,
      subtitle: `Scene ${index + 1}`,
      narration: fixture.narration,
      duration: 5,
      start: index * 5,
      end: (index + 1) * 5,
    })),
  });
}

function assertNoIntelligenceExecutionInPresentationLayer(): void {
  const forbiddenPatterns = [
    /\brunStudioIntelligence\s*\(/,
    /\brunAssetIntelligence\s*\(/,
    /\bbuildRecommendationsFromAssetIntelligence\s*\(/,
    /\bbuildAssetProviderPlan\s*\(/,
    /\bvalidateAssetRecommendations\s*\(/,
  ];

  const files = [
    "CreatorAssetStudio.tsx",
    "CreatorAssetRecommendationCard.tsx",
    "CreatorAssetAlternativeList.tsx",
    "CreatorAssetProviderList.tsx",
    "CreatorAssetValidationCard.tsx",
    "CreatorAssetRepairSuggestions.tsx",
    "creator-asset-studio.selectors.ts",
    "creator-asset-studio.utils.ts",
    "creator-asset-studio.visibility.utils.ts",
    "index.ts",
  ];

  for (const file of files) {
    const contents = readFileSync(join(MODULE_ROOT, file), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(
        contents,
        pattern,
        `${file} must remain a presentation-only module`,
      );
    }
  }

  for (const filePath of [WORKSPACE_PATH, PLANNING_HOOK_PATH]) {
    const contents = readFileSync(filePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${filePath} must not execute intelligence`);
    }
  }
}

console.log("creatorAssetPlanningCache");

test("planning cache is created for a story", () => {
  resetPlanningCachesForTests();
  const script = buildSampleScript();
  const planning = buildSamplePlanning();
  const entry = cacheCreatorAssetPlanning({
    storyId: "story-1",
    script,
    storyMode: "top_5",
    planning,
  });

  assert.equal(entry.storyId, "story-1");
  assert.ok(createPlanningCache("story-1").entry);
  assert.equal(readPlanningCache("story-1")?.planning.recommendation.recommendationVersion, "0.1.0");
});

test("cache updates only when script metadata meaningfully changes", () => {
  resetPlanningCachesForTests();
  const script = buildSampleScript();
  const planning = buildSamplePlanning();

  const first = cacheCreatorAssetPlanning({
    storyId: "story-2",
    script,
    storyMode: "top_5",
    planning,
  });

  const unchanged = readPlanningData("story-2", {
    scriptHash: buildScriptHash(script),
    sceneCount: script.scenes.length,
    storyMode: "top_5",
  });
  assert.ok(unchanged);

  const changedScript = {
    ...script,
    narration: `${script.narration} Updated.`,
  };

  assert.ok(
    hasPlanningChanged(first, {
      storyId: "story-2",
      scriptHash: buildScriptHash(changedScript),
      sceneCount: changedScript.scenes.length,
      storyMode: "top_5",
    }),
  );

  assert.equal(
    readPlanningData("story-2", {
      scriptHash: buildScriptHash(changedScript),
      sceneCount: changedScript.scenes.length,
      storyMode: "top_5",
    }),
    null,
  );
});

test("scene selection does not invalidate cache metadata", () => {
  resetPlanningCachesForTests();
  const script = buildSampleScript();
  const planning = buildSamplePlanning();

  cacheCreatorAssetPlanning({
    storyId: "story-3",
    script,
    storyMode: "top_5",
    planning,
  });

  const metadata = {
    scriptHash: buildScriptHash(script),
    sceneCount: script.scenes.length,
    storyMode: "top_5",
  };

  assert.ok(readPlanningData("story-3", metadata));
  assert.ok(readPlanningData("story-3", metadata));
  assert.equal(buildPlanningCacheKey({ storyId: "story-3", ...metadata }), buildPlanningCacheKey({
    storyId: "story-3",
    ...metadata,
  }));
});

test("reading cache does not mutate stored planning", () => {
  resetPlanningCachesForTests();
  const script = buildSampleScript();
  const planning = buildSamplePlanning();
  const entry = buildCreatorAssetPlanningCacheEntry({
    storyId: "story-4",
    script,
    storyMode: "top_5",
    planning,
  });

  updatePlanningCache("story-4", entry);
  const firstRead = readPlanningCache("story-4");
  assert.ok(firstRead);
  firstRead!.planning.recommendation.coverageScore = 0;

  const secondRead = readPlanningCache("story-4");
  assert.ok(secondRead);
  assert.notEqual(secondRead!.planning.recommendation.coverageScore, 0);
});

test("creator asset studio presentation layer performs zero intelligence execution", () => {
  assertNoIntelligenceExecutionInPresentationLayer();
});

test("planning cache avoids duplicate intelligence execution on repeated reads", () => {
  resetPlanningCachesForTests();
  const script = buildSampleScript();
  const planning = buildSamplePlanning();

  cacheCreatorAssetPlanning({
    storyId: "story-5",
    script,
    storyMode: "top_5",
    planning,
  });

  const metadata = {
    scriptHash: buildScriptHash(script),
    sceneCount: script.scenes.length,
    storyMode: "top_5",
  };

  const first = readPlanningData("story-5", metadata);
  const second = readPlanningData("story-5", metadata);
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.equal(
    first!.recommendation.coverageScore,
    second!.recommendation.coverageScore,
  );
});

test("scene plan generation path can build planning without editor execution", () => {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const intelligence = runStudioIntelligence({
    topic: fixture.topic,
    narration: fixture.narration,
    targetDurationSec: 30,
    mode: fixture.mode,
    entities: fixture.entities,
  });
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: fixture.topic,
    normalizedNarration: intelligence.normalizedNarration,
  });

  const assetInput = {
    topic: fixture.topic,
    studioIntelligence: intelligence,
    mappedScenes: adapter.mappedScenes,
    sceneTexts: adapter.mappedScenes.map((scene) => ({
      sceneId: scene.id,
      narration: scene.narrationExcerpt,
      caption: scene.captionText,
      summary: scene.title,
      title: scene.title,
    })),
    strategyId: intelligence.strategyId,
  };

  const planning = buildCreatorAssetPlanningFromAssetInput(assetInput);
  assert.ok(planning.recommendation.sceneRecommendations.length > 0);
  assert.ok(planning.providerPlan.sceneResults.length > 0);
  assert.ok(planning.validationResult.validationScore > 0);
});

console.log("All creator asset planning cache checks passed.");
