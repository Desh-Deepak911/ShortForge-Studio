/**
 * Preview motion adapter verification (4.2C-4).
 * Run: npm run test:preview-motion
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MEDIA_MOTION_IDENTITY_TRANSFORM,
  mapLegacyImageMotionToSceneMediaMotion,
  resolveMediaMotionState,
  resolveMediaMotionStateForSceneTiming,
  resolveSceneMediaMotion,
} from "@/features/media-motion";
import type { FootieScene, SceneMedia } from "@/features/story/types";

import {
  clampPreviewSceneLocalTimeMs,
  getNeutralPreviewMotionStyle,
  resolvePreviewMediaBaseTransform,
  resolvePreviewMediaMotionStyle,
  resolvePreviewSceneLocalTimeMs,
  toPreviewMotionStyle,
} from "./previewMotionAdapter";

const root = process.cwd();

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

console.log("preview-motion");

test("neutral state — missing motion resolves to identity framing", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 10, y: -5, scale: 1.2, rotation: 0 },
    },
  });
  const style = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 2000,
    sceneDurationMs: 4000,
    frameWidth: 540,
    frameHeight: 960,
  });
  assert.match(style.transform, /translate\(5px, -2\.5px\)/);
  assert.match(style.transform, /scale\(1\.2\)/);
  assert.equal(style.opacity, 1);
  assert.equal(resolveSceneMediaMotion(scene).presetId, "static");
});

test("start / midpoint / end states for slow-zoom-in", () => {
  const motion = {
    version: 1 as const,
    enabled: true,
    presetId: "slow-zoom-in",
    intensity: 1,
  };
  const scene = baseScene({
    media: {
      type: "image",
      url: "blob:img",
      transform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
      motion,
    },
  });

  const start = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 0,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const mid = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 2000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const end = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 4000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });

  assert.match(start.transform, /scale\(1\)/);
  assert.match(end.transform, /scale\(1\.16\)/);
  const midScale = Number(/scale\(([^)]+)\)/.exec(mid.transform)?.[1]);
  assert.ok(midScale > 1 && midScale < 1.16);
});

test("image and video parity — same adapter + engine", () => {
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

  const imageStyle = resolvePreviewMediaMotionStyle({
    scene: imageScene,
    sceneElapsedMs: 1000,
    sceneDurationMs: 4000,
    frameWidth: 540,
    frameHeight: 960,
  });
  const videoStyle = resolvePreviewMediaMotionStyle({
    scene: videoScene,
    media: videoMedia,
    sceneElapsedMs: 1000,
    sceneDurationMs: 4000,
    frameWidth: 540,
    frameHeight: 960,
  });

  assert.equal(imageStyle.transform, videoStyle.transform);
  assert.equal(imageStyle.opacity, videoStyle.opacity);
});

test("seeking / pause — style derives from scene-local time only", () => {
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

  const atSeek = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 3000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  const atPauseSameTime = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 3000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assert.equal(atSeek.transform, atPauseSameTime.transform);

  const engine = resolveMediaMotionStateForSceneTiming({
    motion: resolveSceneMediaMotion(scene),
    baseTransform: MEDIA_MOTION_IDENTITY_TRANSFORM,
    sceneElapsedMs: 3000,
    sceneDurationMs: 4000,
  });
  assert.equal(toPreviewMotionStyle(engine, 1080, 1920).transform, atSeek.transform);
});

test("legacy drafts — imageMotion maps through shared engine", () => {
  const scene = baseScene({
    image: {
      url: "blob:legacy",
      scale: 2,
      x: 20,
      y: 0,
      imageMotion: { type: "zoom-in", intensity: "strong" },
    },
  });
  const style = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 4000,
    sceneDurationMs: 4000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  // base scale 2 × strong peak 1.16
  assert.match(style.transform, /scale\(2\.32\)/);
  assert.match(style.transform, /translate\(20px, 0px\)/);
});

test("transform composition — base framing preserved under motion", () => {
  const base = { x: 10, y: 20, scale: 2, rotation: 5 };
  const state = resolveMediaMotionState({
    motion: {
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      intensity: 1,
    },
    baseTransform: base,
    sceneProgress: 1,
  });
  assert.equal(state.transform.x, 10);
  assert.equal(state.transform.y, 20);
  assert.equal(state.transform.rotation, 5);
  assert.ok(Math.abs(state.transform.scale - 2.32) < 0.001);

  const style = toPreviewMotionStyle(state, 540, 960);
  assert.match(style.transform, /translate\(5px, 10px\)/);
  assert.match(style.transform, /rotate\(5deg\)/);
});

test("transition composition stays separate — adapter has no transition imports", () => {
  const adapter = readSrc(
    "src/features/editor/preview/motion/previewMotionAdapter.ts",
  );
  assert.doesNotMatch(adapter, /TransitionOverlay|resolveTransition|transitionStateToPreview/);
  assert.match(adapter, /resolveMediaMotionStateForSceneTiming/);
});

test("scene local time clamp + resolve from timeline", () => {
  assert.equal(clampPreviewSceneLocalTimeMs(-10, 4000), 0);
  assert.equal(clampPreviewSceneLocalTimeMs(5000, 4000), 4000);
  assert.equal(clampPreviewSceneLocalTimeMs(1500, 0), 0);
  assert.equal(
    resolvePreviewSceneLocalTimeMs({
      timelineTimeMs: 5500,
      sceneStartMs: 4000,
      sceneDurationMs: 3000,
    }),
    1500,
  );
});

test("zero-duration / invalid duration falls back safely", () => {
  const scene = baseScene({
    durationMs: 0,
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 0, y: 0, scale: 1.5, rotation: 0 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
      },
    },
  });
  const style = resolvePreviewMediaMotionStyle({
    scene,
    sceneElapsedMs: 100,
    sceneDurationMs: 0,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  // progress 0 → start delta (scale 1) composed onto base 1.5
  assert.match(style.transform, /scale\(1\.5\)/);
});

test("base transform helper prefers media.transform for video", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:v",
      durationMs: 3000,
      transform: { x: 3, y: 4, scale: 1.1, rotation: 2 },
    },
  });
  assert.deepEqual(resolvePreviewMediaBaseTransform(scene), {
    x: 3,
    y: 4,
    scale: 1.1,
    rotation: 2,
  });
});

test("base transform prefers scene.image over stale media.transform for images", () => {
  const scene = baseScene({
    image: {
      url: "blob:img",
      x: 50,
      y: -20,
      scale: 1.3,
      rotation: 0,
      fitMode: "fill",
    },
    media: {
      type: "image",
      url: "blob:img",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
  });
  assert.deepEqual(resolvePreviewMediaBaseTransform(scene), {
    x: 50,
    y: -20,
    scale: 1.3,
    rotation: 0,
  });
});

const NEUTRAL_EXPECT = "translate(0px, 0px) scale(1) rotate(0deg)";

test("neutral helper matches identity CSS", () => {
  const style = getNeutralPreviewMotionStyle();
  assert.equal(style.transform, NEUTRAL_EXPECT);
  assert.equal(style.opacity, 1);
});

test("preview components wire shared engine; export uses export motion adapter", () => {
  const image = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  const media = readSrc("src/features/editor/components/SceneFrameMedia.tsx");
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const exportRenderer = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );

  assert.match(image, /resolvePreviewMediaMotionStyle|@\/features\/editor\/preview\/motion/);
  assert.match(video, /resolvePreviewMediaMotionStyle|@\/features\/editor\/preview\/motion/);
  assert.match(media, /sceneDurationMs/);
  assert.match(previewFrame, /sceneDurationMs/);
  assert.doesNotMatch(image, /resolveSceneImageMotionTransformState/);
  assert.doesNotMatch(video, /resolveSceneImageMotionTransformState/);
  assert.match(exportRenderer, /resolveExportMediaMotionTransform|@\/features\/editor\/export\/motion/);
  assert.doesNotMatch(exportRenderer, /resolveSceneImageMotionTransformState/);
});

test("adapter does not duplicate easing or interpolation", () => {
  const adapter = readSrc(
    "src/features/editor/preview/motion/previewMotionAdapter.ts",
  );
  assert.doesNotMatch(adapter, /function lerp|ease-in-out|applyMediaMotionEasing/);
  assert.doesNotMatch(adapter, /from ["']react["']/);
});

console.log("\nAll preview motion checks passed.");
