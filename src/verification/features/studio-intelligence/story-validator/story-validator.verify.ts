/**
 * Story validator unit verification
 * (run: npm run test:studio-intelligence-story-validator).
 */
import assert from "node:assert/strict";

import type { SceneBlueprint, SceneImportanceScore } from "@/features/studio-intelligence";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import { createEmptyStudioIntelligenceResult } from "@/features/studio-intelligence/studio-intelligence.utils";
import {
  evaluateDuplicateIntroRule,
  evaluateHookStrengthRule,
  evaluateModeTemplateConsistencyRule,
  evaluatePayoffStrengthRule,
  validateStoryCoherence,
} from "@/features/studio-intelligence/story-validator";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeImportance(value: number): SceneImportanceScore {
  return {
    value,
    tier: value >= 0.85 ? "critical" : value >= 0.65 ? "high" : value >= 0.35 ? "medium" : "low",
  };
}

function makeBlueprint(
  partial: Partial<SceneBlueprint> & Pick<SceneBlueprint, "id" | "role" | "kind">,
): SceneBlueprint {
  return {
    arcId: "arc-1",
    beatIds: ["beat-1"],
    title: partial.title ?? "Scene",
    summary: partial.summary ?? "Summary line.",
    importance: makeImportance(0.7),
    timing: {
      suggestedDurationMs: 3000,
      minDurationMs: 1500,
      maxDurationMs: 5000,
      pacing: "normal",
    },
    visual: {
      visualIntentType: "neutral_broll",
    },
    asset: {
      assetRequirementType: "image",
      preferredOrientation: "landscape",
      imageCount: 1,
    },
    motion: {
      suggestedMotion: "ken_burns",
      intensity: "medium",
    },
    caption: {
      emphasis: "none",
      highlightWords: [],
      captionStyleHint: "default",
    },
    source: "scene_planner",
    confidence: 0.8,
    ...partial,
  };
}

function cloneResult(
  base: ReturnType<typeof runStudioIntelligence>,
  mutate: (draft: ReturnType<typeof runStudioIntelligence>) => void,
) {
  const draft = structuredClone(base);
  mutate(draft);
  return draft;
}

console.log("story-validator");

test("validateStoryCoherence returns aggregate diagnostics", () => {
  const result = runStudioIntelligence({
    topic: "Validator smoke",
    narration: "This is insane. Haaland scored again. The league noticed. Ultimately he changed the race.",
    targetDurationSec: 30,
    mode: "story",
  });

  const validation = validateStoryCoherence(result);

  assert.ok(Number.isFinite(validation.coherenceScore));
  assert.ok(Number.isFinite(validation.hookScore));
  assert.ok(Number.isFinite(validation.payoffScore));
  assert.ok(Array.isArray(validation.ruleResults));
  assert.equal(validation.ruleResults.length, 15);
  assert.ok(validation.validatedAt.length > 0);
});

test("duplicate intro rule detects repeated intro scenes", () => {
  const base = runStudioIntelligence({
    topic: "Duplicate intro",
    narration: "Who is the greatest? Messi changed the game. However Ronaldo scored more. Ultimately both are legends.",
    targetDurationSec: 45,
    mode: "opinion_debate",
  });

  const degraded = cloneResult(base, (draft) => {
    draft.sceneBlueprintCollection.blueprints = [
      makeBlueprint({ id: "intro-1", role: "intro", kind: "hook_opener", title: "Hook A" }),
      makeBlueprint({ id: "intro-2", role: "intro", kind: "hook_opener", title: "Hook B" }),
      ...draft.sceneBlueprintCollection.blueprints,
    ];
  });

  const rule = evaluateDuplicateIntroRule(degraded);
  assert.equal(rule.passed, false);
  assert.ok(rule.message?.includes("Duplicate intro"));
});

test("weak hook rule detects low-importance opener", () => {
  const base = createEmptyStudioIntelligenceResult({
    topic: "Weak hook",
    narration: "Some narration.",
    targetDurationSec: 30,
    mode: "story",
  });

  base.sceneBlueprintCollection.blueprints = [
    makeBlueprint({
      id: "weak-hook",
      role: "context",
      kind: "neutral_broll",
      importance: makeImportance(0.2),
      timing: { suggestedDurationMs: 3000, minDurationMs: 1500, maxDurationMs: 5000, pacing: "slow" },
    }),
  ];
  base.beats = [];

  const rule = evaluateHookStrengthRule(base);
  assert.equal(rule.passed, false);
});

test("weak payoff rule detects non-closing final scene", () => {
  const base = createEmptyStudioIntelligenceResult({
    topic: "Weak payoff",
    narration: "Some narration.",
    targetDurationSec: 30,
    mode: "story",
  });

  base.sceneBlueprintCollection.blueprints = [
    makeBlueprint({ id: "scene-1", role: "intro", kind: "hook_opener" }),
    makeBlueprint({
      id: "weak-end",
      role: "context",
      kind: "neutral_broll",
      importance: makeImportance(0.25),
    }),
  ];

  const rule = evaluatePayoffStrengthRule(base);
  assert.equal(rule.passed, false);
});

test("template mismatch rule detects strategy/template divergence", () => {
  const base = runStudioIntelligence({
    topic: "Template mismatch",
    narration: "These are the top 5 World Cup moments. At number 5, Maradona shocked the world. At number 4, Zidane changed the final. At number 3, Iniesta scored. At number 2, Germany stunned Brazil. And at number 1, Pelé lifted the trophy.",
    targetDurationSec: 45,
    mode: "top_5",
  });

  const mismatched = cloneResult(base, (draft) => {
    draft.diagnostics.modeTemplateId = "debate";
    draft.diagnostics.modeTemplateApplied = true;
  });

  const rule = evaluateModeTemplateConsistencyRule(mismatched);
  assert.equal(rule.passed, false);
});

test("repair suggestions are generated for failed rules", () => {
  const base = runStudioIntelligence({
    topic: "Repair suggestions",
    narration: "Who is the greatest? Messi changed the game. However Ronaldo scored more. Ultimately both are legends.",
    targetDurationSec: 45,
    mode: "opinion_debate",
  });

  const degraded = cloneResult(base, (draft) => {
    draft.sceneBlueprintCollection.blueprints = [
      makeBlueprint({ id: "intro-1", role: "intro", kind: "hook_opener", title: "Hook A" }),
      makeBlueprint({ id: "intro-2", role: "intro", kind: "hook_opener", title: "Hook B" }),
      ...draft.sceneBlueprintCollection.blueprints,
    ];
    draft.sceneBlueprintCollection.blueprints[0].importance = makeImportance(0.2);
    draft.sceneBlueprintCollection.blueprints[0].timing.pacing = "slow";
  });

  const validation = validateStoryCoherence(degraded);
  assert.ok(validation.repairSuggestions.length > 0);
  assert.ok(validation.repairCandidates.length > 0);
  assert.ok(validation.overallWarnings.length > 0);
});

console.log("All story validator unit checks passed.");
