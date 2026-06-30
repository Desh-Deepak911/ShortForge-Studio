/**
 * Studio Intelligence runtime strategy injection verification
 * (run: npm run test:studio-intelligence-runtime-strategy).
 */
import assert from "node:assert/strict";

import type { StudioIntelligenceInput } from "@/features/studio-intelligence";
import { applyDynamicTiming } from "@/features/studio-intelligence/dynamic-timing-planner";
import { buildNarrativeArcs } from "@/features/studio-intelligence/narrative-arc-builder";
import { detectNarrativeBeats } from "@/features/studio-intelligence/narrative-beat-detector";
import { planSceneBlueprintsFromArcs } from "@/features/studio-intelligence/scene-planner";
import { getStoryStrategyById } from "@/features/studio-intelligence/story-strategy/story-strategy.registry";
import {
  DEFAULT_STORY_STRATEGY_ID,
  STORY_STRATEGY_VERSION,
} from "@/features/studio-intelligence/story-strategy/story-strategy.constants";
import {
  getDefaultStoryStrategy,
  resolveStoryStrategy,
} from "@/features/studio-intelligence/story-strategy/story-strategy.utils";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import { enrichBlueprintsWithVisuals } from "@/features/studio-intelligence/visual-planner";

const SAMPLE_INPUT: StudioIntelligenceInput = {
  topic: "Strategy injection",
  narration: "This is insane. Haaland scored again. The league noticed. Ultimately he changed the race.",
  targetDurationSec: 30,
  entities: ["Erling Haaland"],
};

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function stripStrategyFields<T extends Record<string, unknown>>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  delete clone.resolvedStrategy;
  delete clone.strategyId;
  delete clone.plannerConfigurationVersion;

  if (clone.diagnostics && typeof clone.diagnostics === "object") {
    delete (clone.diagnostics as Record<string, unknown>).strategyHandoffTrace;
  }

  return clone;
}

console.log("studio-intelligence-runtime-strategy");

test("history mode resolves history strategy", () => {
  const result = runStudioIntelligence({
    ...SAMPLE_INPUT,
    mode: "historical_explainer",
  });

  assert.equal(result.strategyId, "history");
  assert.equal(result.resolvedStrategy.id, "history");
  assert.equal(result.resolvedStrategy, getStoryStrategyById("history"));
});

test("debate mode resolves debate strategy", () => {
  const result = runStudioIntelligence({
    ...SAMPLE_INPUT,
    mode: "opinion_debate",
  });

  assert.equal(result.strategyId, "debate");
  assert.equal(result.resolvedStrategy.id, "debate");
  assert.equal(result.resolvedStrategy, getStoryStrategyById("debate"));
});

test("unknown mode resolves default strategy", () => {
  const result = runStudioIntelligence({
    ...SAMPLE_INPUT,
    mode: "totally_unknown_mode" as StudioIntelligenceInput["mode"],
  });

  assert.equal(result.strategyId, DEFAULT_STORY_STRATEGY_ID);
  assert.equal(result.resolvedStrategy.id, DEFAULT_STORY_STRATEGY_ID);
  assert.equal(result.resolvedStrategy, getDefaultStoryStrategy());
});

test("runtime passes identical strategy instance through every planner", () => {
  const result = runStudioIntelligence({
    ...SAMPLE_INPUT,
    mode: "story",
  });

  const trace = result.diagnostics.strategyHandoffTrace ?? [];
  assert.equal(trace.length, 5);
  assert.ok(trace.every((strategyId) => strategyId === result.strategyId));
  assert.equal(result.resolvedStrategy, getStoryStrategyById(result.strategyId));
  assert.equal(result.plannerConfigurationVersion, STORY_STRATEGY_VERSION);
});

test("planner output remains identical when using default strategy", () => {
  const input: StudioIntelligenceInput = {
    ...SAMPLE_INPUT,
    mode: "story",
  };
  const defaultStrategy = getDefaultStoryStrategy();

  const beatsWithoutStrategy = detectNarrativeBeats(input);
  const beatsWithStrategy = detectNarrativeBeats(input, defaultStrategy);
  assert.deepEqual(beatsWithoutStrategy, beatsWithStrategy);

  const arcsWithoutStrategy = buildNarrativeArcs(beatsWithoutStrategy);
  const arcsWithStrategy = buildNarrativeArcs(beatsWithStrategy, defaultStrategy);
  assert.deepEqual(arcsWithoutStrategy, arcsWithStrategy);

  const plannedWithoutStrategy = planSceneBlueprintsFromArcs(arcsWithoutStrategy, input);
  const plannedWithStrategy = planSceneBlueprintsFromArcs(arcsWithStrategy, input, defaultStrategy);
  assert.deepEqual(plannedWithoutStrategy, plannedWithStrategy);

  const visualWithoutStrategy = enrichBlueprintsWithVisuals(plannedWithoutStrategy, input);
  const visualWithStrategy = enrichBlueprintsWithVisuals(plannedWithStrategy, input, defaultStrategy);
  assert.deepEqual(visualWithoutStrategy, visualWithStrategy);

  const timedWithoutStrategy = applyDynamicTiming(visualWithoutStrategy, input);
  const timedWithStrategy = applyDynamicTiming(visualWithStrategy, input, defaultStrategy);
  assert.deepEqual(timedWithoutStrategy, timedWithStrategy);

  const runtimeWithoutStrategyFields = stripStrategyFields(
    runStudioIntelligence(input) as unknown as Record<string, unknown>,
  );
  const runtimeWithExplicitDefault = stripStrategyFields(
    runStudioIntelligence({ ...input, mode: undefined }) as unknown as Record<string, unknown>,
  );

  assert.deepEqual(
    runtimeWithoutStrategyFields.sceneBlueprintCollection,
    runtimeWithExplicitDefault.sceneBlueprintCollection,
  );
  assert.deepEqual(runtimeWithoutStrategyFields.beats, runtimeWithExplicitDefault.beats);
  assert.deepEqual(runtimeWithoutStrategyFields.arcs, runtimeWithExplicitDefault.arcs);
});

test("no planner mutates strategy", () => {
  const strategy = resolveStoryStrategy("debate");
  const snapshot = JSON.stringify(strategy);

  runStudioIntelligence({
    ...SAMPLE_INPUT,
    mode: "opinion_debate",
  });

  assert.equal(JSON.stringify(strategy), snapshot);
  assert.ok(Object.isFrozen(strategy));
  assert.ok(Object.isFrozen(strategy.hookStrategy));
  assert.ok(Object.isFrozen(strategy.arcStrategy.preferredArcSequence));
});

console.log("All runtime strategy injection checks passed.");
