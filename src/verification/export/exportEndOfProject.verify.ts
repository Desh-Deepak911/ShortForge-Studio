/**
 * Sprint 6E — end-of-project / end-buffer / mux truncation audit.
 * Run: npm run test:export-end-of-project
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertExportEndBufferContract,
  auditExportMuxDurationArgs,
  resolveExportEndOfProjectSnapshot,
} from "@/features/export/formats";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  resolveExportFrameTimestampMs,
  resolveExportTotalFrames,
} from "@/features/export/timing";
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
    id: "final-scene",
    start: 0,
    end: 5,
    duration: 5,
    startMs: 0,
    endMs: 5000,
    durationMs: 5000,
    subtitle: "Final closing caption word",
    captionMode: "subtitles" as const,
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
    title: "End Of Project",
    narration: "Final closing caption word",
    totalDuration: 5,
    exportSettings: {
      fileName: "eop",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 4800,
  });
}

console.log("\nexport-end-of-project (Sprint 6E)\n");

test("end buffer contract: render = content + buffer", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  assertExportEndBufferContract(manifest);
  assert.ok(manifest.project.endBufferMs >= 0);
  // Product default is 400ms when MasterTimeline applies it.
  assert.equal(
    manifest.project.renderDurationMs,
    manifest.project.contentDurationMs + manifest.project.endBufferMs,
  );
});

test("final semantic snapshot uses last global frame", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const snap = resolveExportEndOfProjectSnapshot(manifest);
  const total = resolveExportTotalFrames(manifest);
  assert.equal(snap.lastGlobalFrameIndex, total - 1);
  assert.equal(
    snap.lastTimestampMs,
    resolveExportFrameTimestampMs(total - 1, manifest.output.fps),
  );
  assert.equal(snap.finalSceneId, "final-scene");
  assert.equal(snap.renderDurationMs, manifest.project.renderDurationMs);
});

test("-shortest is dangerous; production mux must not use it", () => {
  const audit = auditExportMuxDurationArgs(["-i", "v.webm", "-shortest", "out.webm"]);
  assert.equal(audit.hasShortest, true);
  assert.equal(audit.dangerous, true);

  const ok = auditExportMuxDurationArgs(["-i", "v.webm", "-t", "5.400", "out.webm"]);
  assert.equal(ok.hasShortest, false);
  assert.equal(ok.dangerous, false);
  assert.equal(ok.tValueSec, 5.4);

  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.doesNotMatch(ffmpeg, /-shortest/);
});

test("renderExport asserts end-buffer contract before mux", () => {
  const render = read("src/features/export/runtime/render-export.ts");
  assert.match(render, /assertExportEndBufferContract/);
  assert.match(render, /resolveExportEndOfProjectSnapshot/);
  assert.match(render, /validateFinalExportArtifact/);
});

test("final frame interval preserved via totalFrames/fps model", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const frames = resolveExportTotalFrames(manifest);
  const expectedSec = frames / manifest.output.fps;
  const renderSec = manifest.project.renderDurationMs / 1000;
  assert.ok(Math.abs(expectedSec - renderSec) < 1 / manifest.output.fps + 0.001);
});

console.log(`\n${passed} tests passed.\n`);
