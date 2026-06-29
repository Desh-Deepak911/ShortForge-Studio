/**
 * Overlay transition helper verification (run: npm run test:transition-overlay).
 */
import assert from "node:assert/strict";

import {
  clampOverlayTransitionDurationMs,
  getTransitionProgress,
  getTransitionToNextScene,
  OVERLAY_TRANSITION_FALLBACK_DURATION_MS,
} from "@/features/story/utils";
import { getTransitionLayerStyles } from "@/features/preview/utils/previewTimeline";
import {
  getTransitionProgress,
  getTransitionToNextScene,
  resolveSceneTransitionOverlay,
} from "@/features/story/utils/transition-overlay.utils";
import type { FootieScene, TimelineItem } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function timelineWithTransition(durationMs = 800): TimelineItem[] {
  return [
    {
      id: "scene-a",
      type: "scene",
      scene: { id: "scene-a", start: 0, end: 4, duration: 4, subtitle: "A" } as FootieScene,
    },
    {
      id: "t-a-b",
      type: "transition",
      fromSceneId: "scene-a",
      toSceneId: "scene-b",
      effect: "fade",
      durationMs,
      label: "Transition to next scene",
    },
    {
      id: "scene-b",
      type: "scene",
      scene: { id: "scene-b", start: 4, end: 8, duration: 4, subtitle: "B" } as FootieScene,
    },
  ];
}

const scenes: FootieScene[] = [
  { id: "scene-a", start: 0, end: 4, duration: 4, durationMs: 4000, startMs: 0, endMs: 4000, subtitle: "A" },
  { id: "scene-b", start: 4, end: 8, duration: 4, durationMs: 4000, startMs: 4000, endMs: 8000, subtitle: "B" },
];

console.log("transition-overlay");

test("getTransitionToNextScene returns transition leaving scene", () => {
  const items = timelineWithTransition();
  const transition = getTransitionToNextScene("scene-a", items);

  assert.ok(transition);
  assert.equal(transition.toSceneId, "scene-b");
  assert.equal(transition.durationMs, 800);
});

test("getTransitionToNextScene returns null when no outgoing transition", () => {
  assert.equal(getTransitionToNextScene("scene-b", timelineWithTransition()), null);
  assert.equal(getTransitionToNextScene("missing", timelineWithTransition()), null);
});

test("clampOverlayTransitionDurationMs falls back to 500ms", () => {
  assert.equal(
    clampOverlayTransitionDurationMs(undefined, 10_000),
    OVERLAY_TRANSITION_FALLBACK_DURATION_MS,
  );
  assert.equal(clampOverlayTransitionDurationMs(0, 10_000), OVERLAY_TRANSITION_FALLBACK_DURATION_MS);
});

test("clampOverlayTransitionDurationMs caps at 40% of scene duration", () => {
  assert.equal(clampOverlayTransitionDurationMs(2000, 4000), 1600);
  assert.equal(clampOverlayTransitionDurationMs(800, 4000), 800);
});

test("getTransitionProgress is null outside the tail overlay window", () => {
  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: 0,
      sceneDurationMs: 4000,
      transitionDurationMs: 500,
    }),
    null,
  );
  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: 3499,
      sceneDurationMs: 4000,
      transitionDurationMs: 500,
    }),
    null,
  );
  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: 4000,
      sceneDurationMs: 4000,
      transitionDurationMs: 500,
    }),
    null,
  );
});

test("getTransitionProgress runs 0 to 1 during the final overlay window", () => {
  const durationMs = 4000;
  const overlayMs = 500;
  const windowStartMs = durationMs - overlayMs;

  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: windowStartMs,
      sceneDurationMs: durationMs,
      transitionDurationMs: overlayMs,
    }),
    0,
  );

  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: windowStartMs + overlayMs / 2,
      sceneDurationMs: durationMs,
      transitionDurationMs: overlayMs,
    }),
    0.5,
  );

  const nearEnd = getTransitionProgress({
    sceneElapsedMs: durationMs - 1,
    sceneDurationMs: durationMs,
    transitionDurationMs: overlayMs,
  });
  assert.ok(nearEnd != null && nearEnd > 0.99);
});

test("getTransitionProgress uses clamped overlay duration for short scenes", () => {
  const durationMs = 1000;
  const clampedOverlayMs = clampOverlayTransitionDurationMs(800, durationMs);

  assert.equal(clampedOverlayMs, 400);

  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: 599,
      sceneDurationMs: durationMs,
      transitionDurationMs: 800,
    }),
    null,
  );

  assert.equal(
    getTransitionProgress({
      sceneElapsedMs: 600,
      sceneDurationMs: durationMs,
      transitionDurationMs: 800,
    }),
    0,
  );
});

test("resolveSceneTransitionOverlay returns overlay state in tail window only", () => {
  const items = timelineWithTransition(500);
  assert.equal(
    resolveSceneTransitionOverlay(scenes, items, 0, 3000, 4000),
    null,
  );

  const overlay = resolveSceneTransitionOverlay(scenes, items, 0, 3750, 4000);
  assert.ok(overlay);
  assert.equal(overlay.fromScene.id, "scene-a");
  assert.equal(overlay.toScene.id, "scene-b");
  assert.equal(overlay.effect, "fade");
  assert.equal(overlay.progress, 0.5);
});

test("resolveSceneTransitionOverlay uses instant cut progress", () => {
  const items = timelineWithTransition(500).map((item) =>
    item.type === "transition" ? { ...item, effect: "cut" as const } : item,
  );
  const overlay = resolveSceneTransitionOverlay(scenes, items, 0, 3600, 4000);
  assert.ok(overlay);
  assert.equal(overlay.progress, 1);
  assert.equal(getTransitionLayerStyles("cut", overlay.progress).from.opacity, 0);
});

test("getTransitionLayerStyles supports zoom-out", () => {
  const styles = getTransitionLayerStyles("zoom-out", 0.5);
  assert.equal(styles.from.transform, "scale(0.96)");
  assert.equal(styles.from.opacity, 0.5);
  assert.equal(styles.to.opacity, 0.5);
});

console.log("\nAll transition overlay helper checks passed.");
