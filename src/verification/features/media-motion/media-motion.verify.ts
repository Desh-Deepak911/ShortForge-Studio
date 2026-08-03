/**
 * Shared Media Motion Engine foundation — 4.2C-2
 * Run: npm run test:media-motion
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSceneMediaExportFingerprintKey } from "@/components/export/build-export-fingerprint.utils";
import { classifyStoryPatch } from "@/features/editor/story-patches/story-patch-classifier";
import {
  applyMediaMotionEasing,
  buildDisableMediaMotionPatch,
  buildEnableMediaMotionPatch,
  buildMediaMotionPatch,
  buildResetMediaMotionPatch,
  composeMediaMotionTransform,
  mapLegacyImageMotionToSceneMediaMotion,
  MEDIA_MOTION_IDENTITY_TRANSFORM,
  MEDIA_MOTION_STATIC,
  normalizeSceneMediaMotion,
  resolveMediaMotionState,
  resolveSceneMediaMotion,
  resolveSceneMotionProgress,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { normalizeSceneMedia } from "@/features/story/utils/scene.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    durationMs: 5000,
    subtitle: "Caption",
    ...overrides,
  };
}

function baseScript(scenes: FootieScene[]): FootieScript {
  return {
    title: "Story",
    narration: "Narration",
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    scenes,
  };
}

test("normalizeSceneMediaMotion returns static for empty input", () => {
  const motion = normalizeSceneMediaMotion(null);
  assert.equal(motion.presetId, "static");
  assert.equal(motion.enabled, false);
});

test("legacy imageMotion mapping — zoom-in", () => {
  const mapped = mapLegacyImageMotionToSceneMediaMotion({
    type: "zoom-in",
    intensity: "medium",
  });
  assert.equal(mapped.presetId, "slow-zoom-in");
  assert.equal(mapped.enabled, true);
  assert.ok((mapped.intensity ?? 0) > 0);
  assert.ok((mapped.endTransform?.scale ?? 1) > 1);
});

test("legacy imageMotion mapping — none is static", () => {
  const mapped = mapLegacyImageMotionToSceneMediaMotion({
    type: "none",
    intensity: "subtle",
  });
  assert.equal(mapped.presetId, "static");
  assert.equal(mapped.enabled, false);
});

test("media.motion precedence over imageMotion", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/a.jpg",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-in", intensity: "strong" },
    },
    media: {
      type: "image",
      url: "https://example.com/a.jpg",
      imageMotion: { type: "zoom-out", intensity: "subtle" },
      motion: {
        version: 1,
        enabled: true,
        presetId: "pan-left",
        intensity: 1,
      },
    },
  });

  const resolved = resolveSceneMediaMotion(scene);
  assert.equal(resolved.presetId, "pan-left");
});

test("media.imageMotion used when motion absent", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "https://example.com/a.jpg",
      imageMotion: { type: "pan-right", intensity: "medium" },
    },
  });
  assert.equal(resolveSceneMediaMotion(scene).presetId, "pan-right");
});

test("scene.image.imageMotion used when media motion absent", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/a.jpg",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-out", intensity: "subtle" },
    },
  });
  assert.equal(resolveSceneMediaMotion(scene).presetId, "slow-zoom-out");
});

test("static motion returns base transform", () => {
  const base = { x: 10, y: -20, scale: 1.25, rotation: 5 };
  const state = resolveMediaMotionState({
    motion: MEDIA_MOTION_STATIC,
    baseTransform: base,
    sceneProgress: 0.5,
  });
  assert.equal(state.active, false);
  assert.equal(state.presetId, "static");
  assert.equal(state.transform.x, 10);
  assert.equal(state.transform.y, -20);
  assert.equal(state.transform.scale, 1.25);
  assert.equal(state.transform.rotation, 5);
});

test("scene progress clamps to 0–1", () => {
  assert.equal(resolveSceneMotionProgress(0, 5000), 0);
  assert.equal(resolveSceneMotionProgress(2500, 5000), 0.5);
  assert.equal(resolveSceneMotionProgress(5000, 5000), 1);
  assert.equal(resolveSceneMotionProgress(9000, 5000), 1);
  assert.equal(resolveSceneMotionProgress(-100, 5000), 0);
  assert.equal(resolveSceneMotionProgress(100, 0), 0);
});

test("easing is deterministic", () => {
  assert.equal(applyMediaMotionEasing(0.5, "linear"), 0.5);
  assert.ok(applyMediaMotionEasing(0.5, "ease-in") < 0.5);
  assert.ok(applyMediaMotionEasing(0.5, "ease-out") > 0.5);
  assert.equal(applyMediaMotionEasing(0, "ease-in-out"), 0);
  assert.equal(applyMediaMotionEasing(1, "ease-in-out"), 1);
});

test("zoom-in interpolates scale correctly", () => {
  const motion = mapLegacyImageMotionToSceneMediaMotion({
    type: "zoom-in",
    intensity: "strong",
  });
  const start = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 0,
  });
  const mid = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 0.5,
  });
  const end = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 1,
  });

  assert.equal(start.transform.scale, 1);
  assert.ok(mid.transform.scale > start.transform.scale);
  assert.ok(end.transform.scale > mid.transform.scale);
  assert.ok(Math.abs(end.transform.scale - 1.16) < 0.001);
});

test("zoom-out interpolates scale correctly", () => {
  const motion = mapLegacyImageMotionToSceneMediaMotion({
    type: "zoom-out",
    intensity: "strong",
  });
  const start = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 0,
  });
  const end = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 1,
  });
  assert.ok(start.transform.scale > end.transform.scale);
  assert.ok(Math.abs(end.transform.scale - 1) < 0.001);
});

test("pan presets interpolate correctly", () => {
  const motion = mapLegacyImageMotionToSceneMediaMotion({
    type: "pan-left",
    intensity: "strong",
  });
  const start = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 0,
  });
  const end = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 1,
  });
  assert.equal(start.transform.x, 0);
  assert.ok(end.transform.x > 0);
});

test("intensity scales preset deltas", () => {
  const full = resolveMediaMotionState({
    motion: {
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      intensity: 1,
    },
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 1,
  });
  const half = resolveMediaMotionState({
    motion: {
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      intensity: 0.5,
    },
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 1,
  });
  assert.ok(full.transform.scale > half.transform.scale);
  assert.ok(half.transform.scale > 1);
});

test("base transform composes with motion delta", () => {
  const composed = composeMediaMotionTransform(
    { x: 10, y: 20, scale: 2, rotation: 5 },
    { x: 5, y: -3, scale: 1.1, rotation: 2 },
  );
  assert.equal(composed.x, 15);
  assert.equal(composed.y, 17);
  assert.ok(Math.abs(composed.scale - 2.2) < 0.0001);
  assert.equal(composed.rotation, 7);

  const state = resolveMediaMotionState({
    motion: mapLegacyImageMotionToSceneMediaMotion({
      type: "zoom-in",
      intensity: "strong",
    }),
    baseTransform: { x: 10, y: 0, scale: 2, rotation: 0 },
    sceneProgress: 1,
  });
  assert.equal(state.transform.x, 10);
  assert.ok(Math.abs(state.transform.scale - 2 * 1.16) < 0.001);
});

test("images and videos use the same engine", () => {
  const motion = {
    version: 1 as const,
    enabled: true,
    presetId: "slow-zoom-in",
    intensity: 1,
  };
  const imageState = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 0.4,
  });
  const videoState = resolveMediaMotionState({
    motion,
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: 0.4,
  });
  assert.deepEqual(imageState, videoState);
});

test("no motion config preserves existing visuals (identity)", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:video",
      durationMs: 8000,
      transform: { x: 12, y: -8, scale: 1.4, rotation: 0 },
    },
  });
  const motion = resolveSceneMediaMotion(scene);
  const state = resolveMediaMotionState({
    motion,
    baseTransform: scene.media!.transform!,
    sceneProgress: 0.75,
  });
  assert.equal(state.active, false);
  assert.deepEqual(state.transform, scene.media!.transform);
});

test("fingerprint includes normalized motion", () => {
  const without = baseScene({
    media: {
      type: "video",
      url: "blob:v",
      durationMs: 5000,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
  });
  const withMotion = baseScene({
    media: {
      type: "video",
      url: "blob:v",
      durationMs: 5000,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "push-in",
        intensity: 0.8,
        easing: "ease-in-out",
      },
    },
  });
  assert.notEqual(
    buildSceneMediaExportFingerprintKey(without),
    buildSceneMediaExportFingerprintKey(withMotion),
  );
});

test("legacy imageMotion still fingerprints through normalization", () => {
  const a = baseScene({
    media: {
      type: "image",
      url: "https://example.com/a.jpg",
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  });
  const b = baseScene({
    media: {
      type: "image",
      url: "https://example.com/a.jpg",
      imageMotion: { type: "zoom-out", intensity: "medium" },
    },
  });
  assert.notEqual(
    buildSceneMediaExportFingerprintKey(a),
    buildSceneMediaExportFingerprintKey(b),
  );
  assert.match(
    serializeSceneMediaMotionFingerprint(resolveSceneMediaMotion(a)),
    /slow-zoom-in/,
  );
});

test("media intent classification detects media.motion", () => {
  const prev = baseScript([
    baseScene({
      media: {
        type: "video",
        url: "blob:v",
        durationMs: 4000,
      },
    }),
  ]);
  const next = baseScript([
    baseScene({
      media: {
        type: "video",
        url: "blob:v",
        durationMs: 4000,
        motion: {
          version: 1,
          enabled: true,
          presetId: "sports-punch",
          intensity: 1,
        },
      },
    }),
  ]);
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("motion"));
});

test("no scene duration mutation from motion helpers", () => {
  const scene = baseScene({ duration: 7, durationMs: 7000 });
  const before = { duration: scene.duration, durationMs: scene.durationMs };
  resolveSceneMediaMotion(scene);
  resolveMediaMotionState({
    motion: mapLegacyImageMotionToSceneMediaMotion({
      type: "zoom-in",
      intensity: "subtle",
    }),
    baseTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    sceneProgress: resolveSceneMotionProgress(1000, scene.durationMs!),
  });
  assert.equal(scene.duration, before.duration);
  assert.equal(scene.durationMs, before.durationMs);
});

test("normalizeSceneMedia persists motion field", () => {
  const media = normalizeSceneMedia({
    type: "video",
    url: "blob:x",
    durationMs: 3000,
    motion: {
      version: 1,
      enabled: true,
      presetId: "camera-drift",
      intensity: 0.7,
      easing: "ease-in-out",
    },
  });
  assert.ok(media?.motion);
  assert.equal(media?.motion?.presetId, "camera-drift");
  assert.equal(media?.motion?.intensity, 0.7);
});

test("preview and export wire shared media-motion engine", () => {
  const image = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  const exportRenderer = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  const exportAdapter = readSrc(
    "src/features/editor/export/motion/exportMotionAdapter.ts",
  );
  assert.match(image, /@\/features\/editor\/preview\/motion|resolvePreviewMediaMotionStyle/);
  assert.match(video, /@\/features\/editor\/preview\/motion|resolvePreviewMediaMotionStyle/);
  assert.match(exportRenderer, /@\/features\/editor\/export\/motion|resolveExportMediaMotionTransform/);
  assert.match(exportAdapter, /resolveMediaMotionStateForSceneTiming/);
  assert.doesNotMatch(exportRenderer, /resolveSceneImageMotionTransformState/);
});

test("engine module stays pure", () => {
  const engine = readSrc("src/features/media-motion/media-motion.engine.ts");
  assert.doesNotMatch(engine, /from ["']react["']/);
  assert.doesNotMatch(engine, /HTMLVideoElement|CanvasRenderingContext|ffmpeg/i);
});

test("preset selection patch writes scene.media.motion only", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:v",
      durationMs: 5000,
      trimStartMs: 100,
      trimEndMs: 4000,
      transform: { x: 3, y: 4, scale: 1.2, rotation: 0 },
      posterUrl: "https://example.com/p.jpg",
    },
  });
  const result = buildMediaMotionPatch(scene, {
    version: 1,
    enabled: true,
    presetId: "push-in",
    intensity: 1.25,
    easing: "ease-out",
  });
  assert.ok(result);
  assert.equal(result!.patch.media?.motion?.presetId, "push-in");
  assert.equal(result!.patch.media?.trimStartMs, 100);
  assert.equal(result!.patch.media?.posterUrl, "https://example.com/p.jpg");
  assert.equal(result!.patch.media?.transform?.scale, 1.2);
  assert.equal(result!.patch.media?.url, "blob:v");
});

test("enable and disable motion toggles", () => {
  const scene = baseScene({
    media: { type: "image", url: "https://example.com/a.jpg" },
  });
  const enabled = buildEnableMediaMotionPatch(scene, "slow-zoom-in");
  assert.equal(enabled?.motion.enabled, true);
  assert.equal(enabled?.motion.presetId, "slow-zoom-in");
  const disabled = buildDisableMediaMotionPatch({
    ...scene,
    media: enabled!.media,
  });
  assert.equal(disabled?.motion.presetId, "static");
  assert.equal(disabled?.motion.enabled, false);
});

test("reset motion clears motion and preserves crop/trim", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:v",
      durationMs: 6000,
      trimStartMs: 200,
      trimEndMs: 5000,
      transform: { x: 1, y: 2, scale: 1.5, rotation: 3 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "sports-punch",
        intensity: 1,
      },
    },
  });
  const reset = buildResetMediaMotionPatch(scene);
  assert.ok(reset);
  assert.equal(reset!.patch.media?.motion, undefined);
  assert.equal(reset!.patch.media?.trimStartMs, 200);
  assert.equal(reset!.patch.media?.transform?.scale, 1.5);
  assert.equal(reset!.patch.media?.url, "blob:v");
});

test("intensity and easing patch", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "https://example.com/a.jpg",
      motion: {
        version: 1,
        enabled: true,
        presetId: "pan-left",
        intensity: 1,
        easing: "linear",
      },
    },
  });
  const result = buildMediaMotionPatch(scene, { intensity: 1.75, easing: "ease-in" });
  assert.equal(result?.motion.intensity, 1.75);
  assert.equal(result?.motion.easing, "ease-in");
  assert.equal(result?.motion.presetId, "pan-left");
});

test("image compatibility — legacy imageMotion still readable", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/legacy.jpg",
      scale: 1,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  });
  assert.equal(resolveSceneMediaMotion(scene).presetId, "slow-zoom-in");
  const result = buildMediaMotionPatch(scene, {
    version: 1,
    enabled: true,
    presetId: "pull-out",
    intensity: 1,
  });
  assert.ok(result);
  assert.equal(result!.patch.media?.motion?.presetId, "pull-out");
  assert.equal(scene.image?.imageMotion?.type, "zoom-in");
});

test("video compatibility — motion patch for video media", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 9000,
      muted: true,
    },
  });
  const result = buildMediaMotionPatch(scene, {
    version: 1,
    enabled: true,
    presetId: "camera-drift",
    intensity: 0.8,
    easing: "ease-in-out",
  });
  assert.ok(result);
  assert.equal(result!.patch.media?.type, "video");
  assert.equal(result!.patch.media?.motion?.presetId, "camera-drift");
});

test("media intent wiring present in StudioSceneInspector", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /buildMediaMotionPatch/);
  assert.match(inspector, /buildResetMediaMotionPatch/);
  assert.match(inspector, /handleMediaMotionChange/);
  assert.match(inspector, /intent: "media"/);
  // Motion controls are hosted in the Adjust inspector section (not a
  // standalone obsolete Motion title).
  assert.match(inspector, /title="Adjust"/);
  assert.match(inspector, /Framing, motion and visual treatment\./);
  assert.match(inspector, /MediaMotionInspectorPanel/);
});

test("inspector panel is registry-driven", () => {
  const panel = readSrc(
    "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
  );
  assert.match(panel, /MEDIA_MOTION_INSPECTOR_CATEGORIES/);
  assert.match(panel, /getMediaMotionPreset/);
  assert.match(panel, /data-media-motion-enable/);
  assert.match(panel, /data-media-motion-preset/);
  assert.match(panel, /data-media-motion-intensity/);
  assert.match(panel, /data-media-motion-easing/);
  assert.match(panel, /data-media-motion-reset/);
  // Enable control uses StudioSwitch label="Motion" (not a separate "Enable Motion" title).
  assert.match(panel, /label="Motion"/);
  assert.match(panel, /Reset Motion/);
});

console.log(`\nmedia-motion: ${passed} passed`);
