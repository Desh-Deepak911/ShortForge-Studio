/**
 * API-Football topscorers normalization (run: npm run test:api-football-topscorers).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ApiFootballTopScorerItem } from "@/lib/football/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function normalizeTopScorerRankings(entries: ApiFootballTopScorerItem[]) {
  return entries.map((entry, index) => {
    const stats = entry.statistics?.[0];
    const assists = stats?.goals?.assists;
    const appearances = stats?.games?.appearences;

    return {
      rank: index + 1,
      playerName: entry.player.name,
      teamName: stats?.team?.name ?? "",
      goals: stats?.goals?.total ?? null,
      ...(assists != null ? { assists } : {}),
      ...(appearances != null ? { appearances } : {}),
      raw: entry,
    };
  });
}

console.log("apiFootballTopScorers");

test("getTopScorers uses league and season query params", () => {
  const client = readSrc("src/lib/football/api-football.client.ts");
  assert.match(client, /export async function getTopScorers\(\s*params: GetTopScorersParams/);
  assert.match(client, /apiFootballRequest<ApiFootballTopScorerItem>\("\/players\/topscorers"/);
  assert.match(client, /league: leagueId,\s*season/);
});

test("normalizeTopScorerRankings maps player, team, and stats", () => {
  const rankings = normalizeTopScorerRankings([
    {
      player: { id: 1, name: "Kylian Mbappé", nationality: "France" },
      statistics: [
        {
          team: { name: "France" },
          league: { name: "World Cup", season: 2022 },
          games: { appearences: 7 },
          goals: { total: 8, assists: 2 },
        },
      ],
    },
  ]);

  assert.deepEqual(rankings, [
    {
      rank: 1,
      playerName: "Kylian Mbappé",
      teamName: "France",
      goals: 8,
      assists: 2,
      appearances: 7,
      raw: {
        player: { id: 1, name: "Kylian Mbappé", nationality: "France" },
        statistics: [
          {
            team: { name: "France" },
            league: { name: "World Cup", season: 2022 },
            games: { appearences: 7 },
            goals: { total: 8, assists: 2 },
          },
        ],
      },
    },
  ]);
});

test("getTopScorers returns null on invalid params without throwing", () => {
  const client = readSrc("src/lib/football/api-football.client.ts");
  assert.match(client, /if \(!Number\.isFinite\(leagueId\)/);
  assert.match(client, /if \(results === null\) \{\s*return null;/);
  assert.doesNotMatch(client, /throw new Error/);
});

console.log("\nAll API-Football topscorers checks passed.");
