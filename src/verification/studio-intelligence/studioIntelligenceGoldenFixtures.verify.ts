/**
 * Studio Intelligence golden fixture verification
 * (run: npm run test:studio-intelligence-golden-fixtures).
 */
import assert from "node:assert/strict";

import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

import {
  calculateNarrationCoverage,
  cloneGoldenFixtureInput,
  validateGoldenFixtureRun,
} from "./fixtures/golden-fixture.utils";
import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("studio-intelligence-golden-fixtures");

for (const fixture of STUDIO_INTELLIGENCE_GOLDEN_FIXTURES) {
  test(`${fixture.name} passes planning + adapter golden validation`, () => {
    const inputBefore = cloneGoldenFixtureInput(fixture.input);
    const intelligence = runStudioIntelligence(fixture.input);
    const inputAfter = cloneGoldenFixtureInput(fixture.input);

    const adapter = mapBlueprintsToScenes({
      collection: intelligence.sceneBlueprintCollection,
      strategyId: intelligence.strategyId,
      topic: intelligence.input.topic,
      normalizedNarration: intelligence.normalizedNarration,
      targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
      intelligenceRunId: `golden-${fixture.name.toLowerCase().replace(/\s+/g, "-")}`,
    });

    const validation = validateGoldenFixtureRun({
      fixture,
      intelligence,
      adapter,
      inputBefore,
      inputAfter,
    });

    if (!validation.passed) {
      assert.fail(
        `Golden fixture "${fixture.name}" failed:\n${validation.failures.map((failure) => `- ${failure}`).join("\n")}`,
      );
    }

    assert.equal(intelligence.resolvedStrategy.id, fixture.expectedStrategyId);
    assert.ok(intelligence.beats.length >= fixture.expectedMinimumBeats);
    assert.ok(intelligence.arcs.length >= fixture.expectedMinimumArcs);
    assert.ok(adapter.mappedScenes.length >= fixture.expectedMinimumScenes);
    assert.ok(
      adapter.mappedScenes.every(
        (scene) => scene.sourceBeatIds.length > 0 && scene.sourceBlueprintId.length > 0,
      ),
    );
    assert.ok(calculateNarrationCoverage(adapter) >= fixture.expectedNarrationCoverage);
    assert.ok(!adapter.warnings.some((warning) => warning.severity === "error"));
  });
}

test("golden fixture registry covers six story modes", () => {
  assert.equal(STUDIO_INTELLIGENCE_GOLDEN_FIXTURES.length, 6);

  const strategyIds = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES.map((fixture) => fixture.expectedStrategyId);
  assert.deepEqual(
    [...new Set(strategyIds)].sort(),
    ["biography", "countdown", "debate", "match_preview", "news", "tactical_analysis"].sort(),
  );
});

console.log("All Studio Intelligence golden fixture checks passed.");
