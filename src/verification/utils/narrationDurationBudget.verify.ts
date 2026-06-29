/**
 * Narration duration budget verification (run: npm run test:narration-duration-budget).
 */
import assert from "node:assert/strict";

import {
  countWords,
  enforceNarrationWordBudget,
  estimateNarrationDurationMs,
  exceedsNarrationDurationBudget,
  exceedsNarrationScriptBudget,
  getMaxNarrationDurationMs,
  getNarrationMaxOutputTokenRange,
  getNarrationWordBudget,
  exceedsTargetScriptDuration,
  getEstimatedScriptDurationSeconds,
  isWithinNarrationScriptBudget,
  NARRATION_MAX_DURATION_STRETCH,
  NARRATION_WORDS_PER_SECOND,
  resolveNarrationMaxOutputTokens,
  truncateNarrationToWordBudget,
} from "@/features/story/utils/narration-duration-budget.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("narrationDurationBudget");

test("getNarrationWordBudget returns studio presets for 30/45/60", () => {
  assert.deepEqual(getNarrationWordBudget(30), {
    targetSeconds: 30,
    idealMinWords: 70,
    idealMaxWords: 80,
    hardCapWords: 105,
    maxDurationSeconds: 40.5,
  });

  assert.deepEqual(getNarrationWordBudget(45), {
    targetSeconds: 45,
    idealMinWords: 105,
    idealMaxWords: 115,
    hardCapWords: 145,
    maxDurationSeconds: 60.8,
  });

  assert.deepEqual(getNarrationWordBudget(60), {
    targetSeconds: 60,
    idealMinWords: 145,
    idealMaxWords: 155,
    hardCapWords: 190,
    maxDurationSeconds: 81,
  });
});

test("getNarrationWordBudget clamps and interpolates non-preset targets", () => {
  const budget = getNarrationWordBudget(38);
  assert.equal(budget.targetSeconds, 38);
  assert.equal(budget.idealMinWords, 86);
  assert.equal(budget.idealMaxWords, 96);
  assert.equal(budget.hardCapWords, Math.round(38 * NARRATION_MAX_DURATION_STRETCH * NARRATION_WORDS_PER_SECOND));
});

test("countWords normalizes whitespace", () => {
  assert.equal(countWords("  one   two three  "), 3);
  assert.equal(countWords(""), 0);
});

test("estimateNarrationDurationMs uses 2.4 words per second", () => {
  const eightyWords = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
  const durationMs = estimateNarrationDurationMs(eightyWords);
  assert.equal(durationMs, Math.round((80 / NARRATION_WORDS_PER_SECOND) * 1000 + 400));
});

test("enforceNarrationWordBudget truncates overlong narration", () => {
  const budget = getNarrationWordBudget(30);
  const longNarration = Array.from({ length: 150 }, () => "word").join(" ");
  const enforced = enforceNarrationWordBudget(longNarration, budget);

  assert.equal(enforced.truncated, true);
  assert.ok(countWords(enforced.narration) <= budget.hardCapWords);
});

test("resolveNarrationMaxOutputTokens scales with duration presets", () => {
  const assertWithinRange = (duration: number) => {
    const range = getNarrationMaxOutputTokenRange(duration);
    const tokens = resolveNarrationMaxOutputTokens(duration);
    assert.ok(tokens >= range.min && tokens <= range.max);
  };

  assertWithinRange(30);
  assertWithinRange(45);
  assertWithinRange(60);
  assertWithinRange(90);
  assert.equal(resolveNarrationMaxOutputTokens(30), 400);
  assert.equal(resolveNarrationMaxOutputTokens(45), 575);
  assert.equal(resolveNarrationMaxOutputTokens(60), 775);
  assert.equal(resolveNarrationMaxOutputTokens(90), 1025);
});

test("resolveNarrationMaxOutputTokens interpolates between presets", () => {
  const tokens = resolveNarrationMaxOutputTokens(38);
  assert.ok(tokens > resolveNarrationMaxOutputTokens(30));
  assert.ok(tokens < resolveNarrationMaxOutputTokens(45));
});

test("exceedsNarrationScriptBudget checks word cap and estimated duration stretch", () => {
  const budget = getNarrationWordBudget(30);
  const withinBudget = Array.from({ length: 75 }, (_, index) => `word${index}`).join(" ");
  const overWordCap = Array.from({ length: 120 }, () => "word").join(" ");
  const overDurationOnly = Array.from({ length: 100 }, (_, index) => `word${index}`).join(" ");

  assert.equal(isWithinNarrationScriptBudget(withinBudget, budget), true);
  assert.equal(exceedsNarrationScriptBudget(overWordCap, budget), true);
  assert.equal(exceedsNarrationDurationBudget(overDurationOnly, budget), true);
  assert.equal(
    estimateNarrationDurationMs(overDurationOnly),
    Math.round((100 / NARRATION_WORDS_PER_SECOND) * 1000 + 400),
  );
  assert.ok(estimateNarrationDurationMs(overDurationOnly) > getMaxNarrationDurationMs(budget));
});

test("exceedsTargetScriptDuration warns when estimate exceeds target by more than 35%", () => {
  const targetSeconds = 30;
  const threshold = Math.round(targetSeconds * 1.35);
  const underTarget = Array.from({ length: 60 }, (_, index) => `word${index}`).join(" ");
  const overTarget = Array.from({ length: 120 }, () => "word").join(" ");

  assert.equal(exceedsTargetScriptDuration(underTarget, targetSeconds), false);
  assert.ok(getEstimatedScriptDurationSeconds(overTarget) > threshold);
  assert.equal(exceedsTargetScriptDuration(overTarget, targetSeconds), true);
});

test("truncateNarrationToWordBudget prefers sentence boundaries when reasonable", () => {
  const words = Array.from({ length: 90 }, (_, index) =>
    index === 69 ? "stop." : `word${index}`,
  );
  const narration = words.join(" ");
  const truncated = truncateNarrationToWordBudget(narration, 70);

  assert.ok(truncated.endsWith("stop."));
  assert.ok(countWords(truncated) <= 70);
});

console.log("\nAll narration duration budget checks passed.");
