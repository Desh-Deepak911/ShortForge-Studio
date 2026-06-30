/**
 * Scene density adapter verification
 * (run: npm run test:studio-intelligence-scene-density).
 */
import assert from "node:assert/strict";

import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import { adaptSceneDensity } from "@/features/studio-intelligence/scene-density/scene-density-adapter";
import {
  durationPreserved,
  lineagePreserved,
  maxImportancePreserved,
  narrationCoveragePreserved,
  SCENE_DENSITY_ADAPTER_VERSION,
} from "@/features/studio-intelligence/scene-density/scene-density.utils";
import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "@/verification/studio-intelligence/fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function findFixture(name: string) {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES.find((entry) => entry.name === name);
  assert.ok(fixture, `missing golden fixture: ${name}`);
  return fixture;
}

function assertAdaptationPreservesInvariants(
  name: string,
  inputCount: number,
  requestedCount: number,
) {
  const fixture = findFixture(name);
  const intelligence = runStudioIntelligence(fixture.input);
  const originalBlueprints = intelligence.sceneBlueprintCollection.blueprints;

  assert.equal(originalBlueprints.length, inputCount, `${name} baseline scene count changed`);

  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, requestedCount);

  assert.equal(adaptation.success, true, adaptation.reason ?? "adaptation failed");
  assert.equal(adaptation.collection.blueprints.length, requestedCount);
  assert.equal(adaptation.diagnostics.adapterVersion, SCENE_DENSITY_ADAPTER_VERSION);
  assert.equal(adaptation.diagnostics.inputSceneCount, inputCount);
  assert.equal(adaptation.diagnostics.requestedSceneCount, requestedCount);
  assert.equal(adaptation.diagnostics.outputSceneCount, requestedCount);
  assert.ok(durationPreserved(originalBlueprints, adaptation.collection.blueprints));
  assert.ok(lineagePreserved(originalBlueprints, adaptation.collection.blueprints));
  assert.ok(narrationCoveragePreserved(originalBlueprints, adaptation.collection.blueprints));
  assert.ok(maxImportancePreserved(originalBlueprints, adaptation.collection.blueprints));
  assert.equal(
    adaptation.diagnostics.originalTotalDurationMs,
    adaptation.diagnostics.adaptedTotalDurationMs,
  );
  assert.ok(adaptation.diagnostics.adaptedConfidence > 0);
}

console.log("studio-intelligence-scene-density");

test("adaptSceneDensity contract exposes versioned diagnostics", () => {
  const fixture = findFixture("Player biography");
  const intelligence = runStudioIntelligence(fixture.input);
  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, 6);

  assert.equal(adaptation.diagnostics.adapterVersion, SCENE_DENSITY_ADAPTER_VERSION);
  assert.ok(["none", "merge", "split", "mixed"].includes(adaptation.diagnostics.strategy));
});

test("biography adapts 4 → 6 with timing, narration, and importance preserved", () => {
  assertAdaptationPreservesInvariants("Player biography", 4, 6);

  const intelligence = runStudioIntelligence(findFixture("Player biography").input);
  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, 6);
  assert.equal(adaptation.diagnostics.strategy, "split");
  assert.ok(adaptation.diagnostics.splitCount >= 2);
});

test("top 5 adapts 6 → 5 with timing, narration, and importance preserved", () => {
  assertAdaptationPreservesInvariants("Top 5 World Cup moments", 6, 5);

  const intelligence = runStudioIntelligence(findFixture("Top 5 World Cup moments").input);
  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, 5);
  assert.equal(adaptation.diagnostics.strategy, "merge");
  assert.equal(adaptation.diagnostics.mergeCount, 1);
});

test("debate adapts 5 → 6 with timing, narration, and importance preserved", () => {
  assertAdaptationPreservesInvariants("Messi vs Ronaldo debate", 5, 6);

  const intelligence = runStudioIntelligence(findFixture("Messi vs Ronaldo debate").input);
  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, 6);
  assert.equal(adaptation.diagnostics.strategy, "split");
  assert.ok(adaptation.diagnostics.splitCount >= 1);
});

test("news adapts 4 → 6 with timing, narration, and importance preserved", () => {
  assertAdaptationPreservesInvariants("News recap", 4, 6);

  const intelligence = runStudioIntelligence(findFixture("News recap").input);
  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, 6);
  assert.equal(adaptation.diagnostics.strategy, "split");
  assert.ok(adaptation.diagnostics.splitCount >= 2);
});

test("adaptSceneDensity returns failure when adaptation is impossible", () => {
  const fixture = findFixture("Player biography");
  const intelligence = runStudioIntelligence(fixture.input);
  const adaptation = adaptSceneDensity(intelligence.sceneBlueprintCollection, 99);

  assert.equal(adaptation.success, false);
  assert.match(adaptation.reason ?? "", /between 3 and 12/);
});

console.log("All Studio Intelligence scene density checks passed.");
