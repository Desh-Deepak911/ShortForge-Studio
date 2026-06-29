/**
 * Top scorers research verification (run: npm run test:top-scorers-research).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFootballResearchContextText } from "@/features/research/legacy";
import {
  isTopScorersRankingIntent,
  parseRankingIntent,
} from "@/features/research/utils/ranking-intent.utils";
import {
  buildTopScorersUnavailableWarning,
  FIFA_WORLD_CUP_2026_NO_SCORERS_WARNING,
  isAllTimeWorldCupTopScorersIntent,
  isFifaWorldCup2026SeasonIntent,
  normalizeTop5ScorersIntent,
  resolveTopScorersLeagueId,
} from "@/features/research/utils/top-scorers-research.utils";
import { getAllTimeWorldCupTopScorers } from "@/features/research/utils/world-cup-all-time-scorers.utils";
import { buildStoryScriptPrompt } from "@/lib/ai/prompts";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

console.log("topScorersResearch");

test("all-time world cup top scorers intent without year", () => {
  const intent = parseRankingIntent("top 5 highest goal scorers fifa world cup", 5, "top_5");
  assert.equal(isAllTimeWorldCupTopScorersIntent(intent), true);
  assert.equal(isFifaWorldCup2026SeasonIntent(intent), false);
});

test("fifa world cup 2026 uses league 1 and season 2026", () => {
  const intent = parseRankingIntent("top 5 goal scorers fifa world cup 2026", 5, "top_5");
  assert.equal(intent.competition, "fifa_world_cup");
  assert.equal(intent.season, 2026);
  assert.equal(intent.timeScope, "season");
  assert.equal(isAllTimeWorldCupTopScorersIntent(intent), false);
  assert.equal(isFifaWorldCup2026SeasonIntent(intent), true);
  assert.equal(resolveTopScorersLeagueId(intent), 1);
});

test("top_5 mode defaults unknown ranking type to top scorers when competition known", () => {
  const intent = parseRankingIntent("top 5 premier league", 5, "top_5");
  assert.equal(intent.rankingType, "top_scorers");
  assert.equal(intent.competition, "premier_league");
  assert.equal(isTopScorersRankingIntent(intent, "top_5"), true);
});

test("world cup 2026 empty API uses specific warning", () => {
  const intent = parseRankingIntent("top scorers fifa world cup 2026", 5, "top_5");
  assert.equal(
    buildTopScorersUnavailableWarning(intent),
    FIFA_WORLD_CUP_2026_NO_SCORERS_WARNING,
  );
});

test("static all-time fallback returns five curated scorers", () => {
  const players = getAllTimeWorldCupTopScorers(5);
  assert.deepEqual(
    players.map((player) => [player.name, player.nationality, player.goals]),
    [
      ["Miroslav Klose", "Germany", 16],
      ["Ronaldo Nazário", "Brazil", 15],
      ["Gerd Müller", "Germany", 14],
      ["Just Fontaine", "France", 13],
      ["Lionel Messi", "Argentina", 13],
    ],
  );
});

test("context builder surfaces ranked players for preview and script", () => {
  const players = getAllTimeWorldCupTopScorers(5);
  const text = buildFootballResearchContextText({
    mode: "top_5",
    topic: "top 5 highest goal scorers fifa world cup",
    summary: "Top 5 goal scorers — FIFA World Cup (all-time)",
    facts: players.map((player, index) => `#${index + 1} ${player.name}: ${player.goals} goals`),
    players,
    warnings: ["Using curated all-time World Cup record fallback."],
    source: "static-fallback",
    rankingIntent: parseRankingIntent("top 5 highest goal scorers fifa world cup", 5, "top_5"),
  });

  assert.match(text, /RANKED PLAYER DATA:/);
  assert.match(text, /1\. Miroslav Klose — Germany — 16/);
  assert.match(text, /5\. Lionel Messi — Argentina — 13/);
});

test("script prompt mandates ranked player names when RANKED PLAYER DATA present", () => {
  const rankedContext = buildFootballResearchContextText({
    mode: "top_5",
    topic: "top 5 highest goal scorers fifa world cup",
    summary: "Top 5 goal scorers — FIFA World Cup (all-time)",
    facts: [],
    players: getAllTimeWorldCupTopScorers(5),
    warnings: [],
    source: "static-fallback",
  });

  const prompt = buildStoryScriptPrompt(
    "top 5 highest goal scorers fifa world cup",
    "news",
    45,
    "top_5",
    rankedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
  assert.match(prompt, /Mention EVERY ranked item/);
  assert.match(prompt, /include every researched player name and goal total/);
  assert.doesNotMatch(prompt, /Prioritize the strongest 3–5 facts only/);
});

test("research service routes topscorers API with league and season", () => {
  const executor = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");
  const engine = readSrc("src/features/intelligence/providers/api-football-research.engine.ts");
  assert.match(engine, /getTopScorers\(\{ leagueId, season \}\)/);
  assert.match(executor, /executeIntelligenceQuery/);
  assert.match(executor, /buildExecutionEnrichmentFromQuery/);
  assert.doesNotMatch(executor, /apiFootballProvider/);
  assert.doesNotMatch(executor, /staticKnowledgeProvider/);
});

test("normalizeTop5ScorersIntent leaves non-top_5 modes unchanged", () => {
  const intent = parseRankingIntent("top 5 premier league", 5);
  assert.equal(normalizeTop5ScorersIntent(intent).rankingType, "unknown");
});

console.log("\nAll top scorers research checks passed.");
