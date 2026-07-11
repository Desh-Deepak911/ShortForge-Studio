/**
 * Persistent image framing — snap-back regression + StoryDocument commit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMediaFramingSettings, applyResetMediaFramingSettings } from "@/lib/utils/voiceover";
import {
  buildMediaFramingPatch,
  resolveSceneMediaFraming,
  resolveSceneMediaFramingTransform,
} from "@/features/media-framing";
import { resolvePreviewMediaBaseTransform } from "@/features/editor/preview/motion";
import { resolveExportMediaBaseTransform } from "@/features/editor/export/motion";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { applyReferencePanFromScreenDelta, updateSceneImageSettings } from "@/features/story/utils";

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

function baseImageScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-img",
    start: 0,
    end: 4,
    duration: 4,
    durationMs: 4000,
    narration: "Image scene",
    image: {
      url: "blob:image",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fitMode: "fill",
    },
    media: {
      type: "image",
      url: "blob:image",
      source: "upload",
      fitMode: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    ...overrides,
  };
}

function baseScript(scene: FootieScene): FootieScript {
  return {
    title: "Framing",
    scenes: [scene],
  };
}

console.log("\nmedia-framing-image\n");

test("snap-back regression: stale media.transform no longer wins over scene.image", () => {
  const scene = baseImageScene({
    image: {
      url: "blob:image",
      x: 120,
      y: -40,
      scale: 1.4,
      rotation: 0,
      fitMode: "fill",
    },
    media: {
      type: "image",
      url: "blob:image",
      source: "upload",
      fitMode: "cover",
      // Stale upload values — historically caused snap-back after drag.
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
  });

  const framing = resolveSceneMediaFraming(scene);
  assert.equal(framing.positionX, 120);
  assert.equal(framing.positionY, -40);
  assert.equal(framing.zoom, 1.4);

  const preview = resolvePreviewMediaBaseTransform(scene);
  assert.equal(preview.x, 120);
  assert.equal(preview.y, -40);
  assert.equal(preview.scale, 1.4);

  const exportBase = resolveExportMediaBaseTransform(scene);
  assert.equal(exportBase.x, 120);
  assert.equal(exportBase.y, -40);
});

test("drag delta commit dual-writes scene.image and scene.media.transform", () => {
  const scene = baseImageScene();
  const nextPan = applyReferencePanFromScreenDelta(0, 0, 54, -96, 270, 480);
  const result = buildMediaFramingPatch(scene, {
    positionX: nextPan.x,
    positionY: nextPan.y,
  });
  assert.ok(result);
  assert.equal(result!.patch.image?.x, nextPan.x);
  assert.equal(result!.patch.image?.y, nextPan.y);
  assert.equal(result!.patch.media?.transform?.x, nextPan.x);
  assert.equal(result!.patch.media?.transform?.y, nextPan.y);

  const script = applyMediaFramingSettings(baseScript(scene), scene.id, nextPan);
  const committed = script.scenes[0]!;
  assert.equal(committed.image?.x, nextPan.x);
  assert.equal(committed.media?.transform?.x, nextPan.x);
  assert.deepEqual(resolveSceneMediaFramingTransform(committed), {
    x: nextPan.x,
    y: nextPan.y,
    scale: 1,
    rotation: 0,
  });
});

test("updateSceneImageSettings dual-writes media.transform (legacy write path)", () => {
  const scenes = updateSceneImageSettings([baseImageScene()], "scene-img", {
    x: 50,
    y: 25,
    scale: 1.2,
  });
  const scene = scenes[0]!;
  assert.equal(scene.image?.x, 50);
  assert.equal(scene.media?.transform?.x, 50);
  assert.equal(scene.media?.transform?.scale, 1.2);
  assert.equal(scene.media?.fitMode, "cover");
});

test("fit / fill / zoom / reset", () => {
  let script = applyMediaFramingSettings(baseScript(baseImageScene()), "scene-img", {
    fitMode: "fit",
    scale: 2,
    x: 10,
    y: 20,
  });
  let framing = resolveSceneMediaFraming(script.scenes[0]!);
  assert.equal(framing.fitMode, "fit");
  assert.equal(framing.zoom, 2);
  assert.equal(script.scenes[0]!.media?.fitMode, "contain");

  script = applyResetMediaFramingSettings(script, "scene-img");
  framing = resolveSceneMediaFraming(script.scenes[0]!);
  assert.equal(framing.positionX, 0);
  assert.equal(framing.positionY, 0);
  assert.equal(framing.zoom, 1);
  assert.equal(framing.rotationDeg, 0);
  assert.equal(framing.fitMode, "fit");
});

test("undo/redo style: sequential patches restore prior framing", () => {
  const original = baseImageScene();
  const afterDrag = applyMediaFramingSettings(baseScript(original), "scene-img", {
    x: 80,
    y: -30,
  });
  const undone = applyMediaFramingSettings(afterDrag, "scene-img", {
    x: original.image!.x,
    y: original.image!.y,
  });
  assert.equal(undone.scenes[0]!.image?.x, 0);
  assert.equal(undone.scenes[0]!.media?.transform?.x, 0);
});

test("MediaPicker commits on pointer release; drag state is temporary", () => {
  const picker = readSrc("src/features/editor/components/MediaPicker.tsx");
  assert.match(picker, /dragOffset/);
  assert.match(picker, /onPointerUp/);
  assert.match(picker, /onPointerCancel/);
  assert.match(picker, /onLostPointerCapture/);
  assert.match(picker, /setPointerCapture/);
  assert.match(picker, /onTransformChange\(nextPan\)/);
  assert.match(picker, /resolveSceneMediaFraming/);
});

test("image inspector exposes framing controls synchronized with canonical values", () => {
  const inspector = readSrc("src/features/editor/components/SceneImageInspector.tsx");
  assert.match(inspector, /MediaFramingInspectorControls/);
  assert.match(inspector, /onPositionChange/);
  assert.match(inspector, /positionX/);
});

console.log(`\nmedia-framing-image: ${passed} passed\n`);
