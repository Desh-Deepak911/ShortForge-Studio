/**
 * Dynamic subtitle timing verification (run: npm run test:subtitle-dynamic-timing).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
} from "@/features/export/services";
import { resolveExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import { getPreviewSceneTiming } from "@/features/preview/utils/previewSceneTiming";
import type { FootieScene } from "@/features/story/types";
import {
  getSceneTimingAtGlobalTime,
  getSubtitleChunkDurationMs,
  refitScenesToVoiceoverDuration,
  resolveActiveSubtitleAtGlobalTime,
  resolveActiveSubtitleForScene,
  resolveStoryDurationSec,
  splitSubtitleChunks,
} from "@/features/story/utils";
import { applyVoiceoverChanges, syncFootieScript } from "@/lib/utils/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const subtitleText =
  "The palace was alive. Music echoing through marble halls as guests gathered.";

function makeSubtitlesScene(id: string, durationMs: number, startMs: number): FootieScene {
  const duration = durationMs / 1000;
  const start = startMs / 1000;
  return {
    id,
    start,
    end: start + duration,
    duration,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle: "Generated caption",
    subtitleText,
    captionMode: "subtitles",
    subtitleEffect: "fade-up",
  };
}

console.log("subtitle dynamic timing");

test("chunkDuration equals scene.durationMs divided by chunk count", () => {
  const chunks = splitSubtitleChunks(subtitleText);
  assert.ok(chunks.length >= 2);

  const sceneDurationMs = 16_000;
  assert.equal(getSubtitleChunkDurationMs(sceneDurationMs, chunks.length), sceneDurationMs / chunks.length);
});

test("voiceover refit changes chunk duration without storing subtitle timings", () => {
  const script = syncFootieScript({
    title: "Test",
    narration: subtitleText,
    totalDuration: 20,
    scenes: [
      makeSubtitlesScene("1", 8000, 0),
      makeSubtitlesScene("2", 8000, 8000),
      makeSubtitlesScene("3", 4000, 16_000),
    ],
  });

  const chunks = splitSubtitleChunks(subtitleText);
  const before = getSubtitleChunkDurationMs(script.scenes[0]!.durationMs!, chunks.length);

  const refitted = refitScenesToVoiceoverDuration(script.scenes, 16_000);
  const after = getSubtitleChunkDurationMs(refitted[0]!.durationMs!, chunks.length);

  assert.equal(before, 8000 / chunks.length);
  assert.equal(after, 6400 / chunks.length);
  assert.equal(refitted[0]?.subtitleText, subtitleText);
});

test("global playback pipeline derives active chunk from scene.durationMs", () => {
  const scenes = refitScenesToVoiceoverDuration(
    [
      makeSubtitlesScene("1", 8000, 0),
      makeSubtitlesScene("2", 8000, 8000),
      makeSubtitlesScene("3", 4000, 16_000),
    ],
    16_000,
  );

  const timingAt = getSceneTimingAtGlobalTime(scenes, 7000);
  assert.ok(timingAt);
  assert.equal(timingAt.sceneDurationMs, 6400);

  const resolved = resolveActiveSubtitleAtGlobalTime(scenes, scenes[0]!, 3500);
  assert.ok(resolved);
  assert.equal(resolved.chunkDurationMs, 6400 / splitSubtitleChunks(subtitleText).length);
});

test("preview timing uses scene.durationMs from the timing map", () => {
  const scenes = refitScenesToVoiceoverDuration(
    [makeSubtitlesScene("1", 8000, 0), makeSubtitlesScene("2", 8000, 8000)],
    12_000,
  );

  const { sceneElapsedMs, sceneDurationMs, activeSceneIndex } = getPreviewSceneTiming({
    scenes,
    sceneIndex: 1,
    elapsedSec: 3,
    playbackMode: "narration",
    isPlaying: true,
    browserSceneStartedAtMs: null,
    previewClockMs: 0,
  });

  assert.equal(sceneDurationMs, 6000);
  assert.equal(sceneElapsedMs, 3000);
  assert.equal(activeSceneIndex, 0);
  const active = resolveActiveSubtitleForScene(scenes[0]!, { sceneElapsedMs, sceneDurationMs });
  assert.ok(active.activeChunk);
});

test("export derives subtitle timing from scene.durationMs", () => {
  const scene = makeSubtitlesScene("1", 9000, 0);
  const chunks = splitSubtitleChunks(subtitleText);
  const chunkDurationMs = 9000 / chunks.length;
  const display = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: chunkDurationMs * 1.5,
    sceneDurationMs: scene.durationMs!,
  });

  assert.ok(display);
  assert.equal(display.activeChunkDurationMs, chunkDurationMs);
});

test("applyVoiceoverChanges keeps subtitle text and resizes chunk windows", () => {
  const script = syncFootieScript({
    title: "Test",
    narration: subtitleText,
    totalDuration: 20,
    scenes: [
      makeSubtitlesScene("1", 8000, 0),
      makeSubtitlesScene("2", 8000, 8000),
      makeSubtitlesScene("3", 4000, 16_000),
    ],
  });

  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:new",
    voiceoverDurationMs: 16_000,
  });

  const chunks = splitSubtitleChunks(subtitleText);
  const chunkDurationMs = next.scenes[0]!.durationMs! / chunks.length;
  const active = resolveActiveSubtitleForScene(next.scenes[0]!, {
    sceneElapsedMs: chunkDurationMs * 0.5,
    sceneDurationMs: next.scenes[0]!.durationMs!,
  });

  assert.equal(next.scenes[0]?.subtitleText, subtitleText);
  assert.equal(active.chunkDurationMs, chunkDurationMs);
});

test("playback and export duration follow refitted scene timeline", () => {
  const script = syncFootieScript({
    title: "Test",
    narration: subtitleText,
    totalDuration: 20,
    voiceoverUrl: "blob:old",
    voiceoverDurationMs: 20_000,
    scenes: [
      makeSubtitlesScene("1", 8000, 0),
      makeSubtitlesScene("2", 8000, 8000),
      makeSubtitlesScene("3", 4000, 16_000),
    ],
  });

  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:new",
    voiceoverDurationMs: 16_000,
  });

  assert.equal(resolveStoryDurationSec(next), 16);
  const payload = buildFootieExportPayload(next);
  assert.equal(getExportTotalDurationSec(payload), 16);
  assert.equal(payload.scenes[2]?.endMs, 16_000);
});

test("no separate subtitle timeline module exists", () => {
  const typesPath = join(process.cwd(), "src/features/story/types/story.types.ts");
  const types = readFileSync(typesPath, "utf8");
  assert.doesNotMatch(types, /subtitleTiming/);
  assert.doesNotMatch(types, /chunkStartMs/);
});

console.log("\nAll dynamic subtitle timing checks passed.");
