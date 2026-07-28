/**
 * Persistent video framing — playback/trim isolation + position persistence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyMediaFramingSettings,
  applyResetMediaFramingSettings,
} from "@/lib/utils/voiceover";
import {
  buildMediaFramingPatch,
  resolveSceneMediaFraming,
} from "@/features/media-framing";
import { resolvePreviewMediaBaseTransform } from "@/features/editor/preview/motion";
import { buildVideoTrimPatch } from "@/features/media-playback";
import type { FootieScene, FootieScript } from "@/features/story/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function baseVideoScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-vid",
    start: 0,
    end: 5,
    duration: 5,
    durationMs: 5000,
    narration: "Video scene",
    subtitle: "Video scene",
    media: {
      type: "video",
      url: "blob:video",
      source: "upload",
      durationMs: 8000,
      trimStartMs: 500,
      trimEndMs: 4500,
      muted: true,
      fitMode: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    ...overrides,
  };
}

function baseScript(scene: FootieScene): FootieScript {
  return {
    title: "Video framing",
    narration: "Video scene",
    totalDuration: scene.duration,
    scenes: [scene],
  };
}

console.log("\nmedia-framing-video\n");

test("video drag patch persists media.transform only", () => {
  const scene = baseVideoScene();
  const result = buildMediaFramingPatch(scene, {
    positionX: 90,
    positionY: -60,
    zoom: 1.35,
    fitMode: "fit",
  });
  assert.ok(result);
  assert.equal(result!.patch.image, undefined);
  assert.equal(result!.patch.media?.transform?.x, 90);
  assert.equal(result!.patch.media?.transform?.y, -60);
  assert.equal(result!.patch.media?.transform?.scale, 1.35);
  assert.equal(result!.patch.media?.fitMode, "contain");
  // Playback / trim untouched
  assert.equal(result!.patch.media?.trimStartMs, 500);
  assert.equal(result!.patch.media?.trimEndMs, 4500);
  assert.equal(result!.patch.media?.durationMs, 8000);
  assert.equal(result!.patch.media?.muted, true);
});

test("applyMediaFramingSettings does not alter scene duration or trim", () => {
  const scene = baseVideoScene();
  const script = applyMediaFramingSettings(baseScript(scene), "scene-vid", {
    x: 40,
    y: 10,
    scale: 1.5,
    fitMode: "fill",
  });
  const next = script.scenes[0]!;
  assert.equal(next.durationMs, 5000);
  assert.equal(next.media?.trimStartMs, 500);
  assert.equal(next.media?.trimEndMs, 4500);
  assert.equal(next.media?.durationMs, 8000);
  assert.equal(next.media?.transform?.x, 40);
  assert.equal(next.media?.fitMode, "cover");

  const framing = resolveSceneMediaFraming(next);
  assert.equal(framing.positionX, 40);
  assert.equal(framing.zoom, 1.5);
  assert.equal(framing.fitMode, "fill");
});

test("framing does not interfere with trim patch", () => {
  const framed = applyMediaFramingSettings(baseScript(baseVideoScene()), "scene-vid", {
    x: 25,
    y: -15,
  });
  const scene = framed.scenes[0]!;
  const trim = buildVideoTrimPatch(scene, { trimStartMs: 1000, trimEndMs: 4000 });
  assert.ok(trim);
  assert.equal(trim!.patch.media?.transform?.x, 25);
  assert.equal(trim!.patch.media?.transform?.y, -15);
  assert.equal(trim!.patch.media?.trimStartMs, 1000);
  assert.equal(trim!.patch.media?.trimEndMs, 4000);
});

test("fit / fill / zoom / reset for video", () => {
  let script = applyMediaFramingSettings(baseScript(baseVideoScene()), "scene-vid", {
    fitMode: "fit",
    scale: 1.8,
  });
  assert.equal(resolveSceneMediaFraming(script.scenes[0]!).fitMode, "fit");
  assert.equal(script.scenes[0]!.media?.fitMode, "contain");

  script = applyResetMediaFramingSettings(script, "scene-vid");
  const framing = resolveSceneMediaFraming(script.scenes[0]!);
  assert.equal(framing.positionX, 0);
  assert.equal(framing.positionY, 0);
  assert.equal(framing.zoom, 1);
  assert.equal(framing.fitMode, "fit");
});

test("preview base transform reads video media.transform", () => {
  const scene = baseVideoScene({
    media: {
      type: "video",
      url: "blob:video",
      durationMs: 8000,
      transform: { x: 33, y: 44, scale: 1.2, rotation: 5 },
      fitMode: "cover",
    },
  });
  assert.deepEqual(resolvePreviewMediaBaseTransform(scene), {
    x: 33,
    y: 44,
    scale: 1.2,
    rotation: 5,
  });
});

test("SceneFrameVideo uses transformOffset wrapper — not video currentTime for framing", () => {
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  assert.match(video, /transformOffset/);
  assert.match(video, /resolvePreviewMediaMotionStyle/);
  assert.match(video, /PersistentFramingLayer|absolute inset-0/);
  assert.doesNotMatch(video, /currentTime\s*=\s*.*transformOffset/);
});

test("video inspector exposes Framing section", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /MediaFramingInspectorControls/);
  assert.match(inspector, /onFramingChange/);
  assert.match(inspector, /Reposition|onReposition/);
});

test("canvas edit enables video overlay-only drag (no element recreate)", () => {
  const layer = readSrc("src/features/editor/components/EditorCanvasEditLayer.tsx");
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(layer, /overlayOnly/);
  assert.match(layer, /sceneHasFramableMedia/);
  assert.match(preview, /framingDragOffset/);
  assert.match(preview, /hideSceneImage=\{isFrameEditing && !isVideoScene\}/);
});

console.log(`\nmedia-framing-video: ${passed} passed\n`);
