/**
 * Manual canvas capture unit tests (4.2C-8B).
 * Run: npm run test:export-manual-capture
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ManualCanvasCaptureError,
  createManualCanvasFrameCapture,
  resolveExpectedSilentVisualDurationSec,
  validateSilentVisualDuration,
  waitForRecorderFrameIngestion,
} from "@/features/export/utils/export-manual-canvas-capture.utils";
import {
  resolveTimelineFrameCount,
  resolveTimelineFrameSampleTimeMs,
} from "@/features/timeline-intelligence/timeline-playback.utils";
import {
  buildAuditTimelineSlots,
  resolveAuditActiveSceneAtTime,
  simulateCaptureStreamInflation,
} from "@/features/export/utils/export-pipeline-audit.utils";

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

function createMockCanvas(): HTMLCanvasElement {
  let requestCount = 0;
  const track = {
    readyState: "live" as MediaStreamTrackState,
    requestCount: 0,
    requestFrame() {
      requestCount += 1;
      (track as { requestCount: number }).requestCount = requestCount;
    },
    stop() {
      track.readyState = "ended";
    },
  };

  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  };

  return {
    captureStream(frameRate?: number) {
      assert.equal(frameRate, 0, "manual capture must use captureStream(0)");
      return stream;
    },
  } as unknown as HTMLCanvasElement;
}

async function main() {
  console.log("\nexport-manual-capture\n");

  await test("production export uses chunked canvas→JPEG; legacy keeps captureStream(0)", () => {
    const runtime = readSrc("src/features/export/runtime/render-export.ts");
    const chunked = readSrc("src/features/export/chunking/render-chunked-silent-visual.ts");
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(runtime, /renderChunkedSilentVisual/);
    assert.match(chunked, /canvasToJpegBytes|toBlob/);
    assert.doesNotMatch(chunked, /canvas\.captureStream\(fps\)/);
    assert.doesNotMatch(chunked, /sleep\(frameMs\)/);
    assert.match(legacy, /createManualCanvasFrameCapture|captureStream\(0\)/);
    assert.match(legacy, /await capture\.requestFrame\(frameIndex\)/);
    assert.match(legacy, /startExportMediaRecorder/);
    assert.match(legacy, /flushAndStopExportMediaRecorder/);
  });

  await test("one requestFrame per frame index; duplicates rejected", async () => {
    const canvas = createMockCanvas();
    const capture = createManualCanvasFrameCapture(canvas, { strict: true });
    await capture.requestFrame(0);
    await capture.requestFrame(1);
    await capture.requestFrame(2);
    assert.equal(capture.capturedFrameCount(), 3);
    await assert.rejects(() => capture.requestFrame(2), ManualCanvasCaptureError);
    await assert.rejects(() => capture.requestFrame(4), ManualCanvasCaptureError);
  });

  await test("monotonic first and last frames retained in accounting", async () => {
    const canvas = createMockCanvas();
    const capture = createManualCanvasFrameCapture(canvas, { strict: true });
    const total = 10;
    for (let i = 0; i < total; i++) {
      await capture.requestFrame(i);
    }
    assert.equal(capture.capturedFrameCount(), total);
    assert.deepEqual([...capture.requestedFrameIndexes()], [...Array(total).keys()]);
  });

  await test("cancel blocks further capture requests", async () => {
    const canvas = createMockCanvas();
    const capture = createManualCanvasFrameCapture(canvas, { strict: true });
    await capture.requestFrame(0);
    capture.cancel();
    await assert.rejects(() => capture.requestFrame(1), ManualCanvasCaptureError);
  });

  await test("missing requestFrame throws — no captureStream(fps) fallback", () => {
    const canvas = {
      captureStream() {
        return {
          getVideoTracks: () => [{ readyState: "live", stop() {} }],
          getTracks: () => [{ stop() {} }],
        };
      },
    } as unknown as HTMLCanvasElement;

    assert.throws(
      () => createManualCanvasFrameCapture(canvas, { strict: true }),
      ManualCanvasCaptureError,
    );
  });

  await test("expected visual duration is totalFrames / fps (not wall clock)", () => {
    assert.equal(resolveExpectedSilentVisualDurationSec(600, 30), 20);
    assert.equal(resolveExpectedSilentVisualDurationSec(480, 24), 20);
    assert.equal(resolveExpectedSilentVisualDurationSec(1200, 60), 20);

    const wallClockMinutes = 8 * 60_000;
    const validation = validateSilentVisualDuration({
      totalFrames: 600,
      fps: 30,
      wallClockExportMs: wallClockMinutes,
      actualDurationSec: 20.05,
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.expectedDurationSec, 20);

    const inflated = validateSilentVisualDuration({
      totalFrames: 600,
      fps: 30,
      wallClockExportMs: wallClockMinutes,
      actualDurationSec: 180,
    });
    assert.equal(inflated.ok, false);
  });

  await test("24/30/60 FPS frame counts and sample times", () => {
    for (const fps of [24, 30, 60]) {
      const total = resolveTimelineFrameCount(20_000, fps);
      assert.equal(total, Math.ceil((20_000 * fps) / 1000));
      assert.equal(resolveExpectedSilentVisualDurationSec(total, fps), total / fps);
      assert.ok(resolveTimelineFrameSampleTimeMs(0, fps) < 1000 / fps);
    }
  });

  await test("slow video decode model no longer truncates later scenes under manual capture", () => {
    // Historical inflation model still documents the old bug…
    const slots = buildAuditTimelineSlots([
      { id: "img-1", mediaType: "image", sceneDurationMs: 2000 },
      { id: "img-2", mediaType: "image", sceneDurationMs: 2000 },
      {
        id: "vid-1",
        mediaType: "video",
        sceneDurationMs: 5000,
        sourceDurationMs: 16_000,
      },
      { id: "img-3", mediaType: "image", sceneDurationMs: 2000 },
      {
        id: "vid-2",
        mediaType: "video",
        sceneDurationMs: 4000,
        sourceDurationMs: 12_000,
      },
      { id: "img-4", mediaType: "image", sceneDurationMs: 3000 },
    ]);
    const legacy = simulateCaptureStreamInflation({
      slots,
      fps: 30,
      videoPrepareMs: 500,
    });
    assert.equal(legacy.laterScenesTruncatedByMux, true);

    // …but with manual capture, capture count === semantic frames regardless of prepare cost.
    const fps = 30;
    const projectMs = slots[slots.length - 1]!.endMs;
    const totalFrames = resolveTimelineFrameCount(projectMs, fps);
    const captures: Array<{ frameIndex: number; sceneId: string }> = [];
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      // Simulated 500ms prepare does not create extra captures.
      const t = resolveTimelineFrameSampleTimeMs(frameIndex, fps);
      const active = resolveAuditActiveSceneAtTime(slots, t)!;
      captures.push({ frameIndex, sceneId: active.scene.id });
    }
    assert.equal(captures.length, totalFrames);
    assert.ok(captures.some((c) => c.sceneId === "img-3"));
    assert.ok(captures.some((c) => c.sceneId === "img-4"));
    assert.ok(captures.some((c) => c.sceneId === "vid-2"));
    assert.equal(captures[captures.length - 1]!.sceneId, "img-4");
  });

  await test("waitForRecorderFrameIngestion is not fps-paced", async () => {
    const started = Date.now();
    await waitForRecorderFrameIngestion();
    assert.ok(Date.now() - started < 100);
  });

  await test("manual capture guarantees order/count; chunked encode guarantees FPS/duration", () => {
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    const chunked = readSrc("src/features/export/chunking/render-chunked-silent-visual.ts");
    const encode = readSrc("src/features/export/chunking/encode-export-chunk.ts");
    assert.match(legacy, /from \"@\/features\/export\/utils\/export-manual-canvas-capture\.utils\"/);
    assert.match(legacy, /validateSilentVisualDuration|probeBlobDurationSec/);
    assert.match(legacy, /capturedFrameCount\(\) !== totalFrames/);
    assert.match(legacy, /normalizeSilentVisualFrameTiming/);
    assert.match(chunked, /buildExportChunkPlan/);
    assert.match(encode, /-framerate/);
    assert.match(encode, /-frames:v/);
    assert.doesNotMatch(
      legacy,
      /requestFrame\(\) (guarantees|ensures) (constant|CFR)/i,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
