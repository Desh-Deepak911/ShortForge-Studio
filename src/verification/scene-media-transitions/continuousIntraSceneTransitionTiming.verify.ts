import assert from "node:assert/strict";

import {
  CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL,
  resolveContinuousIntraSceneTransitionTiming,
  resolveContinuousTransitionFootageAvailability,
} from "@/features/scene-media-transitions";

let passed = 0;

function test(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function resolve(sceneElapsedMs: number, durationMs = 500) {
  return resolveContinuousIntraSceneTransitionTiming({
    boundaryMs: 3000,
    effectiveDurationMs: durationMs,
    fromWindowDurationMs: 3000,
    toWindowDurationMs: 3000,
    sceneElapsedMs,
  });
}

console.log("\ncontinuous-intra-scene-transition-timing\n");

test("centers the selected duration on the existing boundary", () => {
  const start = resolve(2750);
  assert.ok(start);
  assert.equal(start.model, CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL);
  assert.equal(start.overlayStartMs, 2750);
  assert.equal(start.overlayEndMs, 3250);
  assert.equal(start.outgoingItemLocalMs, 2750);
  assert.equal(start.incomingItemLocalMs, 0);
});

test("keeps both peers advancing through the overlap", () => {
  const early = resolve(2800);
  const mid = resolve(3000);
  const late = resolve(3200);
  assert.ok(early && mid && late);
  assert.ok(mid.outgoingItemLocalMs > early.outgoingItemLocalMs);
  assert.ok(late.outgoingItemLocalMs > mid.outgoingItemLocalMs);
  assert.ok(mid.incomingItemLocalMs > early.incomingItemLocalMs);
  assert.ok(late.incomingItemLocalMs > mid.incomingItemLocalMs);
});

test("joins ordinary outgoing playback at the opening edge", () => {
  const start = resolve(2750);
  assert.ok(start);
  assert.equal(start.outgoingItemLocalMs, 2750);
  assert.equal(start.outgoingAdvanceMs, 0);
});

test("approaches ordinary incoming playback at the closing edge", () => {
  const last = resolve(3249);
  assert.ok(last);
  assert.ok(last.incomingItemLocalMs > 249 && last.incomingItemLocalMs < 250);
  assert.ok(last.outgoingItemLocalMs > 2999 && last.outgoingItemLocalMs < 3000);
  assert.equal(resolve(3250), null);
});

test("preserves exact duration for odd millisecond windows", () => {
  const start = resolveContinuousIntraSceneTransitionTiming({
    boundaryMs: 3000,
    effectiveDurationMs: 501,
    fromWindowDurationMs: 3000,
    toWindowDurationMs: 3000,
    sceneElapsedMs: 2750,
  });
  assert.ok(start);
  assert.equal(start.overlayStartMs, 2750);
  assert.equal(start.overlayEndMs, 3251);
  assert.equal(start.overlayEndMs - start.overlayStartMs, 501);
});

test("remains inside short adjacent windows", () => {
  const result = resolveContinuousIntraSceneTransitionTiming({
    boundaryMs: 400,
    effectiveDurationMs: 320,
    fromWindowDurationMs: 400,
    toWindowDurationMs: 400,
    sceneElapsedMs: 240,
  });
  assert.ok(result);
  assert.equal(result.overlayStartMs, 240);
  assert.equal(result.overlayEndMs, 560);
});

test("fails closed outside the overlap and for invalid inputs", () => {
  assert.equal(resolve(2749), null);
  assert.equal(resolve(3250), null);
  assert.equal(
    resolveContinuousIntraSceneTransitionTiming({
      boundaryMs: 0,
      effectiveDurationMs: 0,
      fromWindowDurationMs: 0,
      toWindowDurationMs: 0,
      sceneElapsedMs: 0,
    }),
    null,
  );
});

test("allows images, unknown metadata, and video trims with enough motion", () => {
  assert.equal(
    resolveContinuousTransitionFootageAvailability({
      fromMedia: { type: "image" },
      toMedia: { type: "video", durationMs: 10_000, trimStartMs: 1000, trimEndMs: 5000 },
      fromWindowDurationMs: 3000,
      effectiveDurationMs: 500,
    }).allowed,
    true,
  );
  assert.equal(
    resolveContinuousTransitionFootageAvailability({
      fromMedia: { type: "video" },
      toMedia: { type: "video" },
      fromWindowDurationMs: 3000,
      effectiveDurationMs: 500,
    }).allowed,
    true,
  );
});

test("falls back to Cut when the outgoing trim would freeze before its boundary", () => {
  assert.deepEqual(
    resolveContinuousTransitionFootageAvailability({
      fromMedia: { type: "video", durationMs: 2000, trimStartMs: 0, trimEndMs: 2000 },
      toMedia: { type: "image" },
      fromWindowDurationMs: 3000,
      effectiveDurationMs: 500,
    }),
    { allowed: false, reason: "outgoing_source_exhausted" },
  );
});

test("falls back to Cut when the incoming trim cannot cover its overlap half", () => {
  assert.deepEqual(
    resolveContinuousTransitionFootageAvailability({
      fromMedia: { type: "image" },
      toMedia: { type: "video", durationMs: 100, trimStartMs: 0, trimEndMs: 100 },
      fromWindowDurationMs: 3000,
      effectiveDurationMs: 500,
    }),
    { allowed: false, reason: "incoming_source_exhausted" },
  );
});

test("is deterministic and provider-free", () => {
  const first = resolve(3033);
  const second = resolve(3033);
  assert.deepEqual(first, second);
  assert.doesNotMatch(
    resolveContinuousIntraSceneTransitionTiming.toString(),
    /fetch|openai|provider|Date\.now|Math\.random/i,
  );
});

console.log(`\n${passed} passed\n`);
