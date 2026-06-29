/**
 * MasterTimeline playback helpers — shared preview/export lookup (run: npm run test:timeline-playback).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMasterTimeline, TIMELINE_END_BUFFER_MS } from "@/features/timeline-intelligence/build-master-timeline";
import { resolveCaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import { resolveImageMotionSchedule } from "@/features/timeline-intelligence/image-motion-presets.utils";
import {
  resolveImageMotionTransform,
} from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import type {
  CaptionAnimationTimelineEvent,
  ImageMotionTimelineEvent,
  TimelineEvent,
  TransitionTimelineEvent,
} from "@/features/timeline-intelligence/timeline.types";
import { getTimelineTrackByType } from "@/features/timeline-intelligence/timeline-utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { resolveSceneImageMotionScale } from "@/features/story/utils/scene-image-motion.utils";
import {
  getActiveCaptionAnimationAtTime,
  getActiveSceneAtTime,
  getActiveSubtitleAtTime,
  getTimelineProgress,
  resolveTimelineSceneFrame,
  resolveTimelineSubtitleChunkAtTime,
} from "@/features/timeline-intelligence/timeline-playback.utils";
import {
  resolveTransitionEffectLayers,
  resolveTransitionState,
} from "@/features/timeline-intelligence/resolve-transition-state.utils";
import { getTransitionLayerStyles } from "@/features/preview/utils/previewTimeline";
import { recalculateSceneTimings } from "@/features/story/utils";
import { resolvePreviewPlaybackState } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolveExportFrameFromMasterTimeline } from "@/features/export/services/video-render.service";
import { getTypewriterRevealedText } from "@/features/story/utils/subtitle-effect.utils";
import { resolveSubtitleDisplayLayout } from "@/features/story/utils/subtitle-layout.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeScene(id: string, durationSec: number, startSec = 0): FootieScene {
  const durationMs = durationSec * 1000;
  const startMs = startSec * 1000;
  const subtitleText = `Subtitle for ${id}.`;

  return {
    id,
    start: startSec,
    end: startSec + durationSec,
    duration: durationSec,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    durationSource: "manual",
    subtitle: `Caption ${id}`,
    captionMode: "subtitles",
    subtitleText,
    subtitleEffect: "fade-up",
    narration: subtitleText,
  };
}

function buildStory(
  scenes: FootieScene[],
  voiceoverDurationMs?: number,
  options: { timelineItems?: FootieScript["timelineItems"] } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);

  return syncFootieScript({
    title: "Timeline Playback QA",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    totalDuration,
    scenes: timedScenes,
    ...(options.timelineItems ? { timelineItems: options.timelineItems } : {}),
    ...(voiceoverDurationMs != null
      ? {
          voiceoverUrl: "blob:qa-voiceover",
          voiceoverDurationMs,
        }
      : {}),
  });
}

test("getTimelineProgress uses startMs <= timeMs < endMs boundary", () => {
  const event: TimelineEvent = {
    id: "evt-1",
    type: "scene",
    startMs: 1000,
    endMs: 4000,
    durationMs: 3000,
    source: "editor-scene-timing",
    metadata: {},
  };

  assert.equal(getTimelineProgress(event, 999).isWithinWindow, false);
  assert.equal(getTimelineProgress(event, 1000).isWithinWindow, true);
  assert.equal(getTimelineProgress(event, 2500).progress, 0.5);
  assert.equal(getTimelineProgress(event, 3999).isWithinWindow, true);
  assert.equal(getTimelineProgress(event, 4000).isWithinWindow, false);
  assert.equal(getTimelineProgress(event, 4000).progress, 1);
});

test("getActiveSceneAtTime holds last scene through render end buffer", () => {
  const story = buildStory(
    [makeScene("s1", 4), makeScene("s2", 4, 4)],
    8_000,
  );
  const timeline = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });

  const atEndBuffer = getActiveSceneAtTime(timeline, timeline.renderDurationMs - 1);
  assert.ok(atEndBuffer);
  assert.equal(atEndBuffer!.event.metadata.sceneId, "s2");
  assert.equal(atEndBuffer!.progress, 1);
  assert.ok(timeline.renderDurationMs >= timeline.narrationDurationMs);
  assert.ok(TIMELINE_END_BUFFER_MS > 0);
});

test("resolveTimelineSceneFrame returns aligned scene and subtitle events", () => {
  const story = buildStory([makeScene("s1", 6)], 6_000);
  const timeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });
  const scenes = story.scenes;

  const frame = resolveTimelineSceneFrame(timeline, scenes, 1500);
  assert.ok(frame);
  assert.equal(frame!.scene.id, "s1");
  assert.equal(frame!.sceneIndex, 0);
  assert.equal(frame!.sceneElapsedMs, 1500);
  assert.ok(frame!.subtitle);
  assert.equal(frame!.subtitle!.event.metadata.sceneId, "s1");
});

test("resolveTimelineSubtitleChunkAtTime matches animation progress when present", () => {
  const story = buildStory([makeScene("s1", 6)], 6_000);
  const timeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });
  const subtitle = getActiveSubtitleAtTime(timeline, 1500);
  const animation = getActiveCaptionAnimationAtTime(timeline, 1500);

  const chunk = resolveTimelineSubtitleChunkAtTime("s1", subtitle, animation);
  assert.ok(chunk);
  assert.ok(chunk!.activeSubtitleChunk.length > 0);
  assert.equal(chunk!.chunkProgress, animation?.progress ?? subtitle?.progress);
});

test("preview and export resolve the same scene index at the same time", () => {
  const story = buildStory([makeScene("s1", 5), makeScene("s2", 5, 5)], 10_000);
  const previewTimeline = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });
  const exportTimeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });
  const scenes = story.scenes;
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const timeMs = 6_500;

  const preview = resolvePreviewPlaybackState(previewTimeline, scenes, timeMs);
  const exportFrame = resolveExportFrameFromMasterTimeline(
    exportTimeline,
    scenes,
    sceneById,
    timeMs,
  );

  assert.ok(preview);
  assert.equal(preview!.sceneIndex, exportFrame.sceneIndex);
  assert.equal(preview!.scene.id, exportFrame.scene.id);
  assert.equal(preview!.sceneElapsedMs, exportFrame.timing.sceneElapsedMs);
  assert.equal(preview!.sceneDurationMs, exportFrame.timing.sceneDurationMs);
});

test("preview and export share resolveTimelineSceneFrame — no duplicate lookup logic", () => {
  const previewUtils = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const exportRender = readSrc("src/features/export/services/video-render.service.ts");
  const playbackUtils = readSrc("src/features/timeline-intelligence/timeline-playback.utils.ts");

  assert.match(previewUtils, /resolveTimelineSceneFrame/);
  assert.match(exportRender, /resolveTimelineSceneFrame/);
  assert.doesNotMatch(previewUtils, /getActiveSceneAtTime/);
  assert.doesNotMatch(exportRender, /getActiveSceneAtTime\(masterTimeline/);
  assert.match(playbackUtils, /export function getTimelineProgress/);
  assert.match(playbackUtils, /export function getActiveSceneAtTime/);
  assert.match(playbackUtils, /export function getActiveSubtitleAtTime/);
  assert.match(playbackUtils, /export function getActiveCaptionAnimationAtTime/);
});

test("subtitle at exact chunk boundary startMs is active on first frame", () => {
  const story = buildStory(
    [
      makeScene("s1", 5, { subtitleText: "Scene one subtitle copy." }),
      makeScene("s2", 5, { startSec: 5, subtitleText: "Scene two begins on a timed boundary." }),
    ],
    10_000,
  );
  const timeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });
  const subtitleTrack = timeline.tracks.find((track) => track.type === "subtitle");
  const events = subtitleTrack?.events ?? [];

  assert.ok(events.length >= 2, "multiple subtitle events");
  const sceneTwoSubtitle = events.find(
    (event) => (event.metadata as { sceneId: string }).sceneId === "s2",
  );
  assert.ok(sceneTwoSubtitle, "scene two subtitle event");

  const atBoundary = getActiveSubtitleAtTime(timeline, sceneTwoSubtitle!.startMs);
  assert.ok(atBoundary, "scene two subtitle active at exact startMs");
  assert.equal(atBoundary!.elapsedMs, 0);
});

test("typewriter first frame reveals at least one character", () => {
  const chunk = "Boundary start frame.";
  assert.equal(getTypewriterRevealedText(chunk, 0), chunk.slice(0, 1));
});

test("line-cap overflow keeps all words via layout scaling", () => {
  const longText =
    "This is a longer subtitle chunk that should wrap across multiple lines without dropping trailing words at the end.";
  const layout = resolveSubtitleDisplayLayout(longText, { maxLines: 3 });
  const originalWords = longText.split(" ");
  const wrappedWords = layout.lines.join(" ").split(" ");

  assert.ok(layout.lines.length > 0);
  assert.equal(wrappedWords.length, originalWords.length);
  assert.ok(layout.fontScale <= 1);
});

function getFirstCaptionAnimationEvent(timeline: ReturnType<typeof buildMasterTimeline>) {
  const track = getTimelineTrackByType(timeline.tracks, "caption-animation");
  const event = track?.events[0] as CaptionAnimationTimelineEvent | undefined;
  assert.ok(event, "caption-animation event");
  return event!;
}

test("resolveCaptionAnimationState drives fade-up opacity and transform", () => {
  const story = buildStory([makeScene("s1", 8)], 8_000);
  const timeline = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });
  const event = getFirstCaptionAnimationEvent(timeline);
  const startMs = event.metadata.subtitleStartMs;

  const atStart = resolveCaptionAnimationState(event, startMs + 50);
  assert.equal(atStart.isActive, true);
  assert.ok(atStart.opacity < 1);
  assert.match(atStart.transform, /translateY/);

  const afterReveal = resolveCaptionAnimationState(event, startMs + 600);
  assert.equal(afterReveal.opacity, 1);
  assert.equal(afterReveal.transform, "none");
  assert.equal(afterReveal.shouldRenderFullText, true);
});

test("resolveCaptionAnimationState typewriter paces by availableDurationMs / characterCount", () => {
  const text = "Short typewriter copy.";
  const story = buildStory([
    {
      ...makeScene("s1", 10),
      subtitleText: text,
      subtitleEffect: "typewriter",
    },
  ]);
  const timeline = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });
  const event = getFirstCaptionAnimationEvent(timeline);
  const startMs = event.metadata.subtitleStartMs;
  const msPerChar = event.metadata.availableDurationMs / text.trim().length;

  const firstFrame = resolveCaptionAnimationState(event, startMs);
  assert.equal(firstFrame.visibleText, text.trim().slice(0, 1));

  const midReveal = resolveCaptionAnimationState(event, startMs + msPerChar * 5);
  assert.ok(midReveal.visibleText.length >= 1);
  assert.ok(midReveal.visibleText.length < text.trim().length);

  const atEnd = resolveCaptionAnimationState(event, event.metadata.subtitleEndMs - 1);
  assert.equal(atEnd.visibleText, text.trim());
  assert.equal(atEnd.shouldRenderFullText, true);
});

test("resolveCaptionAnimationState accelerates typewriter when window is too short", () => {
  const text =
    "He picks it up on the halfway line, beats one, beats two, and curls it into the top corner.";
  const story = buildStory([
    {
      ...makeScene("s1", 6),
      subtitleText: text,
      subtitleEffect: "typewriter",
    },
  ]);
  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const track = getTimelineTrackByType(timeline.tracks, "caption-animation");
  const event = track?.events.find(
    (entry) => (entry as CaptionAnimationTimelineEvent).metadata.captionTooShortForEffect,
  ) as CaptionAnimationTimelineEvent | undefined;
  assert.ok(event, "expected at least one too-short typewriter animation event");

  const nearEnd = resolveCaptionAnimationState(event, event.metadata.subtitleEndMs - 1);
  assert.equal(nearEnd.visibleText, event.metadata.text.trim());
  assert.equal(nearEnd.shouldRenderFullText, true);
});

test("preview and export caption renderers use resolveCaptionAnimationState", () => {
  const exportSubtitle = readSrc("src/features/export/utils/export-subtitle.utils.ts");
  const exportCanvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const subtitleEffectPreview = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");
  const subtitleOverlay = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  assert.match(exportSubtitle, /resolveCaptionAnimationState/);
  assert.match(exportCanvas, /display\.animationState/);
  assert.match(subtitleEffectPreview, /captionAnimationState/);
  assert.match(subtitleOverlay, /captionAnimationState/);
});

function makeImageMotionEvent(
  motionType: ImageMotionTimelineEvent["metadata"]["motionType"],
  startMs: number,
  endMs: number,
  imageMotion: { type: "zoom-in" | "zoom-out"; intensity: "medium" } = {
    type: "zoom-in",
    intensity: "medium",
  },
): ImageMotionTimelineEvent {
  const schedule = resolveImageMotionSchedule({
    motionType,
    imageMotion,
  });

  return {
    id: "image-motion-qa",
    type: "image-motion",
    startMs,
    endMs,
    durationMs: endMs - startMs,
    source: "editor-scene-image-motion",
    metadata: {
      sceneId: "s1",
      sceneIndex: 0,
      sceneEventId: "scene-s1",
      imageMotion,
      motionType: schedule.motionType,
      progressCurve: schedule.progressCurve,
      baseTransform: schedule.baseTransform,
      peakScale: schedule.peakScale,
      panTravelPct: schedule.panTravelPct,
      startMs,
      endMs,
      durationMs: endMs - startMs,
    },
  };
}

test("resolveImageMotionTransform progress uses absolute timeline event window", () => {
  const event = makeImageMotionEvent("slow-zoom-in", 2000, 6000);
  const baseTransform = { scale: 1.15, translateX: 40, translateY: -20 };

  const atStart = resolveImageMotionTransform({ event, timeMs: 2000, baseTransform });
  const atMid = resolveImageMotionTransform({ event, timeMs: 4000, baseTransform });
  const atEnd = resolveImageMotionTransform({ event, timeMs: 5999, baseTransform });

  assert.equal(atStart.progress, 0);
  assert.equal(atMid.progress, 0.5);
  assert.ok(Math.abs(atEnd.progress - 1) < 0.001);
});

test("resolveImageMotionTransform matches Ken Burns zoom-in/out scale multipliers", () => {
  const zoomIn = makeImageMotionEvent("slow-zoom-in", 0, 4000);
  const zoomOut = makeImageMotionEvent("slow-zoom-out", 0, 4000, {
    type: "zoom-out",
    intensity: "medium",
  });
  const baseTransform = { scale: 1.2, translateX: 10, translateY: -5 };
  const legacyMotion = { type: "zoom-in" as const, intensity: "medium" as const };
  const legacyZoomOut = { type: "zoom-out" as const, intensity: "medium" as const };

  for (const sampleProgress of [0, 0.25, 0.5, 0.75, 1]) {
    const timeMs = sampleProgress * 4000;
    const zoomInState = resolveImageMotionTransform({ event: zoomIn, timeMs, baseTransform });
    const zoomOutState = resolveImageMotionTransform({ event: zoomOut, timeMs, baseTransform });

    assert.equal(
      zoomInState.scale,
      baseTransform.scale * resolveSceneImageMotionScale(legacyMotion, sampleProgress),
    );
    assert.equal(
      zoomOutState.scale,
      baseTransform.scale * resolveSceneImageMotionScale(legacyZoomOut, sampleProgress),
    );
    assert.equal(zoomInState.translateX, baseTransform.translateX);
    assert.equal(zoomInState.translateY, baseTransform.translateY);
  }
});

test("resolveImageMotionTransform keeps static motion stable", () => {
  const event = makeImageMotionEvent("static", 1000, 5000);
  const baseTransform = { scale: 0.95, translateX: 12, translateY: 8, rotation: 2 };

  const atStart = resolveImageMotionTransform({ event, timeMs: 1000, baseTransform });
  const atMid = resolveImageMotionTransform({ event, timeMs: 3000, baseTransform });
  const atEnd = resolveImageMotionTransform({ event, timeMs: 4999, baseTransform });

  for (const state of [atStart, atMid, atEnd]) {
    assert.equal(state.scale, baseTransform.scale);
    assert.equal(state.translateX, baseTransform.translateX);
    assert.equal(state.translateY, baseTransform.translateY);
    assert.match(state.transform, /translate\(12px, 8px\) scale\(0\.95\) rotate\(2deg\)/);
  }
});

test("resolveImageMotionTransform pan respects fit/fill base transform", () => {
  const event = makeImageMotionEvent("pan-left", 0, 4000);
  const baseTransform = { scale: 1.05, translateX: 30, translateY: -15 };
  const frameWidth = 1080;

  const atStart = resolveImageMotionTransform({
    event,
    timeMs: 0,
    baseTransform,
    frameWidth,
    frameHeight: 1920,
  });
  const atEnd = resolveImageMotionTransform({
    event,
    timeMs: 4000,
    baseTransform,
    frameWidth,
    frameHeight: 1920,
  });

  assert.equal(atStart.translateX, baseTransform.translateX);
  assert.equal(atStart.translateY, baseTransform.translateY);
  assert.equal(atEnd.translateX, baseTransform.translateX + frameWidth * 0.06);
  assert.equal(atEnd.translateY, baseTransform.translateY);
  assert.equal(atEnd.scale, baseTransform.scale);
});

test("preview and export image motion use resolveImageMotionTransform via timeline events", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const sceneFrameImage = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");

  assert.match(sceneFrameImage, /resolveSceneImageMotionTransformState/);
  assert.match(previewFrame, /timelineImageMotion/);
  assert.match(videoRender, /resolveSceneImageMotionTransformState/);
  assert.match(videoRender, /getImageMotionEventForScene/);
  assert.doesNotMatch(previewFrame, /resolveSceneImageMotionScale/);
  assert.doesNotMatch(videoRender, /resolveSceneImageMotionScale/);
});

function buildTransitionStory(): FootieScript {
  const scenes = recalculateSceneTimings([
    makeScene("s1", 5),
    makeScene("s2", 5, 5),
  ]);

  return buildStory(scenes, 10_000, {
    timelineItems: [
      { id: "s1", type: "scene", scene: scenes[0]! },
      {
        id: "t-s1-s2",
        type: "transition",
        fromSceneId: "s1",
        toSceneId: "s2",
        effect: "fade",
        durationMs: 800,
        label: "Fade",
      },
      { id: "s2", type: "scene", scene: scenes[1]! },
    ],
  });
}

function getTransitionEvent(story: FootieScript): TransitionTimelineEvent {
  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const track = getTimelineTrackByType(timeline.tracks, "transition");
  const event = track?.events[0] as TransitionTimelineEvent | undefined;
  assert.ok(event, "expected transition event");
  return event!;
}

test("resolveTransitionState uses absolute timeline event window", () => {
  const event = getTransitionEvent(buildTransitionStory());

  const before = resolveTransitionState(event, event.startMs - 1);
  const atStart = resolveTransitionState(event, event.startMs);
  const atMid = resolveTransitionState(event, event.startMs + event.durationMs / 2);
  const atEnd = resolveTransitionState(event, event.endMs - 1);

  assert.equal(before.isActive, false);
  assert.equal(before.shouldRenderBothScenes, false);
  assert.equal(atStart.isActive, true);
  assert.equal(atStart.progress, 0);
  assert.equal(atMid.progress, 0.5);
  assert.ok(atEnd.progress > 0.99);
});

test("resolveTransitionState matches getTransitionLayerStyles for existing effects", () => {
  const effects = [
    "fade",
    "slide-left",
    "slide-right",
    "zoom-in",
    "zoom-out",
    "blur",
    "cut",
  ] as const;

  for (const effect of effects) {
    for (const progress of [0, 0.35, 0.7, 1]) {
      const layers = resolveTransitionEffectLayers(effect, progress);
      const styles = getTransitionLayerStyles(effect, progress);

      assert.equal(layers.opacityFrom, styles.from.opacity ?? 1, `${effect} from opacity @${progress}`);
      assert.equal(layers.opacityTo, styles.to.opacity ?? 1, `${effect} to opacity @${progress}`);
      assert.equal(
        layers.transformFrom,
        styles.from.transform ?? "none",
        `${effect} from transform @${progress}`,
      );
      assert.equal(
        layers.transformTo,
        styles.to.transform ?? "none",
        `${effect} to transform @${progress}`,
      );
    }
  }
});

test("resolveTransitionState cut uses instant progress while active", () => {
  const scenes = recalculateSceneTimings([makeScene("s1", 4), makeScene("s2", 4, 4)]);
  const story = buildStory(scenes, 8_000, {
    timelineItems: [
      { id: "s1", type: "scene", scene: scenes[0]! },
      {
        id: "t-cut",
        type: "transition",
        fromSceneId: "s1",
        toSceneId: "s2",
        effect: "cut",
        durationMs: 500,
        label: "Cut",
      },
      { id: "s2", type: "scene", scene: scenes[1]! },
    ],
  });

  const event = getTransitionEvent(story);
  const active = resolveTransitionState(event, event.startMs + 50);

  assert.equal(active.isActive, true);
  assert.equal(active.progress, 1);
  assert.equal(active.opacityFrom, 0);
  assert.equal(active.opacityTo, 1);
  assert.equal(active.shouldRenderBothScenes, true);
});

test("preview and export transition renderers use timeline transition resolver", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const exportCanvas = readSrc("src/features/export/utils/export-transition-canvas.utils.ts");

  assert.match(previewFrame, /transitionStateToPreviewLayerStyles/);
  assert.match(videoPreview, /resolvePreviewTransitionOverlay/);
  assert.match(videoRender, /resolveTimelineTransitionOverlay/);
  assert.match(exportCanvas, /getExportTransitionLayerDrawStatesFromTransitionState/);
  assert.doesNotMatch(videoRender, /resolveSceneTransitionOverlay/);
});

console.log("\nAll timeline playback checks passed.\n");
