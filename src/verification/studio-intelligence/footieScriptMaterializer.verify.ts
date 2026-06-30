/**
 * FootieScript materializer golden + integration verification
 * (run: npm run test:studio-intelligence-footie-script-materializer).
 */
import assert from "node:assert/strict";

import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import {
  cloneFootieScriptMaterializerInput,
  materializerInputsEqual,
  materializeMappedScenesToFootieScript,
  subtitlesWithinWordCap,
} from "@/features/studio-intelligence/footie-script-materializer";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

import { cloneGoldenFixtureInput } from "./fixtures/golden-fixture.utils";
import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function assertContiguousTiming(scenes: { startMs?: number; endMs?: number; durationMs?: number }[]) {
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    assert.ok(scene.startMs != null && scene.endMs != null && scene.durationMs != null);
    assert.equal(scene.endMs - scene.startMs, scene.durationMs);

    if (index > 0) {
      assert.equal(scenes[index - 1]?.endMs, scene.startMs);
    }
  }
}

console.log("studio-intelligence-footie-script-materializer-golden");

test("golden adapter output maps to production-shaped scenes", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  assert.equal(result.success, true);
  assert.ok(result.footieScenes.length >= fixture.expectedMinimumScenes);
  assert.equal(result.scenes.length, result.footieScenes.length);
});

test("required scene fields exist on materialized output", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[1];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 45_000,
  });

  for (const scene of result.footieScenes) {
    assert.ok(scene.id.trim().length > 0);
    assert.ok(scene.subtitle.trim().length > 0);
    assert.ok(scene.duration > 0);
    assert.equal(scene.captionMode, "generated");
    assert.equal(scene.subtitleEffect, "fade-up");
    assert.ok(!scene.image?.url);
  }
});

test("scene timing is contiguous when voiceover duration is provided", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[2];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const voiceoverDurationMs = 60_000;
  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs,
  });

  assertContiguousTiming(result.footieScenes);

  const totalDurationMs = result.footieScenes.at(-1)?.endMs ?? 0;
  assert.equal(totalDurationMs, voiceoverDurationMs);
});

test("narration excerpt is preserved on materialized scenes", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[3];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 30_000,
  });

  for (const [index, draft] of result.scenes.entries()) {
    const mapped = adapter.mappedScenes[index];
    assert.equal(draft.scene.narration, mapped.narrationExcerpt.trim());
  }
});

test("subtitle fallback works and respects 12-word cap across golden fixtures", () => {
  for (const fixture of STUDIO_INTELLIGENCE_GOLDEN_FIXTURES) {
    const intelligence = runStudioIntelligence(fixture.input);
    const adapter = mapBlueprintsToScenes({
      collection: intelligence.sceneBlueprintCollection,
      strategyId: intelligence.strategyId,
      topic: intelligence.input.topic,
      normalizedNarration: intelligence.normalizedNarration,
      targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
    });

    const result = materializeMappedScenesToFootieScript({
      mappedScenes: adapter.mappedScenes,
      narration: intelligence.normalizedNarration,
      voiceoverDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
    });

    for (const scene of result.footieScenes) {
      assert.ok(scene.subtitle.trim().length > 0);
      assert.ok(subtitlesWithinWordCap(scene.subtitle, 12));
    }
  }
});

test("production scene IDs are regenerated", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[4];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 30_000,
  });

  for (const [index, draft] of result.scenes.entries()) {
    const adapterScene = adapter.mappedScenes[index];
    assert.notEqual(draft.scene.id, adapterScene.id);
    assert.ok(!draft.scene.id.startsWith("mapped:"));
    assert.equal(draft.lineage.adapterSceneId, adapterScene.id);
  }
});

test("lineage sidecar is populated", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[5];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 30_000,
  });

  for (const [index, draft] of result.scenes.entries()) {
    const mapped = adapter.mappedScenes[index];
    assert.equal(draft.lineage.sourceBlueprintId, mapped.sourceBlueprintId);
    assert.equal(draft.lineage.sourceArcId, mapped.sourceArcId);
    assert.deepEqual(draft.lineage.sourceBeatIds, mapped.sourceBeatIds);
    assert.ok(draft.metadata.assetSearchQuery?.trim() || draft.metadata.mediaHints.searchQuery?.trim());
  }
});

test("input is not mutated during golden materialization", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const inputBefore = cloneGoldenFixtureInput(fixture.input);
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const materializerInput = {
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 30_000,
  };
  const materializerBefore = cloneFootieScriptMaterializerInput(materializerInput);

  materializeMappedScenesToFootieScript(materializerInput);

  assert.ok(materializerInputsEqual(materializerBefore, materializerInput));
  assert.deepEqual(cloneGoldenFixtureInput(fixture.input), inputBefore);
});

test("empty input returns success=false with warning", () => {
  const result = materializeMappedScenesToFootieScript({
    mappedScenes: [],
    narration: "Narration exists but no mapped scenes.",
    voiceoverDurationMs: 30_000,
  });

  assert.equal(result.success, false);
  assert.ok(result.warnings.some((warning) => warning.code === "EMPTY_MAPPED_SCENES"));
  assert.equal(result.diagnostics.processedSceneCount, 0);
});

test("materialization diagnostics include version, counts, and confidence", () => {
  const fixture = STUDIO_INTELLIGENCE_GOLDEN_FIXTURES[0];
  const intelligence = runStudioIntelligence(fixture.input);
  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
  });

  const result = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 30_000,
  });

  assert.equal(result.diagnostics.processedSceneCount, result.footieScenes.length);
  assert.equal(result.diagnostics.skippedSceneCount, 0);
  assert.ok(result.diagnostics.totalDurationMs > 0);
  assert.ok(result.diagnostics.confidence > 0);
  assert.equal(typeof result.diagnostics.materializationVersion, "string");
});

console.log("All FootieScript materializer golden checks passed.");
