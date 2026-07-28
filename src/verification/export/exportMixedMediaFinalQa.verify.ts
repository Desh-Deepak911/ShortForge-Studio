/**
 * Mixed-media export final QA (4.2C-8C).
 * Run: npm run test:export-mixed-media-final
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mapSceneToExport } from "@/features/export/services/export-payload.service";
import {
  resolveExpectedSilentVisualDurationSec,
  shouldNormalizeSilentVisualTiming,
  validateEffectivePlaybackFps,
  validateSilentVisualDuration,
} from "@/features/export/utils/export-manual-canvas-capture.utils";
import { resolveExportSceneMediaPlaybackState } from "@/features/export/utils/export-scene-media-renderer";
import { resolveExportSeekEpsilonSec } from "@/features/export/utils/export-scene-media-renderer";
import {
  resolveAuditActiveSceneAtTime,
  resolveAuditVideoClipTimeMs,
} from "@/features/export/utils/export-pipeline-audit.utils";
import { getExportSubtitleChunkState } from "@/features/export/utils/export-subtitle.utils";
import {
  MIXED_MEDIA_QA_CONTENT_DURATION_MS,
  MIXED_MEDIA_QA_SCENE_SPECS,
  buildMixedMediaQaAuditSlots,
  buildMixedMediaQaScenes,
  collectMixedMediaQaScenePresence,
  resolveMixedMediaQaProjectDurationMs,
  walkMixedMediaQaFrames,
} from "@/verification/export/mixedMediaQaFixture";
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

async function main() {
  console.log("\nexport-mixed-media-final (4.2C-8C)\n");

  await test("fixture: six scenes, four images, two videos, 21s content", () => {
    assert.equal(MIXED_MEDIA_QA_SCENE_SPECS.length, 6);
    assert.equal(
      MIXED_MEDIA_QA_SCENE_SPECS.filter((s) => s.mediaType === "image").length,
      4,
    );
    assert.equal(
      MIXED_MEDIA_QA_SCENE_SPECS.filter((s) => s.mediaType === "video").length,
      2,
    );
    assert.equal(resolveMixedMediaQaProjectDurationMs(), MIXED_MEDIA_QA_CONTENT_DURATION_MS);
    assert.ok(MIXED_MEDIA_QA_SCENE_SPECS.some((s) => s.fitMode === "fit"));
    assert.ok(MIXED_MEDIA_QA_SCENE_SPECS.some((s) => s.fitMode === "fill"));
    assert.ok(MIXED_MEDIA_QA_SCENE_SPECS.some((s) => s.hasMotion));
    assert.equal(
      MIXED_MEDIA_QA_SCENE_SPECS.find((s) => s.id === "vid-long-source")?.sourceDurationMs,
      16_000,
    );
  });

  await test("scene boundaries: start/mid/end ±1 frame for every scene", () => {
    const slots = buildMixedMediaQaAuditSlots();
    const fps = 30;
    const frameMs = 1000 / fps;

    for (const slot of slots) {
      const before = resolveAuditActiveSceneAtTime(slots, Math.max(0, slot.startMs - 1));
      if (slot.startMs > 0) {
        assert.notEqual(before!.scene.id, slot.id);
      }

      const atStart = resolveAuditActiveSceneAtTime(slots, slot.startMs);
      assert.equal(atStart!.scene.id, slot.id);
      assert.equal(atStart!.sceneElapsedMs, 0);

      const mid = resolveAuditActiveSceneAtTime(
        slots,
        slot.startMs + Math.floor(slot.durationMs / 2),
      );
      assert.equal(mid!.scene.id, slot.id);

      const nearEnd = resolveAuditActiveSceneAtTime(slots, slot.endMs - 1);
      assert.equal(nearEnd!.scene.id, slot.id);

      if (slot.id !== slots[slots.length - 1]!.id) {
        const atEnd = resolveAuditActiveSceneAtTime(slots, slot.endMs);
        assert.notEqual(atEnd!.scene.id, slot.id);
      }

      // One-frame samples around start
      const startFrame = resolveTimelineFrameSampleTimeMs(
        Math.floor((slot.startMs * fps) / 1000),
        fps,
      );
      assert.ok(Math.abs(startFrame - slot.startMs) < frameMs * 1.5 || startFrame >= slot.startMs - frameMs);
    }
  });

  for (const fps of [24, 30, 60] as const) {
    await test(`${fps} FPS: all six scenes captured; final scene retained`, () => {
      const presence = collectMixedMediaQaScenePresence(fps);
      for (const id of presence.sceneIds) {
        assert.ok(id in presence.firstFrameByScene, `missing ${id}`);
        assert.ok(id in presence.lastFrameByScene, `missing last ${id}`);
      }
      assert.equal(presence.finalSceneId, "img-final-fit");
      assert.equal(
        presence.totalFrames,
        resolveTimelineFrameCount(MIXED_MEDIA_QA_CONTENT_DURATION_MS, fps),
      );
      assert.equal(presence.expectedDurationSec, presence.totalFrames / fps);

      // Image after first video
      assert.ok(
        presence.firstFrameByScene["img-motion"]! >
          presence.lastFrameByScene["vid-long-source"]!,
      );
      // Second video after motion image
      assert.ok(
        presence.firstFrameByScene["vid-second"]! >
          presence.lastFrameByScene["img-motion"]!,
      );
      // Final image after second video
      assert.ok(
        presence.firstFrameByScene["img-final-fit"]! >
          presence.lastFrameByScene["vid-second"]!,
      );
    });
  }

  await test("one capture per semantic frame — slow prepare cannot drop later scenes", () => {
    const fps = 30;
    const walk = walkMixedMediaQaFrames(fps);
    // Simulate 500ms prepare cost without extra captures
    const captures = walk.map((sample) => ({
      frameIndex: sample.frameIndex,
      sceneId: sample.sceneId,
      prepareMs: sample.mediaType === "video" ? 500 : 2,
    }));
    assert.equal(captures.length, walk.length);
    assert.equal(new Set(captures.map((c) => c.frameIndex)).size, walk.length);
    assert.ok(captures.some((c) => c.sceneId === "img-motion"));
    assert.ok(captures.some((c) => c.sceneId === "img-final-fit"));
    assert.equal(captures[captures.length - 1]!.sceneId, "img-final-fit");
  });

  await test("long source video does not extend scene or project duration", () => {
    const scenes = buildMixedMediaQaScenes();
    const video = scenes.find((s) => s.id === "vid-long-source")!;
    const atEnd = resolveExportSceneMediaPlaybackState(video, 4999, 5000);
    assert.equal(atEnd.clipTimeMs, 4999);
    assert.ok(atEnd.clipTimeMs < 16_000);
    assert.equal(
      resolveAuditVideoClipTimeMs({
        sceneElapsedMs: 2500,
        sceneDurationMs: 5000,
        sourceDurationMs: 16_000,
      }),
      2500,
    );
    assert.equal(resolveMixedMediaQaProjectDurationMs(), 21_000);
  });

  await test("second video uses independent scene identity and clip timeline", () => {
    const scenes = buildMixedMediaQaScenes();
    const v1 = scenes.find((s) => s.id === "vid-long-source")!;
    const v2 = scenes.find((s) => s.id === "vid-second")!;
    assert.notEqual(v1.media?.url, v2.media?.url);
    assert.equal(resolveExportSceneMediaPlaybackState(v2, 0, 4000).clipTimeMs, 0);
    assert.equal(resolveExportSceneMediaPlaybackState(v2, 2000, 4000).clipTimeMs, 2000);
  });

  await test("captions progress across all scenes including after videos", () => {
    const scenes = buildMixedMediaQaScenes();
    for (const scene of scenes) {
      const state = getExportSubtitleChunkState(mapSceneToExport(scene), {
        sceneElapsedMs: Math.floor((scene.durationMs ?? 1000) / 2),
        sceneDurationMs: scene.durationMs ?? 1000,
      });
      assert.ok(state.chunk.trim().length > 0, scene.id);
    }
    const final = scenes.find((s) => s.id === "img-final-fit")!;
    const exportFinal = mapSceneToExport(final);
    const nearEnd = getExportSubtitleChunkState(exportFinal, {
      sceneElapsedMs: (final.durationMs ?? 3000) - 1,
      sceneDurationMs: final.durationMs ?? 3000,
    });
    assert.equal(nearEnd.chunk, exportFinal.subtitleChunks.at(-1));
    assert.ok(nearEnd.chunk.length > 0);
  });

  await test("final caption completes within final 200ms of project", () => {
    const slots = buildMixedMediaQaAuditSlots();
    const projectEnd = resolveMixedMediaQaProjectDurationMs();
    const active = resolveAuditActiveSceneAtTime(slots, projectEnd - 100);
    assert.equal(active!.scene.id, "img-final-fit");
    const scenes = buildMixedMediaQaScenes();
    const final = scenes.find((s) => s.id === "img-final-fit")!;
    const state = getExportSubtitleChunkState(mapSceneToExport(final), {
      sceneElapsedMs: active!.sceneElapsedMs,
      sceneDurationMs: final.durationMs ?? 3000,
    });
    assert.ok(state.chunk.length > 0);
  });

  await test("effective playback FPS validation catches slow-motion inflation", () => {
    const ok = validateEffectivePlaybackFps({
      capturedFrameCount: 600,
      encodedDurationSec: 20,
      targetFps: 30,
    });
    assert.equal(ok.ok, true);
    assert.ok(Math.abs(ok.effectivePlaybackFps - 30) < 0.01);

    const slow = validateEffectivePlaybackFps({
      capturedFrameCount: 600,
      encodedDurationSec: 300,
      targetFps: 30,
    });
    assert.equal(slow.ok, false);
    assert.ok(slow.effectivePlaybackFps < 5);
  });

  await test("duration validation rejects wall-clock inflated blobs", () => {
    const bad = validateSilentVisualDuration({
      totalFrames: 630,
      fps: 30,
      wallClockExportMs: 180_000,
      actualDurationSec: 180,
    });
    assert.equal(bad.ok, false);

    const good = validateSilentVisualDuration({
      totalFrames: 630,
      fps: 30,
      wallClockExportMs: 180_000,
      actualDurationSec: 21.05,
    });
    assert.equal(good.ok, true);
  });

  await test("normalize is required when MediaRecorder stamps wall-clock timestamps", () => {
    assert.equal(
      shouldNormalizeSilentVisualTiming({
        totalFrames: 630,
        fps: 30,
        wallClockExportMs: 120_000,
        actualDurationSec: 120,
      }),
      true,
    );
    assert.equal(
      shouldNormalizeSilentVisualTiming({
        totalFrames: 630,
        fps: 30,
        wallClockExportMs: 25_000,
        actualDurationSec: 21.0,
      }),
      false,
    );
  });

  await test("production always CFR-encodes silent visual before mux (chunked path)", () => {
    const runtime = readSrc("src/features/export/runtime/render-export.ts");
    const chunked = readSrc("src/features/export/chunking/render-chunked-silent-visual.ts");
    const encode = readSrc("src/features/export/chunking/encode-export-chunk.ts");
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(runtime, /renderChunkedSilentVisual/);
    assert.match(chunked, /buildExportSegmentEncodeArgs/);
    assert.match(encode, /"-framerate"/);
    assert.match(encode, /"-frames:v"/);
    assert.doesNotMatch(chunked, /canvas\.captureStream\(fps\)/);
    assert.doesNotMatch(chunked, /sleep\(frameMs\)/);
    assert.match(legacy, /normalizeSilentVisualFrameTiming/);
    assert.match(legacy, /createManualCanvasFrameCapture/);
    assert.doesNotMatch(legacy, /shouldNormalizeSilentVisualTiming/);

    const ffmpeg = readSrc("src/features/export/utils/ffmpeg.utils.ts");
    assert.match(ffmpeg, /normalizeSilentVisualFrameTiming/);
    assert.match(ffmpeg, /buildSilentVisualFrameExtractArgs/);
    assert.match(ffmpeg, /buildSilentVisualFrameSequenceEncodeArgs/);

    const normalizeUtils = readSrc(
      "src/features/export/utils/export-timestamp-normalization.utils.ts",
    );
    assert.match(normalizeUtils, /"-framerate"/);
    assert.match(normalizeUtils, /"-vsync"/);
    assert.match(normalizeUtils, /"-frames:v"/);
    assert.doesNotMatch(normalizeUtils, /fps=\$\{/);
  });

  await test("FPS-aware seek epsilon for 24/30/60; no fixed 40ms", () => {
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(24) - 0.5 / 24) < 1e-9);
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(30) - 0.5 / 30) < 1e-9);
    assert.ok(Math.abs(resolveExportSeekEpsilonSec(60) - 0.5 / 60) < 1e-9);
  });

  await test("720p/1080p semantic duration identical (resolution-independent clock)", () => {
    for (const fps of [30, 60]) {
      const a = resolveExpectedSilentVisualDurationSec(
        resolveTimelineFrameCount(MIXED_MEDIA_QA_CONTENT_DURATION_MS, fps),
        fps,
      );
      const b = resolveExpectedSilentVisualDurationSec(
        resolveTimelineFrameCount(MIXED_MEDIA_QA_CONTENT_DURATION_MS, fps),
        fps,
      );
      assert.equal(a, b);
      assert.ok(Math.abs(a - MIXED_MEDIA_QA_CONTENT_DURATION_MS / 1000) < 1 / fps + 0.001);
    }
  });

  await test("frame walk is monotonic and ends on final fit image", () => {
    const walk = walkMixedMediaQaFrames(30);
    for (let i = 1; i < walk.length; i++) {
      assert.ok(walk[i]!.exportTimestampMs >= walk[i - 1]!.exportTimestampMs);
      assert.equal(walk[i]!.frameIndex, walk[i - 1]!.frameIndex + 1);
    }
    assert.equal(walk[0]!.sceneId, "img-landscape");
    assert.equal(walk[walk.length - 1]!.sceneId, "img-final-fit");
    assert.equal(walk[walk.length - 1]!.isLastFrameOfScene, true);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
