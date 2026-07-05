/**
 * Preview interaction layer manager — 4.0D-5C
 * Run: npm run test:preview-interaction
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolvePreviewCaptionOverlayClassName,
  resolvePreviewInteractionState,
} from "@/features/preview/utils/preview-interaction.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("normal preview enables caption drag for selected scene", () => {
  const state = resolvePreviewInteractionState({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: false,
    imageEditActive: false,
  });
  assert.equal(state.captionDragEnabled, true);
  assert.equal(state.captionInteractionLocked, false);
  assert.equal(state.captionLayerPointerEvents, "auto");
  assert.equal(resolvePreviewCaptionOverlayClassName(state), "");
});

test("playback locks caption interaction", () => {
  const state = resolvePreviewInteractionState({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: true,
    imageEditActive: false,
  });
  assert.equal(state.captionDragEnabled, false);
  assert.equal(state.captionInteractionLocked, true);
  assert.equal(state.captionLayerPointerEvents, "none");
  assert.match(resolvePreviewCaptionOverlayClassName(state), /pointer-events-none/);
});

test("image edit mode wins over caption drag", () => {
  const state = resolvePreviewInteractionState({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s1",
    playbackActive: false,
    imageEditActive: true,
  });
  assert.equal(state.captionDragEnabled, false);
  assert.equal(state.captionInteractionLocked, true);
  assert.equal(state.captionLayerPointerEvents, "none");
  assert.match(resolvePreviewCaptionOverlayClassName(state), /pointer-events-none/);
  assert.match(resolvePreviewCaptionOverlayClassName(state), /opacity-55/);
});

test("caption drag disabled for non-selected scene without blocking pointer pass-through", () => {
  const state = resolvePreviewInteractionState({
    canvasEditEnabled: true,
    sceneId: "s1",
    selectedSceneId: "s2",
    playbackActive: false,
    imageEditActive: false,
  });
  assert.equal(state.captionDragEnabled, false);
  assert.equal(state.captionInteractionLocked, false);
  assert.equal(resolvePreviewCaptionOverlayClassName(state), "pointer-events-none");
});

test("video preview wires interaction manager", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(videoPreview, /resolvePreviewInteractionState/);
  assert.match(videoPreview, /resolvePreviewCaptionOverlayClassName/);
  assert.doesNotMatch(videoPreview, /isCaptionDragEnabled/);
});

test("caption drag overlay root does not capture full-frame pointer events", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /pointer-events-none absolute inset-0 z-\[15\]/);
  assert.match(overlay, /pointerEvents: draggable \? "auto" : "none"/);
});

console.log(`\npreview-interaction: ${passed} passed`);
