/**
 * Studio Intelligence materializer golden fixture verification
 * (run: npm run test:studio-intelligence-materializer-golden-fixtures).
 *
 * Pipeline: runStudioIntelligence → mapBlueprintsToScenes → materializeMappedScenesToFootieScript
 */
import assert from "node:assert/strict";

import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import {
  cloneFootieScriptMaterializerInput,
  materializerInputsEqual,
  materializeMappedScenesToFootieScript,
} from "@/features/studio-intelligence/footie-script-materializer";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT } from "@/types/footiebitz";

import {
  cloneGoldenFixtureInput,
  summarizeMaterializerGoldenWarnings,
  validateMaterializerGoldenFixtureRun,
} from "./fixtures/golden-fixture.utils";
import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("studio-intelligence-materializer-golden-fixtures");

const validationResults = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES.map((fixture) => {
  const inputBefore = cloneGoldenFixtureInput(fixture.input);
  const intelligence = runStudioIntelligence(fixture.input);
  const inputAfter = cloneGoldenFixtureInput(fixture.input);
  const voiceoverDurationMs =
    fixture.input.targetDurationMs ?? Math.max(1, fixture.input.targetDurationSec) * 1000;

  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: voiceoverDurationMs,
    intelligenceRunId: `materializer-golden-${fixture.name.toLowerCase().replace(/\s+/g, "-")}`,
  });

  const materializerInput = {
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs,
    intelligenceRunId: `materializer-golden-${fixture.name.toLowerCase().replace(/\s+/g, "-")}`,
    adapterDiagnostics: adapter.diagnostics,
  };
  const materializerInputBefore = cloneFootieScriptMaterializerInput(materializerInput);

  const materializer = materializeMappedScenesToFootieScript(materializerInput);

  assert.ok(
    materializerInputsEqual(materializerInputBefore, materializerInput),
    `materializer input mutated for fixture "${fixture.name}"`,
  );

  const validation = validateMaterializerGoldenFixtureRun({
    fixture,
    intelligence,
    adapter,
    materializer,
    inputBefore,
    inputAfter,
    voiceoverDurationMs,
  });

  test(`${fixture.name} passes runtime → adapter → materializer golden validation`, () => {
    if (!validation.passed) {
      assert.fail(
        `Golden materializer fixture "${fixture.name}" failed:\n${validation.failures.map((failure) => `- ${failure}`).join("\n")}`,
      );
    }

    assert.ok(intelligence.beats.length > 0);
    assert.equal(adapter.success, true);
    assert.equal(materializer.success, true);
    assert.ok(materializer.footieScenes.length >= fixture.expectedMinimumScenes);
    assert.ok(materializer.footieScenes.length >= MIN_SCENE_COUNT);
    assert.ok(materializer.footieScenes.length <= MAX_SCENE_COUNT);
  });

  return validation;
});

test("materializer golden fixture registry covers six story modes", () => {
  assert.equal(STUDIO_INTELLIGENCE_GOLDEN_FIXTURES.length, 6);
  assert.equal(validationResults.length, 6);
  assert.ok(validationResults.every((result) => result.passed));
});

const warningSummary = summarizeMaterializerGoldenWarnings(validationResults);

console.log("\nScene count ranges:");
for (const result of validationResults) {
  console.log(`  - ${result.fixtureName}: ${result.sceneCount} scenes`);
}

console.log("\nWarning summary:");
if (Object.keys(warningSummary).length === 0) {
  console.log("  - none");
} else {
  for (const [code, count] of Object.entries(warningSummary).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    console.log(`  - ${code}: ${count}`);
  }
}

console.log("\nAll Studio Intelligence materializer golden fixture checks passed.");
