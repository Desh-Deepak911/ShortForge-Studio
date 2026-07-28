/**
 * Asset search provider SDK verification
 * (run: npm run test:provider-sdk).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAssetProviderPlan } from "@/features/asset-intelligence/providers";
import { buildRecommendationsFromAssetIntelligence } from "@/features/asset-intelligence/recommendation-engine";
import { runAssetIntelligence } from "@/features/asset-intelligence";
import {
  resetAssetSearchCacheForTests,
  runAssetSearchOrchestrator,
  buildAssetSearchRequest,
} from "@/features/asset-search/orchestrator";
import {
  MOCK_ASSET_SEARCH_PROVIDER_ID,
  MOCK_ASSET_SEARCH_PROVIDER_METADATA,
  MockAssetSearchProvider,
  generateDeterministicMockAssets,
  getProvider,
  getProviderMetadata,
  getProviderMetadataCatalog,
  getProviders,
  resolveProvidersByCapability,
  validateProviderMetadata,
} from "@/features/asset-search/providers";
import { ASSET_SEARCH_PROVIDER_SDK_VERSION } from "@/features/asset-search/providers/provider-sdk";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = join(process.cwd(), "src/features/asset-search/providers")
const PROVIDERS_ROOT = join(process.cwd(), "src/features/asset-search/providers")

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

function withEnvAsync(
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

  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function collectSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSources(fullPath));
      continue;
    }

    if (fullPath.endsWith(".ts") && !fullPath.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
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
    sceneRecommendation: recommendation.sceneRecommendations[0]!,
    providerResult: providerPlan.sceneResults[0]!,
  };
}

async function runProviderSdkTests(): Promise<void> {
  console.log("providerSdk");

  console.log("  ✓ metadata integrity");
  for (const metadata of getProviderMetadataCatalog()) {
    assert.deepEqual(validateProviderMetadata(metadata), []);
    assert.ok(metadata.displayName.trim());
    assert.ok(metadata.logo.startsWith("provider:"));
    assert.equal(typeof metadata.requiresApiKey, "boolean");
    assert.equal(typeof metadata.planningOnly, "boolean");
  }

  console.log("  ✓ capability resolution");
  const portraitMatches = resolveProvidersByCapability({
    required: { supportsPortrait: true, supportsCommercialUse: true },
  });
  assert.ok(portraitMatches.length > 0);
  assert.ok(
    portraitMatches.every((match) =>
      match.matchedCapabilities.includes("supportsPortrait"),
    ),
  );
  assert.ok(portraitMatches[0]!.score >= portraitMatches.at(-1)!.score);

  console.log("  ✓ registry lookup");
  await withEnvAsync({ PEXELS_API_KEY: undefined }, async () => {
    assert.equal(getProvider(MOCK_ASSET_SEARCH_PROVIDER_ID)?.id, MOCK_ASSET_SEARCH_PROVIDER_ID);
    assert.equal(getProviders().length, 1);
    assert.equal(getProvider("pexels"), undefined);
  });
  assert.equal(getProviderMetadata("pexels")?.displayName, "Pexels");
  assert.equal(getProviderMetadata(MOCK_ASSET_SEARCH_PROVIDER_ID)?.id, MOCK_ASSET_SEARCH_PROVIDER_ID);

  console.log("  ✓ provider health");
  const health = MockAssetSearchProvider.getHealth();
  assert.equal(health.status, "planning_only");
  assert.ok(health.checkedAt);

  console.log("  ✓ planning_only provider");
  assert.equal(MOCK_ASSET_SEARCH_PROVIDER_METADATA.planningOnly, true);
  assert.equal(MockAssetSearchProvider.getHealth().status, "planning_only");

  console.log("  ✓ rate-limit metadata");
  const pexels = getProviderMetadata("pexels");
  assert.ok(pexels?.rateLimits.requestsPerMinute);
  assert.ok(pexels?.rateLimits.retryAfterSeconds);

  console.log("  ✓ authentication metadata");
  assert.equal(getProviderMetadata("wikimedia")?.authentication.type, "none");
  assert.equal(getProviderMetadata("pexels")?.authentication.type, "api_key");
  assert.equal(getProviderMetadata("unsplash")?.authentication.envKey, "UNSPLASH_ACCESS_KEY");
  assert.equal(getProviderMetadata("internal_library")?.authentication.type, "bearer_token");

  await withEnvAsync({ ASSET_SEARCH_ENABLED: "true" }, async () => {
    await testAsync("orchestrator compatibility", async () => {
      resetAssetSearchCacheForTests();
      const { sceneRecommendation, providerResult } = buildPlanningFixture();

      const result = await runAssetSearchOrchestrator({
        storyId: "sdk-orchestrator-compat",
        sceneId: providerResult.sceneId,
        sceneIndex: providerResult.sceneIndex,
        recommendation: sceneRecommendation,
        providerResult,
        limit: 2,
      });

      assert.equal(result.success, true);
      assert.ok(result.results.length > 0);
    });
  });

  console.log("  ✓ deterministic mock provider unchanged");
  const request = buildAssetSearchRequest({
    orchestrator: {
      storyId: "sdk-deterministic",
      sceneId: "scene-1",
      sceneIndex: 0,
      recommendation: buildPlanningFixture().sceneRecommendation,
      providerResult: buildPlanningFixture().providerResult,
      limit: 3,
    },
    providerId: MOCK_ASSET_SEARCH_PROVIDER_ID,
    query: "Lionel Messi celebration",
  });
  const first = generateDeterministicMockAssets(request);
  const second = generateDeterministicMockAssets(request);
  assert.deepEqual(first.map((asset) => asset.title), second.map((asset) => asset.title));
  assert.match(first[0]!.title, /Lionel Messi celebration 01/);

  console.log("  ✓ no HTTP");
  const forbidden = [/\bfetch\s*\(/, /\baxios\b/, /node:https/, /node:http/];
  const sources = collectSources(SDK_ROOT);
  for (const source of sources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not perform HTTP`);
    }
  }

  console.log("  ✓ no editor imports");
  const editorForbidden = [/@\/features\/editor\//, /CreatorAssetStudio/, /useCreatorAssetPlanningCache/];
  const providerSources = collectSources(PROVIDERS_ROOT);
  for (const source of providerSources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of editorForbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not import editor modules`);
    }
  }

  console.log("  ✓ no UI imports");
  const uiForbidden = [/@\/components\/studio-shell/, /\.tsx"/, /lucide-react/];
  for (const source of providerSources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of uiForbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not import UI modules`);
    }
  }

  assert.equal(ASSET_SEARCH_PROVIDER_SDK_VERSION, "0.1.0");
  assert.equal(MockAssetSearchProvider.metadata.version, ASSET_SEARCH_PROVIDER_SDK_VERSION);
}

void runProviderSdkTests()
  .then(() => {
    console.log("All provider SDK checks passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
