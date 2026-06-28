/**
 * Export payload verification (run: npm run test:export-payload).
 */
import assert from "node:assert/strict";

import {
  buildFootieExportPayload,
  getExportScenesFromPayload,
  getExportTotalDurationSec,
  getExportTransitionsFromPayload,
  getRenderableScenesFromPayload,
  isExportSceneVideoSegment,
  isTransitionVideoContent,
  isVideoSegmentTimelineItem,
} from "@/features/export/services";
import {
  getExportSubtitleChunkState,
  resolveExportSubtitleDisplay,
} from "@/features/export/utils/export-subtitle.utils";
import {
  applyManualDurationPatch,
  attachEvenVoiceoverTiming,
  FADE_UP_DURATION_MS,
  FADE_UP_Y_OFFSET_PX,
  getActiveSceneAtTime,
  getExportSceneCaptionLines,
  getExportHighlightSubtitleFrame,
  getFadeUpSubtitleFrame,
  getTypewriterRevealedText,
  recalculateSceneTimings,
  TRANSITION_CARD_TITLE,
} from "@/features/story/utils";
import type { FootieScene, FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function sampleScene(id: string, subtitle: string): FootieScene {
  return {
    id,
    start: 0,
    end: 3,
    duration: 3,
    subtitle,
  };
}

const script: FootieScript = {
  title: "Derby Night",
  narration: "Full story narration stays separate from transitions.",
  totalDuration: 6,
  scenes: [sampleScene("scene-1", "Opening caption"), sampleScene("scene-2", "Climax caption")],
};

console.log("exportPayload");

test("maps transition timeline items separately from scene segments", () => {
  const payload = buildFootieExportPayload(script);
  const transitions = getExportTransitionsFromPayload(payload);
  const sceneItems = payload.timelineItems.filter(isVideoSegmentTimelineItem);

  assert.ok(transitions.length >= 1);
  assert.equal(sceneItems.length, 2);
  assert.equal(payload.timelineItems.length, sceneItems.length + transitions.length);
  assert.ok(transitions.every((item) => item.type === "transition"));
  assert.ok(sceneItems.every((item) => item.type === "scene"));
});

test("only scene timeline items become export video segments", () => {
  const payload = buildFootieExportPayload(script);
  const renderable = getRenderableScenesFromPayload(payload);
  const timelineScenes = getExportScenesFromPayload(payload);

  assert.equal(renderable.length, 2);
  assert.equal(timelineScenes.length, 2);
  assert.deepEqual(
    renderable.map((scene) => scene.id),
    ["scene-1", "scene-2"],
  );
  assert.ok(renderable.every((scene) => !isTransitionVideoContent(scene.displayCaption)));
});

test("transition connector copy is excluded from renderable video segments", () => {
  assert.equal(isTransitionVideoContent(TRANSITION_CARD_TITLE), true);
  assert.equal(isTransitionVideoContent("Opening caption"), false);

  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      sampleScene("scene-1", TRANSITION_CARD_TITLE),
      sampleScene("scene-2", "Real caption"),
    ],
  });

  const renderable = getRenderableScenesFromPayload(payload);
  assert.equal(renderable.length, 1);
  assert.equal(renderable[0]?.id, "scene-2");
  assert.equal(isExportSceneVideoSegment(payload.scenes[0]!), false);
});

test("passes voiceover metadata through export payload", () => {
  const payload = buildFootieExportPayload({
    ...script,
    voiceoverUrl: "blob:voiceover",
    voiceoverDurationMs: 42_000,
  });

  assert.equal(payload.voiceoverUrl, "blob:voiceover");
  assert.equal(payload.voiceoverDurationMs, 42_000);
  // Export video length follows the scene timeline after mapScenesToExport (6s here).
  assert.equal(getExportTotalDurationSec(payload), 6);
});

test("audio-first export payload includes ms timing and full narration", () => {
  const timedScenes = attachEvenVoiceoverTiming(
    [
      sampleScene("scene-1", "Hook"),
      sampleScene("scene-2", "Payoff"),
    ],
    12_000,
  );

  const payload = buildFootieExportPayload({
    title: "Audio First",
    narration: "one two three four five six seven eight",
    totalDuration: 12,
    scenes: timedScenes,
    voiceoverUrl: "blob:voiceover-audio",
    voiceoverDurationMs: 12_000,
    timelineItems: undefined,
  });

  assert.equal(payload.narration, "one two three four five six seven eight");
  assert.equal(payload.voiceoverUrl, "blob:voiceover-audio");
  assert.equal(payload.voiceoverDurationMs, 12_000);
  assert.equal(payload.audioFirst, true);
  assert.equal(getExportTotalDurationSec(payload), 12);
  assert.ok(payload.scenes.every((scene) => scene.durationMs != null && scene.startMs != null));
  assert.equal(payload.scenes[0]?.durationMs, 6000);
  assert.equal(payload.scenes[1]?.endMs, 12_000);
  assert.ok(payload.timelineItems.length >= 2);
  assert.ok(payload.timelineItems.some(isVideoSegmentTimelineItem));
});

test("export payload uses edited scene durations from timing map", () => {
  const timedScenes = attachEvenVoiceoverTiming(
    [sampleScene("scene-1", "Opening caption"), sampleScene("scene-2", "Climax caption")],
    10_000,
  );
  const edited = recalculateSceneTimings(
    timedScenes.map((scene, index) =>
      index === 0 ? { ...scene, ...applyManualDurationPatch(3) } : scene,
    ),
  );

  const payload = buildFootieExportPayload({
    ...script,
    scenes: edited,
    voiceoverUrl: "blob:voiceover",
    voiceoverDurationMs: 10_000,
  });
  const renderable = getRenderableScenesFromPayload(payload);

  assert.equal(payload.scenes[0]?.durationMs, 3000);
  assert.equal(payload.scenes[0]?.endMs, 3000);
  assert.equal(payload.scenes[1]?.startMs, 3000);
  assert.equal(getActiveSceneAtTime(renderable, 2999)?.index, 0);
  assert.equal(getActiveSceneAtTime(renderable, 3000)?.index, 1);
});

test("generated mode export keeps full caption and empty subtitleChunks", () => {
  const payload = buildFootieExportPayload(script);
  const scene = payload.scenes[0]!;

  assert.equal(scene.captionMode, "generated");
  assert.equal(scene.displayCaption, "Opening caption");
  assert.deepEqual(scene.subtitleChunks, []);
  assert.equal(scene.subtitleText, "");
  assert.ok(scene.durationMs > 0);
  assert.ok(scene.startMs >= 0);
  assert.equal(scene.endMs, scene.startMs + scene.durationMs);
});

test("subtitles mode export provides chunked captions instead of full static text", () => {
  const subtitleText =
    "First phrase starts the scene. Second phrase keeps building tension here. Third phrase lands the payoff now.";

  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...sampleScene("scene-1", "Generated ignored in subtitles mode"),
        captionMode: "subtitles",
        subtitleText,
        subtitleEffect: "typewriter",
      },
    ],
  });

  const scene = payload.scenes[0]!;
  assert.equal(scene.captionMode, "subtitles");
  assert.equal(scene.subtitleEffect, "typewriter");
  assert.ok(scene.subtitleChunks.length >= 2);
  assert.equal(scene.displayCaption, scene.subtitleChunks[0]);
  assert.notEqual(scene.displayCaption, subtitleText);
  assert.equal(scene.subtitleText, subtitleText);
});

test("export renderer selects one timed subtitle chunk per frame", () => {
  const subtitleText =
    "First phrase starts the scene. Second phrase keeps building tension here. Third phrase lands the payoff now.";

  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...sampleScene("scene-1", "Generated ignored"),
        captionMode: "subtitles",
        subtitleText,
        durationMs: 9000,
        startMs: 0,
        endMs: 9000,
      },
    ],
  });

  const scene = payload.scenes[0]!;
  const chunks = scene.subtitleChunks;
  const timing = { sceneDurationMs: 9000 };
  const chunkDurationMs = timing.sceneDurationMs / chunks.length;
  const midIndex = Math.floor(chunks.length / 2);

  const firstChunkLines = getExportSceneCaptionLines(scene, {
    ...timing,
    sceneElapsedMs: 0,
  });
  const middleChunkLines = getExportSceneCaptionLines(scene, {
    ...timing,
    sceneElapsedMs: chunkDurationMs * (midIndex + 0.5),
  });
  const lastChunkLines = getExportSceneCaptionLines(scene, {
    ...timing,
    sceneElapsedMs: timing.sceneDurationMs - 1,
  });

  assert.equal(firstChunkLines.join(" "), chunks[0]);
  assert.equal(middleChunkLines.join(" "), chunks[midIndex]);
  assert.equal(lastChunkLines.join(" "), chunks.at(-1));
  assert.notEqual(firstChunkLines.join(" "), subtitleText);
  assert.notEqual(middleChunkLines.join(" "), firstChunkLines.join(" "));
});

test("generated mode export caption lines ignore scene elapsed timing", () => {
  const payload = buildFootieExportPayload(script);
  const scene = payload.scenes[0]!;

  const early = getExportSceneCaptionLines(scene, {
    sceneElapsedMs: 0,
    sceneDurationMs: scene.durationMs,
  });
  const late = getExportSceneCaptionLines(scene, {
    sceneElapsedMs: scene.durationMs - 1,
    sceneDurationMs: scene.durationMs,
  });

  assert.deepEqual(early, late);
  assert.equal(early.join(" "), "Opening caption");
});

test("fade-up export frame starts transparent and offset downward", () => {
  const start = getFadeUpSubtitleFrame(0);
  assert.equal(start.opacity, 0);
  assert.equal(start.yOffsetPx, FADE_UP_Y_OFFSET_PX);
});

test("fade-up export frame settles fully visible at chunk start", () => {
  const end = getFadeUpSubtitleFrame(FADE_UP_DURATION_MS);
  assert.equal(end.opacity, 1);
  assert.equal(end.yOffsetPx, 0);
});

test("fade-up export uses chunk-local elapsed time for animation", () => {
  const subtitleText =
    "First phrase starts the scene. Second phrase keeps building tension here. Third phrase lands the payoff now.";

  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...sampleScene("scene-1", "Generated ignored"),
        captionMode: "subtitles",
        subtitleText,
        subtitleEffect: "fade-up",
        durationMs: 9000,
        startMs: 0,
        endMs: 9000,
      },
    ],
  });

  const scene = payload.scenes[0]!;
  const chunkDurationMs = 9000 / scene.subtitleChunks.length;
  const secondChunkStartMs = chunkDurationMs;

  const firstChunkState = getExportSubtitleChunkState(scene, {
    sceneElapsedMs: 50,
    sceneDurationMs: 9000,
  });
  const secondChunkState = getExportSubtitleChunkState(scene, {
    sceneElapsedMs: secondChunkStartMs + 50,
    sceneDurationMs: 9000,
  });

  assert.equal(firstChunkState.chunk, scene.subtitleChunks[0]);
  assert.equal(secondChunkState.chunk, scene.subtitleChunks[1]);
  assert.ok(firstChunkState.activeChunkDurationMs > 0);
  assert.ok(firstChunkState.effectProgress < 1);
  assert.ok(getFadeUpSubtitleFrame(firstChunkState.chunkElapsedMs).opacity < 1);
  assert.equal(getFadeUpSubtitleFrame(FADE_UP_DURATION_MS).opacity, 1);
});

test("typewriter export reveals substring based on chunk progress", () => {
  const chunk = "First phrase starts the scene.";
  assert.equal(getTypewriterRevealedText(chunk, 0), chunk.slice(0, 1));
  assert.ok(getTypewriterRevealedText(chunk, 0.5).length < chunk.length);
  assert.equal(getTypewriterRevealedText(chunk, 1), chunk);

  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...sampleScene("scene-1", "Generated ignored"),
        captionMode: "subtitles",
        subtitleText: chunk,
        subtitleEffect: "typewriter",
        durationMs: 6000,
        startMs: 0,
        endMs: 6000,
      },
    ],
  });

  const scene = payload.scenes[0]!;
  const early = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 1500,
    sceneDurationMs: 6000,
  });
  const late = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 6000,
    sceneDurationMs: 6000,
  });

  assert.ok(early);
  assert.ok(late);
  assert.ok((early?.lines.join("") ?? "").length < chunk.length);
  assert.equal(late?.lines.join(" "), chunk);
  assert.equal(early?.effect, "typewriter");
});

test("highlight export animates highlight background through chunk elapsed time", () => {
  const activeChunkDurationMs = 4000;
  const start = getExportHighlightSubtitleFrame(0, activeChunkDurationMs);
  const end = getExportHighlightSubtitleFrame(3999, activeChunkDurationMs);

  assert.ok(start.highlightWidthProgress < end.highlightWidthProgress);
  assert.ok(start.backgroundAlpha <= end.backgroundAlpha);

  const payload = buildFootieExportPayload({
    ...script,
    scenes: [
      {
        ...sampleScene("scene-1", "Generated ignored"),
        captionMode: "subtitles",
        subtitleText: "Highlight this phrase now.",
        subtitleEffect: "highlight",
        durationMs: 4000,
        startMs: 0,
        endMs: 4000,
      },
    ],
  });

  const scene = payload.scenes[0]!;
  const early = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 500,
    sceneDurationMs: 4000,
  });
  const late = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 3500,
    sceneDurationMs: 4000,
  });

  assert.ok(early && late);
  assert.equal(early.effect, "highlight");
  assert.equal(early.lines.join(" "), "Highlight this phrase now.");
  assert.ok(early.effectProgress < late.effectProgress);
});

console.log("All exportPayload checks passed.");
