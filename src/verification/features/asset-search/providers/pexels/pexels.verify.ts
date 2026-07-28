/**
 * Pexels asset search provider verification
 * (run: npm run test:asset-search-pexels).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAssetProviderPlan } from "@/features/asset-intelligence/providers";
import { buildRecommendationsFromAssetIntelligence } from "@/features/asset-intelligence/recommendation-engine";
import { runAssetIntelligence } from "@/features/asset-intelligence";
import {
  normalizeProviderResults,
  resetAssetSearchCacheForTests,
  runAssetSearchOrchestrator,
  buildAssetSearchRequest,
} from "@/features/asset-search/orchestrator";
import {
  getProvider,
  getProviders,
  MOCK_ASSET_SEARCH_PROVIDER_ID,
  PEXELS_PROVIDER_ID,
  PexelsAssetSearchProvider,
  setPexelsFetchForTests,
} from "@/features/asset-search/providers";
import {
  buildPexelsSearchUrl,
  executePexelsSearch,
  normalizePexelsPhotos,
  parsePexelsSearchResponse,
} from "@/features/asset-search/providers/pexels";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PEXELS_ROOT = join(process.cwd(), "src/features/asset-search/providers/pexels");

type MockFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function buildSamplePexelsPayload() {
  return {
    page: 1,
    per_page: 2,
    total_results: 2,
    photos: [
      {
        id: 12345,
        width: 1920,
        height: 1080,
        url: "https://www.pexels.com/photo/football-celebration/",
        photographer: "Jane Doe",
        photographer_url: "https://www.pexels.com/@jane-doe/",
        photographer_id: 42,
        avg_color: "#1A2B3C",
        src: {
          original: "https://images.pexels.com/photos/12345/original.jpg",
          large2x: "https://images.pexels.com/photos/12345/large2x.jpg",
          large: "https://images.pexels.com/photos/12345/large.jpg",
          medium: "https://images.pexels.com/photos/12345/medium.jpg",
          small: "https://images.pexels.com/photos/12345/small.jpg",
          portrait: "https://images.pexels.com/photos/12345/portrait.jpg",
          landscape: "https://images.pexels.com/photos/12345/landscape.jpg",
          tiny: "https://images.pexels.com/photos/12345/tiny.jpg",
        },
        liked: false,
        alt: "Football celebration",
      },
    ],
  };
}

function buildMockFetchResponse(input: {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}): MockFetch {
  return async () =>
    new Response(input.body === undefined ? "" : JSON.stringify(input.body), {
      status: input.status,
      headers: input.headers,
    });
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
    sceneRecommendation: recommendation.sceneRecommendations[0]!,
    providerResult: providerPlan.sceneResults[0]!,
  };
}

function collectPexelsSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectPexelsSources(fullPath));
      continue;
    }

    if (fullPath.endsWith(".ts") && !fullPath.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function runPexelsProviderTests(): Promise<void> {
  console.log("assetSearchPexels");

  await withEnvAsync(
    { ASSET_SEARCH_ENABLED: "true", PEXELS_API_KEY: "test-pexels-key" },
    async () => {
      setPexelsFetchForTests(null);

      await testAsync("mock fetch success", async () => {
        setPexelsFetchForTests(buildMockFetchResponse({ status: 200, body: buildSamplePexelsPayload() }));

        const request = buildAssetSearchRequest({
          orchestrator: {
            storyId: "pexels-success",
            sceneId: "scene-1",
            sceneIndex: 0,
            recommendation: buildPlanningFixture().sceneRecommendation,
            providerResult: buildPlanningFixture().providerResult,
            limit: 2,
            orientation: "landscape",
            page: 1,
          },
          providerId: PEXELS_PROVIDER_ID,
          query: "football celebration",
        });

        const url = buildPexelsSearchUrl(request);
        assert.match(url, /query=football/);
        assert.match(url, /orientation=landscape/);
        assert.match(url, /per_page=2/);

        const result = await PexelsAssetSearchProvider.search(request);
        assert.equal(result.success, true);
        assert.equal(result.assets.length, 1);
        assert.equal(result.assets[0]!.providerAssetId, "12345");
        assert.match(result.assets[0]!.previewUrl, /large\.jpg/);
        assert.equal(result.assets[0]!.attribution?.providerName, "Pexels");
        assert.equal(result.assets[0]!.attribution?.creatorName, "Jane Doe");
      });

      await testAsync("429 handled", async () => {
        setPexelsFetchForTests(
          buildMockFetchResponse({
            status: 429,
            headers: { "retry-after": "30" },
          }),
        );

        const request = buildAssetSearchRequest({
          orchestrator: {
            storyId: "pexels-429",
            sceneId: "scene-1",
            sceneIndex: 0,
            recommendation: buildPlanningFixture().sceneRecommendation,
            providerResult: buildPlanningFixture().providerResult,
          },
          providerId: PEXELS_PROVIDER_ID,
          query: "football",
        });

        const result = await executePexelsSearch(request);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.failure.code, "rate_limited");
          assert.match(result.failure.message, /429/);
          assert.equal(result.failure.retryAfterSeconds, 30);
        }

        const providerResult = await PexelsAssetSearchProvider.search(request);
        assert.equal(providerResult.success, false);
        assert.match(providerResult.error ?? "", /retry after 30s/);
      });

      await testAsync("empty response handled", async () => {
        setPexelsFetchForTests(
          buildMockFetchResponse({
            status: 200,
            body: { page: 1, per_page: 12, photos: [], total_results: 0 },
          }),
        );

        const request = buildAssetSearchRequest({
          orchestrator: {
            storyId: "pexels-empty",
            sceneId: "scene-1",
            sceneIndex: 0,
            recommendation: buildPlanningFixture().sceneRecommendation,
            providerResult: buildPlanningFixture().providerResult,
          },
          providerId: PEXELS_PROVIDER_ID,
          query: "unlikely-empty-query",
        });

        const result = await executePexelsSearch(request);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.failure.code, "empty_results");
        }
      });

      await testAsync("malformed response handled", async () => {
        setPexelsFetchForTests(buildMockFetchResponse({ status: 200, body: { invalid: true } }));

        const parsed = parsePexelsSearchResponse({ invalid: true });
        assert.equal(parsed.ok, false);

        setPexelsFetchForTests(async () => new Response("not-json", { status: 200 }));

        const request = buildAssetSearchRequest({
          orchestrator: {
            storyId: "pexels-malformed",
            sceneId: "scene-1",
            sceneIndex: 0,
            recommendation: buildPlanningFixture().sceneRecommendation,
            providerResult: buildPlanningFixture().providerResult,
          },
          providerId: PEXELS_PROVIDER_ID,
          query: "football",
        });

        const result = await executePexelsSearch(request);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.failure.code, "malformed_response");
        }
      });

      await testAsync("normalization produces valid NormalizedAssetResult", async () => {
        const assets = normalizePexelsPhotos(buildSamplePexelsPayload().photos);
        const request = buildAssetSearchRequest({
          orchestrator: {
            storyId: "pexels-normalize",
            sceneId: "scene-1",
            sceneIndex: 0,
            recommendation: buildPlanningFixture().sceneRecommendation,
            providerResult: buildPlanningFixture().providerResult,
          },
          providerId: PEXELS_PROVIDER_ID,
          query: "football celebration",
        });

        const normalized = normalizeProviderResults(
          {
            providerId: PEXELS_PROVIDER_ID,
            success: true,
            query: request.query,
            assets,
            durationMs: 1,
          },
          request,
        );

        assert.equal(normalized.length, 1);
        assert.equal(normalized[0]!.providerId, PEXELS_PROVIDER_ID);
        assert.equal(normalized[0]!.license.licenseType, "commercial");
        assert.equal(normalized[0]!.license.requiresAttribution, true);
        assert.equal(normalized[0]!.attribution.providerName, "Pexels");
        assert.match(normalized[0]!.attribution.requiredText, /Photo by Jane Doe on Pexels/);
        assert.doesNotMatch(JSON.stringify(normalized[0]), /photographer_url/);
      });

      await testAsync("orchestrator falls back to mock if Pexels fails", async () => {
        resetAssetSearchCacheForTests();
        setPexelsFetchForTests(
          buildMockFetchResponse({
            status: 429,
            headers: { "retry-after": "60" },
          }),
        );

        const { sceneRecommendation, providerResult } = buildPlanningFixture();
        const result = await runAssetSearchOrchestrator({
          storyId: "pexels-orchestrator-fallback",
          sceneId: providerResult.sceneId,
          sceneIndex: providerResult.sceneIndex,
          recommendation: sceneRecommendation,
          providerResult,
          limit: 2,
        });

        assert.equal(result.success, true);
        assert.ok(result.diagnostics.providerFailures.some((failure) => failure.providerId === PEXELS_PROVIDER_ID));
        assert.ok(result.diagnostics.providerAttempts.includes(MOCK_ASSET_SEARCH_PROVIDER_ID));
        assert.ok(result.results.length > 0);
        assert.match(result.results[0]!.previewUrl, /mock\.asset-search\.local/);
      });

      setPexelsFetchForTests(null);
    },
  );

  await withEnvAsync({ ASSET_SEARCH_ENABLED: "true", PEXELS_API_KEY: undefined }, async () => {
    await testAsync("missing API key fallback", async () => {
      assert.equal(getProvider(PEXELS_PROVIDER_ID), undefined);
      assert.equal(getProviders().length, 1);

      resetAssetSearchCacheForTests();
      const { sceneRecommendation, providerResult } = buildPlanningFixture();
      const result = await runAssetSearchOrchestrator({
        storyId: "pexels-missing-key",
        sceneId: providerResult.sceneId,
        sceneIndex: providerResult.sceneIndex,
        recommendation: sceneRecommendation,
        providerResult,
        limit: 2,
      });

      assert.equal(result.success, true);
      assert.ok(
        result.diagnostics.providerFailures.some(
          (failure) => failure.providerId === PEXELS_PROVIDER_ID,
        ),
      );
      assert.ok(result.results.length > 0);
    });
  });

  console.log("  ✓ no client/editor imports");
  const forbidden = [
    /@\/features\/editor\//,
    /CreatorAssetStudio/,
    /useCreatorAssetPlanningCache/,
    /\.tsx"/,
    /lucide-react/,
  ];
  const sources = collectPexelsSources(PEXELS_ROOT);
  for (const source of sources) {
    const contents = readFileSync(source, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(contents, pattern, `${source} must not import client/editor modules`);
    }
  }
}

void runPexelsProviderTests()
  .then(() => {
    setPexelsFetchForTests(null);
    console.log("All Pexels asset search checks passed.");
  })
  .catch((error: unknown) => {
    setPexelsFetchForTests(null);
    console.error(error);
    process.exit(1);
  });
