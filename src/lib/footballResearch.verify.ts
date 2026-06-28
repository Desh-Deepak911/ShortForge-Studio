/**
 * Football research layer verification (run: npm run test:football-research).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  extractFootballSearchQueries,
  mergeFootballContext,
} from "@/features/football/utils/football-research.utils";
import { formatFixtureResearchContext } from "@/features/football/utils/format-research-context.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

console.log("footballResearch");

test("extractFootballSearchQueries splits match briefs", () => {
  assert.deepEqual(extractFootballSearchQueries("Arsenal vs Chelsea", "match_recap"), [
    "Arsenal",
    "Chelsea",
  ]);
  assert.deepEqual(extractFootballSearchQueries("Haaland form", "player_analysis"), [
    "Haaland form",
  ]);
});

test("mergeFootballContext preserves manual notes and appends research", () => {
  const merged = mergeFootballContext("Manual xG note", "Team form from API");
  assert.match(merged ?? "", /Manual xG note/);
  assert.match(merged ?? "", /API-Football research|Football research/);
  assert.match(merged ?? "", /Team form from API/);
  assert.equal(mergeFootballContext(undefined, "Research only"), "Research only");
  assert.equal(mergeFootballContext("Manual only", undefined), "Manual only");
});

test("formatFixtureResearchContext includes fixture facts", () => {
  const formatted = formatFixtureResearchContext({
    topic: "Arsenal vs Chelsea",
    teams: [{ id: 1, name: "Arsenal", country: "England" }],
    recentFixtures: [
      {
        fixture: { id: 99, date: "2025-05-01T00:00:00+00:00", status: { short: "FT" } },
        league: { name: "Premier League", season: 2024, round: "Regular Season - 34" },
        goals: { home: 2, away: 1 },
        teams: {
          home: { id: 1, name: "Arsenal", winner: true },
          away: { id: 2, name: "Chelsea", winner: false },
        },
      },
    ],
    fixtureStatistics: [
      {
        team: { id: 1, name: "Arsenal" },
        statistics: [{ type: "Ball Possession", value: "58%" }],
      },
      {
        team: { id: 2, name: "Chelsea" },
        statistics: [{ type: "Ball Possession", value: "42%" }],
      },
    ],
  });

  assert.match(formatted, /Arsenal 2-1 Chelsea/);
  assert.match(formatted, /Ball Possession/);
});

test("generate-script resolves research before script-only generation", () => {
  const route = readSrc("src/app/api/generate-script/route.ts");
  assert.match(route, /resolveScriptOnlyGenerationContext/);
  assert.match(route, /enableResearch/);
  assert.match(route, /generationContext/);
  assert.match(route, /researchWarning/);
});

test("create flow exposes Football Research Mode", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  const composer = readSrc("src/components/StoryComposer.tsx");
  assert.match(createFlow, /enableResearch/);
  assert.match(createFlow, /generationContext/);
  assert.match(createFlow, /isResearchDefaultEnabledForScriptMode/);
  assert.match(composer, /Smart Research/);
  assert.match(composer, /Use trusted sources when available\./);
});

test("research-football route is wired", () => {
  const route = readSrc("src/app/api/research-football/route.ts");
  assert.match(route, /import "server-only"/);
  assert.match(route, /executeIntelligenceQuery/);
  assert.match(route, /assembledContext/);
  assert.doesNotMatch(route, /contextText/);
  assert.doesNotMatch(route, /buildFootballResearchContextText/);
  assert.match(route, /mode\?:/);
  assert.doesNotMatch(route, /openai/i);
  assert.doesNotMatch(route, /API_FOOTBALL_KEY/);
});

test("api-football client is server-only with safe methods", () => {
  const client = readSrc("src/lib/football/api-football.client.ts");
  assert.match(client, /import "server-only"/);
  assert.match(client, /API_FOOTBALL_BASE_URL/);
  assert.match(client, /AbortSignal\.timeout/);
  assert.match(client, /export async function searchTeams/);
  assert.match(client, /export async function searchFixturesByTeam/);
  assert.match(client, /export async function getFixture/);
  assert.match(client, /export async function getFixtureStatistics/);
  assert.match(client, /export async function getFixtureEvents/);
  assert.match(client, /export async function getFixtureLineups/);
  assert.match(client, /export async function getFixturePlayers/);
  assert.match(client, /export async function getStandings/);
  assert.match(client, /export async function getTopScorers/);
  assert.match(client, /\/players\/topscorers/);
  assert.match(client, /normalizeTopScorerRankings/);
  assert.match(client, /playerName/);
  assert.match(client, /teamName/);
  assert.match(client, /raw: entry/);
  assert.match(client, /export async function getPlayerSearch/);
  assert.match(client, /export async function getPlayerStatistics/);
  assert.doesNotMatch(client, /throw new Error/);
  assert.doesNotMatch(client, /API_FOOTBALL_KEY.*return/);
});

console.log("\nAll football research checks passed.");
