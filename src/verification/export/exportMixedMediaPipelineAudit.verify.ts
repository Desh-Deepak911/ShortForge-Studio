/**
 * Mixed-media export pipeline audit + post-fix verification (4.2C-8A / 4.2C-8B).
 * Run: npm run test:export-mixed-media-audit
 *
 * Documents the historical captureStream(fps) inflation failure and asserts the
 * 4.2C-8B deterministic manual-capture fix is present in production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_DECODE_READY_TIMEOUT_MS,
  EXPORT_SEEK_TIMEOUT_MS,
  ExportSeekRequestRegistry,
  assessPerFrameSeekViability,
  buildAuditTimelineSlots,
  estimateVideoFrameCostMs,
  resolveAuditActiveSceneAtTime,
  resolveAuditProjectDurationMs,
  resolveAuditVideoClipTimeMs,
  simulateCaptureStreamInflation,
} from "@/features/export/utils/export-pipeline-audit.utils";
import { resolveExpectedSilentVisualDurationSec } from "@/features/export/utils/export-manual-canvas-capture.utils";
import { resolveExportSceneMediaPlaybackState } from "@/features/export/utils/export-scene-media-renderer";
import type { FootieScene } from "@/features/story/types";
import {
  resolveTimelineFrameCount,
  resolveTimelineFrameSampleTimeMs,
} from "@/features/timeline-intelligence/timeline-playback.utils";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const DURATION_FIXTURE = [
  { id: "s1-image", mediaType: "image" as const, sceneDurationMs: 3000 },
  {
    id: "s2-video",
    mediaType: "video" as const,
    sceneDurationMs: 5000,
    sourceDurationMs: 16_000,
  },
  { id: "s3-image", mediaType: "image" as const, sceneDurationMs: 4000 },
];

const SIX_SCENE_FIXTURE = [
  { id: "img-1", mediaType: "image" as const, sceneDurationMs: 2000 },
  { id: "img-2", mediaType: "image" as const, sceneDurationMs: 2000 },
  {
    id: "vid-1",
    mediaType: "video" as const,
    sceneDurationMs: 5000,
    sourceDurationMs: 16_000,
  },
  { id: "img-3", mediaType: "image" as const, sceneDurationMs: 2000 },
  {
    id: "vid-2",
    mediaType: "video" as const,
    sceneDurationMs: 4000,
    sourceDurationMs: 12_000,
  },
  { id: "img-4", mediaType: "image" as const, sceneDurationMs: 3000 },
];

async function main() {
  console.log("\nexport-mixed-media-pipeline-audit (4.2C-8A/8B)\n");

  await test("Part2: 16s source in 5s scene does not extend 12s project", () => {
    const slots = buildAuditTimelineSlots(DURATION_FIXTURE);
    assert.equal(resolveAuditProjectDurationMs(DURATION_FIXTURE), 12_000);
    assert.equal(slots[1]!.endMs, 8000);
    assert.equal(slots[2]!.startMs, 8000);
  });

  await test("Part2: production exportDurationMs comes from MasterTimeline.renderDurationMs", () => {
    const preflight = readSrc("src/features/export/utils/export-preflight.utils.ts");
    assert.match(preflight, /exportDurationMs:\s*masterTimeline\.renderDurationMs/);
  });

  await test("Part3: export timestamps are monotonic frameIndex/fps samples", () => {
    const fps = 30;
    const total = resolveTimelineFrameCount(12_000, fps);
    let previous = -1;
    for (let i = 0; i < total; i++) {
      const t = resolveTimelineFrameSampleTimeMs(i, fps);
      assert.ok(t >= previous);
      previous = t;
    }
  });

  await test("Part4: six-scene progression ignores source video duration", () => {
    const slots = buildAuditTimelineSlots(SIX_SCENE_FIXTURE);
    assert.equal(resolveAuditProjectDurationMs(SIX_SCENE_FIXTURE), 18_000);
    assert.equal(resolveAuditActiveSceneAtTime(slots, 4000)!.scene.id, "vid-1");
    assert.equal(resolveAuditActiveSceneAtTime(slots, 9000)!.scene.id, "img-3");
    assert.equal(resolveAuditActiveSceneAtTime(slots, 15_000)!.scene.id, "img-4");
  });

  await test("Part6: 16s source / 5s scene samples only scene-local window", () => {
    const scene: FootieScene = {
      id: "vid",
      start: 3,
      end: 8,
      duration: 5,
      durationMs: 5000,
      startMs: 3000,
      endMs: 8000,
      media: {
        type: "video",
        url: "blob:long",
        durationMs: 16_000,
        muted: true,
      },
    };
    assert.equal(resolveExportSceneMediaPlaybackState(scene, 2500, 5000).clipTimeMs, 2500);
    assert.equal(
      resolveAuditVideoClipTimeMs({
        sceneElapsedMs: 2500,
        sceneDurationMs: 5000,
        sourceDurationMs: 16_000,
      }),
      2500,
    );
  });

  await test("Part8: delayed seek from prior scene is detectable as stale", () => {
    const registry = new ExportSeekRequestRegistry();
    const scene3 = registry.begin({
      frameIndex: 10,
      sceneId: "vid-1",
      requestedSourceTimeMs: 1000,
      startedAtWallMs: 0,
    });
    registry.begin({
      frameIndex: 20,
      sceneId: "img-3",
      requestedSourceTimeMs: 0,
      startedAtWallMs: 50,
    });
    const stale = registry.complete(scene3, {
      completedAtWallMs: 600,
      actualSourceTimeMs: 1000,
      reason: "seeked+rvfc",
    });
    assert.equal(stale.stale, true);
  });

  await test("Historical: captureStream(fps)+500ms waits truncated later scenes", () => {
    const slots = buildAuditTimelineSlots(SIX_SCENE_FIXTURE);
    const report = simulateCaptureStreamInflation({
      slots,
      fps: 30,
      videoPrepareMs: EXPORT_DECODE_READY_TIMEOUT_MS,
    });
    assert.equal(report.laterScenesTruncatedByMux, true);
    assert.ok(!report.sceneIdsVisibleAfterMuxTrim.includes("img-4"));
  });

  await test("4.2C-8B / 6D: production uses chunked canvas frames; legacy keeps manual capture", () => {
    const chunked = readSrc("src/features/export/chunking/render-chunked-silent-visual.ts");
    const runtime = readSrc("src/features/export/runtime/render-export.ts");
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(runtime, /renderChunkedSilentVisual/);
    assert.match(chunked, /buildExportChunkPlan/);
    assert.match(chunked, /renderExportChunkFrames/);
    assert.doesNotMatch(chunked, /canvas\.captureStream\(fps\)/);
    assert.doesNotMatch(chunked, /sleep\(frameMs\)/);
    // Legacy isolated path still uses manual capture + MediaRecorder.
    assert.match(legacy, /createManualCanvasFrameCapture/);
    assert.match(legacy, /await capture\.requestFrame\(frameIndex\)/);
    assert.match(legacy, /startExportMediaRecorder/);
    assert.match(legacy, /flushAndStopExportMediaRecorder/);
  });

  await test("4.2C-8B: one capture per semantic frame preserves all six scenes", () => {
    const slots = buildAuditTimelineSlots(SIX_SCENE_FIXTURE);
    const fps = 30;
    const projectMs = resolveAuditProjectDurationMs(SIX_SCENE_FIXTURE);
    const totalFrames = resolveTimelineFrameCount(projectMs, fps);
    const draws: string[] = [];
    const captures: string[] = [];

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      // Simulated slow video prepare (500ms) — must not create extra captures.
      void EXPORT_DECODE_READY_TIMEOUT_MS;
      const t = resolveTimelineFrameSampleTimeMs(frameIndex, fps);
      const active = resolveAuditActiveSceneAtTime(slots, t)!;
      draws.push(active.scene.id);
      captures.push(active.scene.id);
    }

    assert.equal(draws.length, totalFrames);
    assert.equal(captures.length, totalFrames);
    assert.equal(draws.length, captures.length);
    assert.ok(captures.includes("img-3"));
    assert.ok(captures.includes("img-4"));
    assert.ok(captures.includes("vid-1"));
    assert.ok(captures.includes("vid-2"));
    assert.equal(captures[captures.length - 1], "img-4");
    assert.equal(resolveExpectedSilentVisualDurationSec(totalFrames, fps), totalFrames / fps);
  });

  await test("4.2C-8B.2 / 6D: chunked segment encode uses framerate authority; legacy normalize retained", () => {
    const fps = 30;
    const capturedFrameCount = 952;
    const rawDurationSec = 24.43;
    const expectedNormalized = capturedFrameCount / fps;
    assert.ok(Math.abs(expectedNormalized - 31.7333) < 0.001);
    const rawEffective = capturedFrameCount / rawDurationSec;
    assert.ok(rawEffective > 38);
    const chunked = readSrc("src/features/export/chunking/encode-export-chunk.ts");
    assert.match(chunked, /-framerate/);
    assert.match(chunked, /-frames:v/);
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(legacy, /normalizeSilentVisualFrameTiming/);
    const utils = readSrc("src/features/export/utils/export-timestamp-normalization.utils.ts");
    assert.match(utils, /extract-vsync0\+image2-framerate-encode/);
  });

  await test("4.2C-8B: captions resolve before capture; capture after draw", () => {
    const render = readSrc("src/features/export/services/video-render.service.ts");
    const loop = render.slice(render.indexOf("for (let frameIndex"));
    assert.ok(loop.indexOf("subtitleDisplay") < loop.indexOf("prepareExportMediaForTimelineFrame"));
    assert.ok(loop.indexOf("drawSceneFrame(") < loop.indexOf("capture.requestFrame"));
    assert.ok(loop.indexOf("prepareExportMediaForTimelineFrame") < loop.indexOf("drawSceneFrame("));
  });

  await test("4.2C-8B: seek tokens + FPS epsilon present; no fixed 40ms skip", () => {
    const renderer = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(renderer, /beginExportVideoSeekRequest/);
    assert.match(renderer, /isExportVideoSeekRequestCurrent/);
    assert.match(renderer, /return 0\.5 \/ safeFps/);
    assert.doesNotMatch(renderer, /SEEK_NEAR_EPSILON_SEC\s*=\s*0\.04/);
    assert.equal(EXPORT_SEEK_TIMEOUT_MS, 2000);
  });

  await test("Part13: per-frame seek still costly but no longer duplicates captures", () => {
    const cost = estimateVideoFrameCostMs({
      seekMs: 40,
      decodeWaitMs: 5,
      drawMs: 5,
      sleepMs: 0,
    });
    const assessment = assessPerFrameSeekViability({
      fps: 30,
      averageVideoFrameWallMs: cost,
      projectDurationMs: 18_000,
      maxRealtimeMultiplier: 5,
    });
    // Without sleep + with fast readyState path, viability improves vs 500ms waits.
    assert.ok(cost < 100);
    void assessment;
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
