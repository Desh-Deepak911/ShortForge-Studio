/**
 * Asset search platform verification
 * (run: npm run test:asset-search-platform).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAssetProviderPlan } from "@/features/asset-intelligence/providers";
import { buildRecommendationsFromAssetIntelligence } from "@/features/asset-intelligence/recommendation-engine";
import { runAssetIntelligence } from "@/features/asset-intelligence";
import {
  hasPlanningCache,
  readPlanningCache,
  resetPlanningCachesForTests,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import {
  cacheCreatorAssetPlanning,
  buildCreatorAssetPlanningFromAssetInput,
  buildScriptHash,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import {
  getAssetSearchCacheSizeForTests,
  hashAssetSearchRequest,
  resetAssetSearchCacheForTests,
  runAssetSearchOrchestrator,
  buildAssetSearchRequest,
  buildAssetSearchRequests,
} from "@/features/asset-search/orchestrator";
import {
  generateDeterministicMockAssets,
  getProvider,
  getProviders,
  listRegisteredProviderIds,
  MOCK_ASSET_SEARCH_PROVIDER_ID,
  MockAssetSearchProvider,
  resolveProviderOrder,
} from "@/features/asset-search/providers";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = join(process.cwd(), "src/features/asset-search")

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    throw new Error(`Async test "${name}" must use testAsync`);
  }
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

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

function buildPlanningFixture() {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetIntelligence = runAssetIntelligence(assetInput);
  const recommendation = buildRecommendationsFromAssetIntelligence(
    assetIntelligence,
    assetInput.mappedScenes,
  );
  const providerPlan = buildAssetProviderPlan({
    recommendation,
    sceneAssetPlans: assetIntelligence.sceneAssetPlans,
    mappedScenes: assetInput.mappedScenes,
  });

  return {
    fixture,
    assetInput,
    recommendation,
    providerPlan,
    sceneRecommendation: recommendation.sceneRecommendations[0]!,
    providerResult: providerPlan.sceneResults[0]!,
  };
}

function buildSampleScript(fixture: ReturnType<typeof buildPlanningFixture>["fixture"]): FootieScript {
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

function collectPlatformSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectPlatformSources(fullPath));
      continue;
    }

    if (fullPath.endsWith(".ts") && !fullPath.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log("assetSearchPlatform");

async function runAssetSearchPlatformTests(): Promise<void> {
test("recommendation → search request mapping", () => {
  const { sceneRecommendation, providerResult } = buildPlanningFixture();
  const orchestratorInput = {
    storyId: "story-search-map",
    sceneId: providerResult.sceneId,
    sceneIndex: providerResult.sceneIndex,
    recommendation: sceneRecommendation,
    providerResult,
    semanticSlot: "climax",
    contentPattern: "match_highlight",
  };

  const providerOrder = resolveProviderOrder({
    rankedProviderIds: providerResult.rankedProviders.map((provider) => provider.providerId),
    rankedPriorities: providerResult.rankedProviders.map((provider) => provider.priority),
  });

  const requests = buildAssetSearchRequests({
    orchestrator: orchestratorInput,
    providerOrder,
  });

  assert.ok(requests.length > 0);
  const request = requests[0]!;
  assert.equal(request.query, sceneRecommendation.topRecommendation?.query);
  assert.equal(request.sceneId, providerResult.sceneId);
  assert.equal(request.storyId, "story-search-map");
  assert.equal(request.semanticSlot, "climax");
  assert.equal(request.contentPattern, "match_highlight");
  assert.ok(request.entityIds.length >= 0);
  assert.equal(typeof request.safeSearch, "boolean");
  assert.equal(typeof request.licensePreference, "string");
});

test("registry resolution", () => {
  const previousKey = process.env.PEXELS_API_KEY;
  delete process.env.PEXELS_API_KEY;

  try {
    assert.equal(getProvider(MOCK_ASSET_SEARCH_PROVIDER_ID)?.id, MOCK_ASSET_SEARCH_PROVIDER_ID);
    assert.equal(getProviders().length, 1);
    assert.deepEqual(listRegisteredProviderIds(), [MOCK_ASSET_SEARCH_PROVIDER_ID]);
    assert.equal(getProvider("pexels"), undefined);
  } finally {
    if (previousKey === undefined) {
      delete process.env.PEXELS_API_KEY;
    } else {
      process.env.PEXELS_API_KEY = previousKey;
    }
  }

  const order = resolveProviderOrder({
    rankedProviderIds: ["pexels", "unsplash"],
    rankedPriorities: ["primary", "secondary"],
  });

  assert.deepEqual(order.slice(0, 2), ["pexels", "unsplash"]);
  assert.equal(order.at(-1), MOCK_ASSET_SEARCH_PROVIDER_ID);
});

  await testAsync("mock provider generation", async () => {
    const result = await MockAssetSearchProvider.search(
      buildAssetSearchRequest({
        orchestrator: {
          storyId: "story-mock",
          sceneId: "scene-1",
          sceneIndex: 0,
          recommendation: buildPlanningFixture().sceneRecommendation,
          providerResult: buildPlanningFixture().providerResult,
        },
        providerId: MOCK_ASSET_SEARCH_PROVIDER_ID,
        query: "Lionel Messi celebration",
      }),
    );

    assert.equal(result.success, true);
    assert.ok(result.assets.length > 0);
    assert.match(result.assets[0]!.title, /Lionel Messi celebration 01/);
  });

  test("deterministic query output", () => {
  const baseRequest = buildAssetSearchRequest({
    orchestrator: {
      storyId: "story-deterministic",
      sceneId: "scene-1",
      sceneIndex: 0,
      recommendation: buildPlanningFixture().sceneRecommendation,
      providerResult: buildPlanningFixture().providerResult,
      limit: 3,
    },
    providerId: MOCK_ASSET_SEARCH_PROVIDER_ID,
    query: "Lionel Messi celebration",
  });

  const messiA = generateDeterministicMockAssets(baseRequest);
  const messiB = generateDeterministicMockAssets(baseRequest);
  const ronaldo = generateDeterministicMockAssets({
    ...baseRequest,
    query: "Cristiano Ronaldo free kick",
  });

  assert.deepEqual(messiA.map((asset) => asset.title), messiB.map((asset) => asset.title));
  assert.notDeepEqual(
    messiA.map((asset) => asset.title),
    ronaldo.map((asset) => asset.title),
  );
  assert.match(messiA[0]!.title, /Lionel Messi celebration 01/);
  });

  await withEnvAsync({ ASSET_SEARCH_ENABLED: "true" }, async () => {
  await testAsync("cache hit", async () => {
    resetAssetSearchCacheForTests();
    const { sceneRecommendation, providerResult } = buildPlanningFixture();

    const first = await runAssetSearchOrchestrator({
      storyId: "story-cache-hit",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
      limit: 3,
    });

    assert.equal(first.success, true);
    assert.equal(first.diagnostics.cacheHit, false);
    assert.equal(getAssetSearchCacheSizeForTests(), 1);

    const second = await runAssetSearchOrchestrator({
      storyId: "story-cache-hit",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
      limit: 3,
    });

    assert.equal(second.success, true);
    assert.equal(second.diagnostics.cacheHit, true);
    assert.deepEqual(
      second.results.map((result) => result.title),
      first.results.map((result) => result.title),
    );
  });

  await testAsync("cache miss", async () => {
    resetAssetSearchCacheForTests();
    const { sceneRecommendation, providerResult } = buildPlanningFixture();

    const first = await runAssetSearchOrchestrator({
      storyId: "story-cache-miss",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
      limit: 3,
    });

    const second = await runAssetSearchOrchestrator({
      storyId: "story-cache-miss",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
      limit: 4,
    });

    assert.equal(first.diagnostics.cacheHit, false);
    assert.equal(second.diagnostics.cacheHit, false);
    assert.notDeepEqual(
      first.results.map((result) => result.title),
      second.results.map((result) => result.title),
    );
  });

  await testAsync("provider fallback", async () => {
    resetAssetSearchCacheForTests();
    const { sceneRecommendation, providerResult } = buildPlanningFixture();

    const result = await runAssetSearchOrchestrator({
      storyId: "story-fallback",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
      limit: 2,
    });

    assert.equal(result.success, true);
    assert.ok(result.diagnostics.providerFailures.length > 0);
    assert.ok(result.diagnostics.providerAttempts.includes(MOCK_ASSET_SEARCH_PROVIDER_ID));
    assert.ok(result.results.length > 0);
  });

  await testAsync("diagnostics aggregation", async () => {
    resetAssetSearchCacheForTests();
    const { sceneRecommendation, providerResult } = buildPlanningFixture();

    const result = await runAssetSearchOrchestrator({
      storyId: "story-diagnostics",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
      limit: 2,
    });

    assert.ok(result.diagnostics.requestHash.length > 0);
    assert.ok(result.diagnostics.providerOrder.length > 0);
    assert.equal(typeof result.diagnostics.searchDurationMs, "number");
    assert.equal(result.diagnostics.normalizedResultCount, result.results.length);
    assert.ok(result.results[0]!.license.licenseType);
    assert.ok(result.results[0]!.attribution.requiredText);
  });
  });

  await withEnvAsync({ ASSET_SEARCH_ENABLED: undefined }, async () => {
  await testAsync("feature flag off", async () => {
    resetAssetSearchCacheForTests();
    const { sceneRecommendation, providerResult } = buildPlanningFixture();

    const result = await runAssetSearchOrchestrator({
      storyId: "story-flag-off",
      sceneId: providerResult.sceneId,
      sceneIndex: providerResult.sceneIndex,
      recommendation: sceneRecommendation,
      providerResult,
    });

    assert.equal(result.success, false);
    assert.equal(result.results.length, 0);
    assert.equal(result.diagnostics.disabledReason, "ASSET_SEARCH_ENABLED is not true");
    assert.equal(getAssetSearchCacheSizeForTests(), 0);
  });
  });

  test("no attachment imports", () => {
  const forbidden = [/\battachImage\b/, /\battachSceneImage\b/, /\bapplySceneImageSettings\b/];
  const sources = collectPlatformSources(PLATFORM_ROOT);

  for (const source of sources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not attach images`);
    }
  }
});

test("no editor imports", () => {
  const forbidden = [
    /@\/features\/editor\//,
    /@\/components\/StoryWorkspace/,
    /CreatorAssetStudio/,
    /useCreatorAssetPlanningCache/,
  ];
  const sources = collectPlatformSources(PLATFORM_ROOT);

  for (const source of sources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not import editor modules`);
    }
  }
});

test("no planning cache mutation", () => {
  resetPlanningCachesForTests();
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const script = buildSampleScript(fixture);
  cacheCreatorAssetPlanning({
    storyId: "planning-cache-guard",
    script,
    storyMode: "top_5",
    planning: buildCreatorAssetPlanningFromAssetInput(buildAssetIntelligenceFixtureInput(fixture)),
  });

  const before = readPlanningCache("planning-cache-guard");
  assert.ok(before);
  const beforeHash = buildScriptHash(script);
  assert.equal(before!.scriptHash, beforeHash);

  const sources = collectPlatformSources(PLATFORM_ROOT).join("\n");
  assert.doesNotMatch(sources, /\bupdatePlanningCache\b/);
  assert.doesNotMatch(sources, /\bcacheCreatorAssetPlanning\b/);
  assert.doesNotMatch(sources, /\binvalidatePlanningCache\b/);
  assert.equal(hasPlanningCache("planning-cache-guard"), true);
  assert.equal(readPlanningCache("planning-cache-guard")!.scriptHash, beforeHash);
});

test("no HTTP calls", () => {
  const forbidden = [/\bfetch\s*\(/, /\baxios\b/, /node:https/, /node:http/];
  const sources = collectPlatformSources(PLATFORM_ROOT);

  for (const source of sources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not perform HTTP calls`);
    }
  }
});

test("request hash includes future cache dimensions", () => {
  const request = buildAssetSearchRequest({
    orchestrator: {
      storyId: "story-hash",
      sceneId: "scene-1",
      sceneIndex: 0,
      recommendation: buildPlanningFixture().sceneRecommendation,
      providerResult: buildPlanningFixture().providerResult,
      semanticSlot: "intro",
    },
    providerId: MOCK_ASSET_SEARCH_PROVIDER_ID,
    query: "Lionel Messi celebration",
  });

  const baseHash = hashAssetSearchRequest(request);
  const changedOrientation = hashAssetSearchRequest({ ...request, orientation: "portrait" });
  const changedVisualIntent = hashAssetSearchRequest({
    ...request,
    visualIntent: "player_portrait",
  });

  assert.notEqual(baseHash, changedOrientation);
  assert.notEqual(baseHash, changedVisualIntent);
});

}

void runAssetSearchPlatformTests()
  .then(() => {
    console.log("All asset search platform checks passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
