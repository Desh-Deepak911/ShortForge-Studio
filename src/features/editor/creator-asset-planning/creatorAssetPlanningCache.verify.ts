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
  buildCreatorAssetPlanningSnapshotForGeneratedScenes,
  isAssetIntelligencePlanningEnabled,
  tryBuildCreatorAssetPlanningSnapshotForGeneratedScenes,
} from "@/features/editor/creator-asset-planning/creator-asset-planning-generation.utils";
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
  hydrateCreatorAssetPlanningCache,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { tryGenerateScenesFromStudioIntelligence } from "@/features/story/services/studio-intelligence-scene-plan.utils";
import type { FootieScene } from "@/features/story/types";
import { ensureTimelineItems, getStoryTotalDuration } from "@/features/story/utils";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";
import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/studio-intelligence/fixtures/golden-fixtures.registry";
import { syncFootieScript } from "@/lib/utils/voiceover";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = join(__dirname, "../components/creator-asset-studio");
const WORKSPACE_PATH = join(__dirname, "../../../components/StoryWorkspace.tsx");
const PLANNING_HOOK_PATH = join(__dirname, "useCreatorAssetPlanningCache.ts");
const SCENE_PLANNER_PATH = join(__dirname, "../../story/services/scene-planning.service.ts");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function withEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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

function buildAiGeneratedScenes(narration: string, sceneCount: number): FootieScene[] {
  return Array.from({ length: sceneCount }, (_, index) => ({
    id: String(index + 1),
    start: index * 5,
    end: (index + 1) * 5,
    duration: 5,
    subtitle: `Scene ${index + 1}`,
    narration,
    sceneType: index === 0 ? "intro" : index === sceneCount - 1 ? "ending" : "context",
  }));
}

function buildSyncedScript(input: {
  title: string;
  narration: string;
  scenes: FootieScene[];
  voiceoverDurationMs?: number;
}) {
  return syncFootieScript({
    title: input.title,
    narration: input.narration,
    totalDuration: getStoryTotalDuration(input.scenes),
    scenes: input.scenes,
    timelineItems: ensureTimelineItems(input.scenes),
    voiceoverDurationMs: input.voiceoverDurationMs,
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

  const forbiddenProviderPatterns = [
    /\bfetch\s*\(/,
    /\battachImage\b/,
    /\battachSceneImage\b/,
    /\bproviderApi\b/,
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
    for (const pattern of forbiddenProviderPatterns) {
      assert.doesNotMatch(
        contents,
        pattern,
        `${file} must not call provider APIs or attach images`,
      );
    }
  }

  for (const filePath of [WORKSPACE_PATH, PLANNING_HOOK_PATH]) {
    const contents = readFileSync(filePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${filePath} must not execute intelligence`);
    }
    for (const pattern of forbiddenProviderPatterns) {
      assert.doesNotMatch(contents, pattern, `${filePath} must not call provider APIs`);
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

test("default AI scene path can produce assetPlanningSnapshot", () => {
  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    assert.equal(isAssetIntelligencePlanningEnabled(), true);

    const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
    const sceneCount = 6;
    const scenes = buildAiGeneratedScenes(fixture.narration, sceneCount);
    const voiceoverDurationMs = 30_000;
    const script = buildSyncedScript({
      title: fixture.topic,
      narration: fixture.narration,
      scenes,
      voiceoverDurationMs,
    });

    const snapshot = buildCreatorAssetPlanningSnapshotForGeneratedScenes({
      script,
      scenes,
      title: fixture.topic,
      narration: fixture.narration,
      topic: fixture.topic,
      scriptMode: fixture.mode,
      sceneCount,
      voiceoverDurationMs,
    });

    assert.ok(snapshot.planning.recommendation.sceneRecommendations.length > 0);
    assert.ok(snapshot.planning.providerPlan.sceneResults.length > 0);
    assert.equal(snapshot.sceneCount, sceneCount);
  });
});

test("SI scene-plan success still produces assetPlanningSnapshot", () => {
  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[0];
    const sceneCount = 6;
    const voiceoverDurationMs =
      fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000;

    const siResult = tryGenerateScenesFromStudioIntelligence({
      topic: fixture.input.topic,
      narration: fixture.input.narration,
      voiceoverDurationMs,
      sceneCount,
      scriptMode: fixture.input.mode,
    });

    assert.equal(siResult.success, true, siResult.success ? undefined : siResult.reason);
    if (!siResult.success) {
      return;
    }

    const script = buildSyncedScript({
      title: fixture.input.topic,
      narration: fixture.input.narration,
      scenes: siResult.scenes,
      voiceoverDurationMs,
    });

    const snapshot = buildCreatorAssetPlanningSnapshotForGeneratedScenes({
      script,
      scenes: siResult.scenes,
      title: fixture.input.topic,
      narration: fixture.input.narration,
      topic: fixture.input.topic,
      scriptMode: fixture.input.mode,
      sceneCount,
      voiceoverDurationMs,
      assetPlanningContext: siResult.assetPlanningContext,
    });

    assert.ok(snapshot.planning.recommendation.sceneRecommendations.length > 0);
    assert.equal(snapshot.sceneCount, sceneCount);
  });
});

test("SI failure → AI fallback path still produces assetPlanningSnapshot", () => {
  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[1];
    const sceneCount = 5;
    const voiceoverDurationMs = 30_000;
    const scenes = buildAiGeneratedScenes(fixture.narration, sceneCount);
    const script = buildSyncedScript({
      title: fixture.topic,
      narration: fixture.narration,
      scenes,
      voiceoverDurationMs,
    });

    const snapshot = tryBuildCreatorAssetPlanningSnapshotForGeneratedScenes({
      script,
      scenes,
      title: fixture.topic,
      narration: fixture.narration,
      topic: fixture.topic,
      scriptMode: fixture.mode,
      sceneCount,
      voiceoverDurationMs,
    });

    assert.ok(snapshot);
    assert.ok(snapshot!.planning.recommendation.sceneRecommendations.length > 0);
  });
});

test("asset planning failure does not fail storyboard generation helper", () => {
  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    const snapshot = tryBuildCreatorAssetPlanningSnapshotForGeneratedScenes({
      script: buildSyncedScript({
        title: "",
        narration: "",
        scenes: [],
      }),
      scenes: [],
      title: "",
      narration: "",
      topic: "",
      sceneCount: 0,
      voiceoverDurationMs: 0,
    });

    assert.equal(snapshot, undefined);
  });
});

test("cache read succeeds after voiceoverDurationMs changes", () => {
  resetPlanningCachesForTests();

  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const sceneCount = 6;
  const scenes = buildAiGeneratedScenes(fixture.narration, sceneCount);
  const initialVoiceoverDurationMs = 28_000;
  const scriptAtGeneration = buildSyncedScript({
    title: fixture.topic,
    narration: fixture.narration,
    scenes,
    voiceoverDurationMs: initialVoiceoverDurationMs,
  });

  withEnv({ ASSET_INTELLIGENCE_ENABLED: "true" }, () => {
    const snapshot = buildCreatorAssetPlanningSnapshotForGeneratedScenes({
      script: scriptAtGeneration,
      scenes,
      title: fixture.topic,
      narration: fixture.narration,
      topic: fixture.topic,
      scriptMode: fixture.mode,
      sceneCount,
      voiceoverDurationMs: initialVoiceoverDurationMs,
    });

    hydrateCreatorAssetPlanningCache("story-voiceover", snapshot);

    const scriptAtRead = buildSyncedScript({
      title: fixture.topic,
      narration: fixture.narration,
      scenes,
      voiceoverDurationMs: 31_500,
    });

    assert.notEqual(
      scriptAtGeneration.voiceoverDurationMs,
      scriptAtRead.voiceoverDurationMs,
    );
    assert.equal(buildScriptHash(scriptAtGeneration), buildScriptHash(scriptAtRead));

    const planning = readPlanningData("story-voiceover", {
      scriptHash: buildScriptHash(scriptAtRead),
      sceneCount: scriptAtRead.scenes.length,
      storyMode: fixture.mode,
    });

    assert.ok(planning);
    assert.ok(planning!.recommendation.sceneRecommendations.length > 0);
  });
});

test("scene planner attaches asset planning on all successful paths", () => {
  const scenePlanner = readFileSync(SCENE_PLANNER_PATH, "utf8");

  assert.match(scenePlanner, /finalizeSuccessfulScenePlan/);
  assert.match(scenePlanner, /tryBuildCreatorAssetPlanningSnapshotForGeneratedScenes/);
  assert.match(scenePlanner, /assetPlanningContext: studioIntelligenceResult\.assetPlanningContext/);
  assert.match(scenePlanner, /source: "ai_fallback"/);
});

test("buildScriptHash excludes voiceoverDurationMs", () => {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const scenes = buildAiGeneratedScenes(fixture.narration, 4);
  const base = buildSyncedScript({
    title: fixture.topic,
    narration: fixture.narration,
    scenes,
    voiceoverDurationMs: 20_000,
  });
  const remeasured = buildSyncedScript({
    title: fixture.topic,
    narration: fixture.narration,
    scenes,
    voiceoverDurationMs: 42_000,
  });

  assert.equal(buildScriptHash(base), buildScriptHash(remeasured));
  assert.doesNotMatch(
    readFileSync(join(__dirname, "creator-asset-planning.utils.ts"), "utf8"),
    /voiceoverDurationMs/,
  );
});

console.log("All creator asset planning cache checks passed.");
