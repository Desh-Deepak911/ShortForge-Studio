/**
 * Visual-beat plan generation verification.
 * Run: npm run test:visual-beat-planning
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";
import {
  VISUAL_BEAT_DENSITY_PREFERRED_DWELL_MS,
  VISUAL_BEAT_PLAN_TERMINAL_CODES,
  VISUAL_BEAT_PLAN_WARNING_CODES,
  computePreferredBeatCount,
  generateVisualBeatPlan,
  type VisualBeatDensity,
  type VisualBeatPlanInput,
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
  kind: "image" | "video" | "mixed" = "image",
): readonly VisualBeatUsableMediaIdentity[] {
  return Array.from({ length: count }, (_, index) => ({
    itemId: `item-${index + 1}`,
    mediaKind:
      kind === "mixed" ? (index % 2 === 0 ? "image" : "video") : kind,
    sourceIdentity: `source-${index + 1}`,
  }));
}

function baseInput(
  overrides: Partial<VisualBeatPlanInput> = {},
): VisualBeatPlanInput {
  return {
    narrationText:
      "Opening line lands hard. Midway beat arrives, then a pause; finally the close!",
    sceneDurationMs: 10_000,
    usableMedia: media(4, "mixed"),
    density: "balanced",
    ...overrides,
  };
}

function assertValidOffsets(
  starts: readonly number[],
  sceneDurationMs: number,
): void {
  assert.ok(starts.length >= 1);
  assert.equal(starts[0], 0);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i]! > starts[i - 1]!);
    assert.ok(starts[i]! - starts[i - 1]! >= SCENE_MEDIA_MIN_ITEM_DURATION_MS);
  }
  const last = starts[starts.length - 1]!;
  assert.ok(last < sceneDurationMs);
  assert.ok(sceneDurationMs - last >= SCENE_MEDIA_MIN_ITEM_DURATION_MS);
}

function readDomainTree(): string {
  const root = path.join(process.cwd(), "src/features/visual-beat-density");
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((rel) => rel.endsWith(".ts"));
  return files
    .map((rel) => readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
}

function main(): void {
  console.log("\nVisual-beat plan generation\n");

  test("identical inputs → identical plan", () => {
    const a = generateVisualBeatPlan(baseInput());
    const b = generateVisualBeatPlan(baseInput());
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.deepEqual(a.plan, b.plan);
  });

  test("Fast/Balanced/Studio preferred-count differences", () => {
    const durationMs = 10_000;
    const fast = computePreferredBeatCount(durationMs, "fast");
    const balanced = computePreferredBeatCount(durationMs, "balanced");
    const studio = computePreferredBeatCount(durationMs, "studio");
    assert.ok(fast > balanced);
    assert.ok(balanced > studio);
    assert.equal(
      fast,
      Math.max(1, Math.round(durationMs / VISUAL_BEAT_DENSITY_PREFERRED_DWELL_MS.fast)),
    );
  });

  test("Studio snaps toward narration anchors vs Fast equal-split", () => {
    const narration =
      "First sentence ends here. Second sentence waits, then a phrase; last beat!";
    const shared = {
      narrationText: narration,
      sceneDurationMs: 12_000,
      usableMedia: media(4),
    } as const;
    const fast = generateVisualBeatPlan({ ...shared, density: "fast" });
    const studio = generateVisualBeatPlan({ ...shared, density: "studio" });
    assert.equal(fast.ok, true);
    assert.equal(studio.ok, true);
    if (!fast.ok || !studio.ok) return;
    assert.notDeepEqual(
      fast.plan.proposedStartOffsetsMs,
      studio.plan.proposedStartOffsetsMs,
    );
    assert.ok(
      fast.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_EQUAL_SPLIT_USED,
      ),
    );
    assert.ok(
      !studio.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_EQUAL_SPLIT_USED,
      ) ||
        studio.plan.proposedStartOffsetsMs.some(
          (value, index) => value !== fast.plan.proposedStartOffsetsMs[index],
        ),
    );
  });

  test("fallback without narration", () => {
    const result = generateVisualBeatPlan(
      baseInput({ narrationText: "   \n\t  ", usableMedia: media(3) }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_ANCHORS_FALLBACK,
      ),
    );
    assert.ok(
      result.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_EQUAL_SPLIT_USED,
      ),
    );
    assert.ok(result.plan.anchors?.every((anchor) => anchor.kind === "fallback"));
    assertValidOffsets(result.plan.proposedStartOffsetsMs, 10_000);
  });

  test("one visual covers full scene with inventory warning when appropriate", () => {
    const result = generateVisualBeatPlan(
      baseInput({ usableMedia: media(1), density: "fast" }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.plan.proposedStartOffsetsMs, [0]);
    assert.equal(result.plan.achievedMediaWindowCount, 1);
    assert.ok(result.plan.preferredBeatCount > 1);
    assert.ok(
      result.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_FEWER_VISUALS_THAN_TARGET,
      ),
    );
  });

  test("no visuals → terminal BEATS_NO_USABLE_VISUALS", () => {
    const result = generateVisualBeatPlan(baseInput({ usableMedia: [] }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(
      result.terminalCode,
      VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_NO_USABLE_VISUALS,
    );
  });

  test("invalid duration → terminal BEATS_INVALID_DURATION", () => {
    for (const sceneDurationMs of [NaN, Infinity, -1, 0]) {
      const result = generateVisualBeatPlan(baseInput({ sceneDurationMs }));
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.equal(
        result.terminalCode,
        VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_INVALID_DURATION,
      );
    }
  });

  test("scene too short for minimum windows", () => {
    const result = generateVisualBeatPlan(
      baseInput({
        sceneDurationMs: SCENE_MEDIA_MIN_ITEM_DURATION_MS * 3 - 1,
        usableMedia: media(3),
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(
      result.terminalCode,
      VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_SCENE_TOO_SHORT,
    );
  });

  test("exact minimum-duration boundary succeeds", () => {
    const sceneDurationMs = SCENE_MEDIA_MIN_ITEM_DURATION_MS * 3;
    const result = generateVisualBeatPlan(
      baseInput({
        sceneDurationMs,
        usableMedia: media(3),
        density: "balanced",
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assertValidOffsets(result.plan.proposedStartOffsetsMs, sceneDurationMs);
    assert.deepEqual(result.plan.proposedStartOffsetsMs, [
      0,
      SCENE_MEDIA_MIN_ITEM_DURATION_MS,
      SCENE_MEDIA_MIN_ITEM_DURATION_MS * 2,
    ]);
  });

  test("very long narration stays bounded to scene duration", () => {
    const narration = Array.from({ length: 80 }, (_, i) =>
      `Sentence number ${i + 1} continues the story.`,
    ).join(" ");
    const result = generateVisualBeatPlan(
      baseInput({ narrationText: narration, usableMedia: media(5) }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assertValidOffsets(result.plan.proposedStartOffsetsMs, 10_000);
    for (const anchor of result.plan.anchors ?? []) {
      assert.ok(anchor.offsetMs >= 0);
      assert.ok(anchor.offsetMs <= 10_000);
    }
  });

  test("more visuals than preferred warns without dropping media", () => {
    const result = generateVisualBeatPlan(
      baseInput({
        density: "studio",
        sceneDurationMs: 6_000,
        usableMedia: media(6),
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.achievedMediaWindowCount, 6);
    assert.ok(result.plan.preferredBeatCount < 6);
    assert.ok(
      result.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_MORE_VISUALS_THAN_TARGET,
      ),
    );
    assert.equal(result.plan.proposedStartOffsetsMs.length, 6);
  });

  test("fewer visuals than preferred warns without inventing media", () => {
    const result = generateVisualBeatPlan(
      baseInput({
        density: "fast",
        sceneDurationMs: 12_000,
        usableMedia: media(2),
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.achievedMediaWindowCount, 2);
    assert.ok(result.plan.preferredBeatCount > 2);
    assert.ok(
      result.plan.warningCodes.includes(
        VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_FEWER_VISUALS_THAN_TARGET,
      ),
    );
    assert.equal(result.plan.proposedStartOffsetsMs.length, 2);
  });

  test("mixed image/video inventory is preserved in order", () => {
    const usableMedia = media(4, "mixed");
    const result = generateVisualBeatPlan(baseInput({ usableMedia }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.achievedMediaWindowCount, 4);
    assertValidOffsets(result.plan.proposedStartOffsetsMs, 10_000);
  });

  test("densities produce observably different preferred counts", () => {
    const densities: VisualBeatDensity[] = ["fast", "balanced", "studio"];
    const preferred = densities.map((density) => {
      const result = generateVisualBeatPlan(baseInput({ density }));
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      return result.plan.preferredBeatCount;
    });
    assert.notEqual(preferred[0], preferred[1]);
    assert.notEqual(preferred[1], preferred[2]);
  });

  test("no mutation of input objects", () => {
    const usableMedia = media(3);
    const input = Object.freeze({
      narrationText: "Frozen narration. Second sentence!",
      sceneDurationMs: 9_000,
      usableMedia: Object.freeze([...usableMedia]),
      density: "studio" as const,
    });
    const before = JSON.stringify(input);
    const result = generateVisualBeatPlan(input);
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify(input), before);
  });

  test("no music dependency/import across feature", () => {
    const source = readDomainTree();
    assert.doesNotMatch(source, /from\s+["'][^"']*music[^"']*["']/i);
    assert.doesNotMatch(source, /import\s*\(.*music/i);
    assert.doesNotMatch(source, /features\/audio|audio-mixer|build-export-audio/i);
    assert.doesNotMatch(source, /Date\.now\(|new Date\(|Math\.random\(/);
  });

  test("authority boundary — no visualSequence/mediaTimeline mutation APIs", () => {
    const source = readDomainTree();
    // Min-duration constant import from scene-media-timeline is allowed; mutation/adapters are not.
    assert.doesNotMatch(
      source,
      /from\s+["']@\/features\/mixed-media-scenes[^"']*["']/,
    );
    assert.doesNotMatch(
      source,
      /from\s+["']@\/features\/scene-media-timeline(?!\/editor\/scene-media-timeline\.constants)[^"']*["']/,
    );
    assert.doesNotMatch(
      source,
      /visualSequenceToMediaTimeline|applyVisualSequenceAuthority|updateMixedMediaSequence|reconcileVisualSequence/,
    );
    assert.doesNotMatch(source, /writeFile|fetch\(|axios|openai/i);
  });

  test("uses SCENE_MEDIA_MIN_ITEM_DURATION_MS rather than a local 500 constant", () => {
    const generator = readFileSync(
      path.join(
        process.cwd(),
        "src/features/visual-beat-density/domain/generate-visual-beat-plan.ts",
      ),
      "utf8",
    );
    assert.match(generator, /SCENE_MEDIA_MIN_ITEM_DURATION_MS/);
    assert.equal(SCENE_MEDIA_MIN_ITEM_DURATION_MS, 500);
    assert.doesNotMatch(generator, /const\s+\w+\s*=\s*500\b/);
  });

  test("draft status and version fields", () => {
    const result = generateVisualBeatPlan(baseInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.version, 1);
    assert.equal(result.plan.generatorVersion, 1);
    assert.equal(result.plan.status, "draft");
    assert.equal(result.plan.generatedAtIso, undefined);
  });

  console.log(`\n${passed} passed\n`);
}

main();
