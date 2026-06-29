/**
 * Voice Speed QA (run: npm run test:voice-speed-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
  getRenderableScenesFromPayload,
} from "@/features/export/services";
import {
  getExportSubtitleChunkState,
  resolveExportSubtitleDisplay,
} from "@/features/export/utils/export-subtitle.utils";
import { getPreviewFrameAtTime } from "@/features/preview/utils/previewTimeline";
import { getPreviewSceneTiming } from "@/features/preview/utils/previewSceneTiming";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  ensureTimelineItems,
  getActiveSceneAtTime,
  getSceneTimingAtGlobalTime,
  getStoryVoiceSettings,
  refitScenesToVoiceoverDuration,
  resolveActiveSubtitleForScene,
  resolveStoryDurationSec,
  splitSubtitleChunks,
} from "@/features/story/utils";
import {
  applyStoryVoiceSettings,
  applyVoiceoverChanges,
  applyVoiceoverRegeneration,
  syncFootieScript,
} from "@/lib/utils/voiceover";
import { resolveVoiceoverSpeed } from "@/lib/utils/voiceoverOptions";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();
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
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1.1,
      x: 5,
      y: -3,
      rotation: 8,
      fitMode: "fit",
    },
    narration: "Scene narration excerpt.",
  };
}

function buildSpeedChangeStory(): FootieScript {
  return syncFootieScript({
    title: "Voice Speed QA",
    narration: subtitleText,
    totalDuration: 20,
    voiceoverUrl: "blob:baseline",
    voiceoverDurationMs: 20_000,
    voiceSettings: { voice: "fable", speed: 1 },
    scenes: [
      makeSubtitlesScene("1", 8000, 0),
      makeSubtitlesScene("2", 8000, 8000),
      makeSubtitlesScene("3", 4000, 16_000),
    ],
  });
}

console.log("voice-speed-qa");

test("voice speed updates correctly", () => {
  const script = buildSpeedChangeStory();
  const at125 = applyStoryVoiceSettings(script, { speed: 1.25 });
  const at075 = applyStoryVoiceSettings(script, { speed: 0.75 });

  assert.equal(getStoryVoiceSettings(at125).speed, 1.25);
  assert.equal(getStoryVoiceSettings(at075).speed, 0.75);
  assert.equal(resolveVoiceoverSpeed(1.12), 1.1);
});

test("only voiceover regenerates — story fields and scenes preserved on apply", () => {
  const script = buildSpeedChangeStory();
  const timelineItems = ensureTimelineItems(script.scenes, script.timelineItems);
  const transition = timelineItems.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");

  const next = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { voice: "fable", speed: 1.25 },
  });

  assert.equal(next.title, script.title);
  assert.equal(next.narration, script.narration);
  assert.equal(next.scenes.length, script.scenes.length);
  assert.equal(next.scenes[0]?.id, "1");
  assert.equal(next.scenes[0]?.subtitleText, subtitleText);
  assert.equal(next.scenes[0]?.captionMode, "subtitles");
  assert.equal(next.scenes[0]?.subtitleEffect, "fade-up");
  assert.equal(next.scenes[0]?.subtitle, "Generated caption");
  assert.equal(next.voiceoverUrl, "blob:faster");
  assert.equal(next.voiceoverDurationMs, 16_000);
  assert.equal(getStoryVoiceSettings(next).speed, 1.25);
  assert.equal(next.scenes[0]?.durationMs, script.scenes[0]?.durationMs);
  assert.equal(next.scenes[1]?.durationMs, script.scenes[1]?.durationMs);
  assert.equal(next.scenes[2]?.durationMs, script.scenes[2]?.durationMs);
  assert.equal(resolveStoryDurationSec(next), 20);

  const nextTransition = next.timelineItems?.find((item) => item.type === "transition");
  assert.ok(nextTransition && nextTransition.type === "transition");
  assert.equal(nextTransition.effect, transition.effect);
  assert.equal(nextTransition.durationMs, transition.durationMs);
});

test("images remain after voice speed apply", () => {
  const script = buildSpeedChangeStory();
  const next = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });

  for (const scene of next.scenes) {
    assert.equal(scene.image?.url, `https://example.com/${scene.id}.jpg`);
    assert.equal(scene.image?.scale, 1.1);
    assert.equal(scene.image?.rotation, 8);
    assert.equal(scene.image?.fitMode, "fit");
  }
});

test("applyVoiceoverChanges still refits scenes when used directly", () => {
  const script = buildSpeedChangeStory();
  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });

  assert.equal(next.voiceoverDurationMs, 16_000);
  assert.equal(next.scenes[0]?.durationMs, 6400);
  assert.equal(next.scenes[1]?.durationMs, 6400);
  assert.equal(next.scenes[2]?.durationMs, 3200);
  assert.equal(next.scenes[2]?.endMs, 16_000);
  assert.equal(resolveStoryDurationSec(next), 16);
});

test("preview scene switching follows existing scene timings after speed apply", () => {
  const script = buildSpeedChangeStory();
  const updated = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });
  const timelineItems = ensureTimelineItems(updated.scenes, updated.timelineItems);

  assert.equal(getActiveSceneAtTime(updated.scenes, 7999)?.index, 0);
  assert.equal(getActiveSceneAtTime(updated.scenes, 8000)?.index, 1);

  const frameBefore = getPreviewFrameAtTime(timelineItems, updated.scenes, 7.0);
  const frameAfter = getPreviewFrameAtTime(timelineItems, updated.scenes, 8.5);

  assert.equal(frameBefore.kind === "scene" ? frameBefore.sceneIndex : -1, 0);
  assert.equal(frameAfter.kind === "scene" ? frameAfter.sceneIndex : -1, 1);
});

test("export keeps existing scene timings after speed apply", () => {
  const script = buildSpeedChangeStory();
  const updated = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });
  const payload = buildFootieExportPayload(updated);
  const exportScenes = getRenderableScenesFromPayload(payload);

  assert.equal(getSceneTimingAtGlobalTime(exportScenes, 7999)?.slot.index, 0);
  assert.equal(getSceneTimingAtGlobalTime(exportScenes, 8000)?.slot.index, 1);
  assert.equal(getExportTotalDurationSec(payload), 20);
  assert.equal(payload.voiceoverUrl, "blob:faster");
  assert.equal(payload.voiceoverDurationMs, 16_000);
});

test("subtitle timing still derives from unchanged scene.durationMs", () => {
  const script = buildSpeedChangeStory();
  const updated = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });
  const chunks = splitSubtitleChunks(subtitleText);
  const sceneDurationMs = updated.scenes[0]!.durationMs!;
  const chunkDurationMs = sceneDurationMs / chunks.length;

  const previewTiming = getPreviewSceneTiming({
    scenes: updated.scenes,
    sceneIndex: 99,
    elapsedSec: chunkDurationMs / 1000,
    playbackMode: "narration",
    isPlaying: true,
    browserSceneStartedAtMs: null,
    previewClockMs: 0,
  });

  assert.equal(previewTiming.sceneDurationMs, 8000);
  assert.equal(previewTiming.activeSceneIndex, 0);

  const previewSubtitle = resolveActiveSubtitleForScene(updated.scenes[0]!, previewTiming);
  const exportSubtitle = resolveExportSubtitleDisplay(updated.scenes[0]!, previewTiming);

  assert.equal(previewSubtitle.chunkDurationMs, chunkDurationMs);
  assert.ok(exportSubtitle);
  assert.equal(exportSubtitle!.activeChunkDurationMs, chunkDurationMs);
  assert.equal(previewSubtitle.activeChunk, exportSubtitle!.activeChunk);
});

test("subtitle animations remain synchronized between preview and export", () => {
  const script = buildSpeedChangeStory();
  const updated = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:faster",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });
  const elapsedMs = 2100;
  const timingAt = getSceneTimingAtGlobalTime(updated.scenes, elapsedMs);
  assert.ok(timingAt);

  const timing = {
    sceneElapsedMs: timingAt.sceneElapsedMs,
    sceneDurationMs: timingAt.sceneDurationMs,
  };

  const preview = resolveActiveSubtitleForScene(updated.scenes[0]!, timing);
  const exportState = getExportSubtitleChunkState(updated.scenes[0]!, timing);

  assert.equal(preview.activeChunk, exportState.chunk);
  assert.equal(preview.chunkIndex, Math.floor(timing.sceneElapsedMs / preview.chunkDurationMs));
  assert.equal(preview.chunkProgress, exportState.progress);
  assert.equal(preview.chunkElapsedMs, exportState.chunkElapsedMs);
});

test("no subtitle lag after speed changes — preview and export share global timeline", () => {
  const scenes = refitScenesToVoiceoverDuration(
    [
      makeSubtitlesScene("1", 8000, 0),
      makeSubtitlesScene("2", 8000, 8000),
      makeSubtitlesScene("3", 4000, 16_000),
    ],
    16_000,
  );

  const script = syncFootieScript({
    title: "Lag check",
    narration: subtitleText,
    totalDuration: 16,
    voiceoverUrl: "blob:refit",
    voiceoverDurationMs: 16_000,
    scenes,
  });

  assert.equal(resolveStoryDurationSec(script), 16);

  const sampleTimesMs = [500, 3500, 6400, 9000, 15_500];
  for (const elapsedMs of sampleTimesMs) {
    const globalTiming = getSceneTimingAtGlobalTime(scenes, elapsedMs);
    assert.ok(globalTiming);

    const previewTiming = getPreviewSceneTiming({
      scenes,
      sceneIndex: 0,
      elapsedSec: elapsedMs / 1000,
      playbackMode: "narration",
      isPlaying: true,
      browserSceneStartedAtMs: null,
      previewClockMs: 0,
    });

    assert.equal(previewTiming.sceneElapsedMs, globalTiming.sceneElapsedMs);
    assert.equal(previewTiming.sceneDurationMs, globalTiming.sceneDurationMs);
    assert.equal(previewTiming.activeSceneIndex, globalTiming.slot.index);

    const scene = scenes[globalTiming.slot.index]!;
    const previewChunk = resolveActiveSubtitleForScene(scene, previewTiming).activeChunk;
    const exportChunk = resolveExportSubtitleDisplay(scene, previewTiming)?.activeChunk;

    assert.equal(previewChunk, exportChunk);
  }
});

test("Apply Changes flow only hits voiceover API and restores on failure", () => {
  const hook = readFileSync(join(root, "src/hooks/useStoryVoiceoverApply.ts"), "utf8");
  const card = readFileSync(join(root, "src/components/VoiceSettingsCard.tsx"), "utf8");

  assert.match(hook, /\/api\/generate-voiceover/);
  assert.doesNotMatch(hook, /\/api\/generate-script/);
  assert.match(hook, /restoreVoiceoverBaseline/);
  assert.match(card, /Updating narration/);
  assert.match(card, /Couldn&apos;t update narration/);
});

test("voice speed UI does not auto-regenerate on chip change", () => {
  const card = readFileSync(join(root, "src/components/VoiceSettingsCard.tsx"), "utf8");

  assert.match(card, /applyStoryVoiceSettings\(script,\s*\{\s*speed:/);
  assert.match(card, /onClick=\{\(\) => void applyVoiceoverChanges\(\)\}/);
});

console.log("\nAll voice speed QA checks passed.");
