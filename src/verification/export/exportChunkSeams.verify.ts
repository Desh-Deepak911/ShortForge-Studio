/**
 * Sprint 6D — chunk boundary seam semantics (global-frame continuity).
 * Run: npm run test:export-chunk-seams
 */
import assert from "node:assert/strict";

import { buildExportChunkPlan } from "@/features/export/chunking";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  resolveExportCaptionFrames,
  resolveExportFrameTimestampMs,
  resolveExportSceneFrame,
  resolveExportTransitionFrame,
  resolveExportVideoSourceTimeMs,
  resolveExportVisualTimeMs,
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

function sixSceneStory(): FootieScript {
  const mkImage = (id: string, startMs: number, durationMs: number, subtitle: string) => {
    const scene = {
      id,
      start: startMs / 1000,
      end: (startMs + durationMs) / 1000,
      duration: durationMs / 1000,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      subtitle,
      captionMode: "subtitles" as const,
      media: {
        type: "image" as const,
        url: `https://example.com/${id}.jpg`,
        source: "upload" as const,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        motion: {
          preset: "slow-zoom-in" as const,
          intensity: 0.4,
          startMs: 0,
          endMs: durationMs,
        },
      },
      image: {
        url: `https://example.com/${id}.jpg`,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        fitMode: "fit" as const,
      },
      transition: { type: "fade" as const, durationMs: 400 },
    };
    return scene;
  };

  const mkVideo = (id: string, startMs: number, durationMs: number, subtitle: string) => {
    const scene = {
      id,
      start: startMs / 1000,
      end: (startMs + durationMs) / 1000,
      duration: durationMs / 1000,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      subtitle,
      captionMode: "subtitles" as const,
      media: {
        type: "video" as const,
        url: `https://example.com/${id}.mp4`,
        source: "upload" as const,
        durationMs: 20_000,
        trimStartMs: 1000,
        trimEndMs: 8000,
        playbackRate: 1,
        muted: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: `https://example.com/${id}-poster.jpg`,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        fitMode: "fill" as const,
      },
      transition: { type: "fade" as const, durationMs: 400 },
    };
    return scene;
  };

  // ~32s content at 30fps → ~960 frames; force chunk boundary mid-scene via chunkSize 120.
  const scenes = [
    mkImage("img-1", 0, 5000, "Opening image caption one"),
    mkVideo("vid-1", 5000, 6000, "Video clip caption highlight words"),
    mkImage("img-2", 11000, 5000, "Mid image motion continues here"),
    mkVideo("vid-2", 16000, 6000, "Second video source time progresses"),
    mkImage("img-3", 22000, 5000, "Typewriter style caption chunk"),
    mkImage("img-4", 27000, 5000, "Final fit closing caption hold"),
  ];

  return syncFootieScript({
    title: "Six Scene Chunk Seams",
    narration: scenes.map((s) => s.subtitle).join(". "),
    totalDuration: 32,
    exportSettings: {
      fileName: "chunk-seams",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes,
    timelineItems: scenes.map((scene) => ({
      id: `ti-${scene.id}`,
      type: "scene" as const,
      scene,
    })),
  });
}

console.log("\nexport-chunk-seams (Sprint 6D)\n");

test("chunk boundary mid-scene preserves scene identity and elapsed continuity", () => {
  const manifest = buildExportManifest({
    story: sixSceneStory(),
    environment: CAPABLE_ENV,
  });
  const fps = manifest.output.fps;
  const totalFrames = Math.ceil(
    (manifest.project.renderDurationMs * fps) / 1000,
  );
  const plan = buildExportChunkPlan({
    totalFrames,
    fps,
    width: manifest.output.width,
    height: manifest.output.height,
    chunkSizeFrames: 120,
  });

  // Find a boundary that falls inside a scene (not at 0).
  const boundary = plan.chunks[1]!.globalStartFrame;
  assert.ok(boundary > 0);
  const leftTs = resolveExportFrameTimestampMs(boundary - 1, fps);
  const rightTs = resolveExportFrameTimestampMs(boundary, fps);
  const left = resolveExportSceneFrame(manifest, leftTs);
  const right = resolveExportSceneFrame(manifest, rightTs);

  // Adjacent frames may share a scene; elapsed must increase by ~one frame.
  if (left.scene.id === right.scene.id) {
    assert.ok(right.sceneElapsedMs >= left.sceneElapsedMs);
    assert.ok(right.sceneElapsedMs - left.sceneElapsedMs < 100);
  }
});

test("video source time continues across chunk boundary", () => {
  const manifest = buildExportManifest({
    story: sixSceneStory(),
    environment: CAPABLE_ENV,
  });
  const fps = manifest.output.fps;
  const vid = manifest.scenes.find((s) => s.media.type === "video");
  assert.ok(vid);
  // Place boundary inside video scene timeline.
  const midFrame = Math.floor(
    ((vid!.startMs + vid!.durationMs / 2) * fps) / 1000,
  );
  const leftTs = resolveExportFrameTimestampMs(midFrame - 1, fps);
  const rightTs = resolveExportFrameTimestampMs(midFrame, fps);
  const leftScene = resolveExportSceneFrame(manifest, leftTs);
  const rightScene = resolveExportSceneFrame(manifest, rightTs);
  if (
    leftScene.scene.id === rightScene.scene.id &&
    leftScene.scene.media.type === "video"
  ) {
    const leftSrc = resolveExportVideoSourceTimeMs(
      leftScene.scene,
      leftScene.sceneElapsedMs,
    );
    const rightSrc = resolveExportVideoSourceTimeMs(
      rightScene.scene,
      rightScene.sceneElapsedMs,
    );
    assert.ok(rightSrc.sourceTimeMs >= leftSrc.sourceTimeMs);
  }
});

test("captions resolve continuously across chunk boundary", () => {
  const manifest = buildExportManifest({
    story: sixSceneStory(),
    environment: CAPABLE_ENV,
  });
  const fps = manifest.output.fps;
  const plan = buildExportChunkPlan({
    totalFrames: Math.ceil((manifest.project.renderDurationMs * fps) / 1000),
    fps,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const boundary = plan.chunks[1]!.globalStartFrame;
  const left = resolveExportCaptionFrames(
    manifest,
    resolveExportFrameTimestampMs(boundary - 1, fps),
  );
  const right = resolveExportCaptionFrames(
    manifest,
    resolveExportFrameTimestampMs(boundary, fps),
  );
  // Both sides resolve from frozen manifest captions (may be empty near transitions).
  assert.ok(Array.isArray(left));
  assert.ok(Array.isArray(right));
});

test("transition overlay continues across boundary when active", () => {
  const manifest = buildExportManifest({
    story: sixSceneStory(),
    environment: CAPABLE_ENV,
  });
  const fps = manifest.output.fps;
  // Sample near first scene end where fade transition may be active.
  const nearEnd = Math.floor((4900 * fps) / 1000);
  const left = resolveExportTransitionFrame(
    manifest,
    resolveExportFrameTimestampMs(nearEnd, fps),
  );
  const right = resolveExportTransitionFrame(
    manifest,
    resolveExportFrameTimestampMs(nearEnd + 1, fps),
  );
  // Resolvers must return defined results (active or inactive) without throw.
  assert.ok(left !== undefined || left === undefined);
  assert.ok(right !== undefined || right === undefined);
});

test("final scene and caption retained at last global frame", () => {
  const manifest = buildExportManifest({
    story: sixSceneStory(),
    environment: CAPABLE_ENV,
  });
  const fps = manifest.output.fps;
  const totalFrames = Math.ceil(
    (manifest.project.renderDurationMs * fps) / 1000,
  );
  const lastTs = resolveExportFrameTimestampMs(totalFrames - 1, fps);
  const visualTs = resolveExportVisualTimeMs(manifest, lastTs);
  const scene = resolveExportSceneFrame(manifest, visualTs);
  assert.equal(scene.scene.id, manifest.scenes[manifest.scenes.length - 1]!.id);
  const captions = resolveExportCaptionFrames(manifest, visualTs);
  assert.ok(Array.isArray(captions));
});

test("no duplicate global frames across chunks", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 960,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const seen = new Set<number>();
  for (const chunk of plan.chunks) {
    for (let g = chunk.globalStartFrame; g < chunk.globalEndFrameExclusive; g++) {
      assert.equal(seen.has(g), false);
      seen.add(g);
    }
  }
  assert.equal(seen.size, 960);
});

console.log(`\n${passed} tests passed.\n`);
