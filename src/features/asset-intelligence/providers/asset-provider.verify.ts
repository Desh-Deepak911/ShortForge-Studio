/**
 * Asset provider abstraction verification
 * (run: npm run test:asset-intelligence-provider).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runAssetIntelligence, sceneRequiresAssetCandidates } from "@/features/asset-intelligence";
import {
  ASSET_PROVIDER_REGISTRY,
  buildAssetProviderPlan,
  getAssetProviderDefinition,
  inferRequiredCapabilitiesForRequest,
  listAssetProviderIds,
  providerSupportsCapabilities,
  resolveBestProviders,
  type AssetProviderId,
  type AssetProviderPlanInput,
} from "@/features/asset-intelligence/providers";
import { buildRecommendationsFromAssetIntelligence } from "@/features/asset-intelligence/recommendation-engine";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = __dirname;

const PROVIDER_FIXTURES = {
  biography: "Lamine Yamal biography",
  countdown: "Top 5 World Cup moments",
  debate: "Messi vs Ronaldo debate",
  history: "Barcelona collapse history",
  tactical: "Guardiola tactical analysis",
} as const;

const EXPECTED_PRIMARY_PROVIDERS: Record<
  keyof typeof PROVIDER_FIXTURES,
  AssetProviderId[]
> = {
  biography: ["unsplash", "pexels", "internal_library"],
  countdown: ["wikimedia", "internal_library", "pexels"],
  debate: ["pexels", "unsplash", "pixabay"],
  history: ["wikimedia", "internal_library", "pexels"],
  tactical: ["ai_generated", "internal_library", "pexels"],
};

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function snapshotProviderInput(input: AssetProviderPlanInput): string {
  return JSON.stringify(input);
}

function buildProviderPlanInput(fixtureName: string): AssetProviderPlanInput {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES.find((entry) => entry.name === fixtureName);
  assert.ok(fixture, `fixture not found: ${fixtureName}`);

  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetResult = runAssetIntelligence(assetInput);
  const recommendation = buildRecommendationsFromAssetIntelligence(assetResult, assetInput.mappedScenes);

  return {
    recommendation,
    sceneAssetPlans: assetResult.sceneAssetPlans,
    mappedScenes: assetInput.mappedScenes,
  };
}

function validateProviderFixture(
  label: keyof typeof PROVIDER_FIXTURES,
  fixtureName: string,
): void {
  const input = buildProviderPlanInput(fixtureName);
  const before = snapshotProviderInput(input);
  const plan = buildAssetProviderPlan(input);
  assert.equal(snapshotProviderInput(input), before, `${label}: input mutated`);

  const eligibleScenes = input.recommendation.sceneRecommendations.filter((scene) => {
    const scenePlan = input.sceneAssetPlans?.[scene.sceneIndex];
    return scenePlan ? sceneRequiresAssetCandidates(scenePlan.assetRequirementType) : Boolean(scene.topRecommendation);
  });

  assert.ok(plan.diagnostics.providerCoverage >= 0.9, `${label}: provider coverage below 90%`);

  const expectedProviders = EXPECTED_PRIMARY_PROVIDERS[label];
  let matchedExpectedProvider = false;

  for (const scene of plan.sceneResults) {
    if (!scene.query) {
      continue;
    }

    assert.ok(scene.primaryProvider, `${label}: scene ${scene.sceneId} missing primary provider`);
    assert.ok(scene.rankedProviders.length > 0, `${label}: scene ${scene.sceneId} missing ranked providers`);
    assert.ok(
      ["primary", "secondary", "fallback", "planning_only"].includes(scene.primaryProvider.priority),
      `${label}: priority missing`,
    );
    assert.ok(scene.primaryProvider.reasons.length > 0, `${label}: provider reasons missing`);
    assert.ok(scene.primaryProvider.capabilitiesMatched.length > 0, `${label}: capabilities missing`);
    assert.equal(scene.primaryProvider.planningOnly, true, `${label}: provider must stay planning-only`);

    if (expectedProviders.includes(scene.primaryProvider.providerId)) {
      matchedExpectedProvider = true;
    }

    const request = {
      sceneRecommendation: input.recommendation.sceneRecommendations[scene.sceneIndex],
      visualIntent: input.mappedScenes?.[scene.sceneIndex]?.visualIntentType,
      assetRequirementType: input.sceneAssetPlans?.[scene.sceneIndex]?.assetRequirementType,
      entityTypes: scene.primaryProvider.capabilitiesMatched.length
        ? input.recommendation.sceneRecommendations[scene.sceneIndex].topRecommendation?.entityTypes ?? []
        : [],
      query: scene.query,
    };

    const requiredCapabilities = inferRequiredCapabilitiesForRequest(request);
    const providerDef = getAssetProviderDefinition(scene.primaryProvider.providerId);
    assert.ok(providerDef, `${label}: unknown provider ${scene.primaryProvider.providerId}`);
    assert.ok(
      providerSupportsCapabilities(providerDef, requiredCapabilities),
      `${label}: ${scene.primaryProvider.providerId} missing capabilities for scene ${scene.sceneId}`,
    );
  }

  assert.ok(matchedExpectedProvider, `${label}: expected provider family not selected`);
  assert.ok(plan.diagnostics.providerReasoning.length >= eligibleScenes.length / 2, `${label}: reasoning sparse`);
  assert.ok(Object.keys(plan.diagnostics.recommendedProviderCounts).length > 0, `${label}: provider counts missing`);
}

function assertNoImageApiCallsInModule(): void {
  const moduleFiles = [
    "asset-provider.types.ts",
    "asset-provider.registry.ts",
    "asset-provider.utils.ts",
    "index.ts",
  ];

  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\baxios\b/,
    /https?:\/\//,
    /image-search/i,
    /api\.pexels/i,
    /api\.unsplash/i,
    /pixabay\.com\/api/i,
  ];

  for (const file of moduleFiles) {
    const contents = readFileSync(join(MODULE_ROOT, file), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${file} must not invoke image provider APIs`);
    }
  }
}

console.log("assetProvider");

test("registry includes all planning-only providers", () => {
  const ids = listAssetProviderIds();
  assert.deepEqual(ids.sort(), [
    "ai_generated",
    "internal_library",
    "manual",
    "pexels",
    "pixabay",
    "unsplash",
    "wikimedia",
  ]);
  assert.equal(ASSET_PROVIDER_REGISTRY.length, 7);
  for (const provider of ASSET_PROVIDER_REGISTRY) {
    assert.equal(provider.planningOnly, true);
  }
});

for (const [label, fixtureName] of Object.entries(PROVIDER_FIXTURES)) {
  test(`${label} fixture selects capable providers`, () => {
    validateProviderFixture(label as keyof typeof PROVIDER_FIXTURES, fixtureName);
  });
}

test("resolveBestProviders returns ranked providers for a scene", () => {
  const input = buildProviderPlanInput(PROVIDER_FIXTURES.tactical);
  const scene = input.recommendation.sceneRecommendations.find((entry) => entry.topRecommendation);
  assert.ok(scene?.topRecommendation);

  const ranked = resolveBestProviders({
    sceneRecommendation: scene,
    visualIntent: "timeline_graphic",
    assetRequirementType: "stat_card",
    entityTypes: scene.topRecommendation.entityTypes,
    query: scene.topRecommendation.query,
  });

  assert.ok(ranked.length >= 2);
  assert.ok(ranked[0].score >= ranked[1]?.score);
  assert.equal(ranked[0].providerId, "ai_generated");
});

test("provider module makes no image API calls", () => {
  assertNoImageApiCallsInModule();
});

console.log("All asset provider abstraction checks passed.");
