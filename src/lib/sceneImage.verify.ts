/**
 * Verifies scene image positioning logic (run: npm run test:scene-image).
 * Covers legacy migration, transforms, fit/fill, and preview/export parity.
 */
import assert from "node:assert/strict";

import { buildFootieExportPayload } from "./exportPayload";
import {
  applyReferencePanFromScreenDelta,
  applySceneImageFitMode,
  clampSceneImageScale,
  createSceneImageFromUrl,
  getSceneImage,
  getSceneImageDrawDimensions,
  getSceneImageObjectFit,
  getSceneImageTransformStyle,
  getSceneImageUrl,
  normalizeSceneImage,
  normalizeSceneImageSettings,
  patchSceneImageTransform,
  resetSceneImageTransform,
  resolveExportSceneImage,
  resolveSceneImageTransformForFrame,
  sceneHasImage,
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
  withScreenDragOffset,
} from "./sceneImage";
import type { FootieScene, FootieScript } from "@/types/footiebitz";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const legacyScene: FootieScene = {
  id: "scene-1",
  start: 0,
  end: 5,
  duration: 5,
  subtitle: "Legacy caption",
  uploadedImage: "https://example.com/legacy.jpg",
};

const sampleScene = (image: FootieScene["image"]): FootieScene => ({
  id: "scene-2",
  start: 0,
  end: 5,
  duration: 5,
  subtitle: "Test",
  image,
});

console.log("sceneImage positioning");

test("1. legacy string uploadedImage normalizes with defaults", () => {
  const normalized = normalizeSceneImageSettings(legacyScene);
  assert.equal(normalized.uploadedImage, undefined);
  assert.equal(normalized.image?.url, "https://example.com/legacy.jpg");
  assert.equal(normalized.image?.scale, 1);
  assert.equal(normalized.image?.x, 0);
  assert.equal(normalized.image?.y, 0);
  assert.equal(normalized.image?.fitMode, "fill");
  assert.equal(sceneHasImage(normalized), true);
  assert.equal(getSceneImageUrl(normalized), "https://example.com/legacy.jpg");
});

test("1b. legacy image string field still resolves", () => {
  const fromString = normalizeSceneImage("blob:legacy-image");
  assert.equal(fromString?.url, "blob:legacy-image");
  assert.equal(fromString?.scale, 1);
  assert.equal(resolveExportSceneImage({ image: fromString! })?.url, "blob:legacy-image");
});

test("2. drag delta converts to reference space and back for preview", () => {
  const base = createSceneImageFromUrl("blob:new-upload");
  const previewWidth = 360;
  const previewHeight = 640;

  const stored = applyReferencePanFromScreenDelta(base.x, base.y, 36, -18, previewWidth, previewHeight);
  assert.equal(stored.x, 108);
  assert.equal(stored.y, -54);

  const preview = withScreenDragOffset(
    { ...base, ...stored },
    { x: 0, y: 0 },
    previewWidth,
    previewHeight,
  );
  const resolved = resolveSceneImageTransformForFrame(preview, previewWidth, previewHeight);
  assert.equal(resolved.x, 36);
  assert.equal(resolved.y, -18);
});

test("3. zoom slider clamps scale via patch helper", () => {
  const scene = sampleScene(createSceneImageFromUrl("blob:zoom"));
  const patched = patchSceneImageTransform(scene, { scale: 4 });
  assert.equal(patched?.scale, 3);

  const zoomedOut = patchSceneImageTransform(scene, { scale: 0.1 });
  assert.equal(zoomedOut?.scale, 0.5);
  assert.equal(clampSceneImageScale(Number.NaN), 1);
});

test("4. reset clears pan/zoom/rotation but keeps fit mode and url", () => {
  const image = {
    url: "blob:test",
    scale: 2.2,
    x: 120,
    y: -40,
    rotation: 15,
    fitMode: "fit" as const,
  };

  const reset = resetSceneImageTransform(image);
  assert.equal(reset.url, "blob:test");
  assert.equal(reset.scale, 1);
  assert.equal(reset.x, 0);
  assert.equal(reset.y, 0);
  assert.equal(reset.rotation, 0);
  assert.equal(reset.fitMode, "fit");
});

test("5. fit mode uses contain dimensions", () => {
  const fitImage = applySceneImageFitMode(createSceneImageFromUrl("blob:fit"), "fit");
  assert.equal(fitImage.fitMode, "fit");
  assert.equal(fitImage.x, 0);
  assert.equal(fitImage.y, 0);
  assert.equal(getSceneImageObjectFit(fitImage), "contain");

  const dims = getSceneImageDrawDimensions(fitImage, 1600, 900, 1080, 1920);
  assert.equal(dims.drawWidth, 1080);
  assert.ok(dims.drawHeight < 1920);
});

test("6. fill mode uses cover dimensions", () => {
  const fillImage = applySceneImageFitMode(createSceneImageFromUrl("blob:fill"), "fill");
  assert.equal(fillImage.fitMode, "fill");
  assert.equal(getSceneImageObjectFit(fillImage), "cover");

  const dims = getSceneImageDrawDimensions(fillImage, 1600, 900, 1080, 1920);
  assert.ok(dims.drawWidth >= 1080);
  assert.equal(dims.drawHeight, 1920);
});

test("7. touch drag reference conversion matches half-size preview frame", () => {
  const origin = { x: 200, y: 100 };
  const screenDelta = { x: 20, y: 10 };
  const frame = { width: 540, height: 960 };

  const stored = applyReferencePanFromScreenDelta(
    origin.x,
    origin.y,
    screenDelta.x,
    screenDelta.y,
    frame.width,
    frame.height,
  );

  const resolved = resolveSceneImageTransformForFrame(
    { url: "blob:touch", scale: 1, ...stored, fitMode: "fill" },
    frame.width,
    frame.height,
  );

  assert.equal(resolved.x, origin.x / (SCENE_IMAGE_REFERENCE_WIDTH / frame.width) + screenDelta.x);
  assert.equal(resolved.y, origin.y / (SCENE_IMAGE_REFERENCE_HEIGHT / frame.height) + screenDelta.y);
});

test("8. export payload preserves transforms and preview/export parity at 1080p", () => {
  const script: FootieScript = {
    title: "Test",
    narration: "Hello",
    totalDuration: 5,
    scenes: [
      sampleScene({
        url: "blob:export",
        scale: 1.5,
        x: 108,
        y: -54,
        rotation: 0,
        fitMode: "fill",
      }),
    ],
  };

  const payload = buildFootieExportPayload(script);
  const exportScene = payload.scenes[0];
  const exportImage = resolveExportSceneImage(exportScene);
  assert.ok(exportImage);
  assert.equal(exportImage.scale, 1.5);
  assert.equal(exportImage.x, 108);

  const previewCss = getSceneImageTransformStyle(exportImage!, 540, 960).transform;
  const exportResolved = resolveSceneImageTransformForFrame(exportImage!, 1080, 1920);
  assert.match(previewCss, /translate\(54px, -27px\)/);
  assert.equal(exportResolved.x, 108);
  assert.equal(exportResolved.y, -54);
  assert.equal(exportResolved.scale, 1.5);
});

test("9. partial transform metadata falls back to defaults", () => {
  const partial = normalizeSceneImage({ url: "blob:partial" });
  assert.equal(partial?.scale, 1);
  assert.equal(partial?.x, 0);
  assert.equal(partial?.rotation, 0);
  assert.equal(partial?.fitMode, "fill");
  assert.equal(getSceneImage(sampleScene(undefined)), undefined);
  assert.equal(sceneHasImage(sampleScene(undefined)), false);
});

test("10. generated scenes without images remain image-free", () => {
  const generated = sampleScene(undefined);
  assert.equal(getSceneImage(generated), undefined);
  assert.equal(resolveExportSceneImage(generated), undefined);

  const payload = buildFootieExportPayload({
    title: "Generated",
    narration: "",
    totalDuration: 5,
    scenes: [generated],
  });
  assert.equal(payload.scenes[0].image, undefined);
});

console.log("\nAll scene image positioning checks passed.");
