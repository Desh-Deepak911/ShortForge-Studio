/**
 * Derived visual-beat plan staleness verification.
 * Run: npm run test:visual-beat-plan-commands
 */

import assert from "node:assert/strict";

import {
  VISUAL_BEAT_GENERATOR_VERSION,
  evaluateVisualBeatPlanStaleness,
  generateVisualBeatPlan,
  parseStoredVisualBeatPlan,
  type VisualBeatPlanV1,
  type VisualBeatUsableMediaIdentity,
} from "@/features/visual-beat-density";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function media(
  count: number,
): readonly VisualBeatUsableMediaIdentity[] {
  return Array.from({ length: count }, (_, index) => ({
    itemId: `item-${index + 1}`,
    mediaKind: index % 2 === 0 ? ("image" as const) : ("video" as const),
    sourceIdentity: `source-${index + 1}`,
  }));
}

function makePlan(
  overrides: Partial<VisualBeatPlanV1> = {},
  usableMedia: readonly VisualBeatUsableMediaIdentity[] = media(3),
): VisualBeatPlanV1 {
  const generated = generateVisualBeatPlan({
    narrationText: "One sentence. Two sentence, then end!",
    sceneDurationMs: 9_000,
    usableMedia,
    density: "balanced",
    generatedAtIso: "2020-01-01T00:00:00.000Z",
  });
  assert.equal(generated.ok, true);
  if (!generated.ok) throw new Error("expected plan");
  return { ...generated.plan, ...overrides };
}

function assertReasons(
  projection: ReturnType<typeof evaluateVisualBeatPlanStaleness>,
  expected: readonly string[],
): void {
  assert.deepEqual([...projection.staleReasons].sort(), [...expected].sort());
}

function main(): void {
  console.log("\nVisual-beat plan staleness\n");

  test("absent plan", () => {
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: undefined,
      narrationText: "Hello",
      sceneDurationMs: 5_000,
      usableMedia: media(1),
      currentStartOffsetsMs: [0],
    });
    assert.equal(projection.effectiveStatus, "absent");
    assert.equal(projection.applyAllowed, false);
  });

  test("unchanged plan is not stale", () => {
    const usableMedia = media(3);
    const plan = makePlan();
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia,
      currentStartOffsetsMs: [0, 1000, 2000],
      selectedDensity: "balanced",
    });
    assert.equal(projection.effectiveStatus, "draft");
    assert.equal(projection.applyAllowed, true);
    assertReasons(projection, []);
  });

  test("explicit timestamp only → no staleness", () => {
    const usableMedia = media(3);
    const plan = makePlan({ generatedAtIso: "2020-01-01T00:00:00.000Z" });
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: { ...plan, generatedAtIso: "2099-12-31T23:59:59.000Z" },
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, []);
    assert.equal(projection.applyAllowed, true);
  });

  test("narration only → NARRATION_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan();
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "Completely different narration text.",
      sceneDurationMs: 9_000,
      usableMedia,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["NARRATION_CHANGED"]);
  });

  test("duration only → DURATION_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan();
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 12_000,
      usableMedia,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["DURATION_CHANGED"]);
  });

  test("media reorder only → MEDIA_ORDER_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan({}, usableMedia);
    const reordered = [usableMedia[2]!, usableMedia[0]!, usableMedia[1]!];
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: reordered,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["MEDIA_ORDER_CHANGED"]);
  });

  test("media replacement only → MEDIA_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan({}, usableMedia);
    const replaced = [
      usableMedia[0]!,
      { ...usableMedia[1]!, sourceIdentity: "source-replaced" },
      usableMedia[2]!,
    ];
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: replaced,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["MEDIA_CHANGED"]);
  });

  test("media addition/removal → MEDIA_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan({}, usableMedia);
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: media(4),
      currentStartOffsetsMs: [0, 2000, 4000, 6000],
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["MEDIA_CHANGED"]);
  });

  test("media kind/source change → MEDIA_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan({}, usableMedia);
    const kindChanged = [
      usableMedia[0]!,
      { ...usableMedia[1]!, mediaKind: "image" as const },
      usableMedia[2]!,
    ];
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: kindChanged,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["MEDIA_CHANGED"]);
  });

  test("density only → DENSITY_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan();
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "studio",
    });
    assertReasons(projection, ["DENSITY_CHANGED"]);
  });

  test("generator version only → GENERATOR_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan();
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: {
        ...plan,
        sourceSnapshot: {
          ...plan.sourceSnapshot,
          generatorVersion: VISUAL_BEAT_GENERATOR_VERSION + 1,
        },
      },
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["GENERATOR_CHANGED"]);
    assert.equal(projection.applyAllowed, false);
  });

  test("timing only → TIMING_CHANGED", () => {
    const usableMedia = media(3);
    const plan = makePlan({ status: "applied" });
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia,
      currentStartOffsetsMs: [0, 1000, 2000],
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["TIMING_CHANGED"]);
  });

  test("narration + duration → both reasons only", () => {
    const usableMedia = media(3);
    const plan = makePlan();
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "Different narration entirely.",
      sceneDurationMs: 11_000,
      usableMedia,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["NARRATION_CHANGED", "DURATION_CHANGED"]);
  });

  test("media reorder + timing → both reasons only", () => {
    const usableMedia = media(3);
    const plan = makePlan({ status: "applied" }, usableMedia);
    const reordered = [usableMedia[2]!, usableMedia[0]!, usableMedia[1]!];
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: reordered,
      currentStartOffsetsMs: [0, 1000, 2000],
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["MEDIA_ORDER_CHANGED", "TIMING_CHANGED"]);
  });

  test("malformed/missing snapshot → PLAN_INVALID", () => {
    const plan = makePlan();
    const { sourceSnapshot: _removed, ...withoutSnapshot } = plan;
    void _removed;
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: withoutSnapshot,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: media(3),
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assert.equal(projection.effectiveStatus, "invalid");
    assertReasons(projection, ["PLAN_INVALID"]);
  });

  test("duplicate media identities remain distinguishable in set vs order digests", () => {
    const duplicates: VisualBeatUsableMediaIdentity[] = [
      { itemId: "dup", mediaKind: "image", sourceIdentity: "same" },
      { itemId: "dup", mediaKind: "image", sourceIdentity: "same" },
      { itemId: "other", mediaKind: "video", sourceIdentity: "v" },
    ];
    const plan = makePlan({}, duplicates);
    const reordered = [duplicates[2]!, duplicates[0]!, duplicates[1]!];
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: plan,
      narrationText: "One sentence. Two sentence, then end!",
      sceneDurationMs: 9_000,
      usableMedia: reordered,
      currentStartOffsetsMs: plan.proposedStartOffsetsMs,
      selectedDensity: "balanced",
    });
    assertReasons(projection, ["MEDIA_ORDER_CHANGED"]);
  });

  test("parse drops unknown warning codes but keeps plan", () => {
    const plan = makePlan();
    const parsed = parseStoredVisualBeatPlan({
      ...plan,
      warningCodes: [...plan.warningCodes, "UNKNOWN_CODE"],
    });
    assert.equal(parsed.invalid, false);
    assert.ok(parsed.plan);
    assert.ok(parsed.plan!.sourceSnapshot);
    assert.ok(
      !(parsed.plan!.warningCodes as readonly string[]).includes("UNKNOWN_CODE"),
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
