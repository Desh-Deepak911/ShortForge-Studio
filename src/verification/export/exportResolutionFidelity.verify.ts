/**
 * Sprint 6H — resolution fidelity: canvas dims, source assets, no preview proxies.
 * Run: npm run test:export-resolution-fidelity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  resolveExportVisualQualityProfile,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { getExportBitrate } from "@/features/export/utils/export-settings.utils";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function story(resolution: "720x1280" | "1080x1920", quality: "standard" | "high"): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 3,
    duration: 3,
    startMs: 0,
    endMs: 3000,
    durationMs: 3000,
    subtitle: "Fidelity",
    media: {
      type: "image" as const,
      url: "https://example.com/full-res.jpg",
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1.2, rotation: 0 },
      fitMode: "cover" as const,
    },
    image: {
      url: "https://example.com/full-res.jpg",
      scale: 1.2,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fill" as const,
    },
  };
  return syncFootieScript({
    title: "Resolution Fidelity",
    narration: "Fidelity",
    totalDuration: 3,
    exportSettings: {
      fileName: "fidelity",
      format: "webm",
      quality,
      resolution,
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

console.log("\nexport-resolution-fidelity (Sprint 6H)\n");

test("manifest freezes canvas dimensions and bitrate for 720p and 1080p", () => {
  const m720 = buildExportManifest({
    story: story("720x1280", "standard"),
    environment: CAPABLE_ENV,
  });
  const m1080 = buildExportManifest({
    story: story("1080x1920", "high"),
    environment: CAPABLE_ENV,
  });

  assert.equal(m720.output.width, 720);
  assert.equal(m720.output.height, 1280);
  assert.equal(m720.output.bitrate, getExportBitrate("720x1280", "standard"));

  assert.equal(m1080.output.width, 1080);
  assert.equal(m1080.output.height, 1920);
  assert.equal(m1080.output.bitrate, getExportBitrate("1080x1920", "high"));

  const p720 = resolveExportVisualQualityProfile(m720.output);
  const p1080 = resolveExportVisualQualityProfile(m1080.output);
  assert.equal(p720.videoBitrateArg, "4M");
  assert.equal(p1080.videoBitrateArg, "8M");
});

test("export context canvas uses manifest pixel dimensions (no devicePixelRatio)", () => {
  const context = read("src/features/export/runtime/create-export-render-context.ts");
  assert.match(context, /canvas\.width\s*=\s*width/);
  assert.match(context, /canvas\.height\s*=\s*height/);
  assert.doesNotMatch(context, /devicePixelRatio/);
});

test("export media cache / renderer use original decoded elements, not thumbnails", () => {
  const cache = read("src/features/export/utils/export-media-cache.utils.ts");
  const renderer = read("src/features/export/utils/export-scene-media-renderer.ts");
  assert.match(cache, /HTMLImageElement|new Image\(/);
  assert.match(cache, /HTMLVideoElement|createElement\(["']video["']\)/);
  assert.doesNotMatch(cache, /thumbnailUrl|posterUrl|previewBitmap/);
  assert.match(renderer, /applyExportCanvasMediaQuality/);
  assert.match(renderer, /drawSceneImageInFrame|drawCanvasImageSource/);
  assert.doesNotMatch(renderer, /createImageBitmap|OffscreenCanvas/);
});

test("quality tier changes fingerprint via bitrate", () => {
  const standard = buildExportManifest({
    story: story("1080x1920", "standard"),
    environment: CAPABLE_ENV,
  });
  const high = buildExportManifest({
    story: story("1080x1920", "high"),
    environment: CAPABLE_ENV,
  });
  assert.notEqual(standard.output.bitrate, high.output.bitrate);
  assert.notEqual(standard.fingerprint, high.fingerprint);
});

test("concat remains stream-copy (no re-encode quality loss)", () => {
  const concat = read("src/features/export/chunking/concat-export-chunks.ts");
  assert.match(concat, /-c\s+copy|"-c",\s*"copy"/);
});

console.log(`\nexport-resolution-fidelity: ${passed} passed\n`);
