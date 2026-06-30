/**
 * Scene planner verification
 * (run: npm run test:studio-intelligence-scene-planner).
 */
import assert from "node:assert/strict";

import type { NarrativeArc, NarrativeBeat, NarrativeBeatType } from "@/features/studio-intelligence";
import {
  planSceneBlueprintsFromArcs,
  planScenesForArc,
} from "@/features/studio-intelligence/scene-planner";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeBeat(
  order: number,
  type: NarrativeBeatType,
  text: string,
  importance = 0.6,
): NarrativeBeat {
  return {
    id: `beat-${order + 1}`,
    type,
    label: type,
    text,
    order,
    timing: {
      durationMs: 1500 + order * 300,
      weight: 1,
    },
    importance: {
      value: importance,
      tier: importance >= 0.85 ? "critical" : importance >= 0.65 ? "high" : "medium",
    },
  };
}

function makeArc(partial: Partial<NarrativeArc> & Pick<NarrativeArc, "id" | "type" | "beats">): NarrativeArc {
  const beats = partial.beats;
  const estimatedDurationMs = beats.reduce((total, beat) => total + beat.timing.durationMs, 0);
  const averageImportance =
    beats.length === 0
      ? 0
      : beats.reduce((total, beat) => total + beat.importance.value, 0) / beats.length;

  return {
    title: partial.title ?? "Arc",
    beatIds: beats.map((beat) => beat.id),
    startBeatIndex: beats[0]?.order ?? 0,
    endBeatIndex: beats[beats.length - 1]?.order ?? 0,
    estimatedDurationMs,
    averageImportance,
    suggestedSceneCount: partial.suggestedSceneCount ?? Math.max(1, beats.length),
    ...partial,
  };
}

function cloneArc(arc: NarrativeArc): NarrativeArc {
  return JSON.parse(JSON.stringify(arc)) as NarrativeArc;
}

console.log("studio-intelligence-scene-planner");

test("opening arc creates hook/opening blueprint", () => {
  const arc = makeArc({
    id: "arc-1",
    type: "opening",
    title: "Opening",
    suggestedSceneCount: 2,
    beats: [
      makeBeat(0, "hook", "This is insane.", 0.9),
      makeBeat(1, "context", "Before this season, nobody expected it.", 0.48),
    ],
  });

  const blueprints = planScenesForArc(arc);

  assert.ok(blueprints.length >= 1);
  assert.equal(blueprints[0]?.role, "intro");
  assert.equal(blueprints[0]?.kind, "hook_opener");
  assert.equal(blueprints[0]?.source, "scene_planner");
  assert.ok(blueprints[0]?.beatIds.includes("beat-1"));
});

test("development arc creates multiple evidence/context blueprints when enough beats exist", () => {
  const arc = makeArc({
    id: "arc-2",
    type: "development",
    title: "Development",
    suggestedSceneCount: 4,
    beats: [
      makeBeat(2, "context", "He joined in the summer.", 0.52),
      makeBeat(3, "evidence", "He scored 20 goals in 24 games.", 0.7),
      makeBeat(4, "evidence", "He also created 12 assists.", 0.68),
      makeBeat(5, "turning_point", "Then the title race changed.", 0.8),
    ],
  });

  const blueprints = planScenesForArc(arc);

  assert.ok(blueprints.length >= 2);
  assert.ok(blueprints.some((blueprint) => blueprint.role === "evidence" || blueprint.role === "context"));
  assert.ok(blueprints.some((blueprint) => blueprint.role === "climax" || blueprint.kind === "stat_moment"));
});

test("ending arc creates payoff/conclusion blueprint", () => {
  const arc = makeArc({
    id: "arc-3",
    type: "ending",
    title: "Ending",
    suggestedSceneCount: 2,
    beats: [
      makeBeat(6, "payoff", "That is why he remains the best.", 0.86),
      makeBeat(7, "cta", "Subscribe for more.", 0.55),
    ],
  });

  const blueprints = planScenesForArc(arc);

  assert.ok(blueprints.some((blueprint) => blueprint.role === "payoff" || blueprint.role === "ending"));
  assert.ok(blueprints.some((blueprint) => blueprint.role === "cta" || blueprint.kind === "closing_moment"));
});

test("high-importance beat is not lost", () => {
  const arc = makeArc({
    id: "arc-4",
    type: "development",
    title: "Development",
    suggestedSceneCount: 2,
    beats: [
      makeBeat(0, "context", "Quiet setup line.", 0.42),
      makeBeat(1, "context", "Another low context line.", 0.4),
      makeBeat(2, "evidence", "He scored a hat-trick in the derby.", 0.92),
      makeBeat(3, "context", "Final low context line.", 0.38),
    ],
  });

  const blueprints = planScenesForArc(arc);
  const coveredBeatIds = new Set(blueprints.flatMap((blueprint) => blueprint.beatIds));

  assert.ok(coveredBeatIds.has("beat-3"));
  assert.ok(blueprints.some((blueprint) => blueprint.beatIds.includes("beat-3") && blueprint.beatIds.length === 1));
});

test("total suggested duration is greater than zero", () => {
  const collection = planSceneBlueprintsFromArcs([
    makeArc({
      id: "arc-5",
      type: "opening",
      title: "Opening",
      beats: [makeBeat(0, "hook", "Big hook.", 0.88)],
    }),
    makeArc({
      id: "arc-6",
      type: "ending",
      title: "Ending",
      beats: [makeBeat(1, "payoff", "Strong finish.", 0.84)],
    }),
  ]);

  assert.ok(collection.totalSuggestedDurationMs > 0);
  assert.ok(collection.blueprints.every((blueprint) => blueprint.timing.suggestedDurationMs > 0));
});

test("empty arcs return empty collection", () => {
  assert.deepEqual(planSceneBlueprintsFromArcs([]), {
    blueprints: [],
    sourceArcIds: [],
    totalSuggestedDurationMs: 0,
    averageImportance: 0,
    confidence: 1,
    warnings: [],
  });
});

test("input arcs are not mutated", () => {
  const arc = makeArc({
    id: "arc-7",
    type: "conflict",
    title: "Conflict",
    suggestedSceneCount: 2,
    beats: [
      makeBeat(0, "conflict", "Some say he is overrated.", 0.74),
      makeBeat(1, "reveal", "However, the stats disagree.", 0.78),
    ],
  });
  const before = cloneArc(arc);

  planSceneBlueprintsFromArcs([arc]);

  assert.deepEqual(arc, before);
});

console.log("All scene planner checks passed.");
