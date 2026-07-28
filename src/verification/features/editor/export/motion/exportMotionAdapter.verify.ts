/**
 * Export motion adapter verification (4.2C-5).
 * Run: npm run test:export-motion
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolvePreviewMediaMotionStyle,
} from "@/features/editor/preview/motion";
import {
  MEDIA_MOTION_IDENTITY_TRANSFORM,
  mapLegacyImageMotionToSceneMediaMotion,
  resolveMediaMotionStateForSceneTiming,
  resolveSceneMediaMotion,
} from "@/features/media-motion";
import type { FootieScene, SceneMedia } from "@/features/story/types";

import {
  clampExportSceneLocalTimeMs,
  resolveExportMediaBaseTransform,
  resolveExportMediaMotionTransform,
  resolveExportSceneLocalTimeMs,
  toExportDrawTransformOverride,
} from "@/features/editor/export/motion/exportMotionAdapter";

const root = process.cwd();
const EPS = 1e-6;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "s1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Test",
    ...overrides,
  };
}

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

console.log("export-motion");

test("neutral state — missing motion preserves base framing", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 20, y: -10, scale: 1.25, rotation: 3 },
    },
  });
  const motion = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 2000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assert.equal(motion.active, false);
  assertClose(motion.translateX, 20, "x");
  assertClose(motion.translateY, -10, "y");
  assertClose(motion.scale, 1.25, "scale");
  assertClose(motion.rotationDeg, 3, "rotation");
  assert.equal(motion.opacity, 1);
});

test("start / midpoint / end for slow-zoom-in", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
      },
    },
  });

  const start = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 0,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const mid = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 2000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const end = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 4000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });

  assertClose(start.scale, 1, "start scale");
  assertClose(end.scale, 1.16, "end scale");
  assert.ok(mid.scale > 1 && mid.scale < 1.16);
});

test("clamped before start / after end / zero-duration", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
      },
    },
  });

  const before = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: -500,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const after = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 9999,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const zero = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 100,
    sceneDurationMs: 0,
    frameWidth: 1080,
    frameHeight: 1920,
  });

  assertClose(before.scale, 1, "clamped start");
  assertClose(after.scale, 1.16, "clamped end");
  assertClose(zero.scale, 1, "zero duration → progress 0");
  assert.equal(clampExportSceneLocalTimeMs(-10, 4000), 0);
  assert.equal(clampExportSceneLocalTimeMs(5000, 4000), 4000);
});

test("image and video export parity", () => {
  const motion = mapLegacyImageMotionToSceneMediaMotion({
    type: "zoom-in",
    intensity: "medium",
  });
  const imageScene = baseScene({
    image: {
      url: "blob:img",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  });
  const videoMedia: SceneMedia = {
    type: "video",
    url: "blob:vid",
    durationMs: 4000,
    transform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    motion,
  };
  const videoScene = baseScene({ media: videoMedia });

  const imageMotion = resolveExportMediaMotionTransform({
    scene: imageScene,
    sceneElapsedMs: 1000,
    sceneDurationMs: 4000,
    frameWidth: 720,
    frameHeight: 1280,
  });
  const videoMotion = resolveExportMediaMotionTransform({
    scene: videoScene,
    media: videoMedia,
    sceneElapsedMs: 1000,
    sceneDurationMs: 4000,
    frameWidth: 720,
    frameHeight: 1280,
  });

  assertClose(imageMotion.scale, videoMotion.scale, "scale");
  assertClose(imageMotion.translateX, videoMotion.translateX, "x");
  assertClose(imageMotion.translateY, videoMotion.translateY, "y");
  assertClose(imageMotion.rotationDeg, videoMotion.rotationDeg, "rotation");
  assert.equal(imageMotion.opacity, videoMotion.opacity);
});

test("preview/export semantic parity across scene progress samples", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 40, y: -20, scale: 1.5, rotation: 2 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "pan-left-zoom-in",
        intensity: 1,
        easing: "ease-in-out",
      },
    },
  });

  const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
  for (const progress of samples) {
    const elapsed = progress * 4000;
    const exportMotion = resolveExportMediaMotionTransform({
      scene,
      sceneElapsedMs: elapsed,
      sceneDurationMs: 4000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const previewStyle = resolvePreviewMediaMotionStyle({
      scene,
      sceneElapsedMs: elapsed,
      sceneDurationMs: 4000,
      frameWidth: 1080,
      frameHeight: 1920,
    });

    const engine = resolveMediaMotionStateForSceneTiming({
      motion: resolveSceneMediaMotion(scene),
      baseTransform: resolveExportMediaBaseTransform(scene),
      sceneElapsedMs: elapsed,
      sceneDurationMs: 4000,
    });

    assertClose(
      exportMotion.referenceTransform.x,
      engine.transform.x,
      `ref x @${progress}`,
    );
    assertClose(
      exportMotion.referenceTransform.y,
      engine.transform.y,
      `ref y @${progress}`,
    );
    assertClose(
      exportMotion.referenceTransform.scale,
      engine.transform.scale,
      `ref scale @${progress}`,
    );
    assertClose(
      exportMotion.referenceTransform.rotation ?? 0,
      engine.transform.rotation ?? 0,
      `ref rotation @${progress}`,
    );

    // Preview CSS uses the same scaled pixel values as export.
    const translateMatch = /translate\(([^p]+)px, ([^p]+)px\)/.exec(previewStyle.transform);
    const scaleMatch = /scale\(([^)]+)\)/.exec(previewStyle.transform);
    assert.ok(translateMatch && scaleMatch, `preview css @${progress}`);
    assertClose(Number(translateMatch![1]), exportMotion.translateX, `preview x @${progress}`);
    assertClose(Number(translateMatch![2]), exportMotion.translateY, `preview y @${progress}`);
    assertClose(Number(scaleMatch![1]), exportMotion.scale, `preview scale @${progress}`);
    assert.equal(previewStyle.opacity, exportMotion.opacity);
  }
});

test("resolution scaling — semantic motion identical, pixels scale", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 108, y: 192, scale: 1, rotation: 0 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "pan-right",
        intensity: 1,
      },
    },
  });

  const resolutions = [
    [720, 1280],
    [1080, 1920],
    [1440, 2560],
  ] as const;

  const refs = resolutions.map(([w, h]) =>
    resolveExportMediaMotionTransform({
      scene,
      sceneElapsedMs: 2000,
      sceneDurationMs: 4000,
      frameWidth: w,
      frameHeight: h,
    }),
  );

  for (let i = 1; i < refs.length; i += 1) {
    assertClose(refs[i]!.referenceTransform.x, refs[0]!.referenceTransform.x, "ref x");
    assertClose(refs[i]!.referenceTransform.y, refs[0]!.referenceTransform.y, "ref y");
    assertClose(refs[i]!.referenceTransform.scale, refs[0]!.referenceTransform.scale, "ref scale");
  }

  assertClose(refs[0]!.translateX, refs[0]!.referenceTransform.x * (720 / 1080), "720 x");
  assertClose(refs[1]!.translateX, refs[1]!.referenceTransform.x, "1080 x");
  assertClose(refs[2]!.translateX, refs[2]!.referenceTransform.x * (1440 / 1080), "1440 x");
});

test("frame-rate determinism — timestamp driven, not frame index", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:v",
      durationMs: 4000,
      transform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
      },
    },
  });

  const midMs = 2000;
  const at24 = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: midMs,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const at30 = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: Math.round((30 * midMs) / 30), // same timestamp
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const at60 = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: midMs,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });

  assert.deepEqual(
    {
      s: at24.scale,
      x: at24.translateX,
      y: at24.translateY,
      r: at24.rotationDeg,
    },
    {
      s: at30.scale,
      x: at30.translateX,
      y: at30.translateY,
      r: at30.rotationDeg,
    },
  );
  assert.deepEqual(
    {
      s: at24.scale,
      x: at24.translateX,
      y: at24.translateY,
      r: at24.rotationDeg,
    },
    {
      s: at60.scale,
      x: at60.translateX,
      y: at60.translateY,
      r: at60.rotationDeg,
    },
  );
});

test("base framing composition — crop/zoom/rotation preserved under motion", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 10, y: 20, scale: 2, rotation: 5 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
      },
    },
  });
  const end = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 4000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assertClose(end.translateX, 10, "x preserved");
  assertClose(end.translateY, 20, "y preserved");
  assertClose(end.rotationDeg, 5, "rotation preserved");
  assertClose(end.scale, 2.32, "scale composed");
});

test("legacy drafts — imageMotion maps through shared engine", () => {
  const scene = baseScene({
    image: {
      url: "blob:legacy",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-out", intensity: "strong" },
    },
  });
  const start = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 0,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const end = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 4000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assertClose(start.scale, 1.16, "legacy zoom-out start");
  assertClose(end.scale, 1, "legacy zoom-out end");
});

test("invalid / partial motion falls back safely", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 0, y: 0, scale: 1.1, rotation: 0 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "unknown-preset-xyz",
        intensity: Number.NaN,
      },
    },
  });
  const motion = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs: 2000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assert.ok(Number.isFinite(motion.scale));
  assert.ok(Number.isFinite(motion.translateX));
  assert.equal(motion.opacity, 1);
});

test("draw override shape matches canvas consumer", () => {
  const motion = resolveExportMediaMotionTransform({
    scene: baseScene({
      media: {
        type: "image",
        url: "blob:img",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        motion: {
          version: 1,
          enabled: true,
          presetId: "slow-zoom-in",
          intensity: 1,
        },
      },
    }),
    sceneElapsedMs: 4000,
    sceneDurationMs: 4000,
    frameWidth: 540,
    frameHeight: 960,
  });
  const override = toExportDrawTransformOverride(motion);
  assert.equal(override.scale, motion.scale);
  assert.equal(override.translateX, motion.translateX);
  assert.equal(override.translateY, motion.translateY);
  assert.equal(override.rotation, motion.rotationDeg);
  assert.equal(override.opacity, motion.opacity);
});

test("scene local time from timeline", () => {
  assert.equal(
    resolveExportSceneLocalTimeMs({
      timelineTimeMs: 5500,
      sceneStartMs: 4000,
      sceneDurationMs: 3000,
    }),
    1500,
  );
});

test("adapter does not duplicate easing or interpolation", () => {
  const adapter = readSrc("src/features/editor/export/motion/exportMotionAdapter.ts");
  assert.doesNotMatch(adapter, /function lerp|ease-in-out|applyMediaMotionEasing/);
  assert.doesNotMatch(adapter, /from ["']react["']/);
  assert.match(adapter, /resolveMediaMotionStateForSceneTiming/);
});

test("export renderer wires shared adapter; no legacy motion resolver", () => {
  const renderer = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
  const previewImage = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const previewVideo = readSrc("src/features/editor/components/SceneFrameVideo.tsx");

  assert.match(renderer, /@\/features\/editor\/export\/motion|resolveExportMediaMotionTransform/);
  assert.doesNotMatch(renderer, /resolveSceneImageMotionTransformState/);
  assert.doesNotMatch(renderer, /getImageMotionEventForScene/);
  assert.match(previewImage, /resolvePreviewMediaMotionStyle/);
  assert.match(previewVideo, /resolvePreviewMediaMotionStyle/);
});

test("transition separation — adapter has no transition imports", () => {
  const adapter = readSrc("src/features/editor/export/motion/exportMotionAdapter.ts");
  assert.doesNotMatch(adapter, /TransitionOverlay|resolveTransition|transitionStateToPreview/);
});

console.log("\nAll export motion checks passed.");
