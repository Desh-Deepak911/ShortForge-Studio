import { normalizeSubtitleEffect } from "@/features/story/utils/caption.utils";
import type { FootieScene, SubtitleEffect } from "@/features/story/types";
import {
  estimateTypewriterRevealDurationMs,
  FADE_UP_DURATION_MS,
} from "@/features/story/utils/subtitle-effect.utils";

import type {
  CaptionAnimationTimelineEvent,
  CaptionAnimationTimelineEventMetadata,
  MasterTimeline,
  SubtitleTimelineEvent,
  TimelineTrack,
} from "./timeline.types";
import {
  computeTimelineDurationMs,
  createTimelineTrack,
  getTimelineTrackByType,
  normalizeTimelineEvent,
} from "./timeline-utils";

/** Timeline-driven caption animation schedule for one subtitle chunk. */
export interface CaptionAnimationEvent {
  id: string;
  subtitleId: string;
  subtitleStartMs: number;
  subtitleEndMs: number;
  animationStartMs: number;
  animationEndMs: number;
  availableDurationMs: number;
  holdDurationMs: number;
  effectType: SubtitleEffect;
  textLength: number;
  metadata: CaptionAnimationTimelineEventMetadata;
}

export interface CaptionAnimationTrackDiagnostics {
  eventsScheduled: number;
  captionTooShortCount: number;
  captionTooShortWarnings: string[];
}

export interface CaptionAnimationTrackBuildResult {
  events: CaptionAnimationTimelineEvent[];
  schedules: CaptionAnimationEvent[];
  diagnostics: CaptionAnimationTrackDiagnostics;
  warnings: string[];
}

function resolveSceneEffectMap(scenes: FootieScene[]): Map<string, SubtitleEffect> {
  return new Map(
    scenes.map((scene) => [scene.id, normalizeSubtitleEffect(scene.subtitleEffect)]),
  );
}

function resolveRequiredAnimationMs(effect: SubtitleEffect, text: string, availableDurationMs: number): number {
  const trimmed = text.trim();

  switch (effect) {
    case "typewriter":
      return estimateTypewriterRevealDurationMs(trimmed);
    case "fade-up":
      return Math.min(FADE_UP_DURATION_MS, availableDurationMs);
    case "highlight":
    default:
      return availableDurationMs;
  }
}

/** Schedules one caption animation window inside its subtitle chunk. */
export function scheduleCaptionAnimationEvent(
  subtitle: SubtitleTimelineEvent,
  effect: SubtitleEffect,
): CaptionAnimationEvent {
  const subtitleStartMs = subtitle.startMs;
  const subtitleEndMs = subtitle.endMs;
  const availableDurationMs = Math.max(0, subtitleEndMs - subtitleStartMs);
  const text = subtitle.metadata.text;
  const textLength = text.trim().length;
  const animationStartMs = subtitleStartMs;
  const requiredAnimationMs = resolveRequiredAnimationMs(effect, text, availableDurationMs);

  let animationEndMs = subtitleEndMs;
  if (effect === "typewriter") {
    animationEndMs = Math.min(subtitleEndMs, animationStartMs + requiredAnimationMs);
  } else if (effect === "fade-up") {
    animationEndMs = Math.min(subtitleEndMs, animationStartMs + FADE_UP_DURATION_MS);
  }

  const activeAnimationMs = Math.max(0, animationEndMs - animationStartMs);
  const holdDurationMs = Math.max(0, availableDurationMs - activeAnimationMs);
  const captionTooShortForEffect =
    effect === "typewriter" && requiredAnimationMs > availableDurationMs;

  const metadata: CaptionAnimationTimelineEventMetadata = {
    sceneId: subtitle.metadata.sceneId,
    sceneIndex: subtitle.metadata.sceneIndex,
    chunkIndex: subtitle.metadata.chunkIndex,
    subtitleEventId: subtitle.id,
    effect,
    subtitleId: subtitle.id,
    subtitleStartMs,
    subtitleEndMs,
    animationStartMs,
    animationEndMs,
    availableDurationMs,
    holdDurationMs,
    effectType: effect,
    textLength,
    text,
    requiredAnimationMs,
    captionTooShortForEffect,
  };

  return {
    id: `caption-animation-${subtitle.metadata.sceneId}-${subtitle.metadata.chunkIndex}`,
    subtitleId: subtitle.id,
    subtitleStartMs,
    subtitleEndMs,
    animationStartMs,
    animationEndMs,
    availableDurationMs,
    holdDurationMs,
    effectType: effect,
    textLength,
    metadata,
  };
}

function toTimelineEvent(schedule: CaptionAnimationEvent): CaptionAnimationTimelineEvent {
  return normalizeTimelineEvent({
    id: schedule.id,
    type: "caption-animation",
    startMs: schedule.animationStartMs,
    endMs: schedule.animationEndMs,
    durationMs: computeTimelineDurationMs(schedule.animationStartMs, schedule.animationEndMs),
    source: "derived-caption-animation",
    metadata: schedule.metadata,
  });
}

export interface BuildCaptionAnimationTrackOptions {
  subtitleEvents: SubtitleTimelineEvent[];
  scenes: FootieScene[];
}

/** Builds caption-animation track events from subtitle windows and scene effects. */
export function buildCaptionAnimationTrackFromSubtitles(
  options: BuildCaptionAnimationTrackOptions,
): CaptionAnimationTrackBuildResult {
  const effectBySceneId = resolveSceneEffectMap(options.scenes);
  const schedules: CaptionAnimationEvent[] = [];
  const captionTooShortWarnings: string[] = [];

  for (const subtitle of options.subtitleEvents) {
    if (subtitle.metadata.captionMode !== "subtitles") {
      continue;
    }

    const effect = effectBySceneId.get(subtitle.metadata.sceneId) ?? "fade-up";
    const schedule = scheduleCaptionAnimationEvent(subtitle, effect);

    if (schedule.metadata.captionTooShortForEffect) {
      captionTooShortWarnings.push(
        `[caption-animation] scene ${schedule.metadata.sceneIndex + 1} chunk ${schedule.metadata.chunkIndex + 1}: typewriter needs ~${schedule.metadata.requiredAnimationMs}ms but subtitle window is ${schedule.availableDurationMs}ms.`,
      );
    }

    schedules.push(schedule);
  }

  const events = schedules.map(toTimelineEvent);

  return {
    events,
    schedules,
    diagnostics: {
      eventsScheduled: events.length,
      captionTooShortCount: captionTooShortWarnings.length,
      captionTooShortWarnings,
    },
    warnings: captionTooShortWarnings,
  };
}

/** Rebuilds caption-animation scheduling from an existing MasterTimeline subtitle lane. */
export function buildCaptionAnimationTrack(
  masterTimeline: Pick<MasterTimeline, "tracks"> | { tracks: TimelineTrack[] },
  scenes: FootieScene[],
): CaptionAnimationTrackBuildResult {
  const subtitleTrack = getTimelineTrackByType(masterTimeline.tracks, "subtitle");
  const subtitleEvents = (subtitleTrack?.events ?? []) as SubtitleTimelineEvent[];

  return buildCaptionAnimationTrackFromSubtitles({
    subtitleEvents,
    scenes,
  });
}

/** Returns a caption-animation track ready to attach to MasterTimeline.tracks. */
export function createCaptionAnimationTrack(
  masterTimeline: Pick<MasterTimeline, "tracks"> | { tracks: TimelineTrack[] },
  scenes: FootieScene[],
) {
  const build = buildCaptionAnimationTrack(masterTimeline, scenes);
  return {
    track: createTimelineTrack("caption-animation", build.events),
    ...build,
  };
}
