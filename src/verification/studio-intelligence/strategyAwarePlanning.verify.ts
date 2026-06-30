/**
 * Strategy-aware Studio Intelligence planning verification
 * (run: npm run test:studio-intelligence-strategy-planning).
 */
import assert from "node:assert/strict";

import type { StudioIntelligenceInput } from "@/features/studio-intelligence";
import { getDefaultStoryStrategy, getStoryStrategyById } from "@/features/studio-intelligence/story-strategy";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const DEBATE_NARRATION =
  "Who is the greatest of all time? Some say Messi changed the game with vision. However, Ronaldo's Champions League numbers are impossible to ignore. Critics argue the debate depends on era. Ultimately, both defined a generation.";

const COUNTDOWN_NARRATION =
  "These are the top 5 World Cup moments. At number 5, Maradona shocked the world. At number 4, Zidane changed the final. At number 3, Iniesta scored in 2010. At number 2, Germany stunned Brazil. At number 1, Pelé lifted the trophy.";

const BIOGRAPHY_NARRATION =
  "Lamine Yamal was barely known two years ago. He broke through at Barcelona with elite numbers this season. The stats prove he is already world class at 17. His legacy is only beginning.";

const HISTORY_NARRATION =
  "Why did Barcelona collapse after Messi left? The club lost its identity overnight. Then the finances spiraled. Ultimately, the era ended with a rebuild.";

const TACTICAL_NARRATION =
  "How did Guardiola change football tactics? Arsenal sat in a compact low block. The stats show they allowed just 0.8 xG. However, City's width broke the press. Ultimately, the tactical shift decided the match.";

const DEFAULT_NARRATION =
  "This is insane. Haaland scored again. The league noticed. Ultimately he changed the race.";

function runWithMode(narration: string, mode?: StudioIntelligenceInput["mode"]) {
  return runStudioIntelligence({
    topic: "Strategy planning audit",
    narration,
    targetDurationSec: 45,
    ...(mode ? { mode } : {}),
  });
}

console.log("strategyAwarePlanning");

test("debate strategy changes planner output vs default", () => {
  const defaultResult = runWithMode(DEBATE_NARRATION, "story");
  const debateResult = runWithMode(DEBATE_NARRATION, "opinion_debate");

  assert.notDeepEqual(defaultResult.sceneBlueprintCollection.blueprints, debateResult.sceneBlueprintCollection.blueprints);
  assert.ok(
    debateResult.sceneBlueprintCollection.blueprints.some(
      (blueprint) => blueprint.visual.visualIntentType === "comparison_split",
    ),
  );
  assert.ok((debateResult.diagnostics.strategyApplicationScore ?? 0) > 0.5);
  assert.ok((debateResult.diagnostics.strategyInfluenceApplied?.length ?? 0) > 0);
});

test("countdown strategy creates distinct ranked blueprint layout", () => {
  const defaultResult = runWithMode(COUNTDOWN_NARRATION, "story");
  const countdownResult = runWithMode(COUNTDOWN_NARRATION, "top_5");

  assert.ok(
    countdownResult.sceneBlueprintCollection.blueprints.length >=
      defaultResult.sceneBlueprintCollection.blueprints.length,
  );
  assert.ok(
    countdownResult.sceneBlueprintCollection.blueprints.filter((blueprint) => blueprint.kind === "ranked_reveal")
      .length >= 3,
  );
  assert.ok(countdownResult.diagnostics.strategyDecisions?.some((decision) => decision.includes("Scene density")));
});

test("biography strategy produces different arcs than default", () => {
  const defaultResult = runWithMode(BIOGRAPHY_NARRATION, "story");
  const biographyResult = runWithMode(BIOGRAPHY_NARRATION, "player_analysis");

  const defaultEnding = defaultResult.arcs.find((arc) => arc.type === "ending");
  const biographyEnding = biographyResult.arcs.find((arc) => arc.type === "ending");

  assert.ok(defaultEnding);
  assert.ok(biographyEnding);
  assert.notEqual(defaultEnding.averageImportance, biographyEnding.averageImportance);
  assert.ok(
    biographyResult.sceneBlueprintCollection.blueprints.some(
      (blueprint) => blueprint.visual.visualIntentType === "player_portrait",
    ),
  );
  assert.notDeepEqual(
    defaultResult.sceneBlueprintCollection.blueprints.map((blueprint) => blueprint.visual.visualIntentType),
    biographyResult.sceneBlueprintCollection.blueprints.map((blueprint) => blueprint.visual.visualIntentType),
  );
});

test("history strategy produces archive-forward arcs and visuals", () => {
  const historyResult = runWithMode(HISTORY_NARRATION, "historical_explainer");

  assert.ok(historyResult.arcs.length >= 2);
  assert.ok(
    historyResult.sceneBlueprintCollection.blueprints.some(
      (blueprint) => blueprint.visual.visualIntentType === "archive_footage",
    ),
  );
  assert.ok(historyResult.diagnostics.strategyInfluenceApplied?.some((item) => item.includes("arc:")));
});

test("tactical strategy produces different evidence timing than default", () => {
  const defaultResult = runWithMode(TACTICAL_NARRATION, "story");
  const tacticalResult = runWithMode(TACTICAL_NARRATION, "tactical_review");

  const defaultEvidence = defaultResult.sceneBlueprintCollection.blueprints.find(
    (blueprint) => blueprint.role === "evidence",
  );
  const tacticalEvidence = tacticalResult.sceneBlueprintCollection.blueprints.find(
    (blueprint) => blueprint.role === "evidence",
  );

  assert.ok(defaultEvidence);
  assert.ok(tacticalEvidence);
  assert.notEqual(defaultEvidence.timing.suggestedDurationMs, tacticalEvidence.timing.suggestedDurationMs);
  assert.ok(tacticalResult.diagnostics.strategyInfluenceApplied?.some((item) => item.includes("timing:")));
});

test("default story remains unchanged with explicit default strategy", () => {
  const implicitDefault = runWithMode(DEFAULT_NARRATION);
  const explicitDefault = runWithMode(DEFAULT_NARRATION, "story");
  const defaultStrategy = getDefaultStoryStrategy();

  assert.deepEqual(
    implicitDefault.sceneBlueprintCollection.blueprints,
    explicitDefault.sceneBlueprintCollection.blueprints,
  );
  assert.deepEqual(implicitDefault.beats, explicitDefault.beats);
  assert.deepEqual(implicitDefault.arcs, explicitDefault.arcs);
  assert.equal(explicitDefault.resolvedStrategy, defaultStrategy);
  assert.equal(explicitDefault.diagnostics.strategyApplicationScore ?? 0, 0);
});

test("each planner reports strategy influence diagnostics", () => {
  const result = runWithMode(DEBATE_NARRATION, "opinion_debate");

  assert.ok(result.diagnostics.strategyInfluenceApplied?.some((item) => item.startsWith("beat:")));
  assert.ok(result.diagnostics.strategyInfluenceApplied?.some((item) => item.startsWith("arc:")));
  assert.ok(result.diagnostics.strategyInfluenceApplied?.some((item) => item.startsWith("scene:")));
  assert.ok(result.diagnostics.strategyInfluenceApplied?.some((item) => item.startsWith("visual:")));
  assert.ok(result.diagnostics.strategyInfluenceApplied?.some((item) => item.startsWith("timing:")));
  assert.ok((result.diagnostics.strategyDecisions?.length ?? 0) >= 5);
  assert.equal(result.resolvedStrategy, getStoryStrategyById("debate"));
});

console.log("\nAll strategy-aware planning checks passed.");
