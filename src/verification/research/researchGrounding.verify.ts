/**
 * Research grounding verification (run: npm run test:research-grounding).
 */
import assert from "node:assert/strict";

import { buildFootballResearchContextText } from "@/features/research/legacy";
import {
  applyFifaWorldCup2026Grounding,
  hasNoUsefulResearchForGrounding,
} from "@/features/research/legacy/research-grounding.legacy.utils";
import {
  buildResearchUnavailablePromptRules,
  mentionsFifaWorldCup2026,
  NO_RELIABLE_FOOTBALL_DATA_WARNING,
} from "@/features/research/utils/research-grounding.utils";
import { buildStoryScriptPrompt } from "@/lib/ai/prompts";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("researchGrounding");

test("mentionsFifaWorldCup2026 detects 2026 tournament briefs", () => {
  assert.equal(mentionsFifaWorldCup2026("Cristiano Ronaldo FIFA World Cup 2026"), true);
  assert.equal(mentionsFifaWorldCup2026("World Cup 2026 hosts"), true);
  assert.equal(mentionsFifaWorldCup2026("Arsenal vs Chelsea"), false);
});

test("applyFifaWorldCup2026Grounding adds host nations for empty player research", () => {
  const enriched = applyFifaWorldCup2026Grounding({
    mode: "story",
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    summary: "Research brief",
    facts: [],
    warnings: ["No matching players found in API-Football."],
    source: "fallback",
  });

  assert.equal(enriched.source, "static-fallback");
  assert.equal(hasNoUsefulResearchForGrounding(enriched), false);
  assert.match(enriched.facts.join(" "), /USA, Canada, and Mexico/);
  assert.match(enriched.facts.join(" "), /not the Qatar World Cup/);
});

test("applyFifaWorldCup2026Grounding skips player_analysis already enriched", () => {
  const context = {
    mode: "player_analysis" as const,
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    summary: "Player focus: Cristiano Ronaldo",
    facts: ["Host nations: USA, Canada, Mexico"],
    warnings: ["2026 World Cup squad selection/participation: unknown — not confirmed by API."],
    source: "api-football" as const,
    playerAnalysisIntent: {
      playerName: "Cristiano Ronaldo",
      competitionLabel: "FIFA World Cup 2026",
      competitionKey: "fifa_world_cup_2026" as const,
      year: 2026,
      squadStatus: "unknown" as const,
    },
  };

  const enriched = applyFifaWorldCup2026Grounding(context);
  assert.equal(enriched, context);
});

test("buildFootballResearchContextText includes mandatory 2026 grounding section", () => {
  const enriched = applyFifaWorldCup2026Grounding({
    mode: "player_analysis",
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    summary: "FIFA World Cup 2026",
    facts: ["FIFA World Cup 2026 host nations: USA, Canada, and Mexico."],
    warnings: ["No verified player data for this brief — use conditional language for 2026 participation."],
    source: "static-fallback",
  });

  const text = buildFootballResearchContextText(enriched);
  assert.match(text, /FIFA WORLD CUP 2026 GROUNDING \(mandatory\)/);
  assert.match(text, /Never call this tournament the Qatar World Cup/);
  assert.match(text, /if selected/);
});

test("buildResearchUnavailablePromptRules includes strict and 2026-specific rules", () => {
  const rules = buildResearchUnavailablePromptRules("Cristiano Ronaldo FIFA World Cup 2026");
  assert.match(rules, /Do NOT invent host nations, scores, teams, rankings, stats, or player availability/);
  assert.match(rules, /Do NOT mention past tournaments unless/);
  assert.match(rules, /USA, Canada, and Mexico/);
  assert.match(rules, /never describe this as the Qatar World Cup/);
  assert.match(rules, /if selected/);
});

test("research unavailable prompt for generic topic avoids 2026 block", () => {
  const rules = buildResearchUnavailablePromptRules("Arsenal title race");
  assert.doesNotMatch(rules, /FIFA World Cup 2026/);
});

test("NO_RELIABLE_FOOTBALL_DATA_WARNING matches product copy", () => {
  assert.equal(
    NO_RELIABLE_FOOTBALL_DATA_WARNING,
    "Research is limited for this topic, so the story will avoid exact claims.",
  );
});

test("buildStoryScriptPrompt applies WC 2026 cautious rules when research unavailable", () => {
  const prompt = buildStoryScriptPrompt(
    "Cristiano Ronaldo FIFA World Cup 2026",
    "dramatic",
    30,
    "player_analysis",
    undefined,
    getNarrationWordBudget(30),
    true,
  );

  assert.match(prompt, /Do NOT invent host nations, scores, teams, rankings, stats, or player availability/);
  assert.match(prompt, /USA, Canada, and Mexico/);
  assert.match(prompt, /never describe this as the Qatar World Cup/);
  assert.match(prompt, /if selected/);
});

console.log("\nAll research grounding checks passed.");
