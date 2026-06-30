/**
 * Studio Intelligence foundation verification
 * (run: npm run test:studio-intelligence-foundation).
 */
import assert from "node:assert/strict";

import type {
  NarrativeBeat,
  ScenePlan,
  StudioIntelligenceInput,
  StudioIntelligenceResult,
} from "@/features/studio-intelligence";
import {
  STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES,
  STUDIO_INTELLIGENCE_VERSION,
  clampSceneDurationMs,
  createEmptyStudioIntelligenceResult,
  estimateReadingTimeMs,
  getSupportedStoryStructureCount,
  normalizeNarrationText,
  splitNarrationIntoSentences,
} from "@/features/studio-intelligence";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("studio-intelligence-foundation");

test("public types compile and accept planning shapes", () => {
  const input: StudioIntelligenceInput = {
    topic: "Haaland form",
    narration: "He scored again. The league noticed.",
    targetDurationSec: 45,
    mode: "story",
  };

  const result: StudioIntelligenceResult = createEmptyStudioIntelligenceResult(input);
  const beats: NarrativeBeat[] = result.beats;
  const scenePlans: ScenePlan[] = result.scenePlans;
  assert.equal(beats.length, 0);
  assert.equal(scenePlans.length, 0);
  assert.equal(result.version, STUDIO_INTELLIGENCE_VERSION);
  assert.equal(result.input.topic, "Haaland form");
  assert.equal(result.structure.arc, "hook_story_payoff");
});

test("normalizeNarrationText collapses whitespace", () => {
  assert.equal(normalizeNarrationText("  Hello   world.  "), "Hello world.");
  assert.equal(normalizeNarrationText(null), "");
});

test("splitNarrationIntoSentences splits on sentence boundaries", () => {
  const sentences = splitNarrationIntoSentences(
    "He scored again. The league noticed! Can anyone stop him?",
  );

  assert.deepEqual(sentences, [
    "He scored again.",
    "The league noticed!",
    "Can anyone stop him?",
  ]);
});

test("estimateReadingTimeMs uses spoken pacing assumptions", () => {
  const ms = estimateReadingTimeMs("one two three four five six");
  assert.equal(ms, 2500);
  assert.equal(estimateReadingTimeMs(""), 0);
});

test("clampSceneDurationMs enforces planning bounds", () => {
  assert.equal(clampSceneDurationMs(500), 1000);
  assert.equal(clampSceneDurationMs(3500), 3500);
  assert.equal(clampSceneDurationMs(99_000), 20_000);
});

test("createEmptyStudioIntelligenceResult returns a valid empty shell", () => {
  const result = createEmptyStudioIntelligenceResult({
    topic: "  Derby day  ",
    narration: "  First line. Second line.  ",
    targetDurationSec: 30,
    mode: "match_preview",
  });

  assert.equal(result.beats.length, 0);
  assert.equal(result.scenePlans.length, 0);
  assert.equal(result.input.topic, "Derby day");
  assert.equal(result.input.narration, "First line. Second line.");
  assert.equal(result.structure.modeStrategy?.id, "match_preview");
  assert.equal(result.structure.arc, "question_stakes_battle_cta");
  assert.ok(result.generatedAt);
  assert.equal(getSupportedStoryStructureCount(), STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES.length);
});

console.log("All Studio Intelligence foundation checks passed.");
