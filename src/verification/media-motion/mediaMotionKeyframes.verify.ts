/**
 * Dormant media-motion keyframe domain verification.
 * Run via: npm run test:media-motion-keyframes
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MEDIA_MOTION_KEYFRAME_IDENTITY_OPACITY,
  MEDIA_MOTION_KEYFRAME_IDENTITY_ROTATION,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
  MEDIA_MOTION_KEYFRAME_MAX_SCALE,
  MEDIA_MOTION_KEYFRAME_MIN_SCALE,
  MEDIA_MOTION_KEYFRAME_REFERENCE_HEIGHT,
  MEDIA_MOTION_KEYFRAME_REFERENCE_WIDTH,
  MEDIA_MOTION_KEYFRAME_SERIALIZATION_MAX_OFFSET_MS,
  MEDIA_MOTION_MAX_KEYFRAMES,
  normalizeMediaMotionKeyframes,
  resolveMediaMotionKeyframes,
  selectEndpointPreservingKeyframes,
} from "@/features/media-motion";
import type { MediaMotionKeyframe } from "@/features/story/types";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function frame(
  partial: Partial<MediaMotionKeyframe> & Pick<MediaMotionKeyframe, "offsetMs">,
): MediaMotionKeyframe {
  return {
    offsetMs: partial.offsetMs,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    scale: partial.scale ?? 1,
    rotation: partial.rotation ?? 0,
    opacity: partial.opacity ?? 1,
    easing: partial.easing ?? "linear",
  };
}

function main(): void {
  console.log("\nmedia-motion-keyframes\n");

  test("x/y units are reference-frame pixels matching SceneMediaTransform contract", () => {
    assert.equal(MEDIA_MOTION_KEYFRAME_REFERENCE_WIDTH, 1080);
    assert.equal(MEDIA_MOTION_KEYFRAME_REFERENCE_HEIGHT, 1920);
    assert.equal(
      MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
      MEDIA_MOTION_KEYFRAME_REFERENCE_WIDTH,
    );
    assert.equal(
      MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
      MEDIA_MOTION_KEYFRAME_REFERENCE_HEIGHT,
    );

    const preview = readSrc(
      "src/features/editor/preview/motion/previewMotionAdapter.ts",
    );
    const exportAdapter = readSrc(
      "src/features/editor/export/motion/exportMotionAdapter.ts",
    );
    assert.match(
      preview,
      /x \* \(frameWidth \/ SCENE_IMAGE_REFERENCE_WIDTH\)/,
    );
    assert.match(
      preview,
      /y \* \(frameHeight \/ SCENE_IMAGE_REFERENCE_HEIGHT\)/,
    );
    assert.match(
      exportAdapter,
      /transform\.x \* \(frameWidth \/ SCENE_IMAGE_REFERENCE_WIDTH\)/,
    );
    assert.match(
      exportAdapter,
      /transform\.y \* \(frameHeight \/ SCENE_IMAGE_REFERENCE_HEIGHT\)/,
    );

    const domain = readSrc(
      "src/features/media-motion/domain/media-motion-keyframes.ts",
    );
    assert.match(domain, /reference-frame pixels/);
    assert.match(domain, /1080×1920/);
    assert.doesNotMatch(domain, /normalized 0–1 coordinates as authored unit/);
  });

  test("absent keyframes normalize and resolve as unavailable", () => {
    assert.equal(normalizeMediaMotionKeyframes(undefined), undefined);
    assert.equal(normalizeMediaMotionKeyframes(null), undefined);
    assert.equal(normalizeMediaMotionKeyframes([]), undefined);
    const resolved = resolveMediaMotionKeyframes({
      keyframes: undefined,
      itemElapsedMs: 500,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(resolved.available, false);
    if (!resolved.available) {
      assert.equal(resolved.reason, "absent-keyframes");
    }
  });

  test("malformed entries and non-finite numerics are stripped fail-closed", () => {
    const normalized = normalizeMediaMotionKeyframes(
      [
        frame({ offsetMs: 0, x: 10 }),
        { offsetMs: Number.NaN, x: 1, y: 1, scale: 1, rotation: 0, opacity: 1 },
        {
          offsetMs: 100,
          x: Number.POSITIVE_INFINITY,
          y: 0,
          scale: 1,
        },
        {
          offsetMs: 150,
          x: 0,
          y: 0,
          scale: Number.NEGATIVE_INFINITY,
        },
        {
          offsetMs: 200,
          x: 0,
          y: 0,
          scale: 1,
          rotation: Number.NaN,
        },
        {
          offsetMs: 250,
          x: 0,
          y: 0,
          scale: 1,
          opacity: Number.POSITIVE_INFINITY,
        },
        "bad",
        null,
        {
          offsetMs: 500,
          x: 20,
          y: 0,
          scale: 1,
          easing: "ease-in",
        },
        { offsetMs: 250, x: 5 }, // missing scale
      ],
      { mediaWindowDurationMs: 1000 },
    );
    assert.ok(normalized);
    assert.equal(normalized!.length, 2);
    assert.equal(normalized![0]!.offsetMs, 0);
    assert.equal(normalized![1]!.offsetMs, 500);
    assert.equal(normalized![1]!.rotation, MEDIA_MOTION_KEYFRAME_IDENTITY_ROTATION);
    assert.equal(normalized![1]!.opacity, MEDIA_MOTION_KEYFRAME_IDENTITY_OPACITY);
  });

  test("optional rotation/opacity default to identity; easing allowlist falls back to linear", () => {
    const normalized = normalizeMediaMotionKeyframes(
      [
        { offsetMs: 0, x: 0, y: 0, scale: 1 },
        {
          offsetMs: 500,
          x: 10,
          y: 0,
          scale: 1,
          easing: "cubic" as MediaMotionKeyframe["easing"],
        },
      ],
      { mediaWindowDurationMs: 1000 },
    );
    assert.equal(normalized![0]!.rotation, 0);
    assert.equal(normalized![0]!.opacity, 1);
    assert.equal(normalized![0]!.easing, "linear");
    assert.equal(normalized![1]!.easing, "linear");
  });

  test("duplicate offsets resolve after clamping (boundary collapse last-write-wins)", () => {
    const normalized = normalizeMediaMotionKeyframes(
      [
        frame({ offsetMs: -50, x: 1 }),
        frame({ offsetMs: 0, x: 2 }),
        frame({ offsetMs: 200, x: 3 }),
        frame({ offsetMs: 200, x: 4 }),
        frame({ offsetMs: 5000, x: 5 }),
        frame({ offsetMs: 1000, x: 6 }),
      ],
      { mediaWindowDurationMs: 1000 },
    );
    assert.deepEqual(
      normalized!.map((entry) => [entry.offsetMs, entry.x]),
      [
        [0, 2], // -50 and 0 clamped/collapsed; last write at 0 wins
        [200, 4],
        [1000, 6], // 5000 and 1000 clamp/collapse to 1000; last write wins
      ],
    );
  });

  test("axis-specific reference-frame translation bounds", () => {
    const normalized = normalizeMediaMotionKeyframes(
      [
        frame({
          offsetMs: 0,
          x: -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X - 10,
          y: MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y + 10,
          scale: 0.01,
          rotation: -MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG - 20,
          opacity: -1,
        }),
        frame({
          offsetMs: 1000,
          x: MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X + 1,
          y: -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y - 1,
          scale: 99,
          rotation: MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG + 1,
          opacity: 2,
        }),
      ],
      { mediaWindowDurationMs: 1000 },
    );
    assert.equal(
      normalized![0]!.x,
      -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
    );
    assert.equal(
      normalized![0]!.y,
      MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
    );
    assert.equal(normalized![0]!.scale, MEDIA_MOTION_KEYFRAME_MIN_SCALE);
    assert.equal(
      normalized![0]!.rotation,
      -MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
    );
    assert.equal(normalized![0]!.opacity, 0);
    assert.equal(
      normalized![1]!.x,
      MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
    );
    assert.equal(
      normalized![1]!.y,
      -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
    );
    assert.equal(normalized![1]!.scale, MEDIA_MOTION_KEYFRAME_MAX_SCALE);
  });

  test("endpoint-preserving maximum-count policy is stable", () => {
    const raw = Array.from({ length: MEDIA_MOTION_MAX_KEYFRAMES + 8 }, (_, i) =>
      frame({ offsetMs: i * 10, x: i }),
    );
    const a = normalizeMediaMotionKeyframes(raw, {
      mediaWindowDurationMs: 10_000,
    });
    const b = normalizeMediaMotionKeyframes(raw, {
      mediaWindowDurationMs: 10_000,
    });
    assert.equal(a!.length, MEDIA_MOTION_MAX_KEYFRAMES);
    assert.deepEqual(a, b);
    assert.equal(a![0]!.offsetMs, 0);
    assert.equal(a![0]!.x, 0);
    assert.equal(
      a![a!.length - 1]!.offsetMs,
      (MEDIA_MOTION_MAX_KEYFRAMES + 7) * 10,
    );
    assert.equal(a![a!.length - 1]!.x, MEDIA_MOTION_MAX_KEYFRAMES + 7);

    const selected = selectEndpointPreservingKeyframes(
      raw.map((entry) => ({ ...entry })),
      5,
    );
    assert.equal(selected.length, 5);
    assert.equal(selected[0]!.x, 0);
    assert.equal(selected[selected.length - 1]!.x, raw.length - 1);
    assert.deepEqual(
      selectEndpointPreservingKeyframes(raw, 5),
      selectEndpointPreservingKeyframes(raw, 5),
    );
  });

  test("serialization offset bound is defensive only; real windows clamp strictly", () => {
    const domain = readSrc(
      "src/features/media-motion/domain/media-motion-keyframes.ts",
    );
    assert.match(domain, /Defensive serialization bound/);
    assert.match(domain, /NOT an implied media duration/);
    assert.equal(
      MEDIA_MOTION_KEYFRAME_SERIALIZATION_MAX_OFFSET_MS,
      24 * 60 * 60 * 1000,
    );

    const unknownWindow = normalizeMediaMotionKeyframes([
      frame({ offsetMs: MEDIA_MOTION_KEYFRAME_SERIALIZATION_MAX_OFFSET_MS + 1, x: 1 }),
      frame({ offsetMs: 0, x: 0 }),
    ]);
    assert.equal(
      unknownWindow![1]!.offsetMs,
      MEDIA_MOTION_KEYFRAME_SERIALIZATION_MAX_OFFSET_MS,
    );

    const realWindow = normalizeMediaMotionKeyframes(
      [
        frame({ offsetMs: 0, x: 0 }),
        frame({ offsetMs: 5000, x: 50 }),
      ],
      { mediaWindowDurationMs: 1000 },
    );
    assert.equal(realWindow![1]!.offsetMs, 1000);

    const resolved = resolveMediaMotionKeyframes({
      keyframes: [
        frame({ offsetMs: 0, x: 0 }),
        frame({ offsetMs: 5000, x: 100 }),
      ],
      itemElapsedMs: 500,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(resolved.available, true);
    if (resolved.available) {
      // clamped to window [0,1000] before interpolate → end at 1000, mid at 500
      assert.equal(resolved.sample.x, 50);
    }
  });

  test("linear and existing easing interpolation are deterministic", () => {
    const keyframes = [
      frame({ offsetMs: 0, x: 0, opacity: 0, easing: "linear" }),
      frame({ offsetMs: 1000, x: 100, opacity: 1, easing: "ease-in" }),
    ];
    const linear = resolveMediaMotionKeyframes({
      keyframes,
      itemElapsedMs: 500,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(linear.available, true);
    if (linear.available) {
      assert.equal(linear.sample.x, 50);
      assert.equal(linear.sample.opacity, 0.5);
    }

    const easeInFrames = [
      frame({ offsetMs: 0, x: 0, easing: "ease-in" }),
      frame({ offsetMs: 1000, x: 100, easing: "linear" }),
    ];
    const eased = resolveMediaMotionKeyframes({
      keyframes: easeInFrames,
      itemElapsedMs: 500,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(eased.available, true);
    if (eased.available) {
      assert.equal(eased.sample.x, 25);
    }

    const easeOutFrames = [
      frame({ offsetMs: 0, x: 0, easing: "ease-out" }),
      frame({ offsetMs: 1000, x: 100 }),
    ];
    const easeOut = resolveMediaMotionKeyframes({
      keyframes: easeOutFrames,
      itemElapsedMs: 500,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(easeOut.available, true);
    if (easeOut.available) {
      assert.equal(easeOut.sample.x, 75);
    }
  });

  test("endpoint holding before first and after last keyframe", () => {
    const keyframes = [
      frame({ offsetMs: 200, x: 20, opacity: 0.2 }),
      frame({ offsetMs: 800, x: 80, opacity: 0.8 }),
    ];
    const before = resolveMediaMotionKeyframes({
      keyframes,
      itemElapsedMs: 0,
      mediaWindowDurationMs: 1000,
    });
    const after = resolveMediaMotionKeyframes({
      keyframes,
      itemElapsedMs: 1000,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(before.available, true);
    assert.equal(after.available, true);
    if (before.available && after.available) {
      assert.equal(before.sample.x, 20);
      assert.equal(before.sample.opacity, 0.2);
      assert.equal(after.sample.x, 80);
      assert.equal(after.sample.opacity, 0.8);
    }
  });

  test("zero/negative/non-finite duration and elapsed are fail-closed", () => {
    const keyframes = [
      frame({ offsetMs: 0, x: 0 }),
      frame({ offsetMs: 100, x: 10 }),
    ];
    for (const mediaWindowDurationMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const resolved = resolveMediaMotionKeyframes({
        keyframes,
        itemElapsedMs: 50,
        mediaWindowDurationMs,
      });
      assert.equal(resolved.available, false);
      if (!resolved.available) {
        assert.equal(resolved.reason, "invalid-media-window-duration");
      }
    }
    const badElapsed = resolveMediaMotionKeyframes({
      keyframes,
      itemElapsedMs: Number.NaN,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(badElapsed.available, false);
    if (!badElapsed.available) {
      assert.equal(badElapsed.reason, "non-finite-elapsed");
    }

    const single = resolveMediaMotionKeyframes({
      keyframes: [frame({ offsetMs: 0, x: 1 })],
      itemElapsedMs: 0,
      mediaWindowDurationMs: 1000,
    });
    assert.equal(single.available, false);
    if (!single.available) {
      assert.equal(single.reason, "insufficient-keyframes");
    }
  });

  test("normalization never mutates nested input objects", () => {
    const nested = {
      offsetMs: 100,
      x: 1,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      easing: "linear" as const,
    };
    const raw = [nested, frame({ offsetMs: 0, x: 0 })];
    const snapshot = JSON.stringify(raw);
    const normalized = normalizeMediaMotionKeyframes(raw, {
      mediaWindowDurationMs: 1000,
    });
    assert.equal(JSON.stringify(raw), snapshot);
    assert.equal(nested.offsetMs, 100);
    assert.notEqual(normalized![1], nested);
    assert.equal(normalized![0]!.offsetMs, 0);
  });

  test("single-media and mixed-media item-local clocks share the same resolver", () => {
    const single = resolveMediaMotionKeyframes({
      keyframes: [
        frame({ offsetMs: 0, x: 0 }),
        frame({ offsetMs: 2000, x: 200 }),
      ],
      itemElapsedMs: 1000,
      mediaWindowDurationMs: 2000,
    });
    assert.equal(single.available, true);
    if (single.available) {
      assert.equal(single.sample.x, 100);
    }

    const mixed = resolveMediaMotionKeyframes({
      keyframes: [
        frame({ offsetMs: 0, x: 0 }),
        frame({ offsetMs: 500, x: 50 }),
      ],
      itemElapsedMs: 250,
      mediaWindowDurationMs: 500,
    });
    assert.equal(mixed.available, true);
    if (mixed.available) {
      assert.equal(mixed.sample.x, 25);
    }
  });

  test("uses left keyframe outgoing easing between neighbors", () => {
    const keyframes = [
      frame({ offsetMs: 0, x: 0, easing: "ease-in-out" }),
      frame({ offsetMs: 1000, x: 100, easing: "linear" }),
      frame({ offsetMs: 2000, x: 0, easing: "ease-in" }),
    ];
    const mid = resolveMediaMotionKeyframes({
      keyframes,
      itemElapsedMs: 500,
      mediaWindowDurationMs: 2000,
    });
    assert.equal(mid.available, true);
    if (mid.available) {
      assert.equal(mid.sample.x, 50);
    }
    const secondSpan = resolveMediaMotionKeyframes({
      keyframes,
      itemElapsedMs: 1500,
      mediaWindowDurationMs: 2000,
    });
    assert.equal(secondSpan.available, true);
    if (secondSpan.available) {
      assert.equal(secondSpan.sample.x, 50);
    }
  });

  console.log(`\n${passed} passed\n`);
}

main();
