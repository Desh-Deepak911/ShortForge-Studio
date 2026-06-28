import {
  SUBTITLE_ESTIMATED_CHARS_PER_LINE,
  SUBTITLE_MAX_VISIBLE_LINES,
} from "@/features/story/utils/subtitle.utils";
import { clampOverlayTransitionDurationMs } from "@/features/story/utils/transition-overlay.utils";

import {
  TIMELINE_END_BUFFER_MS,
  TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS,
} from "./build-master-timeline";
import type {
  CaptionAnimationTimelineEvent,
  MasterTimeline,
  SceneTimelineEvent,
  SubtitleTimelineEvent,
  TimelineTrack,
  TransitionTimelineEvent,
} from "./timeline.types";
import {
  computeTimelineDurationMs,
  getTimelineContentEndMs,
  getTimelineTrackByType,
  getTrackUnionDurationMs,
  normalizeTimelineEvent,
} from "./timeline-utils";

/** Scene shorter than this is flagged — never auto-extended in v1. */
export const TIMELINE_OPTIMIZER_SHORT_SCENE_THRESHOLD_MS = 2000;

/** Per-chunk subtitle window below this is flagged as dense — never rewritten in v1. */
export const TIMELINE_OPTIMIZER_DENSE_SUBTITLE_CHUNK_MS = 750;

export type TimelineOptimizerRuleId =
  | "final-subtitle-hold"
  | "transition-scene-fraction"
  | "short-scene-flag"
  | "dense-subtitle-flag"
  | "animation-window-clamp"
  | "narration-audio-preservation";

export type TimelineOptimizerFindingSeverity = "info" | "warning" | "applied";

export interface TimelineOptimizerFinding {
  rule: TimelineOptimizerRuleId;
  severity: TimelineOptimizerFindingSeverity;
  message: string;
  eventId?: string;
  sceneId?: string;
}

export interface OptimizeMasterTimelineOptions {
  shortSceneThresholdMs?: number;
  denseSubtitleChunkDurationMs?: number;
}

export interface OptimizeMasterTimelineResult {
  timeline: MasterTimeline;
  findings: TimelineOptimizerFinding[];
  appliedChangeCount: number;
}

function cloneTimeline(timeline: MasterTimeline): MasterTimeline {
  return structuredClone(timeline);
}

function replaceTrackEvents<T extends TimelineTrack>(
  tracks: TimelineTrack[],
  type: TimelineTrack["type"],
  events: T["events"],
): TimelineTrack[] {
  return tracks.map((track) =>
    track.type === type ? { ...track, events: events.map((event) => normalizeTimelineEvent(event)) } : track,
  );
}

function estimateVisibleLines(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / SUBTITLE_ESTIMATED_CHARS_PER_LINE));
}

function resolveSceneEventMap(tracks: TimelineTrack[]): Map<string, SceneTimelineEvent> {
  const sceneTrack = getTimelineTrackByType(tracks, "scene");
  const map = new Map<string, SceneTimelineEvent>();

  for (const event of sceneTrack?.events ?? []) {
    const sceneEvent = event as SceneTimelineEvent;
    map.set(sceneEvent.metadata.sceneId, sceneEvent);
  }

  return map;
}

function resolveSubtitleEventMap(tracks: TimelineTrack[]): Map<string, SubtitleTimelineEvent> {
  const subtitleTrack = getTimelineTrackByType(tracks, "subtitle");
  const map = new Map<string, SubtitleTimelineEvent>();

  for (const event of subtitleTrack?.events ?? []) {
    const subtitleEvent = event as SubtitleTimelineEvent;
    map.set(subtitleEvent.id, subtitleEvent);
  }

  return map;
}

function flagShortScenes(
  tracks: TimelineTrack[],
  thresholdMs: number,
  findings: TimelineOptimizerFinding[],
): void {
  const sceneTrack = getTimelineTrackByType(tracks, "scene");

  for (const event of sceneTrack?.events ?? []) {
    const sceneEvent = event as SceneTimelineEvent;
    if (sceneEvent.durationMs >= thresholdMs) {
      continue;
    }

    findings.push({
      rule: "short-scene-flag",
      severity: "warning",
      eventId: sceneEvent.id,
      sceneId: sceneEvent.metadata.sceneId,
      message: `Scene ${sceneEvent.metadata.sceneIndex + 1} is ${sceneEvent.durationMs}ms — below ${thresholdMs}ms short-scene threshold.`,
    });
  }
}

function flagDenseSubtitles(
  tracks: TimelineTrack[],
  denseChunkDurationMs: number,
  findings: TimelineOptimizerFinding[],
): void {
  const subtitleTrack = getTimelineTrackByType(tracks, "subtitle");
  const sceneById = resolveSceneEventMap(tracks);

  for (const event of subtitleTrack?.events ?? []) {
    const subtitle = event as SubtitleTimelineEvent;
    const scene = sceneById.get(subtitle.metadata.sceneId);
    const chunkDurationMs = subtitle.durationMs;
    const visibleLines = estimateVisibleLines(subtitle.metadata.text);
    const reasons: string[] = [];

    if (chunkDurationMs > 0 && chunkDurationMs < denseChunkDurationMs) {
      reasons.push(`chunk window ${chunkDurationMs}ms is below ${denseChunkDurationMs}ms`);
    }

    if (visibleLines > SUBTITLE_MAX_VISIBLE_LINES) {
      reasons.push(`estimated ${visibleLines} lines exceeds ${SUBTITLE_MAX_VISIBLE_LINES}-line cap`);
    }

    if (scene && subtitle.metadata.chunkCount > 1) {
      const averageChunkMs = scene.durationMs / subtitle.metadata.chunkCount;
      if (averageChunkMs < denseChunkDurationMs) {
        reasons.push(
          `${subtitle.metadata.chunkCount} chunks in ${scene.durationMs}ms (~${Math.round(averageChunkMs)}ms each)`,
        );
      }
    }

    if (reasons.length === 0) {
      continue;
    }

    findings.push({
      rule: "dense-subtitle-flag",
      severity: "warning",
      eventId: subtitle.id,
      sceneId: subtitle.metadata.sceneId,
      message: `Dense subtitle chunk ${subtitle.metadata.chunkIndex + 1} on scene ${subtitle.metadata.sceneIndex + 1}: ${reasons.join("; ")}.`,
    });
  }
}

function clampTransitionEventsToSceneTail(
  tracks: TimelineTrack[],
  findings: TimelineOptimizerFinding[],
): { tracks: TimelineTrack[]; appliedChangeCount: number } {
  const transitionTrack = getTimelineTrackByType(tracks, "transition");
  if (!transitionTrack || transitionTrack.events.length === 0) {
    return { tracks, appliedChangeCount: 0 };
  }

  const sceneById = resolveSceneEventMap(tracks);
  let appliedChangeCount = 0;

  const nextEvents = transitionTrack.events.map((event) => {
    const transition = event as TransitionTimelineEvent;
    const scene = sceneById.get(transition.metadata.fromSceneId);
    if (!scene) {
      return transition;
    }

    const requestedOverlayMs = transition.durationMs;
    const safeOverlayMs = clampOverlayTransitionDurationMs(
      requestedOverlayMs,
      scene.durationMs,
    );
    const safeStartMs = Math.max(scene.startMs, scene.endMs - safeOverlayMs);
    const safeEndMs = scene.endMs;

    if (safeStartMs === transition.startMs && safeEndMs === transition.endMs) {
      return transition;
    }

    appliedChangeCount += 1;
    findings.push({
      rule: "transition-scene-fraction",
      severity: "applied",
      eventId: transition.id,
      sceneId: transition.metadata.fromSceneId,
      message: `Clamped transition on scene ${transition.metadata.fromSceneIndex + 1} to ${safeEndMs - safeStartMs}ms within outgoing scene tail.`,
    });

    const durationMs = computeTimelineDurationMs(safeStartMs, safeEndMs);

    return normalizeTimelineEvent({
      ...transition,
      startMs: safeStartMs,
      endMs: safeEndMs,
      durationMs,
      metadata: {
        ...transition.metadata,
        startMs: safeStartMs,
        endMs: safeEndMs,
        durationMs,
      },
    });
  });

  return {
    tracks: replaceTrackEvents(tracks, "transition", nextEvents),
    appliedChangeCount,
  };
}

function clampCaptionAnimationToSubtitleWindows(
  tracks: TimelineTrack[],
  findings: TimelineOptimizerFinding[],
): { tracks: TimelineTrack[]; appliedChangeCount: number } {
  const animationTrack = getTimelineTrackByType(tracks, "caption-animation");
  if (!animationTrack || animationTrack.events.length === 0) {
    return { tracks, appliedChangeCount: 0 };
  }

  const subtitleById = resolveSubtitleEventMap(tracks);
  let appliedChangeCount = 0;

  const nextEvents = animationTrack.events.map((event) => {
    const animation = event as CaptionAnimationTimelineEvent;
    const subtitle =
      subtitleById.get(animation.metadata.subtitleEventId) ??
      subtitleById.get(animation.metadata.subtitleId);

    if (!subtitle) {
      return animation;
    }

    const subtitleStartMs = subtitle.startMs;
    const subtitleEndMs = subtitle.endMs;
    const clampedStartMs = Math.max(subtitleStartMs, animation.startMs);
    const clampedEndMs = Math.min(subtitleEndMs, animation.endMs);

    if (clampedStartMs === animation.startMs && clampedEndMs === animation.endMs) {
      return animation;
    }

    appliedChangeCount += 1;
    const availableDurationMs = Math.max(0, subtitleEndMs - subtitleStartMs);
    const activeAnimationMs = Math.max(0, clampedEndMs - clampedStartMs);
    const holdDurationMs = Math.max(0, availableDurationMs - activeAnimationMs);

    findings.push({
      rule: "animation-window-clamp",
      severity: "applied",
      eventId: animation.id,
      sceneId: animation.metadata.sceneId,
      message: `Clamped caption animation on scene ${animation.metadata.sceneIndex + 1} chunk ${animation.metadata.chunkIndex + 1} to subtitle window (${clampedEndMs - clampedStartMs}ms).`,
    });

    return normalizeTimelineEvent({
      ...animation,
      startMs: clampedStartMs,
      endMs: clampedEndMs,
      durationMs: computeTimelineDurationMs(clampedStartMs, clampedEndMs),
      metadata: {
        ...animation.metadata,
        subtitleStartMs,
        subtitleEndMs,
        animationStartMs: clampedStartMs,
        animationEndMs: clampedEndMs,
        availableDurationMs,
        holdDurationMs,
        captionTooShortForEffect:
          animation.metadata.effect === "typewriter" &&
          (animation.metadata.requiredAnimationMs ?? 0) > availableDurationMs,
      },
    });
  });

  return {
    tracks: replaceTrackEvents(tracks, "caption-animation", nextEvents),
    appliedChangeCount,
  };
}

function recomputeTimelineSpans(
  timeline: MasterTimeline,
  preservedNarrationDurationMs: number,
  preservedAudioDurationMs: number,
): MasterTimeline {
  const endBufferMs = timeline.diagnostics.endBufferMs ?? TIMELINE_END_BUFFER_MS;
  const sceneDurationMs = getTrackUnionDurationMs(timeline.tracks, "scene");
  const subtitleDurationMs = getTrackUnionDurationMs(timeline.tracks, "subtitle");
  const animationDurationMs = getTrackUnionDurationMs(timeline.tracks, "caption-animation");
  const transitionDurationMs = getTrackUnionDurationMs(timeline.tracks, "transition");
  const contentEndMs = getTimelineContentEndMs(timeline);

  const subtitleTrack = getTimelineTrackByType(timeline.tracks, "subtitle");
  const finalSubtitleEndMs = (subtitleTrack?.events ?? []).reduce(
    (maxEndMs, event) => Math.max(maxEndMs, event.endMs),
    0,
  );

  const subtitleCompletionEndMs =
    finalSubtitleEndMs > 0
      ? finalSubtitleEndMs + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS
      : 0;

  const renderEndBeforeBufferMs = Math.max(
    preservedAudioDurationMs,
    preservedNarrationDurationMs,
    sceneDurationMs,
    subtitleDurationMs,
    animationDurationMs,
    transitionDurationMs,
    contentEndMs,
    subtitleCompletionEndMs,
  );

  const renderDurationMs = renderEndBeforeBufferMs + endBufferMs;
  const finalSubtitleEndGapMs = renderEndBeforeBufferMs - finalSubtitleEndMs;

  const animationTrack = getTimelineTrackByType(timeline.tracks, "caption-animation");
  const captionTooShortForAnimationCount = (animationTrack?.events ?? []).filter(
    (event) =>
      (event as CaptionAnimationTimelineEvent).metadata.captionTooShortForEffect === true,
  ).length;

  const transitionTrack = getTimelineTrackByType(timeline.tracks, "transition");
  const transitionsScheduled = transitionTrack?.events.length ?? 0;

  return {
    ...timeline,
    renderDurationMs,
    audioDurationMs: preservedAudioDurationMs,
    narrationDurationMs: preservedNarrationDurationMs,
    sceneDurationMs,
    subtitleDurationMs,
    animationDurationMs,
    transitionDurationMs,
    diagnostics: {
      ...timeline.diagnostics,
      captionTooShortForAnimationCount,
      transitionsScheduled,
      finalSubtitleEndMs,
      contentEndMs,
      renderEndBeforeBufferMs,
      finalSubtitleEndGapMs,
    },
  };
}

function ensureFinalSubtitleHoldBuffer(
  timeline: MasterTimeline,
  findings: TimelineOptimizerFinding[],
): { timeline: MasterTimeline; appliedChangeCount: number } {
  const finalSubtitleEndMs = timeline.diagnostics.finalSubtitleEndMs ?? 0;
  if (finalSubtitleEndMs <= 0) {
    return { timeline, appliedChangeCount: 0 };
  }

  const requiredRenderEndMs =
    finalSubtitleEndMs + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS;
  const currentRenderEndBeforeBufferMs =
    timeline.diagnostics.renderEndBeforeBufferMs ?? timeline.renderDurationMs;

  if (currentRenderEndBeforeBufferMs >= requiredRenderEndMs) {
    findings.push({
      rule: "final-subtitle-hold",
      severity: "info",
      message: `Final subtitle hold satisfied (${timeline.diagnostics.finalSubtitleEndGapMs ?? 0}ms gap before render tail).`,
    });
    return { timeline, appliedChangeCount: 0 };
  }

  const endBufferMs = timeline.diagnostics.endBufferMs ?? TIMELINE_END_BUFFER_MS;
  const nextTimeline = recomputeTimelineSpans(
    timeline,
    timeline.narrationDurationMs,
    timeline.audioDurationMs,
  );

  findings.push({
    rule: "final-subtitle-hold",
    severity: "applied",
    message: `Extended render tail to preserve ${TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS}ms readable hold after final subtitle (${nextTimeline.renderDurationMs - endBufferMs}ms render end).`,
  });

  return { timeline: nextTimeline, appliedChangeCount: 1 };
}

function assertNarrationAudioPreserved(
  before: MasterTimeline,
  after: MasterTimeline,
  findings: TimelineOptimizerFinding[],
): void {
  const audioTrackBefore = getTimelineTrackByType(before.tracks, "audio");
  const audioTrackAfter = getTimelineTrackByType(after.tracks, "audio");

  const voiceoverBefore = audioTrackBefore?.events.find(
    (event) => event.metadata && (event.metadata as { trackId?: string }).trackId === "voiceover",
  );
  const voiceoverAfter = audioTrackAfter?.events.find(
    (event) => event.metadata && (event.metadata as { trackId?: string }).trackId === "voiceover",
  );

  if (voiceoverBefore && voiceoverAfter) {
    if (
      voiceoverBefore.startMs !== voiceoverAfter.startMs ||
      voiceoverBefore.endMs !== voiceoverAfter.endMs
    ) {
      throw new Error("Timeline optimizer must not modify voiceover audio events.");
    }
  }

  if (before.narrationDurationMs !== after.narrationDurationMs) {
    throw new Error("Timeline optimizer must preserve narrationDurationMs.");
  }

  if (before.audioDurationMs !== after.audioDurationMs) {
    throw new Error("Timeline optimizer must preserve audioDurationMs.");
  }

  findings.push({
    rule: "narration-audio-preservation",
    severity: "info",
    message: "Narration and audio lane spans preserved.",
  });
}

/**
 * Applies safe timeline polish rules to an existing MasterTimeline.
 * Does not change scene order, narration copy, voiceover, or subtitle text.
 */
export function optimizeMasterTimeline(
  masterTimeline: MasterTimeline,
  options: OptimizeMasterTimelineOptions = {},
): OptimizeMasterTimelineResult {
  const shortSceneThresholdMs =
    options.shortSceneThresholdMs ?? TIMELINE_OPTIMIZER_SHORT_SCENE_THRESHOLD_MS;
  const denseSubtitleChunkDurationMs =
    options.denseSubtitleChunkDurationMs ?? TIMELINE_OPTIMIZER_DENSE_SUBTITLE_CHUNK_MS;

  const findings: TimelineOptimizerFinding[] = [];
  let appliedChangeCount = 0;

  let timeline = cloneTimeline(masterTimeline);

  flagShortScenes(timeline.tracks, shortSceneThresholdMs, findings);
  flagDenseSubtitles(timeline.tracks, denseSubtitleChunkDurationMs, findings);

  const transitionResult = clampTransitionEventsToSceneTail(timeline.tracks, findings);
  timeline = { ...timeline, tracks: transitionResult.tracks };
  appliedChangeCount += transitionResult.appliedChangeCount;

  const animationResult = clampCaptionAnimationToSubtitleWindows(timeline.tracks, findings);
  timeline = { ...timeline, tracks: animationResult.tracks };
  appliedChangeCount += animationResult.appliedChangeCount;

  timeline = recomputeTimelineSpans(
    timeline,
    masterTimeline.narrationDurationMs,
    masterTimeline.audioDurationMs,
  );

  const holdResult = ensureFinalSubtitleHoldBuffer(timeline, findings);
  timeline = holdResult.timeline;
  appliedChangeCount += holdResult.appliedChangeCount;

  assertNarrationAudioPreserved(masterTimeline, timeline, findings);

  const optimizerWarnings = findings
    .filter((finding) => finding.severity === "applied" || finding.severity === "warning")
    .map((finding) => `[timeline-optimizer] ${finding.message}`);

  timeline = {
    ...timeline,
    id: `${timeline.id}-optimized`,
    warnings: [...timeline.warnings, ...optimizerWarnings],
  };

  return {
    timeline,
    findings,
    appliedChangeCount,
  };
}
