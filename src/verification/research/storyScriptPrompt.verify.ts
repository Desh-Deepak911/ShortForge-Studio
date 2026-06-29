/**
 * Story script prompt verification (run: npm run test:story-script-prompt).
 */
import assert from "node:assert/strict";

import { buildStoryScriptPrompt } from "@/lib/ai/prompts";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("storyScriptPrompt");

const researchedContext = [
  "RESEARCHED FOOTBALL CONTEXT",
  "",
  "Mode: match recap",
  "Final score:",
  "- Final: Arsenal 2-1 Chelsea",
  "Warnings:",
  "- Exact xG unavailable from provider.",
].join("\n");

test("researched context uses factual grounding rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "tactical",
    30,
    "match_recap",
    researchedContext,
    getNarrationWordBudget(30),
  );

  assert.match(prompt, /Researched football context rules/);
  assert.match(prompt, /primary factual grounding/);
  assert.match(prompt, /Do NOT invent exact numbers/);
  assert.match(prompt, /Script length budget \(hard rules/);
  assert.match(prompt, /Target duration: 30s/);
  assert.match(prompt, /Ideal word count: 70–80/);
  assert.match(prompt, /Hard maximum word count: 105/);
  assert.match(prompt, /Do not exceed the hard maximum/);
  assert.match(prompt, /Shorter is better than complete/);
  assert.match(prompt, /Use research context selectively/);
  assert.match(prompt, /Prioritize the strongest 3–5 facts only/);
  assert.match(prompt, /30-second structure/);
  assert.match(prompt, /Short, punchy opening/);
  assert.match(prompt, /Tell the story of the game/);
});

test("ranked top_5 context disables selectivity and requires all players", () => {
  const rankedContext = [
    "RESEARCHED FOOTBALL CONTEXT",
    "",
    "RANKED PLAYER DATA:",
    "1. Miroslav Klose — Germany — 16",
    "2. Ronaldo Nazário — Brazil — 15",
  ].join("\n");

  const prompt = buildStoryScriptPrompt(
    "top 5 highest goal scorers fifa world cup",
    "news",
    45,
    "top_5",
    rankedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
  assert.match(prompt, /include every researched player name and goal total/);
  assert.doesNotMatch(prompt, /Prioritize the strongest 3–5 facts only/);
});

test("manual context keeps standard stats rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "dramatic",
    30,
    "story",
    "Manual note: high intensity derby.",
    getNarrationWordBudget(30),
  );

  assert.match(prompt, /Stats and context rules/);
  assert.doesNotMatch(prompt, /Researched football context rules/);
  assert.doesNotMatch(prompt, /Use research context selectively/);
  assert.match(prompt, /Manual note: high intensity derby/);
});

test("45s budget omits 30-second structure block", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "tactical",
    45,
    "match_preview",
    researchedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Target duration: 45s/);
  assert.match(prompt, /Hard maximum word count: 145/);
  assert.doesNotMatch(prompt, /30-second structure/);
});

test("dramatic tone includes length guard without expanding budget", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "dramatic",
    30,
    "match_recap",
    researchedContext,
    getNarrationWordBudget(30),
  );

  assert.match(prompt, /Dramatic tone must not increase length/);
});

test("mode voice is injected for tactical review", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea low block",
    "tactical",
    45,
    "tactical_review",
    researchedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Mode voice/);
  assert.match(prompt, /Analytical and pattern-led/);
  assert.match(prompt, /formations, pressing triggers/);
});

test("top_5 without ranked data uses missing-rankings rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Top 5 Premier League strikers",
    "news",
    60,
    "top_5",
    researchedContext,
    getNarrationWordBudget(60),
  );

  assert.match(prompt, /Top 5 mode without ranked data \(mandatory/);
  assert.match(prompt, /Do NOT pretend to deliver a ranked top-5 countdown/);
  assert.match(prompt, /Do NOT use a ranked countdown with invented players/);
  assert.match(prompt, /State clearly that verified ranking data is unavailable/);
  assert.doesNotMatch(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
});

test("top_5 missing rankings with research attempted adds cautious fallback", () => {
  const prompt = buildStoryScriptPrompt(
    "Top 5 Premier League strikers",
    "news",
    60,
    "top_5",
    undefined,
    getNarrationWordBudget(60),
    { researchAttemptedWithoutData: true, top5RankedDataAvailable: false },
  );

  assert.match(prompt, /Top 5 mode without ranked data \(mandatory/);
  assert.match(prompt, /Football research unavailable/);
});

test("top_5 mode voice still applies when ranked data present", () => {
  const rankedContext = [
    "RESEARCHED FOOTBALL CONTEXT",
    "",
    "RANKED PLAYER DATA:",
    "1. Miroslav Klose — Germany — 16",
  ].join("\n");

  const prompt = buildStoryScriptPrompt(
    "Top 5 World Cup scorers",
    "news",
    60,
    "top_5",
    rankedContext,
    getNarrationWordBudget(60),
    { top5RankedDataAvailable: true },
  );

  assert.match(prompt, /Ranked and punchy/);
  assert.match(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
  assert.match(prompt, /Mention EVERY ranked item/);
  assert.match(prompt, /Keep the EXACT order/);
});

test("research unavailable uses cautious fallback rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Cristiano Ronaldo FIFA World Cup 2026",
    "dramatic",
    30,
    "player_analysis",
    undefined,
    getNarrationWordBudget(30),
    true,
  );

  assert.match(prompt, /Football research unavailable/);
  assert.match(prompt, /Do NOT invent host nations, scores, teams, rankings, stats, or player availability/);
  assert.match(prompt, /USA, Canada, and Mexico/);
  assert.match(prompt, /never describe this as the Qatar World Cup/);
  assert.match(prompt, /stay qualitative and do not backfill facts from general knowledge/);
  assert.doesNotMatch(prompt, /Researched football context rules/);
});

console.log("\nAll story script prompt checks passed.");
