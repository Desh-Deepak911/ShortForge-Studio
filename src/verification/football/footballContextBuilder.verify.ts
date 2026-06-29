/**
 * Football context builder verification (run: npm run test:football-context-builder).
 */
import assert from "node:assert/strict";

import { buildFootballResearchContextText } from "@/features/research/legacy";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("footballContextBuilder");

const baseContext: FootballResearchContext = {
  mode: "match_recap",
  topic: "Arsenal vs Chelsea",
  summary: "North London derby recap with verified provider data.",
  facts: ["Arsenal scored first.", "Chelsea equalised late."],
  teams: [{ id: 1, name: "Arsenal", country: "England" }],
  fixture: {
    id: 99,
    date: "2025-05-01T00:00:00+00:00",
    status: "FT",
    league: "Premier League",
    season: 2024,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeGoals: 2,
    awayGoals: 1,
  },
  statistics: [
    { team: "Arsenal", type: "Ball Possession", value: "58%" },
    { team: "Chelsea", type: "Ball Possession", value: "42%" },
  ],
  events: [
    { minute: 12, team: "Arsenal", player: "Saka", type: "Goal", detail: "Normal Goal" },
  ],
  warnings: [],
  source: "api-football",
};

test("includes researched header and recap sections", () => {
  const text = buildFootballResearchContextText(baseContext);
  assert.match(text, /RESEARCHED FOOTBALL CONTEXT/);
  assert.match(text, /Final score:/);
  assert.match(text, /Arsenal 2-1 Chelsea/);
  assert.match(text, /Match statistics:/);
  assert.match(text, /Key events:/);
});

test("adds xG warning when expected goals are missing", () => {
  const text = buildFootballResearchContextText(baseContext);
  assert.match(text, /Exact xG unavailable from provider\./);
});

test("top_5 warns and falls back when ranking data is missing", () => {
  const text = buildFootballResearchContextText({
    ...baseContext,
    mode: "top_5",
    standings: undefined,
    players: undefined,
    statistics: undefined,
    facts: ["Five players to watch this month."],
  });

  assert.match(text, /No ranking data available from provider/);
  assert.match(text, /Available context \(fallback\):/);
  assert.match(text, /Five players to watch this month\./);
  assert.doesNotMatch(text, /RANKED PLAYER DATA:/);
});

test("top_5 includes prominent ranked player data with exact names and goals", () => {
  const text = buildFootballResearchContextText({
    mode: "top_5",
    topic: "top 5 highest goal scorers fifa world cup",
    summary: "Top 5 goal scorers — FIFA World Cup (all-time)",
    facts: ["#1 Miroslav Klose: 16 goals"],
    players: [
      { id: 1, name: "Miroslav Klose", nationality: "Germany", league: "FIFA World Cup", goals: 16, assists: null },
      { id: 2, name: "Ronaldo Nazário", nationality: "Brazil", league: "FIFA World Cup", goals: 15, assists: null },
      { id: 3, name: "Gerd Müller", nationality: "Germany", league: "FIFA World Cup", goals: 14, assists: null },
      { id: 4, name: "Just Fontaine", nationality: "France", league: "FIFA World Cup", goals: 13, assists: null },
      { id: 5, name: "Lionel Messi", nationality: "Argentina", league: "FIFA World Cup", goals: 13, assists: null },
    ],
    warnings: ["Using curated all-time World Cup record fallback."],
    source: "static-fallback",
  });

  assert.match(text, /RANKING SCRIPT RULES \(mandatory\):/);
  assert.match(text, /RANKED PLAYER DATA:/);
  assert.match(text, /1\. Miroslav Klose — Germany — 16/);
  assert.match(text, /2\. Ronaldo Nazário — Brazil — 15/);
  assert.match(text, /5\. Lionel Messi — Argentina — 13/);
  assert.match(text, /Do NOT introduce, mention, or invent any player beyond the ranked list below\./);
  assert.match(text, /Use only the ranked players and goal totals in RANKED PLAYER DATA/);
  assert.doesNotMatch(text, /Player stat rankings:/);
});

test("non-top_5 modes include ranked player data when available", () => {
  const text = buildFootballResearchContextText({
    ...baseContext,
    mode: "story",
    players: [
      { id: 1, name: "Erling Haaland", team: "Manchester City", goals: 27, assists: 5 },
    ],
  });

  assert.match(text, /RANKED PLAYER DATA:/);
  assert.match(text, /1\. Erling Haaland — Manchester City — 27/);
});

test("tactical_review includes lineups and substitutions sections", () => {
  const text = buildFootballResearchContextText({
    ...baseContext,
    mode: "tactical_review",
    lineups: [
      {
        team: "Arsenal",
        formation: "4-3-3",
        startingXi: ["Raya", "White", "Saliba"],
        substitutes: ["Nelson"],
      },
    ],
    events: [
      { minute: 70, team: "Arsenal", type: "subst", detail: "Nelson on, Jesus off" },
    ],
  });

  assert.match(text, /Formations & lineups:/);
  assert.match(text, /4-3-3/);
  assert.match(text, /Substitutions:/);
});

console.log("\nAll football context builder checks passed.");
