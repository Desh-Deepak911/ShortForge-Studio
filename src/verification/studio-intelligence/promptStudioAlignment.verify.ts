/**
 * Prompt ↔ Studio Intelligence alignment verification
 * (run: npm run test:studio-intelligence-prompt-alignment).
 */
import assert from "node:assert/strict";

import { analyzeIntent } from "@/features/intent-engine";
import { resolveIntentScriptMode } from "@/features/intelligence/intent/intent-display.utils";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import {
  resolvePromptStudioAlignment,
  resolveStudioStrategyForScriptMode,
} from "@/features/studio-intelligence/prompt-studio-alignment";
import type { ScriptMode } from "@/types/footiebitz";

import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function expectAlignment(
  topic: string,
  mode: ScriptMode,
  allowedStudioStrategies: string[],
  forbiddenStudioStrategies: string[] = [],
) {
  const alignment = resolvePromptStudioAlignment({ mode, topic });

  assert.ok(
    allowedStudioStrategies.includes(alignment.studioStrategyId),
    `${topic}: expected studio strategy in [${allowedStudioStrategies.join(", ")}], got ${alignment.studioStrategyId}`,
  );

  for (const forbidden of forbiddenStudioStrategies) {
    assert.notEqual(
      alignment.studioStrategyId,
      forbidden,
      `${topic}: must not resolve to ${forbidden}`,
    );
  }

  assert.notEqual(alignment.alignmentStatus, "mismatch", `${topic}: alignment mismatch`);
  assert.equal(alignment.modeTemplateId, alignment.studioStrategyId);
}

console.log("promptStudioAlignment");

test("Top 5 aligns with countdown", () => {
  expectAlignment("Top 5 World Cup moments", "top_5", ["countdown"]);

  const alignment = resolvePromptStudioAlignment({ mode: "top_5", topic: "Top 5 World Cup moments" });
  assert.equal(alignment.promptStructureId, "countdown_ranked_reveal");
  assert.equal(alignment.alignmentStatus, "aligned");
});

test("Messi vs Ronaldo aligns with debate/comparison, not match_preview", () => {
  const analysis = analyzeIntent("Messi vs Ronaldo");
  const mode = resolveIntentScriptMode(analysis.intent);
  assert.equal(mode, "opinion_debate");

  expectAlignment("Messi vs Ronaldo", mode, ["debate", "comparison"], ["match_preview"]);

  const alignment = resolvePromptStudioAlignment({ mode, topic: "Messi vs Ronaldo" });
  assert.equal(alignment.promptStructureId, "debate_argument_counterpoint_takeaway");
  assert.ok(["aligned", "partial"].includes(alignment.alignmentStatus));
});

test("Barcelona collapse aligns with history", () => {
  const analysis = analyzeIntent("Why Barcelona collapsed after Messi left");
  const mode = resolveIntentScriptMode(analysis.intent);
  assert.equal(mode, "historical_explainer");

  expectAlignment("Why Barcelona collapsed after Messi left", mode, ["history"]);

  const alignment = resolvePromptStudioAlignment({
    mode,
    topic: "Why Barcelona collapsed after Messi left",
  });
  assert.equal(alignment.promptStructureId, "curiosity_explanation_example_payoff");
  assert.equal(alignment.alignmentStatus, "aligned");
});

test("Lamine Yamal rise aligns with biography/player analysis", () => {
  const analysis = analyzeIntent("The rise of Lamine Yamal");
  const mode = resolveIntentScriptMode(analysis.intent);
  assert.equal(mode, "player_analysis");

  expectAlignment("The rise of Lamine Yamal", mode, ["biography"]);

  const alignment = resolvePromptStudioAlignment({ mode, topic: "The rise of Lamine Yamal" });
  assert.equal(alignment.promptStructureId, "hook_story_payoff");
  assert.equal(alignment.studioStrategyId, "biography");
});

test("Tactical prompt aligns with tactical_analysis", () => {
  const analysis = analyzeIntent("How Guardiola changed football tactics");
  const mode = resolveIntentScriptMode(analysis.intent);
  assert.equal(mode, "tactical_review");

  expectAlignment("How Guardiola changed football tactics", mode, ["tactical_analysis"]);

  const alignment = resolvePromptStudioAlignment({
    mode,
    topic: "How Guardiola changed football tactics",
  });
  assert.equal(alignment.promptStructureId, "bold_claim_explanation_evidence_takeaway");
  assert.equal(alignment.alignmentStatus, "aligned");
});

test("Match preview aligns with match_preview", () => {
  const analysis = analyzeIntent("India vs Pakistan match preview");
  const mode = resolveIntentScriptMode(analysis.intent);
  assert.equal(mode, "match_preview");

  expectAlignment("India vs Pakistan match preview", mode, ["match_preview"], ["debate", "comparison"]);

  const alignment = resolvePromptStudioAlignment({
    mode,
    topic: "India vs Pakistan match preview",
  });
  assert.equal(alignment.promptStructureId, "question_stakes_battle_cta");
  assert.equal(alignment.studioStrategyId, "match_preview");
});

test("Prompt structure and Studio template do not conflict for golden fixtures", () => {
  for (const fixture of STUDIO_INTELLIGENCE_GOLDEN_FIXTURES) {
    const mode = fixture.input.mode ?? "story";
    const topic = fixture.input.topic;
    const intelligence = runStudioIntelligence(fixture.input);

    const alignment = resolvePromptStudioAlignment({
      mode,
      topic,
      studioStrategyId: intelligence.strategyId,
    });

    assert.notEqual(
      alignment.alignmentStatus,
      "mismatch",
      `golden fixture "${fixture.name}" has alignment mismatch: ${alignment.mismatchWarnings.join("; ")}`,
    );
    assert.equal(
      alignment.modeTemplateId,
      fixture.expectedStrategyId,
      `golden fixture "${fixture.name}" template mismatch`,
    );
    assert.equal(
      alignment.studioStrategyId,
      fixture.expectedStrategyId,
      `golden fixture "${fixture.name}" strategy mismatch`,
    );
  }
});

test("ScriptMode resolver covers all eight modes", () => {
  const modes: ScriptMode[] = [
    "story",
    "top_5",
    "opinion_debate",
    "historical_explainer",
    "player_analysis",
    "tactical_review",
    "match_preview",
    "match_recap",
  ];

  for (const mode of modes) {
    const strategyId = resolveStudioStrategyForScriptMode(mode);
    assert.ok(strategyId.length > 0, `missing strategy for ${mode}`);
  }
});

console.log("All prompt ↔ studio alignment checks passed.");
