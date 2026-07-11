/**
 * Sprint 6E — final artifact validation.
 * Run: npm run test:export-final-artifact
 */
import assert from "node:assert/strict";

import { validateFinalExportArtifact } from "@/features/export/validation";
import type { ExportFormatArtifact } from "@/features/export/formats";
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

function story(): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 2,
    duration: 2,
    startMs: 0,
    endMs: 2000,
    durationMs: 2000,
    subtitle: "Validate",
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
    title: "Final Artifact",
    narration: "Validate",
    totalDuration: 2,
    exportSettings: {
      fileName: "final",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

function artifact(
  overrides: Partial<ExportFormatArtifact> = {},
): ExportFormatArtifact {
  const bytes = new Uint8Array(4096);
  return {
    blob: new Blob([bytes], { type: "video/webm" }),
    format: "webm",
    filename: "final.webm",
    mimeType: "video/webm",
    hasAudio: false,
    resultKind: "default",
    ...overrides,
  };
}

console.log("\nexport-final-artifact (Sprint 6E)\n");

test("correct silent WebM artifact validates", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const silent = {
    ...manifest,
    audio: { ...manifest.audio, mode: "silent" as const, voiceover: null, music: null },
  };
  const result = validateFinalExportArtifact({
    artifact: artifact(),
    manifest: silent,
    finalFrameRendered: true,
    probedHasVideo: true,
    probedHasAudio: false,
    probedDurationMs: silent.project.renderDurationMs,
    probedWidth: silent.output.width,
    probedHeight: silent.output.height,
    probedFps: silent.output.fps,
  });
  assert.equal(result.valid, true);
});

test("tiny/corrupt file rejected", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const result = validateFinalExportArtifact({
    artifact: artifact({
      blob: new Blob([new Uint8Array(10)], { type: "video/webm" }),
    }),
    manifest,
    finalFrameRendered: true,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "FILE_TOO_SMALL"));
});

test("missing video rejected", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const result = validateFinalExportArtifact({
    artifact: artifact(),
    manifest,
    probedHasVideo: false,
    finalFrameRendered: true,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_VIDEO"));
});

test("WebM labeled as MP4 rejected", () => {
  const manifest = buildExportManifest({
    story: {
      ...story(),
      exportSettings: {
        fileName: "final",
        format: "mp4",
        quality: "standard",
        resolution: "720x1280",
      },
    },
    environment: CAPABLE_ENV,
  });
  const result = validateFinalExportArtifact({
    artifact: artifact({
      format: "mp4",
      filename: "final.mp4",
      mimeType: "video/mp4",
      blob: new Blob([new Uint8Array(4096)], { type: "video/webm" }),
    }),
    manifest,
    finalFrameRendered: true,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "WEBM_RENAMED_AS_MP4"));
});

test("wrong duration rejected", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const result = validateFinalExportArtifact({
    artifact: artifact(),
    manifest,
    finalFrameRendered: true,
    probedDurationMs: 50,
    probedHasVideo: true,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "WRONG_DURATION"));
});

test("missing final frame marker rejected", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const result = validateFinalExportArtifact({
    artifact: artifact(),
    manifest,
    finalFrameRendered: false,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "FINAL_FRAME_MISSING"));
});

test("wrong extension rejected", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const result = validateFinalExportArtifact({
    artifact: artifact({ filename: "final.mp4" }),
    manifest,
    finalFrameRendered: true,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "WRONG_EXTENSION"));
});

console.log(`\n${passed} tests passed.\n`);
