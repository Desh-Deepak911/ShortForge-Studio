/**
 * Creator asset planning refresh verification
 * (imported by creatorAssetPlanningCache.verify.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runAssetIntelligence } from "@/features/asset-intelligence";
import {
  readPlanningCache,
  readPlanningData,
  resetPlanningCachesForTests,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import {
  buildCreatorAssetPlanningFromAssetInput,
  buildScriptHash,
  cacheCreatorAssetPlanning,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { refreshCreatorAssetPlanning } from "@/features/editor/creator-asset-planning-refresh/creator-asset-planning-refresh.service";
import {
  cloneScriptForRefreshCheck,
  CREATOR_ASSET_PLANNING_REFRESH_EFFECTIVE_SCOPE,
  scriptsEqualForRefresh,
} from "@/features/editor/creator-asset-planning-refresh/creator-asset-planning-refresh.utils";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFRESH_ROOT = join(process.cwd(), "src/features/editor/creator-asset-planning-refresh");
const REFRESH_FILES = [
  "creator-asset-planning-refresh.service.ts",
  "creator-asset-planning-refresh.utils.ts",
  "creator-asset-planning-refresh.types.ts",
  "index.ts",
];
const READ_PATH_FILES = [
  join(process.cwd(), "src/features/editor/creator-asset-planning/useCreatorAssetPlanningCache.ts"),
  join(process.cwd(), "src/features/editor/creator-asset-planning/creator-asset-planning.cache.ts"),
];

async function withEnvAsync(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
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
    await fn();
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

function buildSampleScript(): FootieScript {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetResult = runAssetIntelligence(assetInput);

  return syncFootieScript({
    title: fixture.topic,
    narration: fixture.narration,
    totalDuration: 30,
    voiceoverDurationMs: 30_000,
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

function buildSamplePlanning() {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  return buildCreatorAssetPlanningFromAssetInput(assetInput);
}

export async function runCreatorAssetPlanningRefreshTests(): Promise<void> {
  console.log("creator asset planning refresh");

  await withEnvAsync({ ASSET_INTELLIGENCE_ENABLED: "true" }, async () => {
    console.log("  ✓ full refresh replaces stale cache");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    cacheCreatorAssetPlanning({
      storyId: "refresh-stale",
      script,
      storyMode: "top_5",
      planning: buildSamplePlanning(),
    });

    const editedScript = {
      ...script,
      narration: `${script.narration} Updated for refresh.`,
    };

    const staleRead = readPlanningData("refresh-stale", {
      scriptHash: buildScriptHash(editedScript),
      sceneCount: editedScript.scenes.length,
      storyMode: "top_5",
    });
    assert.ok(staleRead?.staleness?.isStale);

    const result = await refreshCreatorAssetPlanning({
      storyId: "refresh-stale",
      script: editedScript,
      storyMode: "top_5",
      scope: "full",
      reason: "stale_planning",
    });

    assert.equal(result.success, true);
    assert.equal(result.diagnostics.cacheReplaced, true);
    assert.equal(result.diagnostics.requestedScope, "full");
    assert.equal(result.diagnostics.effectiveScope, CREATOR_ASSET_PLANNING_REFRESH_EFFECTIVE_SCOPE);

    const freshRead = readPlanningData(
      "refresh-stale",
      {
        scriptHash: buildScriptHash(editedScript),
        sceneCount: editedScript.scenes.length,
        storyMode: "top_5",
      },
      { mode: "strict" },
    );
    assert.ok(freshRead);
    assert.equal(freshRead!.staleness, undefined);
    assert.equal(readPlanningCache("refresh-stale")?.staleness, undefined);
  });

  await withEnvAsync({ ASSET_INTELLIGENCE_ENABLED: "true" }, async () => {
    console.log("  ✓ failed refresh preserves old cache");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const planning = buildSamplePlanning();
    cacheCreatorAssetPlanning({
      storyId: "refresh-failure",
      script,
      storyMode: "top_5",
      planning,
    });

    const previousHash = readPlanningCache("refresh-failure")!.scriptHash;
    const previousCoverage = readPlanningCache("refresh-failure")!.planning.recommendation.coverageScore;

    const result = await refreshCreatorAssetPlanning({
      storyId: "refresh-failure",
      script: { ...script, scenes: [] },
      storyMode: "top_5",
      scope: "full",
    });

    assert.equal(result.success, false);
    assert.equal(result.diagnostics.cacheReplaced, false);
    assert.ok(result.error);

    const preserved = readPlanningCache("refresh-failure");
    assert.ok(preserved);
    assert.equal(preserved!.scriptHash, previousHash);
    assert.equal(preserved!.planning.recommendation.coverageScore, previousCoverage);
  });

  await withEnvAsync({ ASSET_INTELLIGENCE_ENABLED: "true" }, async () => {
    console.log("  ✓ refresh does not mutate script");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const scriptBefore = cloneScriptForRefreshCheck(script);

    await refreshCreatorAssetPlanning({
      storyId: "refresh-immutable",
      script,
      storyMode: "top_5",
      scope: "full",
    });

    assert.equal(scriptsEqualForRefresh(scriptBefore, script), true);
  });

  await withEnvAsync({ ASSET_INTELLIGENCE_ENABLED: "true" }, async () => {
    console.log("  ✓ scene scope records scene scope in diagnostics");
    resetPlanningCachesForTests();
    const script = buildSampleScript();
    const targetScene = script.scenes[1]!;

    const result = await refreshCreatorAssetPlanning({
      storyId: "refresh-scene-scope",
      script,
      storyMode: "top_5",
      scope: "scene",
      sceneIndex: 1,
      sceneId: targetScene.id,
      reason: "scene_edit",
    });

    assert.equal(result.success, true);
    assert.equal(result.diagnostics.requestedScope, "scene");
    assert.equal(result.diagnostics.sceneIndex, 1);
    assert.equal(result.diagnostics.sceneId, targetScene.id);
    assert.equal(result.diagnostics.reason, "scene_edit");
    assert.equal(result.diagnostics.effectiveScope, "full");
  });

  console.log("  ✓ no provider API calls");
  const forbiddenProviderPatterns = [
    /\bfetch\s*\(/,
    /\battachImage\b/,
    /\battachSceneImage\b/,
    /\bproviderApi\b/,
  ];

  for (const file of REFRESH_FILES) {
    const source = readFileSync(join(REFRESH_ROOT, file), "utf8");
    for (const pattern of forbiddenProviderPatterns) {
      assert.doesNotMatch(source, pattern, `${file} must not call provider APIs or attach images`);
    }
  }

  console.log("  ✓ no image attachment");
  for (const file of REFRESH_FILES) {
    const source = readFileSync(join(REFRESH_ROOT, file), "utf8");
    assert.doesNotMatch(source, /\battachImage\b/);
    assert.doesNotMatch(source, /\battachSceneImage\b/);
  }

  console.log("  ✓ no editor intelligence execution on read path");
  const forbiddenReadPatterns = [
    /\brunStudioIntelligence\s*\(/,
    /\brunAssetIntelligence\s*\(/,
    /\bbuildRecommendationsFromAssetIntelligence\s*\(/,
    /\bbuildAssetProviderPlan\s*\(/,
    /\bvalidateAssetRecommendations\s*\(/,
    /\brefreshCreatorAssetPlanning\s*\(/,
  ];

  for (const filePath of READ_PATH_FILES) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbiddenReadPatterns) {
      assert.doesNotMatch(source, pattern, `${filePath} must remain read-only`);
    }
  }
}
