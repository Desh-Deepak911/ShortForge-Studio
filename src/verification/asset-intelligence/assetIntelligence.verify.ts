/**
 * Asset Intelligence entity-aware query planner verification
 * (run: npm run test:asset-intelligence).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isAssetIntelligenceEnabled,
  runAssetIntelligence,
  type AssetIntelligenceInput,
} from "@/features/asset-intelligence";
import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = join(__dirname, "../../features/asset-intelligence");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function snapshotInput(input: AssetIntelligenceInput): string {
  return JSON.stringify(input);
}

const GOLDEN_TOPIC =
  "Erling Haaland Ballon d'Or Champions League legacy";

const GOLDEN_NARRATION =
  "Erling Haaland just changed everything. He dominated the Champions League with ruthless finishing. " +
  "Haaland carried Manchester City through Europe. The numbers were unreal. Haaland scored in every knockout round. " +
  "Then he won the Ballon d'Or. Haaland stood on the podium as the best player in the world. " +
  "Haaland lifted the trophy while the crowd roared. This Haaland era may define a generation.";

const GOLDEN_INPUT_ENTITIES = ["Erling Haaland", "Ballon d'Or", "Champions League"];

function buildGoldenAssetIntelligenceInput(): AssetIntelligenceInput {
  const studioIntelligence = runStudioIntelligence({
    topic: GOLDEN_TOPIC,
    narration: GOLDEN_NARRATION,
    targetDurationSec: 45,
    mode: "player_analysis",
    entities: GOLDEN_INPUT_ENTITIES,
  });

  const adapterResult = mapBlueprintsToScenes({
    collection: studioIntelligence.sceneBlueprintCollection,
    strategyId: studioIntelligence.strategyId,
    topic: GOLDEN_TOPIC,
    normalizedNarration: studioIntelligence.normalizedNarration,
  });

  return {
    topic: GOLDEN_TOPIC,
    studioIntelligence,
    mappedScenes: adapterResult.mappedScenes,
    inputEntities: [...GOLDEN_INPUT_ENTITIES],
    entitySummaries: [
      { kind: "player", name: "Erling Haaland" },
      { kind: "award", name: "Ballon d'Or" },
      { kind: "tournament", name: "Champions League" },
    ],
    sceneTexts: adapterResult.mappedScenes.map((scene) => ({
      sceneId: scene.id,
      narration: scene.narrationExcerpt,
      caption: scene.captionText,
      summary: scene.title,
      title: scene.title,
    })),
    strategyId: studioIntelligence.strategyId,
  };
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

  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\baxios\b/,
    /image-search/i,
    /unsplash/i,
    /pexels/i,
    /getty/i,
  ];

  for (const file of moduleFiles) {
    const contents = readFileSync(join(MODULE_ROOT, file), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.match(
        contents,
        /^(?!.*(?:fetch\s*\(|axios|image-search|unsplash|pexels|getty)).*$/s,
        `${file} must not invoke image search APIs`,
      );
      assert.doesNotMatch(contents, pattern, `${file} must not invoke image search APIs`);
    }
  }
}

console.log("assetIntelligence");

test("golden fixture detects multiple entity types including award and tournament", () => {
  const input = buildGoldenAssetIntelligenceInput();
  const result = runAssetIntelligence(input);

  const entityTypes = new Set(result.entities.map((entity) => entity.type));
  assert.ok(entityTypes.size >= 2, `expected >= 2 entity types, got ${entityTypes.size}`);
  assert.ok(
    result.entities.some((entity) => entity.type === "award"),
    "expected award entity",
  );
  assert.ok(
    result.entities.some((entity) => entity.type === "tournament"),
    "expected tournament entity",
  );
});

test("every non-placeholder scene has at least one query candidate", () => {
  const input = buildGoldenAssetIntelligenceInput();
  const result = runAssetIntelligence(input);

  for (const plan of result.sceneAssetPlans) {
    if (plan.assetRequirementType === "placeholder") {
      continue;
    }

    assert.ok(
      plan.candidates.length >= 1,
      `scene ${plan.sceneId} missing query candidates`,
    );
  }
});

test("legacy SI search queries are preserved on scene plans", () => {
  const input = buildGoldenAssetIntelligenceInput();
  const result = runAssetIntelligence(input);

  assert.ok(input.mappedScenes && input.mappedScenes.length > 0, "expected mapped scenes on fixture");
  assert.equal(result.sceneAssetPlans.length, input.mappedScenes.length);

  let preservedCount = 0;

  for (let index = 0; index < input.mappedScenes.length; index += 1) {
    const scene = input.mappedScenes[index];
    const plan = result.sceneAssetPlans[index];
    const expectedLegacy = scene.assetSearchQuery?.trim() || scene.mediaHints.searchQuery?.trim();

    if (!expectedLegacy) {
      continue;
    }

    preservedCount += 1;
    assert.equal(
      plan.legacySearchQuery,
      expectedLegacy,
      `legacy query not preserved for scene index ${index} (${scene.id})`,
    );
  }

  assert.ok(preservedCount > 0);
  assert.ok(result.diagnostics.legacyQueryPreservedCount > 0);
});

test("diversity warnings generated when a primary entity dominates", () => {
  const input = buildGoldenAssetIntelligenceInput();
  const result = runAssetIntelligence(input);

  assert.ok(
    result.diversityPlan.warnings.length > 0,
    "expected diversity warnings for Haaland-dominated fixture",
  );
  assert.ok(
    result.warnings.some((warning) => /dominates|consecutive/i.test(warning)),
    "expected dominance or consecutive-scene warning",
  );
});

test("input is not mutated by runAssetIntelligence", () => {
  const input = buildGoldenAssetIntelligenceInput();
  const before = snapshotInput(input);

  runAssetIntelligence(input);

  assert.equal(snapshotInput(input), before);
});

test("module makes no image API calls", () => {
  assertNoImageApiCallsInModule();
});

test("asset intelligence runtime flag defaults to disabled", () => {
  const previous = process.env.ASSET_INTELLIGENCE_ENABLED;
  delete process.env.ASSET_INTELLIGENCE_ENABLED;
  assert.equal(isAssetIntelligenceEnabled(), false);
  if (previous !== undefined) {
    process.env.ASSET_INTELLIGENCE_ENABLED = previous;
  }
});

test("result includes required planning artifacts", () => {
  const input = buildGoldenAssetIntelligenceInput();
  const result = runAssetIntelligence(input);

  assert.equal(result.version, "0.2.0");
  assert.ok(result.entities.length > 0);
  assert.ok(result.sceneAssetPlans.length > 0);
  assert.ok(result.assetSearchPlan.scenePlans.length === result.sceneAssetPlans.length);
  assert.ok(result.diversityPlan);
  assert.ok(result.diagnostics);
  assert.equal(result.plannerStep, "asset_intelligence");
  assert.ok(result.diagnostics.entityCoverage > 0);
  assert.ok(result.diagnostics.queryCoverage >= 1);
  assert.ok(result.diagnostics.candidateQualityScore > 0);
});

console.log("All asset intelligence checks passed.");
