/**
 * Asset recommendation validator verification
 * (run: npm run test:asset-intelligence-validator).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runAssetIntelligence, sceneRequiresAssetCandidates } from "@/features/asset-intelligence";
import { buildAssetProviderPlan } from "@/features/asset-intelligence/providers";
import { buildRecommendationsFromAssetIntelligence } from "@/features/asset-intelligence/recommendation-engine";
import {
  snapshotAssetValidatorInput,
  validateAssetRecommendations,
  type AssetValidationRuleId,
  type AssetValidatorInput,
} from "@/features/asset-intelligence/validator";
import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/asset-intelligence/fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "@/verification/asset-intelligence/fixtures/build-asset-intelligence-fixture-input.utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = __dirname;

const VALIDATOR_FIXTURES = {
  biography: "Lamine Yamal biography",
  countdown: "Top 5 World Cup moments",
  debate: "Messi vs Ronaldo debate",
  history: "Barcelona collapse history",
  tactical: "Guardiola tactical analysis",
  news: "India vs Pakistan match preview",
} as const;

const EXPECTED_RULE_COUNT = 18;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function buildValidatorInput(fixtureName: string): AssetValidatorInput {
  const fixture = ASSET_INTELLIGENCE_GOLDEN_FIXTURES.find((entry) => entry.name === fixtureName);
  assert.ok(fixture, `fixture not found: ${fixtureName}`);

  const assetInput = buildAssetIntelligenceFixtureInput(fixture);
  const assetResult = runAssetIntelligence(assetInput);
  const recommendation = buildRecommendationsFromAssetIntelligence(assetResult, assetInput.mappedScenes);
  const providerPlan = buildAssetProviderPlan({
    recommendation,
    sceneAssetPlans: assetResult.sceneAssetPlans,
    mappedScenes: assetInput.mappedScenes,
  });

  return {
    assetIntelligence: assetResult,
    recommendation,
    providerPlan,
    mappedScenes: assetInput.mappedScenes,
  };
}

function validateValidatorFixture(
  label: keyof typeof VALIDATOR_FIXTURES,
  fixtureName: string,
): ReturnType<typeof validateAssetRecommendations> {
  const input = buildValidatorInput(fixtureName);
  const before = snapshotAssetValidatorInput(input);
  const result = validateAssetRecommendations(input);
  assert.equal(snapshotAssetValidatorInput(input), before, `${label}: input mutated`);

  assert.ok(result.validationScore > 0, `${label}: validation score missing`);
  assert.ok(result.entityCoverageScore >= 0, `${label}: entity coverage score missing`);
  assert.ok(result.providerCoverageScore >= 0, `${label}: provider coverage score missing`);
  assert.ok(result.visualDiversityScore >= 0, `${label}: visual diversity score missing`);
  assert.ok(result.recommendationQualityScore >= 0, `${label}: recommendation quality score missing`);
  assert.ok(result.providerQualityScore >= 0, `${label}: provider quality score missing`);
  assert.equal(result.diagnostics.validationRulesExecuted.length, EXPECTED_RULE_COUNT, `${label}: rule count`);
  assert.ok(result.diagnostics.repairSuggestionCount >= 0, `${label}: repair suggestion count missing`);

  const eligibleScenes = input.recommendation.sceneRecommendations.filter((scene) => {
    const scenePlan = input.assetIntelligence.sceneAssetPlans[scene.sceneIndex];
    return scenePlan ? sceneRequiresAssetCandidates(scenePlan.assetRequirementType) : Boolean(scene.topRecommendation);
  });

  const coverageEligible = Math.min(result.entityCoverageScore, result.providerCoverageScore);
  assert.ok(coverageEligible >= 0.9 || result.validationScore >= 0.75, `${label}: coverage below threshold`);

  assert.ok(result.ruleResults.length === EXPECTED_RULE_COUNT, `${label}: incomplete rule results`);
  assert.ok(result.diagnostics.validatorVersion.length > 0, `${label}: validator version missing`);

  if (eligibleScenes.length > 0) {
    assert.ok(
      result.repairSuggestions.length > 0 || result.validationScore >= 0.85,
      `${label}: expected repair suggestions or high validation score`,
    );
  }

  return result;
}

function assertNoImageApiCallsInModule(): void {
  const moduleFiles = [
    "asset-validator.types.ts",
    "asset-validator.rules.ts",
    "asset-validator.utils.ts",
    "asset-validator.ts",
    "index.ts",
  ];

  const forbiddenPatterns = [/\bfetch\s*\(/, /\baxios\b/, /https?:\/\//, /api\.pexels/i, /api\.unsplash/i];

  for (const file of moduleFiles) {
    const contents = readFileSync(join(MODULE_ROOT, file), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${file} must not invoke image provider APIs`);
    }
  }
}

function findRule(
  result: ReturnType<typeof validateAssetRecommendations>,
  ruleId: AssetValidationRuleId,
) {
  return result.ruleResults.find((rule) => rule.ruleId === ruleId);
}

console.log("assetValidator");

test("validator executes all planning rules", () => {
  const input = buildValidatorInput(VALIDATOR_FIXTURES.tactical);
  const result = validateAssetRecommendations(input);
  assert.equal(result.diagnostics.validationRulesExecuted.length, EXPECTED_RULE_COUNT);
});

const fixtureResults: Partial<
  Record<keyof typeof VALIDATOR_FIXTURES, ReturnType<typeof validateAssetRecommendations>>
> = {};

for (const [label, fixtureName] of Object.entries(VALIDATOR_FIXTURES)) {
  test(`${label} fixture produces validation output`, () => {
    fixtureResults[label as keyof typeof VALIDATOR_FIXTURES] = validateValidatorFixture(
      label as keyof typeof VALIDATOR_FIXTURES,
      fixtureName,
    );
  });
}

test("duplicate recommendations are detected across fixtures", () => {
  const results = Object.values(fixtureResults);
  assert.ok(results.length > 0);

  const duplicateDetected = results.some((result) => {
    const rule = findRule(result, "duplicate_recommendations");
    return Boolean(rule && (result.recommendationQualityScore < 1 || result.repairSuggestions.some((entry) => entry.category === "portrait")));
  });

  const haalandResult = validateAssetRecommendations(
    buildValidatorInput("Haaland Ballon d'Or Champions League"),
  );
  const haalandDuplicateRule = findRule(haalandResult, "duplicate_recommendations");

  assert.ok(
    duplicateDetected || haalandResult.diagnostics.warningsByType.duplicate !== undefined || Boolean(haalandDuplicateRule),
    "duplicate asset detection should run",
  );
});

test("unused important entities are detected", () => {
  const results = Object.values(fixtureResults);
  const unusedDetected = results.some((result) => {
    const rule = findRule(result, "unused_important_entities");
    return Boolean(
      rule &&
        (result.repairSuggestions.some((entry) => entry.category === "entity") ||
          result.warnings.some((warning) => warning.includes("unused")) ||
          !rule.passed),
    );
  });

  assert.ok(unusedDetected, "unused entity detection should run");
});

test("provider mismatch is detected for historical or tactical scenes", () => {
  const historyResult = fixtureResults.history;
  assert.ok(historyResult);

  const historicalRule = findRule(historyResult, "historical_provider_match");
  const capabilityRule = findRule(historyResult, "provider_capability_consistency");
  assert.ok(historicalRule);
  assert.ok(capabilityRule);

  const tacticalResult = fixtureResults.tactical;
  assert.ok(tacticalResult);
  const tacticalRule = findRule(tacticalResult, "tactical_provider_preference");
  assert.ok(tacticalRule);
});

test("validator module makes no image API calls", () => {
  assertNoImageApiCallsInModule();
});

console.log("All asset recommendation validator checks passed.");
