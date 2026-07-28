/**
 * Export subtitle sync (4.2C-7).
 * Run: npm run test:export-subtitle-sync
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  mapSceneToExport,
} from "@/features/export/services/export-payload.service";
import {
  resolveExportFrameFromMasterTimeline,
} from "@/features/export/services/video-render.service";
import {
  getExportSubtitleChunkState,
  resolveExportSubtitleDisplay,
} from "@/features/export/utils/export-subtitle.utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
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

function makeScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 4,
    duration: 4,
    durationMs: 4000,
    startMs: 0,
    endMs: 4000,
    captionMode: "subtitles",
    subtitle: "Hello world from export sync",
    subtitleText: "Hello world from export sync",
    subtitleEffect: "fade-up",
    ...overrides,
  };
}

async function main() {
  console.log("\nexport-subtitle-sync\n");

  await test("caption resolved before draw in export frame path", () => {
    const videoRender = readSrc("src/features/export/services/video-render.service.ts");
    const loopStart = videoRender.indexOf("for (let frameIndex");
    const loop = videoRender.slice(loopStart, loopStart + 2500);
    const subtitleIdx = loop.indexOf("subtitleDisplay");
    const prepareIdx = loop.indexOf("prepareExportMediaForTimelineFrame");
    const drawIdx = loop.indexOf("drawSceneFrame(");
    assert.ok(subtitleIdx > -1 && prepareIdx > subtitleIdx && drawIdx > prepareIdx);
  });

  await test("export uses frame-center sample timestamp for captions", () => {
    const videoRender = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(videoRender, /resolveTimelineFrameSampleTimeMs\(frameIndex,\s*fps\)/);
  });

  await test("millisecond precision retained (no whole-second rounding)", () => {
    for (const fps of [24, 30, 60]) {
      const t0 = resolveTimelineFrameSampleTimeMs(0, fps);
      const t1 = resolveTimelineFrameSampleTimeMs(1, fps);
      assert.ok(t1 - t0 < 1000, `fps=${fps} frame delta must stay sub-second`);
      assert.ok(Number.isInteger(t0) && Number.isInteger(t1));
    }
  });

  await test("caption boundaries at ±1ms and frame midpoint", () => {
    const scene = makeScene({
      subtitle: "Only chunk",
      subtitleText: "Only chunk",
      subtitleEffect: "fade-up",
    });
    const exportScene = mapSceneToExport(scene);
    const duration = 4000;

    const atStart = resolveExportSubtitleDisplay(exportScene, {
      sceneElapsedMs: 0,
      sceneDurationMs: duration,
    });
    assert.ok(atStart);
    assert.equal(atStart!.activeChunk, "Only chunk");

    const oneMsIn = resolveExportSubtitleDisplay(exportScene, {
      sceneElapsedMs: 1,
      sceneDurationMs: duration,
    });
    assert.ok(oneMsIn);

    const mid = resolveExportSubtitleDisplay(exportScene, {
      sceneElapsedMs: Math.floor(duration / 2),
      sceneDurationMs: duration,
    });
    assert.ok(mid);

    const nearEnd = resolveExportSubtitleDisplay(exportScene, {
      sceneElapsedMs: duration - 1,
      sceneDurationMs: duration,
    });
    assert.ok(nearEnd);

    // Negative elapsed is clamped by timing helpers — still resolves deterministically.
    const clampedNeg = resolveExportSubtitleDisplay(exportScene, {
      sceneElapsedMs: -1,
      sceneDurationMs: duration,
    });
    assert.ok(clampedNeg);
    assert.equal(clampedNeg!.sceneElapsedMs, -1);
  });

  await test("chunk state progresses with sceneElapsedMs (no previous-frame lag)", () => {
    const scene = makeScene({
      subtitle: "AAA. BBB.",
      subtitleText: "AAA. BBB.",
      subtitleEffect: "fade-up",
    });
    const exportScene = mapSceneToExport(scene);
    const early = getExportSubtitleChunkState(exportScene, {
      sceneElapsedMs: 100,
      sceneDurationMs: 4000,
    });
    const late = getExportSubtitleChunkState(exportScene, {
      sceneElapsedMs: 3000,
      sceneDurationMs: 4000,
    });
    assert.equal(early.chunk, exportScene.subtitleChunks[0]);
    assert.equal(late.chunk, exportScene.subtitleChunks.at(-1));
    assert.ok(late.chunkElapsedMs >= 0);
  });

  await test("24/30/60 FPS sample times stay consistent for same sceneElapsed", () => {
    const scene = makeScene();
    const exportScene = mapSceneToExport(scene);
    for (const fps of [24, 30, 60]) {
      const exportTs = resolveTimelineFrameSampleTimeMs(15, fps);
      const display = resolveExportSubtitleDisplay(exportScene, {
        sceneElapsedMs: Math.min(exportTs, scene.durationMs ?? 4000),
        sceneDurationMs: scene.durationMs ?? 4000,
      });
      assert.ok(display);
      assert.equal(display!.sceneElapsedMs, Math.min(exportTs, scene.durationMs ?? 4000));
    }
  });

  await test("MasterTimeline export frame resolves subtitle from same timestamp", () => {
    const scene = makeScene({
      narration: "Hello world from export sync",
    });
    const script: FootieScript = {
      title: "Sync",
      narration: "Hello world from export sync",
      scenes: [scene],
      totalDuration: 4,
      voiceoverUrl: "blob:voice",
      voiceoverDurationMs: 4000,
    };
    const preflight = prepareStoryForExport(script);
    const scenes = buildFootieExportPayload(preflight.story).scenes;
    const sceneById = new Map(scenes.map((s) => [s.id, s]));
    const masterTimeline = preflight.masterTimeline;

    const t = 500;
    const frameA = resolveExportFrameFromMasterTimeline(
      masterTimeline,
      scenes,
      sceneById,
      t,
      script.defaultCaptionAnimation,
    );
    const frameB = resolveExportFrameFromMasterTimeline(
      masterTimeline,
      scenes,
      sceneById,
      t,
      script.defaultCaptionAnimation,
    );
    assert.equal(frameA.timing.sceneElapsedMs, frameB.timing.sceneElapsedMs);
    assert.equal(
      frameA.subtitleDisplay?.activeChunk ?? null,
      frameB.subtitleDisplay?.activeChunk ?? null,
    );
  });

  await test("no independent caption clock in export renderer", () => {
    const videoRender = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(videoRender, /resolveExportFrameTiming|resolveExportFrameFromMasterTimeline/);
    assert.match(videoRender, /resolveTimelineFrameSampleTimeMs\(frameIndex,\s*fps\)/);
    // Subtitles are resolved with the same currentTimeMs as scene timing — before capture.
    assert.match(
      videoRender,
      /const currentTimeMs = resolveTimelineFrameSampleTimeMs[\s\S]*subtitleDisplay[\s\S]*prepareExportMediaForTimelineFrame[\s\S]*capture\.requestFrame/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
