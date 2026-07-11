/**
 * Sprint 6E — WebM format adapter contract.
 * Run: npm run test:export-webm-format
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WEBM_CODEC_POLICY,
  createWebmExportFormatAdapter,
  resolveExportFormatAdapter,
} from "@/features/export/formats";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
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

function story(): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 3,
    duration: 3,
    startMs: 0,
    endMs: 3000,
    durationMs: 3000,
    subtitle: "WebM",
    media: {
      type: "image" as const,
      url: "https://example.com/a.jpg",
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    image: {
      url: "https://example.com/a.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit" as const,
    },
  };
  return syncFootieScript({
    title: "WebM Format",
    narration: "WebM",
    totalDuration: 3,
    exportSettings: {
      fileName: "webm-format",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

console.log("\nexport-webm-format (Sprint 6E)\n");

test("codec policy: container/extension/MIME/Opus/copy", () => {
  assert.equal(WEBM_CODEC_POLICY.container, "webm");
  assert.equal(WEBM_CODEC_POLICY.extension, ".webm");
  assert.equal(WEBM_CODEC_POLICY.mimeType, "video/webm");
  assert.equal(WEBM_CODEC_POLICY.audioCodec, "libopus");
  assert.equal(WEBM_CODEC_POLICY.preferVideoStreamCopy, true);
});

test("resolve adapter selects WebM for webm manifests", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const adapter = resolveExportFormatAdapter(manifest);
  assert.equal(adapter.format, "webm");
  assert.equal(adapter.codecPolicy.mimeType, "video/webm");
});

test("silent WebM is video-only policy (no forced silent audio track)", () => {
  const adapter = createWebmExportFormatAdapter(
    buildExportManifest({ story: story(), environment: CAPABLE_ENV }),
  );
  assert.equal(adapter.codecPolicy.audioCodec, "libopus");
  // Silent mode still uses policy; mux returns hasAudio=false.
  const muxSrc = read("src/features/export/formats/webm-export-format-adapter.ts");
  assert.match(muxSrc, /mode === \"silent\"/);
  assert.match(muxSrc, /hasAudio:\s*false/);
});

test("mux path prefers video copy", () => {
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(ffmpeg, /"-c:v",\s*"copy"/);
  assert.match(ffmpeg, /libopus/);
});

test("finalization throws typed fallbacks instead of silent auto-download", () => {
  const webm = read("src/features/export/formats/webm-export-format-adapter.ts");
  assert.match(webm, /ExportFinalizationError/);
  assert.match(webm, /availableFallbacks/);
  assert.doesNotMatch(webm, /finishExportDownload\(\{\s*blob:\s*silentBlob/);
});

console.log(`\n${passed} tests passed.\n`);
