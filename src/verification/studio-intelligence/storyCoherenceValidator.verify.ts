/**
 * Story coherence validator integration verification
 * (run: npm run test:studio-intelligence-story-validator).
 */
import assert from "node:assert/strict";

import type { StudioIntelligenceInput } from "@/features/studio-intelligence";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function runMode(narration: string, mode: StudioIntelligenceInput["mode"]) {
  return runStudioIntelligence({
    topic: "Story coherence audit",
    narration,
    targetDurationSec: 45,
    mode,
  });
}

const COUNTDOWN_NARRATION =
  "These are the top 5 World Cup moments. At number 5, Maradona shocked the world. At number 4, Zidane changed the final. At number 3, Iniesta scored in 2010. At number 2, Germany stunned Brazil. And at number 1, Pelé lifted the trophy.";

const DEBATE_NARRATION =
  "Who is the greatest of all time? Some say Messi changed the game with vision. However, Ronaldo's Champions League numbers are impossible to ignore. Critics argue the debate depends on era. Ultimately, both defined a generation.";

const BIOGRAPHY_NARRATION =
  "Lamine Yamal was barely known two years ago. He broke through at Barcelona with elite numbers this season. The stats prove he is already world class at 17. His legacy is only beginning.";

const HISTORY_NARRATION =
  "Why did Barcelona collapse after Messi left? The club lost its identity overnight. Then the finances spiraled. Ultimately, the era ended with a rebuild.";

const TACTICAL_NARRATION =
  "How did Guardiola change football tactics? Arsenal sat in a compact low block. The stats show they allowed just 0.8 xG. However, City's width broke the press. Ultimately, the tactical shift decided the match.";

const NEWS_NARRATION =
  "Breaking: Manchester City sign a record-breaking midfielder. The deal reshapes the Premier League title race. City now boast the deepest squad in Europe. What happens next could define the season.";

const DEFAULT_NARRATION =
  "This is insane. Haaland scored again. The league noticed. Ultimately he changed the race.";

function assertValidationAttached(result: ReturnType<typeof runStudioIntelligence>, label: string) {
  assert.ok(result.storyValidation, `${label}: storyValidation missing`);
  assert.ok(Number.isFinite(result.storyValidation.coherenceScore), `${label}: coherenceScore missing`);
  assert.equal(result.storyValidation.ruleResults.length, 15, `${label}: expected 15 rules`);
  assert.ok(
    result.diagnostics.plannerStepsExecuted.includes("story_coherence_validation"),
    `${label}: validator step missing from diagnostics`,
  );
}

console.log("storyCoherenceValidator");

test("countdown planning includes story validation", () => {
  const result = runMode(COUNTDOWN_NARRATION, "top_5");
  assertValidationAttached(result, "countdown");
  assert.ok(result.storyValidation.coherenceScore >= 0.8);
});

test("debate planning includes story validation", () => {
  const result = runMode(DEBATE_NARRATION, "opinion_debate");
  assertValidationAttached(result, "debate");
  assert.ok(result.storyValidation.coherenceScore >= 0.8);
});

test("biography planning includes story validation", () => {
  const result = runMode(BIOGRAPHY_NARRATION, "player_analysis");
  assertValidationAttached(result, "biography");
  assert.ok(result.storyValidation.coherenceScore >= 0.8);
});

test("history planning includes story validation", () => {
  const result = runMode(HISTORY_NARRATION, "historical_explainer");
  assertValidationAttached(result, "history");
  assert.ok(result.storyValidation.coherenceScore >= 0.8);
});

test("tactical planning includes story validation", () => {
  const result = runMode(TACTICAL_NARRATION, "tactical_review");
  assertValidationAttached(result, "tactical");
  assert.ok(result.storyValidation.coherenceScore >= 0.8);
});

test("news planning includes story validation", () => {
  const result = runMode(NEWS_NARRATION, "match_recap");
  assertValidationAttached(result, "news");
  assert.ok(result.storyValidation.coherenceScore >= 0.8);
});

test("default story planning includes story validation", () => {
  const result = runMode(DEFAULT_NARRATION, "story");
  assertValidationAttached(result, "default");
  assert.ok(result.storyValidation.coherenceScore >= 0.75);
});

test("golden fixtures produce coherence scores above 0.8", () => {
  for (const fixture of STUDIO_INTELLIGENCE_GOLDEN_FIXTURES) {
    const result = runStudioIntelligence(fixture.input);
    assertValidationAttached(result, fixture.name);
    assert.ok(
      result.storyValidation.coherenceScore >= 0.8,
      `golden fixture "${fixture.name}" coherence ${result.storyValidation.coherenceScore.toFixed(2)} below 0.8`,
    );
  }
});

console.log("All story coherence validator checks passed.");
