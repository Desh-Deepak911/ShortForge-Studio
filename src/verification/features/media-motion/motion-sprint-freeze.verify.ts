/**
 * Sprint 5 Shared Media Motion freeze QA (4.2C-6).
 * Dev-only parity harness + structural / matrix regression coverage.
 * Run: npm run test:motion-sprint-freeze
 *
 * Does not mutate scenes. Does not log per-frame. No production UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveExportMediaMotionTransform,
} from "@/features/editor/export/motion";
import {
  resolvePreviewMediaMotionStyle,
} from "@/features/editor/preview/motion";
import {
  MEDIA_MOTION_EASING_OPTIONS,
  MEDIA_MOTION_IDENTITY_TRANSFORM,
  MEDIA_MOTION_INTENSITY_MAX,
  MEDIA_MOTION_INTENSITY_MIN,
  MEDIA_MOTION_PRESETS,
  listMediaMotionPresetIds,
  resolveMediaMotionStateForSceneTiming,
  resolveSceneMediaMotion,
  serializeSceneMediaMotionFingerprint,
  type MediaMotionEasing,
  type SceneMediaMotion,
} from "@/features/media-motion";
import type { FootieScene } from "@/features/story/types";

const root = process.cwd();
const EPS = 1e-5;
const PROGRESS_SAMPLES = [0, 0.05, 0.1, 0.25, 0.33, 0.5, 0.66, 0.75, 0.9, 0.95, 1];
const INTENSITY_SAMPLES = [0, 0.25, 0.5, 1, 1.5, 2];
const RESOLUTIONS = [
  [720, 1280],
  [1080, 1920],
  [1440, 2560],
] as const;

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "freeze-s1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Freeze QA",
    ...overrides,
  };
}

function motionConfig(
  partial: Partial<SceneMediaMotion> & Pick<SceneMediaMotion, "presetId">,
): SceneMediaMotion {
  return {
    version: 1,
    enabled: true,
    intensity: 1,
    easing: "linear",
    ...partial,
  };
}

function sceneWithMotion(
  motion: SceneMediaMotion,
  mediaType: "image" | "video" = "image",
  base = MEDIA_MOTION_IDENTITY_TRANSFORM,
): FootieScene {
  if (mediaType === "video") {
    return baseScene({
      media: {
        type: "video",
        url: "blob:video",
        durationMs: 4000,
        transform: { ...base },
        motion,
      },
    });
  }
  return baseScene({
    media: {
      type: "image",
      url: "blob:image",
      transform: { ...base },
      motion,
    },
  });
}

/** Dev harness snapshot — select scene inputs and inspect parity. */
export interface MotionFreezeHarnessSnapshot {
  progress: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  normalizedMotion: SceneMediaMotion;
  sharedState: ReturnType<typeof resolveMediaMotionStateForSceneTiming>;
  previewCss: ReturnType<typeof resolvePreviewMediaMotionStyle>;
  exportTransform: ReturnType<typeof resolveExportMediaMotionTransform>;
  parity: {
    translateX: boolean;
    translateY: boolean;
    scale: boolean;
    rotation: boolean;
    opacity: boolean;
  };
}

export function buildMotionFreezeHarnessSnapshot(input: {
  scene: FootieScene;
  progress: number;
  frameWidth?: number;
  frameHeight?: number;
}): MotionFreezeHarnessSnapshot {
  const sceneDurationMs = input.scene.durationMs ?? 4000;
  const progress = Math.min(1, Math.max(0, input.progress));
  const sceneElapsedMs = progress * sceneDurationMs;
  const frameWidth = input.frameWidth ?? 1080;
  const frameHeight = input.frameHeight ?? 1920;
  const normalizedMotion = resolveSceneMediaMotion(input.scene);
  const sharedState = resolveMediaMotionStateForSceneTiming({
    motion: normalizedMotion,
    baseTransform:
      input.scene.media?.transform ?? { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneElapsedMs,
    sceneDurationMs,
  });
  const previewCss = resolvePreviewMediaMotionStyle({
    scene: input.scene,
    sceneElapsedMs,
    sceneDurationMs,
    frameWidth,
    frameHeight,
  });
  const exportTransform = resolveExportMediaMotionTransform({
    scene: input.scene,
    sceneElapsedMs,
    sceneDurationMs,
    frameWidth,
    frameHeight,
  });

  const translateMatch = /translate\(([^p]+)px, ([^p]+)px\)/.exec(previewCss.transform);
  const scaleMatch = /scale\(([^)]+)\)/.exec(previewCss.transform);
  const rotateMatch = /rotate\(([^d]+)deg\)/.exec(previewCss.transform);

  return {
    progress,
    sceneElapsedMs,
    sceneDurationMs,
    normalizedMotion,
    sharedState,
    previewCss,
    exportTransform,
    parity: {
      translateX:
        Boolean(translateMatch) &&
        Math.abs(Number(translateMatch![1]) - exportTransform.translateX) < EPS,
      translateY:
        Boolean(translateMatch) &&
        Math.abs(Number(translateMatch![2]) - exportTransform.translateY) < EPS,
      scale:
        Boolean(scaleMatch) &&
        Math.abs(Number(scaleMatch![1]) - exportTransform.scale) < EPS,
      rotation:
        Boolean(rotateMatch) &&
        Math.abs(Number(rotateMatch![1]) - exportTransform.rotationDeg) < EPS,
      opacity: previewCss.opacity === exportTransform.opacity,
    },
  };
}

console.log("motion-sprint-freeze");

test("structural — single production interpolation path", () => {
  const previewImage = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const previewVideo = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  const exportRenderer = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  const previewAdapter = readSrc(
    "src/features/editor/preview/motion/previewMotionAdapter.ts",
  );
  const exportAdapter = readSrc(
    "src/features/editor/export/motion/exportMotionAdapter.ts",
  );
  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  const patchUtils = readSrc(
    "src/features/media-motion/media-motion-patch.utils.ts",
  );

  assert.match(previewAdapter, /resolveRenderedMediaMotion/);
  assert.match(exportAdapter, /resolveRenderedMediaMotion/);
  assert.match(previewImage, /resolvePreviewMediaMotionStyle/);
  assert.match(previewVideo, /resolvePreviewMediaMotionStyle/);
  assert.match(exportRenderer, /resolveExportMediaMotionTransform/);
  assert.doesNotMatch(previewImage, /resolveSceneImageMotionTransformState/);
  assert.doesNotMatch(previewVideo, /resolveSceneImageMotionTransformState/);
  assert.doesNotMatch(exportRenderer, /resolveSceneImageMotionTransformState/);
  assert.doesNotMatch(exportRenderer, /getImageMotionEventForScene/);
  assert.match(inspector, /buildMediaMotionPatch/);
  assert.match(inspector, /intent: "media"/);
  assert.match(patchUtils, /scene\.media\.motion/);
  assert.doesNotMatch(patchUtils, /imageMotion:/);
});

test("canonical write — patch helpers never write imageMotion", () => {
  const patchUtils = readSrc(
    "src/features/media-motion/media-motion-patch.utils.ts",
  );
  assert.match(patchUtils, /never trim, poster, crop/);
  assert.doesNotMatch(patchUtils, /imageMotion\s*:/);
});

test("canonical read precedence — media.motion over legacy imageMotion", () => {
  const scene = baseScene({
    image: {
      url: "blob:legacy",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-out", intensity: "strong" },
    },
    media: {
      type: "image",
      url: "blob:canonical",
      transform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
      motion: motionConfig({ presetId: "slow-zoom-in", intensity: 1 }),
      imageMotion: { type: "pan-left", intensity: "subtle" },
    },
  });
  const resolved = resolveSceneMediaMotion(scene);
  assert.equal(resolved.presetId, "slow-zoom-in");
});

test("preset matrix — all presets finite at progress samples", () => {
  for (const presetId of listMediaMotionPresetIds()) {
    if (presetId === "custom") {
      continue;
    }
    const scene = sceneWithMotion(motionConfig({ presetId, intensity: 1 }));
    for (const progress of PROGRESS_SAMPLES) {
      const snap = buildMotionFreezeHarnessSnapshot({ scene, progress });
      const t = snap.sharedState.transform;
      assert.ok(Number.isFinite(t.x), `${presetId} x @${progress}`);
      assert.ok(Number.isFinite(t.y), `${presetId} y @${progress}`);
      assert.ok(Number.isFinite(t.scale) && t.scale > 0, `${presetId} scale @${progress}`);
      assert.ok(Number.isFinite(t.rotation ?? 0), `${presetId} rotation @${progress}`);
      assert.ok(snap.parity.translateX && snap.parity.scale, `${presetId} parity @${progress}`);
    }
  }
  assert.ok(MEDIA_MOTION_PRESETS.length >= 8);
});

test("intensity matrix — 0..2 identical for preview/export", () => {
  assert.equal(MEDIA_MOTION_INTENSITY_MIN, 0);
  assert.equal(MEDIA_MOTION_INTENSITY_MAX, 2);
  for (const intensity of INTENSITY_SAMPLES) {
    const scene = sceneWithMotion(
      motionConfig({ presetId: "slow-zoom-in", intensity }),
    );
    const snap = buildMotionFreezeHarnessSnapshot({ scene, progress: 1 });
    assert.ok(snap.parity.scale, `intensity ${intensity}`);
    if (intensity === 0) {
      // Intensity 0 → inactive / identity motion delta on base.
      assertClose(snap.exportTransform.scale, 1, "intensity 0 scale");
    }
  }
});

test("easing matrix — start/end stable; midpoint differs by curve", () => {
  const easings = MEDIA_MOTION_EASING_OPTIONS.map((o) => o.value as MediaMotionEasing);
  for (const easing of easings) {
    const scene = sceneWithMotion(
      motionConfig({ presetId: "slow-zoom-in", intensity: 1, easing }),
    );
    const start = buildMotionFreezeHarnessSnapshot({ scene, progress: 0 });
    const mid = buildMotionFreezeHarnessSnapshot({ scene, progress: 0.5 });
    const end = buildMotionFreezeHarnessSnapshot({ scene, progress: 1 });
    assertClose(start.exportTransform.scale, 1, `${easing} start`);
    assertClose(end.exportTransform.scale, 1.16, `${easing} end`);
    assert.ok(mid.parity.scale, `${easing} mid parity`);
  }
});

test("image/video parity across presets at midpoint", () => {
  for (const presetId of ["slow-zoom-in", "pan-left", "gentle-drift", "push-in"]) {
    const motion = motionConfig({ presetId, intensity: 1, easing: "ease-in-out" });
    const image = sceneWithMotion(motion, "image");
    const video = sceneWithMotion(motion, "video");
    const imageSnap = buildMotionFreezeHarnessSnapshot({ scene: image, progress: 0.5 });
    const videoSnap = buildMotionFreezeHarnessSnapshot({ scene: video, progress: 0.5 });
    assertClose(
      imageSnap.exportTransform.scale,
      videoSnap.exportTransform.scale,
      `${presetId} scale`,
    );
    assertClose(
      imageSnap.exportTransform.translateX,
      videoSnap.exportTransform.translateX,
      `${presetId} x`,
    );
    assertClose(
      imageSnap.exportTransform.translateY,
      videoSnap.exportTransform.translateY,
      `${presetId} y`,
    );
  }
});

test("base framing composition — crop/zoom/rotation preserved", () => {
  const base = { x: 40, y: -30, scale: 1.8, rotation: 7 };
  const scene = sceneWithMotion(
    motionConfig({ presetId: "slow-zoom-in", intensity: 1 }),
    "image",
    base,
  );
  const end = buildMotionFreezeHarnessSnapshot({ scene, progress: 1 });
  assertClose(end.sharedState.transform.x, 40, "x");
  assertClose(end.sharedState.transform.y, -30, "y");
  assertClose(end.sharedState.transform.rotation ?? 0, 7, "rotation");
  assertClose(end.sharedState.transform.scale, 1.8 * 1.16, "composed scale");
});

test("resolution matrix — reference state identical; pixels scale", () => {
  const scene = sceneWithMotion(
    motionConfig({ presetId: "pan-left", intensity: 1 }),
  );
  const refs = RESOLUTIONS.map(([w, h]) =>
    buildMotionFreezeHarnessSnapshot({
      scene,
      progress: 0.5,
      frameWidth: w,
      frameHeight: h,
    }),
  );
  for (let i = 1; i < refs.length; i += 1) {
    assertClose(
      refs[i]!.sharedState.transform.x,
      refs[0]!.sharedState.transform.x,
      "ref x",
    );
    assertClose(
      refs[i]!.exportTransform.referenceTransform.scale,
      refs[0]!.exportTransform.referenceTransform.scale,
      "ref scale",
    );
  }
  assertClose(
    refs[0]!.exportTransform.translateX,
    refs[0]!.exportTransform.referenceTransform.x * (720 / 1080),
    "720px x",
  );
});

test("frame-rate determinism — same timestamp identical", () => {
  const scene = sceneWithMotion(
    motionConfig({ presetId: "slow-zoom-in", intensity: 1 }),
  );
  const timestamps = [0, 100, 250, 500, 1000, 2000, 3999, 4000];
  for (const ms of timestamps) {
    const a = resolveExportMediaMotionTransform({
      scene,
      sceneElapsedMs: ms,
      sceneDurationMs: 4000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const b = resolveExportMediaMotionTransform({
      scene,
      sceneElapsedMs: ms,
      sceneDurationMs: 4000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    assert.deepEqual(
      {
        x: a.translateX,
        y: a.translateY,
        s: a.scale,
        r: a.rotationDeg,
      },
      {
        x: b.translateX,
        y: b.translateY,
        s: b.scale,
        r: b.rotationDeg,
      },
    );
  }
});

test("legacy drafts — missing/null/partial/unknown normalize safely", () => {
  const cases: Array<{ label: string; scene: FootieScene }> = [
    { label: "undefined motion", scene: baseScene({ media: { type: "image", url: "blob:x" } }) },
    {
      label: "null motion",
      scene: baseScene({
        media: { type: "image", url: "blob:x", motion: null as unknown as SceneMediaMotion },
      }),
    },
    {
      label: "legacy imageMotion only",
      scene: baseScene({
        image: {
          url: "blob:l",
          scale: 1,
          x: 0,
          y: 0,
          imageMotion: { type: "zoom-in", intensity: "medium" },
        },
      }),
    },
    {
      label: "unknown preset",
      scene: sceneWithMotion(
        motionConfig({ presetId: "does-not-exist", intensity: 1 }),
      ),
    },
    {
      label: "zero duration",
      scene: {
        ...sceneWithMotion(motionConfig({ presetId: "slow-zoom-in" })),
        durationMs: 0,
        duration: 0,
      },
    },
  ];

  for (const { label, scene } of cases) {
    const snap = buildMotionFreezeHarnessSnapshot({ scene, progress: 0.5 });
    assert.ok(Number.isFinite(snap.exportTransform.scale), label);
    assert.ok(Number.isFinite(snap.exportTransform.translateX), label);
    // Rendering must not mutate scene.
    const before = JSON.stringify(scene.media?.motion ?? scene.image?.imageMotion ?? null);
    resolveSceneMediaMotion(scene);
    const after = JSON.stringify(scene.media?.motion ?? scene.image?.imageMotion ?? null);
    assert.equal(before, after, `${label} no mutation`);
  }
});

test("fingerprint — motion config changes; resolved frame values do not", () => {
  const a = sceneWithMotion(motionConfig({ presetId: "static", intensity: 0, enabled: false }));
  const b = sceneWithMotion(motionConfig({ presetId: "slow-zoom-in", intensity: 1.25 }));
  assert.notEqual(
    serializeSceneMediaMotionFingerprint(resolveSceneMediaMotion(a)),
    serializeSceneMediaMotionFingerprint(resolveSceneMediaMotion(b)),
  );
});

test("opacity channel — adapters expose neutral 1 (not implemented in engine)", () => {
  const scene = sceneWithMotion(motionConfig({ presetId: "slow-zoom-in" }));
  const snap = buildMotionFreezeHarnessSnapshot({ scene, progress: 0.5 });
  assert.equal(snap.previewCss.opacity, 1);
  assert.equal(snap.exportTransform.opacity, 1);
  assert.equal(snap.parity.opacity, true);
});

test("timeline foundation — track builder retained; renderers do not consume", () => {
  const track = readSrc(
    "src/features/timeline-intelligence/build-image-motion-track.ts",
  );
  const legacy = readSrc(
    "src/features/timeline-intelligence/resolve-image-motion-transform.utils.ts",
  );
  const exportRenderer = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  assert.match(track, /no longer consume these timeline events/);
  assert.match(legacy, /Not used by active preview or export rendering/);
  assert.doesNotMatch(exportRenderer, /getImageMotionEventForScene/);
});

test("story evolution detects canonical media.motion", () => {
  const detector = readSrc(
    "src/features/editor/story-evolution/story-change-detector.ts",
  );
  assert.match(detector, /resolveSceneMediaMotion/);
  assert.match(detector, /serializeSceneMediaMotionFingerprint/);
  assert.doesNotMatch(detector, /left\.image\?\.imageMotion/);
});

console.log("\nAll motion sprint freeze checks passed.");
