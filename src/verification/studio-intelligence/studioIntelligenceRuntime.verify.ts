/**
 * Studio Intelligence runtime verification
 * (run: npm run test:studio-intelligence-runtime).
 */
import assert from "node:assert/strict";

import type { StudioIntelligenceInput } from "@/features/studio-intelligence";
import {
  STUDIO_INTELLIGENCE_PLANNER_STEPS,
  runStudioIntelligence,
} from "@/features/studio-intelligence/studio-intelligence-runtime";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function cloneInput(input: StudioIntelligenceInput): StudioIntelligenceInput {
  return JSON.parse(JSON.stringify(input)) as StudioIntelligenceInput;
}

console.log("studio-intelligence-runtime");

test("simple narration runs complete pipeline", () => {
  const result = runStudioIntelligence({
    topic: "Haaland form",
    narration: "This is insane. Haaland scored again. The league noticed. Ultimately he changed the race.",
    targetDurationSec: 30,
    mode: "story",
    entities: ["Erling Haaland"],
  });

  assert.ok(result.beats.length > 0);
  assert.ok(result.arcs.length > 0);
  assert.ok(result.sceneBlueprintCollection.blueprints.length > 0);
  assert.equal(result.normalizedNarration, result.input.narration);
  assert.ok(result.summary.estimatedScenes > 0);
  assert.equal(result.diagnostics.plannerStepsExecuted.length, STUDIO_INTELLIGENCE_PLANNER_STEPS.length);
});

test("empty narration returns empty result", () => {
  const result = runStudioIntelligence({
    topic: "Empty",
    narration: "   ",
    targetDurationSec: 30,
  });

  assert.equal(result.beats.length, 0);
  assert.equal(result.arcs.length, 0);
  assert.equal(result.sceneBlueprintCollection.blueprints.length, 0);
  assert.equal(result.metrics.beatCount, 0);
  assert.ok(result.diagnostics.warnings.some((warning) => /empty narration/i.test(warning)));
});

test("debate narration creates beats, arcs, and blueprints", () => {
  const result = runStudioIntelligence({
    topic: "Debate striker",
    narration:
      "He is the most debated striker in England. Some say he is overrated. However, the stats tell a different story. Ultimately, he proved them wrong.",
    targetDurationSec: 45,
    mode: "opinion_debate",
  });

  assert.ok(result.beats.length >= 3);
  assert.ok(result.arcs.length >= 2);
  assert.ok(result.sceneBlueprintCollection.blueprints.length >= 2);
  assert.ok(result.beats.some((beat) => beat.type === "conflict" || beat.type === "hook"));
});

test("hook detection reflected in metrics", () => {
  const result = runStudioIntelligence({
    topic: "Hook test",
    narration: "This is insane. Haaland just scored again.",
    targetDurationSec: 20,
  });

  assert.equal(result.metrics.hookDetected, true);
  assert.equal(result.beats[0]?.type, "hook");
});

test("duration metrics are valid", () => {
  const result = runStudioIntelligence({
    topic: "Duration test",
    narration: "He scored. They celebrated. Subscribe for more.",
    targetDurationSec: 30,
    targetDurationMs: 30_000,
  });

  assert.ok(result.metrics.estimatedDurationMs > 0);
  assert.equal(result.metrics.estimatedDurationMs, result.sceneBlueprintCollection.totalSuggestedDurationMs);
  assert.equal(result.summary.estimatedDurationMs, result.metrics.estimatedDurationMs);
  assert.ok(Math.abs(result.metrics.estimatedDurationMs - 30_000) <= 500);
});

test("pipeline executes planners in order", () => {
  const result = runStudioIntelligence({
    topic: "Order test",
    narration: "Opening line. Middle evidence with 20 goals. Final payoff line.",
    targetDurationSec: 25,
  });

  assert.deepEqual(result.diagnostics.plannerStepsExecuted, [...STUDIO_INTELLIGENCE_PLANNER_STEPS]);
});

test("no planner mutates input", () => {
  const input: StudioIntelligenceInput = {
    topic: "  Mutation test  ",
    narration: "  First line. Second line.  ",
    targetDurationSec: 30,
    entities: ["  Player One  "],
    mode: "story",
  };
  const before = cloneInput(input);

  runStudioIntelligence(input);

  assert.deepEqual(input, before);
});

console.log("All Studio Intelligence runtime checks passed.");
