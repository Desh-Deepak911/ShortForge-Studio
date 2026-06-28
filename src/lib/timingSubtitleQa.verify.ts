/**
 * Timing + subtitle wrapping QA (run: npm run test:timing-subtitle-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  getRenderableScenesFromPayload,
} from "@/features/export/services";
import { wrapTextToLines } from "@/features/export/utils/export-caption-canvas.utils";
import { resolveExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import { getPreviewFrameAtTime } from "@/features/preview/utils/previewTimeline";
import { getPreviewSceneTiming } from "@/features/preview/utils/previewSceneTiming";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  applyManualDurationPatch,
  attachEvenVoiceoverTiming,
  getActiveSceneAtTime,
  getActiveSubtitleChunkState,
  getSceneTimingAtGlobalTime,
  getSceneTimingMap,
  isSubtitleChunkWithinLimits,
  recalculateSceneTimings,
  splitSubtitleChunks,
  SUBTITLE_MAX_VISIBLE_LINES,
  wrapSubtitleTextToDisplayLines,
} from "@/features/story/utils";
import { resolveSubtitleDisplayLayout } from "@/features/story/utils/subtitle-layout.utils";
import { getExportSubtitleChunkState } from "@/features/export/utils/export-subtitle.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeScene(id: string, durationSec: number, subtitle: string): FootieScene {
  return {
    id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    subtitle,
  };
}

function buildEditedTwoSceneStory(): FootieScript {
  const timed = attachEvenVoiceoverTiming(
    [makeScene("scene-1", 7, "Scene one caption"), makeScene("scene-2", 7, "Scene two caption")],
    14_000,
  );
  const edited = recalculateSceneTimings(
    timed.map((scene, index) =>
      index === 0 ? { ...scene, ...applyManualDurationPatch(3) } : scene,
    ),
  );

  return {
    title: "Timing QA",
    narration: "Narration for timing QA story.",
    totalDuration: edited.reduce((sum, scene) => sum + scene.duration, 0),
    scenes: edited,
  };
}

function mockCanvasCtx(charWidth = 8): CanvasRenderingContext2D {
  return {
    measureText(text: string) {
      return { width: text.length * charWidth };
    },
  } as CanvasRenderingContext2D;
}

function computeExportLineBaselines(lineCount: number, scale = 1): number[] {
  const fontSize = 64 * scale;
  const lineHeight = fontSize * 1.3;
  const padY = 10 * scale;
  const subtitleY = 1600 * scale;
  const textBlockHeight = lineCount * lineHeight;
  const boxHeight = textBlockHeight + padY * 2;
  const boxTop = subtitleY - boxHeight;
  const textTopY = boxTop + padY;

  return Array.from({ length: lineCount }, (_, index) => textTopY + (index + 1) * lineHeight);
}

console.log("timing-subtitle-qa");

test("manual edit changes Scene 1 from 7s to 3s with synced ms fields", () => {
  const script = buildEditedTwoSceneStory();
  const scene1 = script.scenes[0]!;

  assert.equal(scene1.duration, 3);
  assert.equal(scene1.durationMs, 3000);
  assert.equal(scene1.durationSource, "manual");
});

test("preview switches to Scene 2 at 3s after duration edit", () => {
  const script = buildEditedTwoSceneStory();
  const { scenes } = script;
  const timelineItems = script.timelineItems ?? [];

  assert.equal(getActiveSceneAtTime(scenes, 2999)?.index, 0);
  assert.equal(getActiveSceneAtTime(scenes, 3000)?.index, 1);

  const frameBefore = getPreviewFrameAtTime(timelineItems, scenes, 2.999);
  const frameAfter = getPreviewFrameAtTime(timelineItems, scenes, 3);

  assert.equal(frameBefore.kind === "scene" ? frameBefore.sceneIndex : -1, 0);
  assert.equal(frameAfter.kind === "scene" ? frameAfter.sceneIndex : -1, 1);
});

test("export switches to Scene 2 at 3s after duration edit", () => {
  const script = buildEditedTwoSceneStory();
  const payload = buildFootieExportPayload(script);
  const exportScenes = getRenderableScenesFromPayload(payload);

  assert.equal(getSceneTimingAtGlobalTime(exportScenes, 2999)?.slot.index, 0);
  assert.equal(getSceneTimingAtGlobalTime(exportScenes, 3000)?.slot.index, 1);
});

test("Scene 2 starts immediately after Scene 1 with no gap", () => {
  const script = buildEditedTwoSceneStory();
  const map = getSceneTimingMap(script.scenes);

  assert.equal(map[0]?.endMs, 3000);
  assert.equal(map[1]?.startMs, 3000);
  assert.equal(map[0]?.endMs, map[1]?.startMs);
});

test("preview subtitle chunk timing uses edited scene duration", () => {
  const script = buildEditedTwoSceneStory();
  const scene = {
    ...script.scenes[0]!,
    captionMode: "subtitles" as const,
    subtitleText:
      "First phrase here. Second phrase follows. Third phrase closes the scene now.",
  };
  const scenes = recalculateSceneTimings([scene, ...script.scenes.slice(1)]);
  const subtitleText = scene.subtitleText!;
  const timing = getPreviewSceneTiming({
    scenes,
    sceneIndex: 0,
    elapsedSec: 1.5,
    playbackMode: "narration",
    isPlaying: true,
    browserSceneStartedAtMs: null,
    previewClockMs: 0,
  });

  assert.equal(timing.sceneDurationMs, 3000);

  const state = getActiveSubtitleChunkState(subtitleText, timing.sceneElapsedMs, timing.sceneDurationMs);
  const chunkDurationMs = timing.sceneDurationMs / splitSubtitleChunks(subtitleText).length;
  const expectedIndex = Math.floor(timing.sceneElapsedMs / chunkDurationMs);

  assert.equal(
    state.chunk,
    splitSubtitleChunks(subtitleText)[expectedIndex],
  );
});

test("export subtitle chunk timing uses edited scene duration", () => {
  const script = buildEditedTwoSceneStory();
  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...script.scenes[0]!,
        captionMode: "subtitles",
        subtitleText:
          "First phrase here. Second phrase follows. Third phrase closes the scene now.",
      },
      script.scenes[1]!,
    ],
  });
  const scene = getRenderableScenesFromPayload(payload)[0]!;
  const timingAt = getSceneTimingAtGlobalTime(getRenderableScenesFromPayload(payload), 1500);

  assert.equal(timingAt?.sceneDurationMs, 3000);

  const exportState = getExportSubtitleChunkState(scene, {
    sceneElapsedMs: timingAt?.sceneElapsedMs ?? 0,
    sceneDurationMs: timingAt?.sceneDurationMs ?? 3000,
  });
  const chunks = splitSubtitleChunks(scene.subtitleText);
  const chunkDurationMs = 3000 / chunks.length;
  const expectedIndex = Math.floor((timingAt?.sceneElapsedMs ?? 0) / chunkDurationMs);

  assert.equal(exportState.chunk, chunks[expectedIndex]);
});

test("export canvas line baselines stay vertically ordered", () => {
  for (const lineCount of [2, 3]) {
    const baselines = computeExportLineBaselines(lineCount);
    for (let index = 1; index < baselines.length; index++) {
      assert.ok(baselines[index]! > baselines[index - 1]!);
    }
  }
});

test("subtitles preserve all words within the visible line budget", () => {
  const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const text = "word ".repeat(30).trim();

  assert.match(globalsCss, /-webkit-line-clamp:\s*3/);
  assert.equal(SUBTITLE_MAX_VISIBLE_LINES, 3);

  const previewLayout = resolveSubtitleDisplayLayout(text, { maxLines: 3 });
  const exportLines = wrapTextToLines(mockCanvasCtx(), text, 844, 3);

  assert.equal(previewLayout.lines.join(" ").split(" ").length, text.split(" ").length);
  assert.equal(exportLines.join(" ").split(" ").length, text.split(" ").length);
  assert.ok(previewLayout.fontScale <= 1);
});

test("long subtitles split into smaller timed chunks", () => {
  const longText =
    "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";
  const chunks = splitSubtitleChunks(longText);

  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => isSubtitleChunkWithinLimits(chunk)));
});

test("preview and export stay aligned on chunk selection after duration edit", () => {
  const script = buildEditedTwoSceneStory();
  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...script.scenes[0]!,
        captionMode: "subtitles",
        subtitleText:
          "First phrase here. Second phrase follows. Third phrase closes the scene now.",
      },
      script.scenes[1]!,
    ],
  });
  const scene = getRenderableScenesFromPayload(payload)[0]!;
  const subtitleText = scene.subtitleText;

  for (const elapsedMs of [500, 1500, 2500]) {
    const timingAt = getSceneTimingAtGlobalTime(getRenderableScenesFromPayload(payload), elapsedMs);
    const exportState = getExportSubtitleChunkState(scene, {
      sceneElapsedMs: timingAt?.sceneElapsedMs ?? elapsedMs,
      sceneDurationMs: timingAt?.sceneDurationMs ?? 3000,
    });
    const previewState = getActiveSubtitleChunkState(
      subtitleText,
      timingAt?.sceneElapsedMs ?? elapsedMs,
      timingAt?.sceneDurationMs ?? 3000,
    );
    const exportDisplay = resolveExportSubtitleDisplay(scene, {
      sceneElapsedMs: timingAt?.sceneElapsedMs ?? elapsedMs,
      sceneDurationMs: timingAt?.sceneDurationMs ?? 3000,
    });

    assert.equal(exportState.chunk, previewState.chunk);
    assert.ok(exportDisplay);
    assert.deepEqual(exportDisplay.lines, wrapSubtitleTextToDisplayLines(exportState.chunk, { maxLines: 3 }));
  }
});

console.log("All timing + subtitle wrapping QA checks passed.");
