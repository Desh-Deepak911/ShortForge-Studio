/**
 * Adapter richness verification (run: npm run test:studio-intelligence-adapter-richness).
 *
 * Ensures mode-template semantics survive blueprint adapter + materializer mapping.
 */
import assert from "node:assert/strict";

import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { resolveBlueprintSemanticMetadata } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter-semantics.utils";
import { materializeMappedScenesToFootieScript } from "@/features/studio-intelligence/footie-script-materializer";
import type { StudioIntelligenceInput } from "@/features/studio-intelligence";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";

import {
  cloneGoldenFixtureInput,
  validateGoldenFixtureRun,
} from "./fixtures/golden-fixture.utils";
import { STUDIO_INTELLIGENCE_GOLDEN_FIXTURES } from "./fixtures/golden-fixtures.registry";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function runPipeline(narration: string, mode: StudioIntelligenceInput["mode"]) {
  const intelligence = runStudioIntelligence({
    topic: "Adapter richness audit",
    narration,
    targetDurationSec: 45,
    mode,
  });

  const adapter = mapBlueprintsToScenes({
    collection: intelligence.sceneBlueprintCollection,
    strategyId: intelligence.strategyId,
    topic: intelligence.input.topic,
    normalizedNarration: intelligence.normalizedNarration,
    targetDurationMs: 45_000,
  });

  const materializer = materializeMappedScenesToFootieScript({
    mappedScenes: adapter.mappedScenes,
    narration: intelligence.normalizedNarration,
    voiceoverDurationMs: 45_000,
    adapterDiagnostics: adapter.diagnostics,
  });

  return { intelligence, adapter, materializer };
}

function scenesWithLabel(
  adapter: ReturnType<typeof mapBlueprintsToScenes>,
  label: string,
) {
  return adapter.mappedScenes.filter((scene) =>
    scene.semanticSlotLabel.toLowerCase().includes(label.toLowerCase()),
  );
}

const COUNTDOWN_NARRATION =
  "These are the top 5 World Cup moments. At number 5, Maradona shocked the world. At number 4, Zidane changed the final. At number 3, Iniesta scored in 2010. At number 2, Germany stunned Brazil. And at number 1, Pelé lifted the trophy.";

const DEBATE_NARRATION =
  "Who is the greatest of all time? Some say Messi changed the game with vision. However, Ronaldo's Champions League numbers are impossible to ignore. Critics argue the debate depends on era. Ultimately, both defined a generation.";

const BIOGRAPHY_NARRATION =
  "Lamine Yamal was barely known two years ago. He broke through at Barcelona with elite numbers this season. The stats prove he is already world class at 17. His legacy is only beginning.";

const TACTICAL_NARRATION =
  "How did Guardiola change football tactics? Arsenal sat in a compact low block. The stats show they allowed just 0.8 xG. However, City's width broke the press. Ultimately, the tactical shift decided the match.";

console.log("adapterRichness");

test("countdown fixture preserves ranked slot metadata", () => {
  const { adapter } = runPipeline(COUNTDOWN_NARRATION, "top_5");

  const rankedScenes = adapter.mappedScenes.filter(
    (scene) => scene.contentPattern === "ranked_scene" || scene.blueprintKind === "ranked_reveal",
  );

  assert.ok(rankedScenes.length >= 3, "expected ranked reveal scenes");
  assert.ok(scenesWithLabel(adapter, "#5").length >= 1);
  assert.ok(scenesWithLabel(adapter, "#1").length >= 1);

  for (const scene of rankedScenes) {
    assert.equal(scene.templateId, "countdown");
    assert.equal(scene.templateApplied, true);
    assert.ok(scene.semanticSlotId.startsWith("rank_"));
    assert.ok(scene.planningTags.some((tag) => tag.startsWith("slot:")));
  }

  assert.ok((adapter.diagnostics.semanticCoverage ?? 0) >= 0.8);
  assert.ok((adapter.diagnostics.modeTemplateSemanticsPreserved ?? 0) >= 3);
});

test("debate fixture preserves argument/counter/verdict metadata", () => {
  const { adapter } = runPipeline(DEBATE_NARRATION, "opinion_debate");

  assert.ok(scenesWithLabel(adapter, "argument a").length >= 1);
  assert.ok(scenesWithLabel(adapter, "counterpoint").length >= 1);
  assert.ok(scenesWithLabel(adapter, "verdict").length >= 1);

  const debateScenes = adapter.mappedScenes.filter(
    (scene) => scene.contentPattern === "debate_scene" || scene.blueprintKind === "debate_split",
  );
  assert.ok(debateScenes.length >= 1);

  for (const scene of debateScenes) {
    assert.equal(scene.templateId, "debate");
    assert.equal(scene.proposedSceneType, "context");
  }

  assert.ok((adapter.diagnostics.collapsedSemanticKinds ?? []).includes("debate_split"));
});

test("biography fixture preserves origin/rise/peak/legacy metadata", () => {
  const { adapter } = runPipeline(BIOGRAPHY_NARRATION, "player_analysis");

  for (const label of ["origin", "peak", "legacy"]) {
    const matches = scenesWithLabel(adapter, label);
    assert.ok(matches.length >= 1, `missing biography slot: ${label}`);
    assert.equal(matches[0]?.templateId, "biography");
    assert.equal(matches[0]?.templateApplied, true);
  }

  const riseSemantics = resolveBlueprintSemanticMetadata(
    {
      id: "bp-rise",
      arcId: "arc-1",
      beatIds: ["beat-rise"],
      role: "evidence",
      kind: "stat_moment",
      title: "Rise: Breakthrough season",
      summary: "He broke through with elite numbers.",
      importance: { value: 0.7, tier: "high" },
      timing: {
        suggestedDurationMs: 3000,
        minDurationMs: 1500,
        maxDurationMs: 5000,
        pacing: "normal",
      },
      visual: { visualIntentType: "match_action" },
      asset: {
        assetRequirementType: "image",
        preferredOrientation: "landscape",
        imageCount: 1,
      },
      motion: { suggestedMotion: "ken_burns", intensity: "medium" },
      caption: { emphasis: "none", highlightWords: [], captionStyleHint: "default" },
      source: "scene_planner",
      confidence: 0.9,
    },
    2,
    5,
    "biography",
  );

  assert.equal(riseSemantics.semanticSlotId, "rise");
  assert.equal(riseSemantics.semanticSlotLabel, "Rise");
  assert.equal(riseSemantics.templateId, "biography");
});

test("tactical fixture preserves setup/pattern/key play metadata", () => {
  const { adapter } = runPipeline(TACTICAL_NARRATION, "tactical_review");

  assert.ok(scenesWithLabel(adapter, "formation").length >= 1 || scenesWithLabel(adapter, "setup").length >= 1);
  assert.ok(scenesWithLabel(adapter, "pattern").length >= 1);
  assert.ok(scenesWithLabel(adapter, "key play").length >= 1);

  const analysisScenes = adapter.mappedScenes.filter((scene) => scene.contentPattern === "analysis_scene");
  assert.ok(analysisScenes.length >= 2);

  for (const scene of analysisScenes) {
    assert.equal(scene.templateId, "tactical_analysis");
  }

  const statAnalysis = analysisScenes.filter((scene) => scene.blueprintKind === "stat_moment");
  for (const scene of statAnalysis) {
    assert.equal(scene.proposedSceneType, "context");
  }
});

test("production sceneType remains backward-compatible", () => {
  const { adapter, materializer } = runPipeline(DEBATE_NARRATION, "opinion_debate");

  const allowedProductionTypes = new Set([
    "intro",
    "context",
    "evidence",
    "conflict",
    "match",
    "ending",
    "transition",
  ]);

  for (const scene of materializer.footieScenes) {
    assert.ok(
      allowedProductionTypes.has(scene.sceneType ?? "context"),
      `unexpected production sceneType: ${scene.sceneType}`,
    );
  }

  const rankedReveal = adapter.mappedScenes.find((scene) => scene.blueprintKind === "ranked_reveal");
  if (rankedReveal) {
    assert.equal(rankedReveal.proposedSceneType, "context");
  }

  const debateSplit = adapter.mappedScenes.find((scene) => scene.blueprintKind === "debate_split");
  if (debateSplit) {
    assert.equal(debateSplit.proposedSceneType, "context");
  }
});

test("materializer output preserves semantic sidecar metadata", () => {
  const { adapter, materializer } = runPipeline(COUNTDOWN_NARRATION, "top_5");

  assert.equal(materializer.scenes.length, adapter.mappedScenes.length);

  for (let index = 0; index < adapter.mappedScenes.length; index += 1) {
    const mapped = adapter.mappedScenes[index];
    const draft = materializer.scenes[index];

    assert.equal(draft.metadata.semanticSlotId, mapped.semanticSlotId);
    assert.equal(draft.metadata.semanticSlotLabel, mapped.semanticSlotLabel);
    assert.equal(draft.metadata.semanticRole, mapped.semanticRole);
    assert.equal(draft.metadata.templateId, mapped.templateId);
    assert.equal(draft.metadata.templateApplied, mapped.templateApplied);
    assert.equal(draft.metadata.contentPattern, mapped.contentPattern);
    assert.deepEqual(draft.metadata.planningTags, mapped.planningTags);
  }
});

test("golden fixtures still pass with semantic adapter metadata", () => {
  for (const fixture of STUDIO_INTELLIGENCE_GOLDEN_FIXTURES) {
    const inputBefore = cloneGoldenFixtureInput(fixture.input);
    const intelligence = runStudioIntelligence(fixture.input);
    const inputAfter = cloneGoldenFixtureInput(fixture.input);

    const adapter = mapBlueprintsToScenes({
      collection: intelligence.sceneBlueprintCollection,
      strategyId: intelligence.strategyId,
      topic: intelligence.input.topic,
      normalizedNarration: intelligence.normalizedNarration,
      targetDurationMs: fixture.input.targetDurationMs ?? fixture.input.targetDurationSec * 1000,
    });

    const validation = validateGoldenFixtureRun({
      fixture,
      intelligence,
      adapter,
      inputBefore,
      inputAfter,
    });

    assert.ok(validation.passed, `golden fixture "${fixture.name}" failed: ${validation.failures.join("; ")}`);
    assert.ok((adapter.diagnostics.semanticCoverage ?? 0) >= 0.5);
  }
});

console.log("All adapter richness checks passed.");
