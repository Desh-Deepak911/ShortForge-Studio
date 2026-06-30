/**
 * Scene asset recommendation engine verification
 * (run: npm run test:asset-intelligence-recommendations).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runAssetIntelligence, sceneRequiresAssetCandidates } from "@/features/asset-intelligence";
import {
  buildRecommendationsFromAssetIntelligence,
  buildSceneAssetRecommendations,
  type SceneAssetRecommendationInput,
} from "@/features/asset-intelligence/recommendation-engine";
import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = __dirname;

const RECOMMENDATION_FIXTURE_NAMES = [
  "Messi vs Ronaldo debate",
  "Top 5 World Cup moments",
  "Guardiola tactical analysis",
  "Lamine Yamal biography",
  "Barcelona collapse history",
] as const;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function snapshotRecommendationInput(input: SceneAssetRecommendationInput): string {
  return JSON.stringify(input);
}

function buildRecommendationInput(fixtureName: string): SceneAssetRecommendationInput {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES.find((entry) => entry.name === fixtureName);
  assert.ok(fixture, `fixture not found: ${fixtureName}`);

  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetResult = runAssetIntelligence(assetInput);

  return {
    entities: assetResult.entities,
    sceneAssetPlans: assetResult.sceneAssetPlans,
    diversityPlan: assetResult.diversityPlan,
    mappedScenes: assetInput.mappedScenes,
    diagnostics: assetResult.diagnostics,
  };
}

function validateRecommendationFixture(fixtureName: string): void {
  const input = buildRecommendationInput(fixtureName);
  const before = snapshotRecommendationInput(input);
  const result = buildSceneAssetRecommendations(input);
  assert.equal(snapshotRecommendationInput(input), before, `${fixtureName}: input mutated`);

  const eligibleScenes = input.sceneAssetPlans.filter((plan) =>
    sceneRequiresAssetCandidates(plan.assetRequirementType),
  );

  assert.ok(result.coverageScore > 0.9, `${fixtureName}: coverage ${result.coverageScore} <= 0.9`);
  assert.ok(result.confidenceScore > 0, `${fixtureName}: confidence score missing`);

  const topQueries = result.sceneRecommendations
    .map((scene) => scene.topRecommendation?.query)
    .filter((query): query is string => Boolean(query));

  assert.ok(topQueries.length >= eligibleScenes.length, `${fixtureName}: missing top recommendations`);
  assert.equal(
    new Set(topQueries.map((query) => normalizeAssetSearchQuery(query))).size,
    topQueries.length,
    `${fixtureName}: duplicate top recommendations detected`,
  );

  for (const scene of result.sceneRecommendations) {
    if (!sceneRequiresAssetCandidates(
      input.sceneAssetPlans[scene.sceneIndex]?.assetRequirementType ?? "placeholder",
    )) {
      continue;
    }

    assert.ok(scene.topRecommendation, `${fixtureName}: scene ${scene.sceneId} missing top recommendation`);
    assert.ok(scene.topRecommendation.reasons.length > 0, `${fixtureName}: missing reasons`);
    assert.ok(scene.topRecommendation.reasonLabels.length > 0, `${fixtureName}: missing reason labels`);
    assert.ok(
      ["very_high", "high", "medium", "low"].includes(scene.confidence),
      `${fixtureName}: scene confidence missing`,
    );
    assert.ok(scene.alternatives.length > 0, `${fixtureName}: scene ${scene.sceneId} missing alternatives`);
    assert.ok(scene.reasoning.length > 0, `${fixtureName}: scene ${scene.sceneId} missing reasoning`);
  }

  assert.ok(result.globalRecommendations.length > 0, `${fixtureName}: global recommendations missing`);
  assert.ok(result.diagnostics.scenesWithRecommendation > 0, `${fixtureName}: diagnostics missing`);
}

function assertNoImageApiCallsInModule(): void {
  const moduleFiles = [
    "recommendation-engine.types.ts",
    "recommendation-engine.utils.ts",
    "scene-asset-recommendation.ts",
    "index.ts",
  ];

  const forbiddenPatterns = [/\bfetch\s*\(/, /\baxios\b/, /image-search/i, /unsplash/i, /pexels/i, /getty/i];

  for (const file of moduleFiles) {
    const contents = readFileSync(join(MODULE_ROOT, file), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${file} must not invoke image search APIs`);
    }
  }
}

console.log("recommendationEngine");

for (const fixtureName of RECOMMENDATION_FIXTURE_NAMES) {
  test(`${fixtureName} produces ranked scene recommendations`, () => {
    validateRecommendationFixture(fixtureName);
  });
}

test("buildRecommendationsFromAssetIntelligence wrapper works", () => {
  const assetInput = buildAssetIntelligenceFixtureInput(
    ASSET_INTELLIGENCE_GOLDEN_FIXTURES.find((entry) => entry.name === "Messi vs Ronaldo debate")!,
  );
  const assetResult = runAssetIntelligence(assetInput);
  const result = buildRecommendationsFromAssetIntelligence(assetResult, assetInput.mappedScenes);

  assert.ok(result.sceneRecommendations.length > 0);
  assert.ok(result.coverageScore > 0.9);
});

test("recommendation module makes no image API calls", () => {
  assertNoImageApiCallsInModule();
});

console.log("All scene asset recommendation checks passed.");
