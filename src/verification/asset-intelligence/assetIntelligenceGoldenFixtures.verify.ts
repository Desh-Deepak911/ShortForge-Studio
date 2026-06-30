/**
 * Asset Intelligence golden fixture verification
 * (run: npm run test:asset-intelligence-golden-fixtures).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findExpectedPrimaryEntities,
  isHumanReadableQuery,
  runAssetIntelligence,
  sceneRequiresAssetCandidates,
  type AssetIntelligenceInput,
} from "@/features/asset-intelligence";
import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";

import { ASSET_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/asset-intelligence-golden-fixtures.registry";
import { buildAssetIntelligenceFixtureInput } from "./fixtures/build-asset-intelligence-fixture-input.utils";
import type { AssetIntelligenceGoldenFixture } from "./fixtures/asset-intelligence-golden-fixture.types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = join(__dirname, "../../features/asset-intelligence");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function snapshotInput(input: AssetIntelligenceInput): string {
  return JSON.stringify(input);
}

function countMatchedThemes(
  queries: string[],
  themes: string[],
): number {
  const normalizedQueries = queries.map((query) => normalizeAssetSearchQuery(query));
  return themes.filter((theme) => {
    const normalizedTheme = normalizeAssetSearchQuery(theme);
    return normalizedQueries.some((query) => query.includes(normalizedTheme));
  }).length;
}

function assertNoImageApiCallsInModule(): void {
  const moduleFiles = [
    "asset-intelligence.types.ts",
    "asset-entity-merge.utils.ts",
    "asset-query-planner.utils.ts",
    "asset-query-quality.utils.ts",
    "asset-diagnostics.utils.ts",
    "asset-diversity.utils.ts",
    "run-asset-intelligence.ts",
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

function validateFixture(fixture: AssetIntelligenceGoldenFixture): void {
  const input = buildAssetIntelligenceFixtureInput(fixture);
  const before = snapshotInput(input);
  const result = runAssetIntelligence(input);
  assert.equal(snapshotInput(input), before, `${fixture.name}: input mutated`);

  const detectedTypes = new Set(result.entities.map((entity) => entity.type));
  for (const expectedType of fixture.expectedEntityTypes) {
    assert.ok(
      detectedTypes.has(expectedType),
      `${fixture.name}: missing entity type ${expectedType}`,
    );
  }

  const matchedPrimaries = findExpectedPrimaryEntities(
    result.entities,
    fixture.expectedPrimaryEntities,
  );
  assert.ok(
    matchedPrimaries.length >= Math.min(2, fixture.expectedPrimaryEntities.length),
    `${fixture.name}: expected primary entities missing (${matchedPrimaries.length}/${fixture.expectedPrimaryEntities.length})`,
  );

  const highConfidenceMatches = matchedPrimaries.filter((entity) => entity.confidence === "high");
  assert.ok(
    highConfidenceMatches.length >= 1,
    `${fixture.name}: expected at least one high-confidence primary entity`,
  );

  for (const plan of result.sceneAssetPlans) {
    if (!sceneRequiresAssetCandidates(plan.assetRequirementType)) {
      continue;
    }

    assert.ok(
      plan.candidates.length >= fixture.minimumQueryCandidatesPerScene,
      `${fixture.name}: scene ${plan.sceneId} missing query candidates`,
    );

    for (const candidate of plan.candidates) {
      assert.ok(
        isHumanReadableQuery(candidate, result.entities),
        `${fixture.name}: generic/unreadable query "${candidate.query}"`,
      );
      assert.ok(candidate.rationale.trim().length > 0, `${fixture.name}: missing candidate rationale`);
      assert.ok(
        ["high", "medium", "low"].includes(candidate.confidence),
        `${fixture.name}: missing candidate confidence`,
      );
      assert.ok(
        candidate.query.length <= 80,
        `${fixture.name}: query too long "${candidate.query}"`,
      );
    }
  }

  const allQueries = result.sceneAssetPlans.flatMap((plan) =>
    plan.candidates.map((candidate) => candidate.query),
  );
  const matchedThemeCount = countMatchedThemes(allQueries, fixture.expectedAssetThemes);
  const requiredThemeMatches = Math.max(1, Math.ceil(fixture.expectedAssetThemes.length / 2));
  assert.ok(
    matchedThemeCount >= requiredThemeMatches,
    `${fixture.name}: expected ${requiredThemeMatches} asset themes, matched ${matchedThemeCount}`,
  );

  assert.ok(input.mappedScenes && input.mappedScenes.length > 0, `${fixture.name}: missing mapped scenes`);
  for (let index = 0; index < input.mappedScenes.length; index += 1) {
    const scene = input.mappedScenes[index];
    const plan = result.sceneAssetPlans[index];
    const expectedLegacy = scene.assetSearchQuery?.trim() || scene.mediaHints.searchQuery?.trim();
    if (expectedLegacy) {
      assert.equal(
        plan.legacySearchQuery,
        expectedLegacy,
        `${fixture.name}: legacy query not preserved at index ${index}`,
      );
    }
  }

  assert.ok(
    result.diagnostics.repeatedEntityRatio <= fixture.maxRepeatedPrimaryEntityRatio + 0.05 ||
      (fixture.expectedDiversityWarnings ?? false),
    `${fixture.name}: repeated entity ratio ${result.diagnostics.repeatedEntityRatio.toFixed(2)} exceeds ${fixture.maxRepeatedPrimaryEntityRatio}`,
  );

  if (fixture.expectedDiversityWarnings) {
    assert.ok(
      result.diversityPlan.warnings.length > 0,
      `${fixture.name}: expected diversity warnings`,
    );
    assert.ok(
      result.diversityPlan.alternateRecommendations.length > 0,
      `${fixture.name}: expected alternate recommendations`,
    );
  }

  const minimumQuality = fixture.minimumCandidateQualityScore ?? 0.5;
  assert.ok(
    result.diagnostics.candidateQualityScore >= minimumQuality,
    `${fixture.name}: candidate quality ${result.diagnostics.candidateQualityScore.toFixed(2)} below ${minimumQuality}`,
  );

  assert.ok(result.diagnostics.entityCoverage > 0, `${fixture.name}: entityCoverage missing`);
  assert.ok(result.diagnostics.queryCoverage >= 1, `${fixture.name}: queryCoverage below 1`);
  assert.ok(
    Number.isFinite(result.diagnostics.diversityScore),
    `${fixture.name}: diversityScore missing`,
  );
}

console.log("assetIntelligenceGoldenFixtures");

for (const fixture of ASSET_INTELLIGENCE_GOLDEN_FIXTURES) {
  test(`${fixture.name} passes asset intelligence golden validation`, () => {
    validateFixture(fixture);
  });
}

test("all seven golden fixtures are registered", () => {
  assert.equal(ASSET_INTELLIGENCE_GOLDEN_FIXTURES.length, 7);
});

test("module makes no image API calls", () => {
  assertNoImageApiCallsInModule();
});

console.log("All asset intelligence golden fixture checks passed.");
