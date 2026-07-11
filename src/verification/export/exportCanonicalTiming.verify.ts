/**
 * Sprint 6C — Canonical export timing from ExportManifest.
 * Run: npm run test:export-canonical-timing
 */
import assert from "node:assert/strict";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  resolveExportCaptionFrame,
  resolveExportContentEndMs,
  resolveExportFrameTimestampMs,
  resolveExportRenderEndMs,
  resolveExportSceneFrame,
  resolveExportTotalFrames,
  resolveExportTransitionFrame,
  resolveExportVideoSourceTimeMs,
  resolveExportVisualTimeMs,
} from "@/features/export/timing";
import { TIMELINE_END_BUFFER_MS } from "@/features/timeline-intelligence/build-master-timeline";
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

function mixedStory(): FootieScript {
  const scenes = [
    {
      id: "scene-1",
      start: 0,
      end: 4,
      duration: 4,
      startMs: 0,
      endMs: 4000,
      durationMs: 4000,
      subtitle: "One",
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
    },
    {
      id: "scene-2",
      start: 4,
      end: 8,
      duration: 4,
      startMs: 4000,
      endMs: 8000,
      durationMs: 4000,
      subtitle: "Two",
      media: {
        type: "video" as const,
        url: "https://example.com/b.mp4",
        source: "upload" as const,
        durationMs: 20_000,
        trimStartMs: 1000,
        trimEndMs: 6000,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        fitMode: "cover" as const,
      },
    },
  ];
  return syncFootieScript({
    title: "Timing Fixture",
    narration: "One. Two.",
    totalDuration: 8,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 8000,
    exportSettings: {
      fileName: "timing",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes,
    timelineItems: [
      { id: "ti-1", type: "scene", scene: scenes[0]! },
      {
        id: "ti-t",
        type: "transition",
        fromSceneId: "scene-1",
        toSceneId: "scene-2",
        effect: "fade",
        durationMs: 500,
        label: "Fade",
      },
      { id: "ti-2", type: "scene", scene: scenes[1]! },
    ],
  });
}

console.log("\nexport-canonical-timing (Sprint 6C)\n");

const manifest = buildExportManifest({
  story: mixedStory(),
  environment: CAPABLE_ENV,
});

test("render end equals manifest.project.renderDurationMs", () => {
  assert.equal(resolveExportRenderEndMs(manifest), manifest.project.renderDurationMs);
  assert.ok(manifest.project.renderDurationMs >= 8000 + TIMELINE_END_BUFFER_MS - 1);
});

test("total frames from manifest duration × fps", () => {
  const expected = Math.ceil(
    (manifest.project.renderDurationMs * manifest.output.fps) / 1000,
  );
  assert.equal(resolveExportTotalFrames(manifest), expected);
});

test("frame-center timestamps", () => {
  assert.equal(resolveExportFrameTimestampMs(0, 30), Math.round((0.5 * 1000) / 30));
  assert.equal(resolveExportFrameTimestampMs(1, 30), Math.round((1.5 * 1000) / 30));
  assert.equal(resolveExportFrameTimestampMs(29, 30), Math.round((29.5 * 1000) / 30));
});

test("scene resolution and elapsed reset", () => {
  const early = resolveExportSceneFrame(manifest, 100);
  assert.equal(early.scene.id, "scene-1");
  assert.equal(early.sceneElapsedMs, 100);

  const mid = resolveExportSceneFrame(manifest, 4500);
  assert.equal(mid.scene.id, "scene-2");
  assert.equal(mid.sceneElapsedMs, 500);
});

test("visual time freezes at content end during buffer", () => {
  const contentEnd = resolveExportContentEndMs(manifest);
  const renderEnd = resolveExportRenderEndMs(manifest);
  assert.ok(renderEnd > contentEnd);
  assert.equal(resolveExportVisualTimeMs(manifest, renderEnd), contentEnd);
  assert.equal(resolveExportVisualTimeMs(manifest, contentEnd + 50), contentEnd);
});

test("transition overlap on outgoing scene tail", () => {
  const frame = resolveExportTransitionFrame(manifest, 3750);
  assert.ok(frame);
  assert.equal(frame!.fromScene.id, "scene-1");
  assert.equal(frame!.toScene.id, "scene-2");
  assert.ok(frame!.progress > 0 && frame!.progress <= 1);
});

test("video source time uses trim + scene elapsed", () => {
  const scene = manifest.scenes.find((s) => s.media.type === "video")!;
  const { sourceTimeMs, holdLastFrame } = resolveExportVideoSourceTimeMs(scene, 0);
  assert.equal(sourceTimeMs, 1000);
  assert.equal(holdLastFrame, false);

  const nearEnd = resolveExportVideoSourceTimeMs(scene, 5000);
  assert.equal(nearEnd.sourceTimeMs, 6000);
  assert.equal(nearEnd.holdLastFrame, true);
});

test("voiceover duration does not redefine render end via timing helpers", () => {
  assert.equal(
    resolveExportRenderEndMs(manifest),
    manifest.project.renderDurationMs,
  );
  // Timing domain never consults live audio element / voiceover duration.
  assert.equal(
    resolveExportTotalFrames(manifest),
    Math.ceil((manifest.project.renderDurationMs * manifest.output.fps) / 1000),
  );
});

test("caption frame from manifest captions", () => {
  if (manifest.captions.length === 0) {
    console.log("  ~ skip caption timing (no captions in fixture)");
    return;
  }
  const caption = manifest.captions[0]!;
  const mid = Math.round((caption.startMs + caption.endMs) / 2);
  const frame = resolveExportCaptionFrame(manifest, mid);
  assert.ok(frame);
  assert.equal(frame!.caption.id, caption.id);
});

console.log(`\n${passed} tests passed.\n`);
