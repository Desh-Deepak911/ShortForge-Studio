/**
 * Ranking intent parsing verification (run: npm run test:ranking-intent).
 */
import assert from "node:assert/strict";

import {
  isTopScorersRankingIntent,
  isTopScorersWorldCupIntent,
  parseRankingIntent,
} from "@/features/research/utils/ranking-intent.utils";
import { getAllTimeWorldCupTopScorers } from "@/features/research/utils/world-cup-all-time-scorers.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("rankingIntent");

test("parses top 5 highest goal scorers fifa world cup as all-time ranking", () => {
  const intent = parseRankingIntent("top 5 highest goal scorers fifa world cup");

  assert.deepEqual(intent, {
    kind: "ranking",
    rankingType: "top_scorers",
    competition: "fifa_world_cup",
    timeScope: "all_time",
    seasonStatus: "not_applicable",
    limit: 5,
  });
  assert.equal(isTopScorersWorldCupIntent(intent), true);
});

test("detects top_scorers synonyms", () => {
  const phrases = [
    "top scorers premier league",
    "highest goal scorers in europe",
    "best goal scorers this season",
    "golden boot race",
    "most goals in la liga",
  ];

  for (const phrase of phrases) {
    assert.equal(parseRankingIntent(phrase).rankingType, "top_scorers", phrase);
  }
});

test("detects league competitions for ranking research", () => {
  assert.equal(parseRankingIntent("top scorers premier league").competition, "premier_league");
  assert.equal(parseRankingIntent("most goals la liga").competition, "la_liga");
  assert.equal(parseRankingIntent("golden boot serie a").competition, "serie_a");
});

test("detects fifa world cup competition scope", () => {
  assert.equal(parseRankingIntent("world cup winners").competition, "fifa_world_cup");
  assert.equal(parseRankingIntent("fifa world cup 2022").competition, "fifa_world_cup");
});

test("detects season year and all-time markers", () => {
  assert.deepEqual(parseRankingIntent("top 10 goal scorers world cup 2022"), {
    kind: "ranking",
    rankingType: "top_scorers",
    competition: "fifa_world_cup",
    timeScope: "season",
    season: 2022,
    seasonStatus: "explicit",
    limit: 10,
  });

  assert.equal(parseRankingIntent("all time world cup goal scorers").timeScope, "all_time");
  assert.equal(parseRankingIntent("greatest scorers ever in world cup history").timeScope, "all_time");
});

test("all-time world cup fallback returns curated ranked players with goals", () => {
  const players = getAllTimeWorldCupTopScorers(5);

  assert.equal(players.length, 5);
  assert.deepEqual(
    players.map((player) => ({
      name: player.name,
      nationality: player.nationality,
      goals: player.goals,
    })),
    [
      { name: "Miroslav Klose", nationality: "Germany", goals: 16 },
      { name: "Ronaldo Nazário", nationality: "Brazil", goals: 15 },
      { name: "Gerd Müller", nationality: "Germany", goals: 14 },
      { name: "Just Fontaine", nationality: "France", goals: 13 },
      { name: "Lionel Messi", nationality: "Argentina", goals: 13 },
    ],
  );
});

test("top_5 mode defaults to top scorers for known competition", () => {
  const intent = parseRankingIntent("top 5 premier league", 5, "top_5");
  assert.equal(intent.rankingType, "top_scorers");
  assert.equal(isTopScorersRankingIntent(intent, "top_5"), true);
});

console.log("\nAll ranking intent checks passed.");
