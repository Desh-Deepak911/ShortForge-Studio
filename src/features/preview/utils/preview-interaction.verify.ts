/**
 * Preview interaction layer — 4.0E-4C
 * Run: npm run test:preview-interaction
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolvePreviewCaptionOverlayClassName,
  resolvePreviewImageEditLayerClassName,
  resolvePreviewInteractionLayer,
} from "@/features/preview/utils/preview-interaction-layer.utils";
import { resolvePreviewInteractionState } from "@/features/preview/utils/preview-interaction.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("caption edit mode enables caption pointer events for selected scene", () => {
  const layer = resolvePreviewInteractionLayer({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: false,
    imageEditActive: false,
  });
  assert.equal(layer.interactionMode, "caption_edit");
  assert.equal(layer.allowCaptionPointerEvents, true);
  assert.equal(layer.allowCaptionDrag, true);
  assert.equal(layer.allowImagePointerEvents, true);
  assert.equal(layer.allowImageEdit, true);
  assert.equal(resolvePreviewCaptionOverlayClassName(layer), "");
});

test("playback locks all editing interactions", () => {
  const layer = resolvePreviewInteractionLayer({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: true,
    imageEditActive: false,
  });
  assert.equal(layer.interactionMode, "playback");
  assert.equal(layer.allowCaptionPointerEvents, false);
  assert.equal(layer.allowImagePointerEvents, false);
  assert.equal(layer.allowCaptionDrag, false);
  assert.equal(layer.allowImageEdit, false);
  assert.match(resolvePreviewCaptionOverlayClassName(layer), /pointer-events-none/);
});

test("image edit mode wins over caption drag", () => {
  const layer = resolvePreviewInteractionLayer({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: false,
    imageEditActive: true,
  });
  assert.equal(layer.interactionMode, "image_edit");
  assert.equal(layer.allowCaptionPointerEvents, false);
  assert.equal(layer.allowCaptionDrag, false);
  assert.equal(layer.allowImagePointerEvents, true);
  assert.equal(layer.allowImageEdit, true);
  assert.match(resolvePreviewCaptionOverlayClassName(layer), /pointer-events-none/);
  assert.match(resolvePreviewCaptionOverlayClassName(layer), /opacity-55/);
  assert.match(resolvePreviewImageEditLayerClassName(layer), /z-\[18\]/);
});

test("passive mode for non-selected scene without blocking pointer pass-through", () => {
  const layer = resolvePreviewInteractionLayer({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s2",
    playbackActive: false,
    imageEditActive: false,
  });
  assert.equal(layer.interactionMode, "passive");
  assert.equal(layer.allowCaptionDrag, false);
  assert.equal(layer.allowCaptionPointerEvents, false);
  assert.equal(resolvePreviewCaptionOverlayClassName(layer), "pointer-events-none");
  assert.match(resolvePreviewImageEditLayerClassName(layer), /z-\[4\]/);
});

test("legacy interaction state maps from interaction layer", () => {
  const layer = resolvePreviewInteractionLayer({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: false,
    imageEditActive: true,
  });
  const legacy = resolvePreviewInteractionState({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: false,
    imageEditActive: true,
  });
  assert.equal(legacy.captionDragEnabled, layer.allowCaptionDrag);
  assert.equal(legacy.captionInteractionLocked, !layer.allowCaptionPointerEvents);
});

test("video preview wires interaction layer resolver", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(videoPreview, /resolvePreviewInteractionLayer/);
  assert.match(videoPreview, /resolvePreviewCaptionOverlayClassName/);
  assert.match(videoPreview, /resolvePreviewImageEditLayerClassName/);
  assert.match(videoPreview, /allowPointerEvents=\{previewInteraction\.allowCaptionPointerEvents\}/);
  assert.match(videoPreview, /allowPointerEvents=\{previewInteraction\.allowImagePointerEvents\}/);
  assert.doesNotMatch(videoPreview, /isCaptionDragEnabled/);
});

test("caption drag overlay uses explicit pointer-events gate", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /pointer-events-none absolute inset-0 z-\[15\]/);
  assert.match(overlay, /captionInteractive/);
  assert.match(overlay, /pointerEvents: captionInteractive \? "auto" : "none"/);
  assert.doesNotMatch(overlay, /hasCaptionLayoutOverride/);
});

test("caption preview overlay uses engine layout unless actively dragging", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /usesEnginePlacement = isDragging \|\| draftOffsets != null/);
  assert.match(overlay, /resolvePreviewCaptionLayoutForScene/);
});

console.log(`\npreview-interaction: ${passed} passed`);
