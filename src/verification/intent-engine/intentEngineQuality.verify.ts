/**
 * Intent Engine v2 quality verification (run: npm run test:intent-engine-quality).
 */
import assert from "node:assert/strict";

import { analyzeIntent, INTENT_QUALITY_CONFIDENCE_THRESHOLD } from "@/features/intent-engine";
import { resolveIntentScriptMode } from "@/features/intelligence/intent/intent-display.utils";
import type { ScriptMode } from "@/types/footiebitz";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function expectScriptMode(
  prompt: string,
  expectedModes: ScriptMode | ScriptMode[],
  label?: string,
) {
  const analysis = analyzeIntent(prompt);
  const scriptMode = resolveIntentScriptMode(analysis.intent);
  const allowed = Array.isArray(expectedModes) ? expectedModes : [expectedModes];

  assert.ok(
    allowed.includes(scriptMode),
    `${label ?? prompt}: expected ${allowed.join(" or ")}, got ${scriptMode} (intent=${analysis.intent})`,
  );
  assert.ok(
    analysis.confidenceScore >= INTENT_QUALITY_CONFIDENCE_THRESHOLD,
    `${label ?? prompt}: confidence ${analysis.confidenceScore.toFixed(2)} below ${INTENT_QUALITY_CONFIDENCE_THRESHOLD}`,
  );
  assert.ok(analysis.matchedPatterns.length > 0, `${label ?? prompt}: expected matchedPatterns`);
  assert.ok(analysis.reasoning.length > 0, `${label ?? prompt}: expected reasoning`);
}

console.log("intentEngineQuality");

test("Messi vs Ronaldo → opinion_debate", () => {
  expectScriptMode("Messi vs Ronaldo", "opinion_debate");
});

test("Top 5 World Cup moments → top_5", () => {
  expectScriptMode("Top 5 World Cup moments", "top_5");
});

test("Why Barcelona collapsed after Messi left → historical_explainer", () => {
  expectScriptMode("Why Barcelona collapsed after Messi left", "historical_explainer", "Barcelona collapse");
});

test("India vs Pakistan match preview → match_preview", () => {
  expectScriptMode("India vs Pakistan match preview", "match_preview");
});

test("How Guardiola changed football tactics → tactical_review", () => {
  expectScriptMode("How Guardiola changed football tactics", "tactical_review", "Guardiola tactics");
});

test("Ronaldo's greatest Champions League nights → top_5 or player_analysis", () => {
  expectScriptMode("Ronaldo's greatest Champions League nights", ["top_5", "player_analysis"]);
});

test("Is Neymar underrated? → opinion_debate", () => {
  expectScriptMode("Is Neymar underrated?", "opinion_debate");
});

test("The rise of Lamine Yamal → player_analysis", () => {
  expectScriptMode("The rise of Lamine Yamal", "player_analysis");
});

console.log("\nAll intent engine quality checks passed.");
