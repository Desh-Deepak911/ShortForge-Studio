/**
 * Sprint 6G — export media quality: original decoded assets + high-quality resampling.
 * Run: npm run test:export-media-quality
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyExportCanvasMediaQuality,
  drawCanvasImageSource,
  resolveExportSceneMediaDrawImage,
} from "@/features/export/utils/export-scene-media-renderer";
import { resolveSceneMediaFraming } from "@/features/media-framing";
import type { FootieScene } from "@/features/story/types";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-media-quality (Sprint 6G)\n");

test("Fit / Fill / Zoom / Pan resolve from original framing, not a preview proxy", () => {
  const scene: Pick<FootieScene, "image" | "uploadedImage" | "media"> = {
    media: {
      type: "image",
      url: "https://example.com/hi-res.jpg",
      source: "upload",
      transform: { x: 40, y: -20, scale: 1.5, rotation: 0 },
      fitMode: "cover",
    },
    image: {
      url: "https://example.com/hi-res.jpg",
      scale: 1.5,
      x: 40,
      y: -20,
      rotation: 0,
      fitMode: "fill",
    },
  };

  const framing = resolveSceneMediaFraming(scene);
  assert.equal(framing.fitMode, "fill");
  assert.equal(framing.zoom, 1.5);
  assert.equal(framing.positionX, 40);
  assert.equal(framing.positionY, -20);

  const drawImage = resolveExportSceneMediaDrawImage(scene);
  assert.ok(drawImage);
  assert.equal(drawImage!.fitMode, "fill");
  assert.equal(drawImage!.scale, 1.5);
  assert.equal(drawImage!.x, 40);
  assert.equal(drawImage!.y, -20);
});

test("applyExportCanvasMediaQuality enables high-quality smoothing", () => {
  const calls: Record<string, unknown> = {};
  const ctx = {
    set imageSmoothingEnabled(v: boolean) {
      calls.enabled = v;
    },
    get imageSmoothingEnabled() {
      return Boolean(calls.enabled);
    },
    set imageSmoothingQuality(v: ImageSmoothingQuality) {
      calls.quality = v;
    },
    get imageSmoothingQuality() {
      return (calls.quality as ImageSmoothingQuality) ?? "low";
    },
  } as CanvasRenderingContext2D;

  applyExportCanvasMediaQuality(ctx);
  assert.equal(calls.enabled, true);
  assert.equal(calls.quality, "high");
});

test("drawCanvasImageSource applies export quality before drawSceneImageInFrame", () => {
  const order: string[] = [];
  const ctx = {
    save() {
      order.push("save");
    },
    restore() {
      order.push("restore");
    },
    beginPath() {},
    rect() {},
    clip() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage() {
      order.push("drawImage");
    },
    set imageSmoothingEnabled(v: boolean) {
      if (v) order.push("smoothing-enabled");
    },
    set imageSmoothingQuality(v: ImageSmoothingQuality) {
      if (v === "high") order.push("smoothing-high");
    },
    get imageSmoothingEnabled() {
      return true;
    },
    get imageSmoothingQuality() {
      return "high" as ImageSmoothingQuality;
    },
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;

  const source = { width: 1920, height: 1080 } as CanvasImageSource;
  const sceneImage = {
    url: "https://example.com/a.jpg",
    scale: 1.25,
    x: 10,
    y: -5,
    rotation: 0,
    fitMode: "fit" as const,
  };

  drawCanvasImageSource(ctx, source, 720, 1280, sceneImage, 1920, 1080, {
    scale: 1.25,
    translateX: 10,
    translateY: -5,
    rotation: 0,
  });

  assert.ok(order.includes("smoothing-enabled"));
  assert.ok(order.includes("smoothing-high"));
  assert.ok(order.includes("drawImage"));
  const smoothIdx = order.indexOf("smoothing-high");
  const drawIdx = order.indexOf("drawImage");
  assert.ok(smoothIdx >= 0 && drawIdx > smoothIdx, "quality must be set before drawImage");
});

test("structural: export draws from HTMLImageElement / HTMLVideoElement, not thumbnails", () => {
  const renderer = read("src/features/export/utils/export-scene-media-renderer.ts");
  const cache = read("src/features/export/utils/export-media-cache.utils.ts");

  assert.match(renderer, /applyExportCanvasMediaQuality/);
  assert.match(renderer, /drawSceneImageInFrame/);
  assert.match(renderer, /HTMLImageElement/);
  assert.match(renderer, /HTMLVideoElement|ExportVideoAsset/);
  assert.doesNotMatch(renderer, /createImageBitmap|thumbnail|OffscreenCanvas|preview.?canvas/i);

  assert.match(cache, /new Image\(|HTMLImageElement/);
  assert.match(cache, /createElement\(["']video["']\)|HTMLVideoElement/);
  assert.doesNotMatch(cache, /thumbnailUrl|posterUrl|previewBitmap/);
});

test("Fit and Fill both go through shared framing resolver before canvas draw", () => {
  const renderer = read("src/features/export/utils/export-scene-media-renderer.ts");
  assert.match(renderer, /resolveSceneMediaFraming/);
  assert.match(renderer, /resolveExportSceneMediaDrawImage/);
  assert.match(renderer, /getSceneImageDrawDimensions|drawSceneImageInFrame/);
});

console.log(`\nexport-media-quality: ${passed} passed\n`);
