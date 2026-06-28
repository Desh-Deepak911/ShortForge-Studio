/**
 * Competition resolver verification (run: npm run test:competition-resolver).
 */
import assert from "node:assert/strict";

import {
  resolveCompetitionFromTopic as resolveCanonicalCompetition,
} from "@/features/intelligence/competitions";
import {
  detectRankingSeasonFromTopic,
  getCompetitionLeagueId,
  resolveCompetitionFromTopic,
  resolveRankingSeason,
} from "@/features/research/utils/competition-resolver.utils";
import { parseRankingIntent } from "@/features/research/utils/ranking-intent.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("competitionResolver");

test("maps common competitions to API-Football league ids", () => {
  assert.equal(resolveCompetitionFromTopic("top scorers premier league").leagueId, 39);
  assert.equal(resolveCompetitionFromTopic("la liga golden boot").leagueId, 140);
  assert.equal(resolveCompetitionFromTopic("serie a top scorers").leagueId, 135);
  assert.equal(resolveCompetitionFromTopic("bundesliga most goals").leagueId, 78);
  assert.equal(resolveCompetitionFromTopic("ligue 1 goal scorers").leagueId, 61);
  assert.equal(resolveCompetitionFromTopic("champions league top scorers").leagueId, 2);
  assert.equal(resolveCompetitionFromTopic("europa league top scorers").leagueId, 3);
  assert.equal(resolveCompetitionFromTopic("fifa world cup 2022 scorers").leagueId, 1);
});

test("canonical resolver returns structured competition resolution", () => {
  const resolved = resolveCanonicalCompetition("top scorers premier league 2023");

  assert.equal(resolved.scope, "premier_league");
  assert.equal(resolved.canonicalName, "Premier League");
  assert.deepEqual(resolved.aliases, ["Premier League", "EPL", "English Premier League"]);
  assert.equal(resolved.providerIds.apiFootballLeagueId, 39);
  assert.equal(resolved.season, 2023);
  assert.equal(resolved.timeScope, "season");
  assert.equal(resolved.confidence.tier, "high");
  assert.equal(resolved.warnings.length, 0);
});

test("premier league without year requires season but does not infer configured season", () => {
  const intent = parseRankingIntent("top 5 scorers premier league");
  assert.equal(intent.competition, "premier_league");
  assert.equal(intent.timeScope, "season");
  assert.equal(intent.season, undefined);
  assert.equal(intent.seasonStatus, "missing_required");
  assert.equal(resolveRankingSeason(intent), undefined);

  const canonical = resolveCanonicalCompetition("top 5 scorers premier league");
  assert.equal(canonical.warnings[0], "Choose a season to fetch ranking data.");
});

test("topic year overrides configured season", () => {
  const intent = parseRankingIntent("top scorers premier league 2023");
  assert.equal(intent.season, 2023);
  assert.equal(intent.timeScope, "season");
  assert.equal(intent.seasonStatus, "explicit");
  assert.equal(resolveRankingSeason(intent), 2023);
  assert.equal(detectRankingSeasonFromTopic("premier league 2023"), 2023);
});

test("all-time world cup stays on static fallback path", () => {
  const intent = parseRankingIntent("top 5 highest goal scorers fifa world cup");
  assert.equal(intent.competition, "fifa_world_cup");
  assert.equal(intent.timeScope, "all_time");
  assert.equal(intent.seasonStatus, "not_applicable");
  assert.equal(resolveRankingSeason(intent), undefined);
  assert.equal(getCompetitionLeagueId("fifa_world_cup"), 1);
});

test("world cup with year uses season-specific API data", () => {
  const intent = parseRankingIntent("top 10 goal scorers world cup 2022");
  assert.equal(intent.competition, "fifa_world_cup");
  assert.equal(intent.timeScope, "season");
  assert.equal(intent.season, 2022);
  assert.equal(intent.seasonStatus, "explicit");
  assert.equal(resolveRankingSeason(intent), 2022);
});

test("world cup 2026 uses explicit 2026 season only when topic says 2026", () => {
  const intent = parseRankingIntent("top 5 goal scorers world cup 2026");
  assert.equal(intent.competition, "fifa_world_cup");
  assert.equal(intent.timeScope, "season");
  assert.equal(intent.season, 2026);
  assert.equal(intent.seasonStatus, "explicit");
  assert.equal(resolveRankingSeason(intent), 2026);

  const allTime = parseRankingIntent("top 5 goal scorers world cup");
  assert.equal(allTime.timeScope, "all_time");
  assert.equal(allTime.season, undefined);
  assert.equal(allTime.seasonStatus, "not_applicable");
});

console.log("\nAll competition resolver checks passed.");
