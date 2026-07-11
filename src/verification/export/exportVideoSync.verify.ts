/**
 * Export video frame accuracy (4.2C-7).
 * Run: npm run test:export-video-sync
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveExportSeekEpsilonSec,
  resolveExportSceneMediaPlaybackState,
  seekVideoFrame,
  waitForDecodedVideoFrame,
} from "@/features/export/utils/export-scene-media-renderer";
import { resolveSceneMediaPlayback } from "@/features/media-playback";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import {
  resolveTimelineFrameSampleTimeMs,
  resolveTimelineFrameTimeMs,
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

function createMockVideo(): HTMLVideoElement {
  let currentTime = 0;
  const listeners = new Map<string, Set<() => void>>();
  let rvfcHandle = 0;
  const video = {
    muted: true,
    volume: 0,
    paused: true,
    duration: 10,
    videoWidth: 1080,
    videoHeight: 1920,
    readyState: 2,
    seekCallCount: 0,
    drawReadyAfterSeek: false,
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      (video as { seekCallCount: number }).seekCallCount += 1;
      queueMicrotask(() => {
        listeners.get("seeked")?.forEach((fn) => fn());
      });
    },
    pause() {
      this.paused = true;
    },
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    requestVideoFrameCallback(cb: () => void) {
      rvfcHandle += 1;
      queueMicrotask(() => {
        (video as { drawReadyAfterSeek: boolean }).drawReadyAfterSeek = true;
        cb();
      });
      return rvfcHandle;
    },
    cancelVideoFrameCallback() {},
  };
  return video as unknown as HTMLVideoElement;
}

const videoMedia: SceneMedia = {
  type: "video",
  url: "blob:clip",
  durationMs: 5000,
  trimStartMs: 1000,
  trimEndMs: 4000,
  muted: true,
};

async function main() {
  console.log("\nexport-video-sync\n");

  await test("export timestamp uses direct frame formula (no accumulation)", () => {
    const fps = 30;
    const times: number[] = [];
    for (let i = 0; i < 90; i++) {
      times.push(resolveTimelineFrameSampleTimeMs(i, fps));
    }
    assert.equal(times[0], Math.round((0.5 * 1000) / fps));
    assert.equal(times[30], Math.round((30.5 * 1000) / fps));
    // Deterministic — same index always same ms
    assert.equal(resolveTimelineFrameSampleTimeMs(17, fps), times[17]);
    assert.notEqual(resolveTimelineFrameTimeMs(0, fps), resolveTimelineFrameSampleTimeMs(0, fps));
  });

  await test("24/30/60 FPS map equivalent seconds identically", () => {
    // 1.0s wall time → sample near center of the frame containing 1s
    const at1s = (fps: number) => {
      const frameIndex = Math.floor(1 * fps);
      return resolveTimelineFrameSampleTimeMs(frameIndex, fps);
    };
    // Frame containing t=1000ms: floor(1000*fps/1000)=floor(fps) → sample (fps+0.5)*1000/fps
    assert.equal(at1s(24), Math.round(((24 + 0.5) * 1000) / 24));
    assert.equal(at1s(30), Math.round(((30 + 0.5) * 1000) / 30));
    assert.equal(at1s(60), Math.round(((60 + 0.5) * 1000) / 60));
  });

  await test("trim offset included once via Media Playback Engine", () => {
    const scene: FootieScene = {
      id: "v1",
      start: 0,
      end: 3,
      duration: 3,
      durationMs: 3000,
      startMs: 0,
      endMs: 3000,
      media: videoMedia,
    };
    const a = resolveExportSceneMediaPlaybackState(scene, 500, 3000);
    const b = resolveSceneMediaPlayback({
      sceneMedia: videoMedia,
      sceneElapsedMs: 500,
      sceneDurationMs: 3000,
      playing: false,
      loopMode: "none",
    });
    assert.equal(a.clipTimeMs, b.clipTimeMs);
    assert.equal(a.clipTimeMs, 1500); // 1000 trim + 500 elapsed
    assert.equal(a.trimStartMs, 1000);
  });

  await test("same export timestamp → same source timestamp", () => {
    const scene: FootieScene = {
      id: "v1",
      start: 0,
      end: 3,
      duration: 3,
      durationMs: 3000,
      startMs: 0,
      endMs: 3000,
      media: videoMedia,
    };
    const first = resolveExportSceneMediaPlaybackState(scene, 1200, 3000);
    const second = resolveExportSceneMediaPlaybackState(scene, 1200, 3000);
    assert.equal(first.clipTimeMs, second.clipTimeMs);
  });

  await test("seek epsilon is FPS-aware (half frame) — no fixed 40ms", () => {
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(30) - 0.5 / 30) < 1e-9);
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(60) - 0.5 / 60) < 1e-9);
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(24) - 0.5 / 24) < 1e-9);
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(10) - 0.5 / 10) < 1e-9);
    assert.ok(resolveExportSeekEpsilonSec(60) < resolveExportSeekEpsilonSec(30));
  });

  await test("seeking waits for decoded frame before success", async () => {
    const video = createMockVideo();
    // Force post-seek decode path through RVFC by dropping readyState until seeked.
    Object.defineProperty(video, "readyState", {
      get: () => ((video as unknown as { seekCallCount: number }).seekCallCount > 0 ? 2 : 1),
      configurable: true,
    });
    const ok = await seekVideoFrame(video, 1.5, {
      epsilonSec: resolveExportSeekEpsilonSec(30),
    });
    assert.equal(ok, true);
    assert.ok(Math.abs(video.currentTime - 1.5) < 1e-6);
    assert.equal((video as unknown as { seekCallCount: number }).seekCallCount, 1);
  });

  await test("near-identical timestamp does not re-seek within epsilon", async () => {
    const video = createMockVideo();
    await seekVideoFrame(video, 1.0, { epsilonSec: resolveExportSeekEpsilonSec(30) });
    const seeksAfterFirst = (video as unknown as { seekCallCount: number }).seekCallCount;
    const ok = await seekVideoFrame(video, 1.0 + 0.001, {
      epsilonSec: resolveExportSeekEpsilonSec(30),
    });
    assert.equal(ok, true);
    assert.equal(
      (video as unknown as { seekCallCount: number }).seekCallCount,
      seeksAfterFirst,
    );
  });

  await test("no 500ms wait when correct decoded frame already available", async () => {
    const video = createMockVideo();
    await seekVideoFrame(video, 2.0, { epsilonSec: resolveExportSeekEpsilonSec(30) });
    const seeksAfterPrime = (video as unknown as { seekCallCount: number }).seekCallCount;
    const started = Date.now();
    const ok = await seekVideoFrame(video, 2.0 + 0.001, {
      epsilonSec: resolveExportSeekEpsilonSec(30),
    });
    assert.equal(ok, true);
    assert.ok(Date.now() - started < 100);
    assert.equal(
      (video as unknown as { seekCallCount: number }).seekCallCount,
      seeksAfterPrime,
    );
  });

  await test("target-time change forces a new seek (no stale frame reuse)", async () => {
    const video = createMockVideo();
    await seekVideoFrame(video, 0.5, { epsilonSec: resolveExportSeekEpsilonSec(30) });
    const afterFirst = (video as unknown as { seekCallCount: number }).seekCallCount;
    await seekVideoFrame(video, 1.0, { epsilonSec: resolveExportSeekEpsilonSec(30) });
    assert.equal(
      (video as unknown as { seekCallCount: number }).seekCallCount,
      afterFirst + 1,
    );
  });

  await test("waitForDecodedVideoFrame uses RVFC when not yet ready", async () => {
    const video = createMockVideo();
    Object.defineProperty(video, "readyState", {
      get: () => 1,
      configurable: true,
    });
    const ok = await waitForDecodedVideoFrame(video, { timeoutMs: 100 });
    assert.equal(ok, true);
    assert.equal((video as unknown as { drawReadyAfterSeek: boolean }).drawReadyAfterSeek, true);
  });

  await test("stale seek request tokens are rejected", async () => {
    const {
      beginExportVideoSeekRequest,
      isExportVideoSeekRequestCurrent,
      resetExportVideoSamplingState,
    } = await import("@/features/export/utils/export-scene-media-renderer");
    resetExportVideoSamplingState();
    const first = beginExportVideoSeekRequest("vid-a");
    const second = beginExportVideoSeekRequest("vid-a");
    assert.equal(isExportVideoSeekRequestCurrent(first), false);
    assert.equal(isExportVideoSeekRequestCurrent(second), true);
  });

  await test("scene switch resets sampling identity", async () => {
    const {
      beginExportVideoSeekRequest,
      getExportVideoSamplingState,
      noteExportPreparedScene,
      resetExportVideoSamplingState,
    } = await import("@/features/export/utils/export-scene-media-renderer");
    resetExportVideoSamplingState();
    beginExportVideoSeekRequest("vid-1");
    noteExportPreparedScene("img-2", "image");
    assert.equal(getExportVideoSamplingState().sceneId, "img-2");
    assert.equal(getExportVideoSamplingState().lastRequestedSourceSec, null);
  });

  await test("long source video in short scene uses scene-local clip only", () => {
    const scene: FootieScene = {
      id: "v",
      start: 0,
      end: 5,
      duration: 5,
      durationMs: 5000,
      startMs: 0,
      endMs: 5000,
      media: {
        type: "video",
        url: "blob:long",
        durationMs: 16_000,
        muted: true,
      },
    };
    const end = resolveExportSceneMediaPlaybackState(scene, 4999, 5000);
    assert.equal(end.clipTimeMs, 4999);
    assert.ok(end.clipTimeMs < 16_000);
  });

  await test("export loop uses sample time + FPS seek epsilon (chunked or legacy)", () => {
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    const chunked = readSrc("src/features/export/chunking/render-export-chunk.ts");
    const runtime = readSrc("src/features/export/runtime/render-export.ts");
    assert.match(runtime, /renderChunkedSilentVisual/);
    assert.match(chunked, /prepareExportFrame/);
    assert.match(legacy, /resolveTimelineFrameSampleTimeMs|createManualCanvasFrameCapture/);
    assert.doesNotMatch(legacy, /sleep\(frameMs\)/);
    const renderer = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(renderer, /waitForDecodedVideoFrame/);
    assert.match(renderer, /resolveExportSeekEpsilonSec/);
    assert.match(renderer, /beginExportVideoSeekRequest/);
  });

  await test("canvas draw path restores state (save/restore)", () => {
    const renderer = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(renderer, /ctx\.save\(\)/);
    assert.match(renderer, /ctx\.restore\(\)/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
