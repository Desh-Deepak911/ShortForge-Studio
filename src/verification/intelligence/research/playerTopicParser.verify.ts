/**
 * Player topic parser verification (run: npm run test:player-topic-parser).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFootballResearchContextText } from "@/features/research/utils/football-context-builder";
import {
  buildPlayerAnalysisIntent,
  pickBestPlayerSearchMatch,
} from "@/features/research/utils/player-analysis.utils";
import {
  buildPlayerSearchQueries,
  parsePlayerAnalysisTopic,
} from "@/features/research/utils/player-topic-parser.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

console.log("playerTopicParser");

test("parsePlayerAnalysisTopic extracts Ronaldo and FIFA World Cup 2026", () => {
  const parsed = parsePlayerAnalysisTopic("Cristiano Ronaldo FIFA World Cup 2026");
  assert.equal(parsed.playerName, "Cristiano Ronaldo");
  assert.equal(parsed.competitionLabel, "FIFA World Cup 2026");
  assert.equal(parsed.competitionKey, "fifa_world_cup_2026");
  assert.equal(parsed.year, 2026);
});

test("parsePlayerAnalysisTopic extracts Haaland and Premier League year", () => {
  const parsed = parsePlayerAnalysisTopic("Erling Haaland Premier League 2024");
  assert.equal(parsed.playerName, "Erling Haaland");
  assert.equal(parsed.competitionLabel, "Premier League");
  assert.equal(parsed.competitionKey, "premier_league");
  assert.equal(parsed.year, 2024);
});

test("buildPlayerSearchQueries includes full name and surname fallback", () => {
  assert.deepEqual(buildPlayerSearchQueries("Cristiano Ronaldo"), [
    "Cristiano Ronaldo",
    "Ronaldo",
  ]);
});

test("pickBestPlayerSearchMatch prefers exact name match", () => {
  const match = pickBestPlayerSearchMatch("Cristiano Ronaldo", [
    {
      player: { id: 1, name: "C. Ronaldo", nationality: "Portugal" },
      statistics: [],
    },
    {
      player: { id: 2, name: "Cristiano Ronaldo", nationality: "Portugal" },
      statistics: [],
    },
  ]);

  assert.equal(match?.player.name, "Cristiano Ronaldo");
});

test("player analysis context text uses structured sections", () => {
  const intent = buildPlayerAnalysisIntent(
    parsePlayerAnalysisTopic("Cristiano Ronaldo FIFA World Cup 2026"),
  );

  const text = buildFootballResearchContextText({
    mode: "player_analysis",
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    summary: "Player focus: Cristiano Ronaldo",
    facts: [
      "Competition: FIFA World Cup 2026",
      "Host nations: USA, Canada, Mexico",
    ],
    warnings: ["2026 World Cup squad selection/participation: unknown — not confirmed by API."],
    source: "fallback",
    playerAnalysisIntent: intent,
    players: [
      {
        id: 874,
        name: "Cristiano Ronaldo",
        nationality: "Portugal",
        team: "Al Nassr",
        league: "Pro League",
        season: 2024,
        goals: 10,
        assists: 2,
        appearances: 15,
      },
    ],
  });

  assert.match(text, /^Player:/m);
  assert.match(text, /- Cristiano Ronaldo/);
  assert.match(text, /^Team\/Nation:/m);
  assert.match(text, /Club: Al Nassr/);
  assert.match(text, /^Competition:/m);
  assert.match(text, /FIFA World Cup 2026/);
  assert.match(text, /Host nations: USA, Canada, Mexico/);
  assert.match(text, /^Known facts:/m);
  assert.match(text, /Goals: 10/);
  assert.match(text, /^Unknowns:/m);
  assert.match(text, /if selected/);
});

test("player research engine parses player topic before API search", () => {
  const analysisUtils = readSrc("src/features/research/utils/intelligence-analysis-research.utils.ts");
  const engine = readSrc("src/features/intelligence/providers/api-football-research.engine.ts");
  assert.match(analysisUtils, /parsePlayerAnalysisTopic/);
  assert.match(engine, /buildPlayerSearchQueries/);
  assert.match(engine, /pickBestPlayerSearchMatch/);
  assert.match(engine, /appendFifaWorldCup2026TournamentFacts/);
  assert.match(engine, /buildVerifiedPlayerFactStrings/);
});

console.log("\nAll player topic parser checks passed.");
