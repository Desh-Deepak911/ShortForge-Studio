import type { FootieScene } from "@/features/story/types";
import { normalizeSceneImageMotion } from "@/features/story/utils/scene.utils";

import {
  resolveImageMotionPreset,
  resolveImageMotionSchedule,
  type ImageMotionBaseTransform,
  type ImageMotionPreset,
  type ImageMotionProgressCurve,
} from "./image-motion-presets.utils";
import type {
  ImageMotionTimelineEvent,
  ImageMotionTimelineEventMetadata,
  MasterTimeline,
  SceneTimelineEvent,
  TimelineTrack,
} from "./timeline.types";
import {
  computeTimelineDurationMs,
  createTimelineTrack,
  getTimelineTrackByType,
  normalizeTimelineEvent,
} from "./timeline-utils";

/** Timeline-driven image motion schedule for one scene window. */
export interface ImageMotionEvent {
  id: string;
  sceneId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  motionType: ImageMotionPreset;
  progressCurve: ImageMotionProgressCurve;
  baseTransform: ImageMotionBaseTransform;
  metadata: ImageMotionTimelineEventMetadata;
}

export interface ImageMotionTrackDiagnostics {
  eventsScheduled: number;
  staticMotionCount: number;
  animatedMotionCount: number;
}

export interface ImageMotionTrackBuildResult {
  events: ImageMotionTimelineEvent[];
  schedules: ImageMotionEvent[];
  diagnostics: ImageMotionTrackDiagnostics;
  warnings: string[];
}

export interface ScheduleImageMotionEventOptions {
  scene: FootieScene;
  sceneIndex: number;
  sceneEvent: SceneTimelineEvent;
  motionType?: ImageMotionPreset;
}

/** Schedules one image motion window aligned to its parent scene event. */
export function scheduleImageMotionEvent(
  options: ScheduleImageMotionEventOptions,
): ImageMotionEvent | null {
  const imageMotion = normalizeSceneImageMotion(options.scene.image?.imageMotion);
  const motionType =
    options.motionType ?? resolveImageMotionPreset(imageMotion) ?? null;

  if (!motionType) {
    return null;
  }

  const schedule = resolveImageMotionSchedule({ motionType, imageMotion });
  const startMs = options.sceneEvent.startMs;
  const endMs = options.sceneEvent.endMs;

  return {
    id: `image-motion-${options.scene.id}`,
    sceneId: options.scene.id,
    startMs,
    endMs,
    durationMs: computeTimelineDurationMs(startMs, endMs),
    motionType: schedule.motionType,
    progressCurve: schedule.progressCurve,
    baseTransform: schedule.baseTransform,
    metadata: buildImageMotionMetadata(options, schedule, imageMotion, startMs, endMs),
  };
}

function buildImageMotionMetadata(
  options: ScheduleImageMotionEventOptions,
  schedule: ReturnType<typeof resolveImageMotionSchedule>,
  imageMotion: ReturnType<typeof normalizeSceneImageMotion>,
  startMs: number,
  endMs: number,
): ImageMotionTimelineEventMetadata {
  return {
    sceneId: options.scene.id,
    sceneIndex: options.sceneIndex,
    sceneEventId: options.sceneEvent.id,
    imageMotion,
    motionType: schedule.motionType,
    progressCurve: schedule.progressCurve,
    baseTransform: schedule.baseTransform,
    startMs,
    endMs,
    durationMs: computeTimelineDurationMs(startMs, endMs),
    peakScale: schedule.peakScale,
    panTravelPct: schedule.panTravelPct,
  };
}

function toTimelineEvent(schedule: ImageMotionEvent): ImageMotionTimelineEvent {
  return normalizeTimelineEvent({
    id: schedule.id,
    type: "image-motion",
    startMs: schedule.startMs,
    endMs: schedule.endMs,
    durationMs: schedule.durationMs,
    source: "derived-image-motion",
    metadata: schedule.metadata,
  });
}

export interface BuildImageMotionTrackOptions {
  scenes: FootieScene[];
  sceneEvents: SceneTimelineEvent[];
}

/** Builds image-motion track events from scene windows and editor motion settings. */
export function buildImageMotionTrackFromScenes(
  options: BuildImageMotionTrackOptions,
): ImageMotionTrackBuildResult {
  const sceneById = new Map(
    options.sceneEvents.map((event) => [event.metadata.sceneId, event]),
  );
  const schedules: ImageMotionEvent[] = [];

  for (const [index, scene] of options.scenes.entries()) {
    const sceneEvent = sceneById.get(scene.id);
    if (!sceneEvent) {
      continue;
    }

    const schedule = scheduleImageMotionEvent({
      scene,
      sceneIndex: index,
      sceneEvent,
    });

    if (schedule) {
      schedules.push(schedule);
    }
  }

  const events = schedules.map(toTimelineEvent);
  const staticMotionCount = schedules.filter((entry) => entry.motionType === "static").length;

  return {
    events,
    schedules,
    diagnostics: {
      eventsScheduled: events.length,
      staticMotionCount,
      animatedMotionCount: events.length - staticMotionCount,
    },
    warnings: [],
  };
}

/** Rebuilds image-motion scheduling from an existing MasterTimeline scene lane. */
export function buildImageMotionTrack(
  masterTimeline: Pick<MasterTimeline, "tracks"> | { tracks: TimelineTrack[] },
  scenes: FootieScene[],
): ImageMotionTrackBuildResult {
  const sceneTrack = getTimelineTrackByType(masterTimeline.tracks, "scene");
  const sceneEvents = (sceneTrack?.events ?? []) as SceneTimelineEvent[];

  return buildImageMotionTrackFromScenes({
    scenes,
    sceneEvents,
  });
}

/** Returns an image-motion track ready to attach to MasterTimeline.tracks. */
export function createImageMotionTrack(
  masterTimeline: Pick<MasterTimeline, "tracks"> | { tracks: TimelineTrack[] },
  scenes: FootieScene[],
) {
  const build = buildImageMotionTrack(masterTimeline, scenes);
  return {
    track: createTimelineTrack("image-motion", build.events),
    ...build,
  };
}
