import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveExportMediaMotionTransform } from "@/features/editor/export/motion";
import { resolvePreviewMediaMotionStyle } from "@/features/editor/preview/motion";
import {
  resolveRenderedMediaMotion,
  type RenderedMediaMotionState,
} from "@/features/media-motion";
import type { FootieScene, SceneMediaMotion, SceneMediaTransform } from "@/features/story/types";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const base: SceneMediaTransform = { x: 100, y: -50, scale: 1.2, rotation: 10 };
const motion: SceneMediaMotion = {
  version: 1,
  enabled: true,
  presetId: "slow-zoom-in",
  easing: "linear",
  intensity: 1,
  startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
  endTransform: { x: 0, y: 0, scale: 1.1, rotation: 0 },
  keyframes: [
    { offsetMs: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, easing: "ease-in" },
    { offsetMs: 1000, x: 100, y: 200, scale: 1.5, rotation: 20, opacity: 0.4, easing: "linear" },
  ],
};
const scene: FootieScene = {
  id: "scene",
  start: 0,
  end: 1,
  duration: 1,
  startMs: 0,
  endMs: 1000,
  durationMs: 1000,
  subtitle: "",
  narration: "",
  media: { type: "image", url: "https://example.com/a.jpg", source: "upload", transform: base, motion },
  image: { url: "https://example.com/a.jpg", ...base, fitMode: "fill" },
};

function rendered(
  elapsed: number,
  duration = 1000,
  options: {
    keyframedVisualEffectsEnabled?: boolean;
    motionOverride?: SceneMediaMotion;
  } = {},
): RenderedMediaMotionState {
  return resolveRenderedMediaMotion({
    motion: options.motionOverride ?? motion,
    baseTransform: base,
    itemElapsedMs: elapsed,
    mediaWindowDurationMs: duration,
    keyframedVisualEffectsEnabled: options.keyframedVisualEffectsEnabled !== false,
  });
}

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function main(): void {
  console.log("\nmedia-motion-keyframes-render-parity\n");

  test("shared, preview, and export samples agree at key timing points", () => {
    for (const elapsed of [0, 500, 750, 1000]) {
      const shared = rendered(elapsed);
      const preview = resolvePreviewMediaMotionStyle({
        scene,
        motion,
        sceneElapsedMs: elapsed,
        sceneDurationMs: 1000,
        frameWidth: 1080,
        frameHeight: 1920,
        keyframedVisualEffectsEnabled: true,
      });
      const exported = resolveExportMediaMotionTransform({
        scene,
        motion,
        sceneElapsedMs: elapsed,
        sceneDurationMs: 1000,
        frameWidth: 1080,
        frameHeight: 1920,
        keyframedVisualEffectsEnabled: true,
      });
      assert.equal(exported.referenceTransform.x, shared.transform.x);
      assert.equal(exported.referenceTransform.y, shared.transform.y);
      assert.equal(exported.opacity, shared.opacity);
      assert.match(
        preview.transform,
        new RegExp(`translate\\(${shared.transform.x}px, ${shared.transform.y}px\\)`),
      );
      assert.equal(preview.opacity, shared.opacity);
    }
  });

  test("reference-frame translations scale across 720p, 1080p, and 4K", () => {
    const shared = rendered(1000);
    for (const [width, height] of [
      [720, 1280],
      [1080, 1920],
      [2160, 3840],
    ]) {
      const exported = resolveExportMediaMotionTransform({
        scene,
        motion,
        sceneElapsedMs: 1000,
        sceneDurationMs: 1000,
        frameWidth: width,
        frameHeight: height,
        keyframedVisualEffectsEnabled: true,
      });
      assert.ok(Math.abs(exported.translateX - (shared.transform.x * width) / 1080) < 1e-9);
      assert.ok(Math.abs(exported.translateY - (shared.transform.y * height) / 1920) < 1e-9);
    }
  });

  test("keyframes compose rotation and scale with framing and return opacity", () => {
    const state = rendered(1000);
    assert.equal(state.transform.x, 200);
    assert.equal(state.transform.y, 150);
    assert.ok(Math.abs(state.transform.scale - 1.8) < 1e-9);
    assert.equal(state.transform.rotation, 30);
    assert.equal(state.opacity, 0.4);
    assert.equal(state.authority, "keyframes");
    const off = resolveRenderedMediaMotion({
      motion,
      baseTransform: base,
      itemElapsedMs: 1000,
      mediaWindowDurationMs: 1000,
      keyframedVisualEffectsEnabled: false,
    });
    assert.equal(off.opacity, 1);
    assert.equal(off.authority, "preset");
  });

  test("authority matrix: disabled motion ignores keyframes even when capability on", () => {
    const disabled: SceneMediaMotion = { ...motion, enabled: false };
    const state = rendered(1000, 1000, {
      keyframedVisualEffectsEnabled: true,
      motionOverride: disabled,
    });
    assert.equal(state.authority, "preset");
    assert.equal(state.active, false);
    assert.equal(state.opacity, 1);
    assert.deepEqual(state.transform, base);

    const capOff = rendered(1000, 1000, {
      keyframedVisualEffectsEnabled: false,
      motionOverride: motion,
    });
    assert.equal(capOff.authority, "preset");

    const insufficient: SceneMediaMotion = {
      ...motion,
      keyframes: [motion.keyframes![0]!],
    };
    const legacyFallback = rendered(1000, 1000, {
      keyframedVisualEffectsEnabled: true,
      motionOverride: insufficient,
    });
    assert.equal(legacyFallback.authority, "preset");
    assert.equal(legacyFallback.active, true);
  });

  test("mixed-media local clocks reset progress per media window", () => {
    const first = rendered(500, 1000);
    const second = rendered(250, 500);
    assert.equal(first.progress, 0.5);
    assert.equal(second.progress, 0.5);
    assert.equal(first.transform.x, second.transform.x);
  });

  test("adjacent mixed-media items isolate rotation opacity and translation", () => {
    const itemA: SceneMediaMotion = {
      ...motion,
      keyframes: [
        { offsetMs: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, easing: "linear" },
        { offsetMs: 1000, x: 80, y: -40, scale: 1.2, rotation: 15, opacity: 0.7, easing: "linear" },
      ],
    };
    const itemB: SceneMediaMotion = {
      ...motion,
      keyframes: [
        { offsetMs: 0, x: -50, y: 60, scale: 1, rotation: -10, opacity: 0.9, easing: "linear" },
        { offsetMs: 1000, x: 20, y: 10, scale: 1.4, rotation: 25, opacity: 0.3, easing: "linear" },
      ],
    };
    const endA = resolveRenderedMediaMotion({
      motion: itemA,
      baseTransform: base,
      itemElapsedMs: 1000,
      mediaWindowDurationMs: 1000,
      keyframedVisualEffectsEnabled: true,
    });
    const startB = resolveRenderedMediaMotion({
      motion: itemB,
      baseTransform: base,
      itemElapsedMs: 0,
      mediaWindowDurationMs: 1000,
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(endA.authority, "keyframes");
    assert.equal(startB.authority, "keyframes");
    assert.notEqual(endA.transform.x, startB.transform.x);
    assert.notEqual(endA.transform.rotation, startB.transform.rotation);
    assert.notEqual(endA.opacity, startB.opacity);
    // Boundary sample for B must use B's first keyframe, not A's end state.
    assert.equal(startB.transform.x, base.x + -50);
    assert.equal(startB.transform.rotation, (base.rotation ?? 0) + -10);
    assert.equal(startB.opacity, 0.9);
  });

  test("rendering boundaries multiply opacity and isolate canvas state", () => {
    const renderer = read("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(renderer, /ctx\.save\(\)/);
    assert.match(renderer, /ctx\.globalAlpha \*= opacity/);
    assert.match(renderer, /ctx\.restore\(\)/);

    const transition = read("src/features/export/utils/export-transition-canvas.utils.ts");
    assert.match(transition, /ctx\.save\(\)/);
    assert.match(transition, /ctx\.globalAlpha = layer\.opacity/);
    assert.match(transition, /ctx\.restore\(\)/);

    const previewAdapter = read("src/features/editor/preview/motion/previewMotionAdapter.ts");
    assert.match(previewAdapter, /resolveRenderedMediaMotion/);
    assert.match(previewAdapter, /opacity: state\?\.opacity \?\? 1/);

    const image = read("src/features/editor/components/SceneFrameImage.tsx");
    const video = read("src/features/editor/components/SceneFrameVideo.tsx");
    assert.match(image, /resolvePreviewMediaMotionStyle/);
    assert.match(video, /resolvePreviewMediaMotionStyle/);
    // Motion opacity lands on the media element; transition styles are applied
    // by the preview layer planner on a parent wrapper (CSS multiplies).
    const layerPlan = read(
      "src/features/scene-media-transitions/preview/plan-preview-media-layers.ts",
    );
    assert.match(layerPlan, /style: composition\.layerStyles/);
    assert.match(
      read("src/features/preview/components/PreviewFrame.tsx"),
      /style=\{mediaLayerPlan\.(outgoing|primary)\.style\}/,
    );

    assert.match(
      read("src/features/editor/export/motion/exportMotionAdapter.ts"),
      /resolveRenderedMediaMotion/,
    );
    assert.doesNotMatch(
      read("src/features/media-motion/media-motion.engine.ts"),
      /keyframes/,
    );
  });

  test("capability loading defaults keep preview on legacy until explicit true", () => {
    const image = read("src/features/editor/components/SceneFrameImage.tsx");
    const video = read("src/features/editor/components/SceneFrameVideo.tsx");
    const context = read(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.match(image, /useKeyframedVisualEffectsEnabled/);
    assert.match(video, /useKeyframedVisualEffectsEnabled/);
    assert.match(context, /keyframedVisualEffectsEnabled: false/);
    assert.match(
      read("src/features/editor/preview/motion/previewMotionAdapter.ts"),
      /keyframedVisualEffectsEnabled: input\.keyframedVisualEffectsEnabled === true/,
    );
    // Adoption is boolean-only; adapters do not seek/select on capability flips.
    assert.doesNotMatch(image, /currentTime\s*=/);
    assert.doesNotMatch(image, /scrollIntoView|focus\(/);
  });

  console.log(`\n${passed} passed\n`);
}
main();
