/**
 * Mode template planning verification (run: npm run test:studio-intelligence-mode-templates).
 */
import assert from "node:assert/strict";

import type { StudioIntelligenceInput } from "@/features/studio-intelligence";
import { applyModeTemplateToBlueprints } from "@/features/studio-intelligence/mode-templates";
import { getStoryStrategyById } from "@/features/studio-intelligence/story-strategy";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function titlesInclude(result: ReturnType<typeof runStudioIntelligence>, labels: string[]) {
  const titles = result.sceneBlueprintCollection.blueprints.map((blueprint) => blueprint.title.toLowerCase());
  return labels.every((label) => titles.some((title) => title.includes(label.toLowerCase())));
}

function runMode(narration: string, mode: StudioIntelligenceInput["mode"]) {
  return runStudioIntelligence({
    topic: "Mode template audit",
    narration,
    targetDurationSec: 45,
    mode,
  });
}

const COUNTDOWN_NARRATION =
  "These are the top 5 World Cup moments. At number 5, Maradona shocked the world. At number 4, Zidane changed the final. At number 3, Iniesta scored in 2010. At number 2, Germany stunned Brazil. And at number 1, Pelé lifted the trophy.";

const DEBATE_NARRATION =
  "Who is the greatest of all time? Some say Messi changed the game with vision. However, Ronaldo's Champions League numbers are impossible to ignore. Critics argue the debate depends on era. Ultimately, both defined a generation.";

const BIOGRAPHY_NARRATION =
  "Lamine Yamal was barely known two years ago. He broke through at Barcelona with elite numbers this season. The stats prove he is already world class at 17. His legacy is only beginning.";

const HISTORY_NARRATION =
  "Why did Barcelona collapse after Messi left? The club lost its identity overnight. Then the finances spiraled. Ultimately, the era ended with a rebuild.";

const TACTICAL_NARRATION =
  "How did Guardiola change football tactics? Arsenal sat in a compact low block. The stats show they allowed just 0.8 xG. However, City's width broke the press. Ultimately, the tactical shift decided the match.";

const MATCH_PREVIEW_NARRATION =
  "El Clasico kicks off tonight at the Bernabeu. Watch for Vinicius against Barcelona's high defensive line. Real Madrid need a win to stay top of La Liga. This preview breaks down the key battles before kickoff.";

const NEWS_NARRATION =
  "Breaking: Manchester City sign a record-breaking midfielder. The deal reshapes the Premier League title race. City now boast the deepest squad in Europe. What happens next could define the season.";

const DEFAULT_NARRATION =
  "This is insane. Haaland scored again. The league noticed. Ultimately he changed the race.";

console.log("modeTemplatePlanning");

test("countdown creates ranked slot semantics", () => {
  const result = runMode(COUNTDOWN_NARRATION, "top_5");
  assert.ok(titlesInclude(result, ["#5", "#1"]));
  assert.ok(result.sceneBlueprintCollection.blueprints.some((blueprint) => blueprint.kind === "ranked_reveal"));
  assert.equal(result.diagnostics.modeTemplateId, "countdown");
  assert.ok((result.diagnostics.templateSlotsMatched ?? 0) >= 3);
});

test("debate creates argument/counter/verdict semantics", () => {
  const result = runMode(DEBATE_NARRATION, "opinion_debate");
  assert.ok(titlesInclude(result, ["argument a", "counterpoint", "verdict"]));
  assert.equal(result.diagnostics.modeTemplateApplied, true);
});

test("biography creates rise/peak/legacy semantics", () => {
  const result = runMode(BIOGRAPHY_NARRATION, "player_analysis");
  assert.ok(titlesInclude(result, ["origin", "peak", "legacy"]));
});

test("history creates context/turning-point/impact semantics", () => {
  const result = runMode(HISTORY_NARRATION, "historical_explainer");
  assert.ok(titlesInclude(result, ["context", "impact", "legacy"]));
});

test("tactical creates setup/pattern/key play semantics", () => {
  const result = runMode(TACTICAL_NARRATION, "tactical_review");
  assert.ok(titlesInclude(result, ["formation", "pattern", "key play", "outcome"]));
});

test("match preview creates stakes/key battle/prediction semantics", () => {
  const result = runMode(MATCH_PREVIEW_NARRATION, "match_preview");
  assert.ok(titlesInclude(result, ["stakes hook", "key battle", "prediction"]));
});

test("news creates what changed/impact/what next semantics", () => {
  const result = runMode(NEWS_NARRATION, "match_recap");
  assert.ok(titlesInclude(result, ["breaking hook", "context", "impact", "what next"]));
});

test("default story is minimally changed", () => {
  const before = runStudioIntelligence({
    topic: "Default",
    narration: DEFAULT_NARRATION,
    targetDurationSec: 30,
    mode: "story",
  });

  const strategy = getStoryStrategyById("default");
  const normalized = applyModeTemplateToBlueprints(before.sceneBlueprintCollection, strategy);
  assert.deepEqual(normalized.collection.blueprints, before.sceneBlueprintCollection.blueprints);
  assert.ok(normalized.diagnostics.templateFallbacks.includes("default_template_minimal_pass"));
});

test("IDs and lineage are preserved", () => {
  const result = runMode(DEBATE_NARRATION, "opinion_debate");
  const ids = result.sceneBlueprintCollection.blueprints.map((blueprint) => blueprint.id);
  const beatIds = result.sceneBlueprintCollection.blueprints.map((blueprint) => blueprint.beatIds);

  const strategy = getStoryStrategyById("debate");
  const { collection } = applyModeTemplateToBlueprints(result.sceneBlueprintCollection, strategy);

  assert.deepEqual(
    collection.blueprints.map((blueprint) => blueprint.id),
    ids,
  );
  assert.deepEqual(
    collection.blueprints.map((blueprint) => blueprint.beatIds),
    beatIds,
  );
  assert.ok(beatIds.every((group) => group.length > 0));
});

test("runtime diagnostics include template application", () => {
  const result = runMode(COUNTDOWN_NARRATION, "top_5");
  assert.equal(result.diagnostics.modeTemplateApplied, true);
  assert.equal(result.diagnostics.modeTemplateId, "countdown");
  assert.ok((result.diagnostics.templateSlotsMatched ?? 0) > 0);
  assert.ok(result.diagnostics.plannerStepsExecuted.includes("mode_template_normalization"));
});

console.log("\nAll mode template planning checks passed.");
