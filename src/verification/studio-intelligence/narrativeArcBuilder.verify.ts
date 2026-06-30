/**
 * Narrative arc builder verification
 * (run: npm run test:studio-intelligence-arcs).
 */
import assert from "node:assert/strict";

import {
  buildNarrativeArcs,
  calculateArcDuration,
  calculateArcImportance,
  suggestArcSceneCount,
} from "@/features/studio-intelligence/narrative-arc-builder";
import { NARRATIVE_ARC_SCENE_COUNT_RANGES } from "@/features/studio-intelligence/studio-intelligence.constants";
import type { NarrativeArcType, NarrativeBeat, NarrativeBeatType } from "@/features/studio-intelligence";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeBeat(
  order: number,
  type: NarrativeBeatType,
  text: string,
  importance = 0.6,
  emotion?: string,
  purpose?: string,
): NarrativeBeat {
  return {
    id: `beat-${order + 1}`,
    type,
    label: type,
    text,
    order,
    timing: {
      durationMs: 1500 + order * 250,
      weight: 1,
    },
    importance: {
      value: importance,
      tier: importance >= 0.85 ? "critical" : importance >= 0.65 ? "high" : "medium",
    },
    emotion,
    purpose,
  };
}

function arcTypes(arcs: ReturnType<typeof buildNarrativeArcs>): NarrativeArcType[] {
  return arcs.map((arc) => arc.type);
}

console.log("studio-intelligence-arcs");

test("hook → context → evidence → payoff → cta produces opening, development, ending", () => {
  const beats = [
    makeBeat(0, "hook", "This is insane.", 0.9, "excitement", "Grab attention immediately"),
    makeBeat(1, "context", "Before this season, nobody saw it coming.", 0.5, undefined, "Provide background context"),
    makeBeat(2, "evidence", "He scored 30 goals in 28 matches.", 0.72, undefined, "Support the claim with facts"),
    makeBeat(3, "payoff", "That is why he changed the title race.", 0.86, "resolution", "Land the narrative payoff"),
    makeBeat(4, "cta", "Subscribe for more breakdowns.", 0.55, undefined, "Prompt viewer action"),
  ];

  const arcs = buildNarrativeArcs(beats);

  assert.deepEqual(arcTypes(arcs), ["opening", "development", "ending"]);
  assert.equal(arcs[0]?.beatIds.length, 2);
  assert.equal(arcs[1]?.beatIds.length, 1);
  assert.equal(arcs[2]?.beatIds.length, 2);
});

test("debate narration produces opening, conflict, ending", () => {
  const beats = [
    makeBeat(0, "hook", "He is the most debated striker in England.", 0.88, "curiosity"),
    makeBeat(1, "setup", "Let's break down both sides.", 0.52, undefined, "Frame the story before the main arc"),
    makeBeat(2, "conflict", "Some say he is overrated.", 0.74, "tension"),
    makeBeat(3, "reveal", "However, the stats tell a different story.", 0.78, "surprise"),
    makeBeat(4, "payoff", "Ultimately, he proved the doubters wrong.", 0.84, "resolution"),
    makeBeat(5, "cta", "Drop your take in the comments.", 0.55),
  ];

  const arcs = buildNarrativeArcs(beats);

  assert.deepEqual(arcTypes(arcs), ["opening", "conflict", "ending"]);
});

test("importance averages are calculated", () => {
  const beats = [
    makeBeat(0, "hook", "Hook line.", 0.8),
    makeBeat(1, "context", "Context line.", 0.4),
  ];

  const arcs = buildNarrativeArcs(beats);
  const opening = arcs[0];

  assert.ok(opening);
  assert.equal(opening.averageImportance, calculateArcImportance(beats));
  assert.equal(opening.averageImportance, 0.6);
});

test("duration estimates are greater than zero", () => {
  const beats = [
    makeBeat(0, "hook", "Hook line.", 0.8),
    makeBeat(1, "evidence", "Evidence line.", 0.7),
    makeBeat(2, "payoff", "Payoff line.", 0.86),
  ];

  const arcs = buildNarrativeArcs(beats);

  for (const arc of arcs) {
    assert.ok(arc.estimatedDurationMs > 0);
    assert.equal(arc.estimatedDurationMs, calculateArcDuration(arc.beats));
  }
});

test("suggested scene counts stay within arc ranges", () => {
  const beats = [
    makeBeat(0, "hook", "Hook.", 0.9),
    makeBeat(1, "context", "Context.", 0.5),
    makeBeat(2, "evidence", "Evidence one.", 0.7),
    makeBeat(3, "evidence", "Evidence two.", 0.7),
    makeBeat(4, "turning_point", "Then it changed.", 0.8),
    makeBeat(5, "conflict", "Critics pushed back.", 0.74),
    makeBeat(6, "payoff", "He still delivered.", 0.86),
    makeBeat(7, "cta", "Follow for more.", 0.55),
  ];

  const arcs = buildNarrativeArcs(beats);

  for (const arc of arcs) {
    const range = NARRATIVE_ARC_SCENE_COUNT_RANGES[arc.type];
    assert.ok(arc.suggestedSceneCount >= range.min);
    assert.ok(arc.suggestedSceneCount <= range.max);
    assert.equal(arc.suggestedSceneCount, suggestArcSceneCount(arc.type, arc.beats.length));
  }
});

test("empty beat list returns an empty arc list", () => {
  assert.deepEqual(buildNarrativeArcs([]), []);
});

console.log("All narrative arc builder checks passed.");
