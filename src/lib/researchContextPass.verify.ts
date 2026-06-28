/**
 * Research context pass verification (run: npm run test:research-context-pass).
 */
import assert from "node:assert/strict";

import { buildFootballResearchContextText } from "@/features/research/legacy";
import {
  isResearchContextTextUseful,
  shouldPassResearchContextToScript,
} from "@/features/research/utils/research-context-pass.utils";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("researchContextPass");

const worldCupStaticContext: FootballResearchContext = {
  mode: "top_5",
  topic: "top 5 highest goal scorers fifa world cup",
  summary: "Top 5 goal scorers — FIFA World Cup (all-time)",
  facts: ["#1 Miroslav Klose: 16 goals"],
  players: [
    { id: 1, name: "Miroslav Klose", nationality: "Germany", goals: 16, assists: null },
    { id: 2, name: "Ronaldo Nazário", nationality: "Brazil", goals: 15, assists: null },
  ],
  warnings: ["Using curated all-time World Cup record fallback."],
  source: "static-fallback",
};

test("static-fallback ranked data should pass to script generation", () => {
  assert.equal(shouldPassResearchContextToScript(worldCupStaticContext), true);

  const text = buildFootballResearchContextText(worldCupStaticContext);
  assert.equal(isResearchContextTextUseful(text), true);
  assert.match(text, /RANKED PLAYER DATA:/);
  assert.match(text, /Miroslav Klose — Germany — 16/);
});

test("warnings-only fallback should not pass as factual context", () => {
  const emptyFallback: FootballResearchContext = {
    mode: "top_5",
    topic: "unknown topic",
    summary: "Research brief: unknown topic",
    facts: [],
    warnings: ["API_FOOTBALL_KEY is not configured."],
    source: "fallback",
  };

  assert.equal(shouldPassResearchContextToScript(emptyFallback), false);

  const text = buildFootballResearchContextText(emptyFallback);
  assert.equal(isResearchContextTextUseful(text), false);
});

test("manual source with user facts should pass", () => {
  const manualContext: FootballResearchContext = {
    mode: "story",
    topic: "Arsenal vs Chelsea",
    summary: "Research brief: Arsenal vs Chelsea",
    facts: ["Saka scored in the 12th minute."],
    warnings: ["API_FOOTBALL_KEY is not configured — using manual context only."],
    source: "manual",
  };

  assert.equal(shouldPassResearchContextToScript(manualContext), true);
  assert.equal(isResearchContextTextUseful(buildFootballResearchContextText(manualContext)), true);
});

console.log("\nAll research context pass checks passed.");
