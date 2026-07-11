/**
 * Sprint 6E — MP4 format adapter contract.
 * Run: npm run test:export-mp4-format
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MP4_CODEC_POLICY,
  MP4_ENCODER_ASSUMED_AVAILABLE,
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
    subtitle: "MP4",
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
    title: "MP4 Format",
    narration: "MP4",
    totalDuration: 3,
    exportSettings: {
      fileName: "mp4-format",
      format: "mp4",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

console.log("\nexport-mp4-format (Sprint 6E)\n");

test("codec policy: mp4 / libx264 / aac / faststart", () => {
  assert.equal(MP4_CODEC_POLICY.container, "mp4");
  assert.equal(MP4_CODEC_POLICY.extension, ".mp4");
  assert.equal(MP4_CODEC_POLICY.mimeType, "video/mp4");
  assert.equal(MP4_CODEC_POLICY.videoCodec, "libx264");
  assert.equal(MP4_CODEC_POLICY.audioCodec, "aac");
  assert.equal(MP4_CODEC_POLICY.movFlagsFaststart, true);
  assert.equal(MP4_ENCODER_ASSUMED_AVAILABLE, true);
});

test("resolve adapter selects MP4 for mp4 manifests", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  assert.equal(manifest.output.format, "mp4");
  const adapter = resolveExportFormatAdapter(manifest);
  assert.equal(adapter.format, "mp4");
});

test("ffmpeg MP4 profile uses libx264 + aac + faststart", () => {
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(ffmpeg, /libx264/);
  assert.match(ffmpeg, /"-c:a",\s*"aac"/);
  assert.match(ffmpeg, /movflags/);
  assert.match(ffmpeg, /\+faststart/);
});

test("refuses WebM renamed as MP4", () => {
  const mp4 = read("src/features/export/formats/mp4-export-format-adapter.ts");
  assert.match(mp4, /WEBM_RENAMED|refusing to rename as MP4|WebM content/);
  const validation = read(
    "src/features/export/validation/validate-final-export-artifact.ts",
  );
  assert.match(validation, /WEBM_RENAMED_AS_MP4/);
});

test("minimum re-encode: single-pass mux for voice MP4", () => {
  const mp4 = read("src/features/export/formats/mp4-export-format-adapter.ts");
  assert.match(mp4, /muxExportVideoWithAudioMix/);
  assert.match(mp4, /outputFormat:\s*\"mp4\"/);
});

console.log(`\n${passed} tests passed.\n`);
