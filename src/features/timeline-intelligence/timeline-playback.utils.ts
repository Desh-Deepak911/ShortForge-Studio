import type {
  CaptionAnimationTimelineEvent,
  ImageMotionTimelineEvent,
  MasterTimeline,
  SceneTimelineEvent,
  SubtitleTimelineEvent,
  TimelineEvent,
  TransitionTimelineEvent,
} from "./timeline.types";
import { getTimelineTrackByType } from "./timeline-utils";

export interface ActiveTimelineEvent<T extends TimelineEvent = TimelineEvent> {
  event: T;
  elapsedMs: number;
  durationMs: number;
  /** Linear progress through the event window (0–1). */
  progress: number;
}

export interface TimelineProgress {
  elapsedMs: number;
  durationMs: number;
  progress: number;
  /** True when `startMs <= timeMs < endMs`. */
  isWithinWindow: boolean;
}

export interface TimelineSceneFrame<TScene extends { id: string; durationMs?: number }> {
  scene: TScene;
  sceneIndex: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  sceneActive: ActiveTimelineEvent<SceneTimelineEvent> | null;
  subtitle: ActiveTimelineEvent<SubtitleTimelineEvent> | null;
  captionAnimation: ActiveTimelineEvent<CaptionAnimationTimelineEvent> | null;
  imageMotion: ActiveTimelineEvent<ImageMotionTimelineEvent> | null;
}

export interface TimelineSubtitleChunkState {
  activeSubtitleChunk: string;
  chunkProgress: number;
  chunkElapsedMs: number;
  chunkDurationMs: number;
}

/** Stable export frame clock — integer ms from frame index and fps. */
export function resolveTimelineFrameTimeMs(frameIndex: number, fps: number): number {
  return Math.floor((frameIndex * 1000) / fps);
}

/** Frame count needed to cover a render span (inclusive of final frame). */
export function resolveTimelineFrameCount(renderDurationMs: number, fps: number): number {
  return Math.max(1, Math.ceil((renderDurationMs * fps) / 1000));
}

function sortEventsByStart<T extends TimelineEvent>(events: T[]): T[] {
  return [...events].sort((left, right) => left.startMs - right.startMs);
}

/**
 * Progress for one timeline event at an absolute time.
 * Boundary rule: `startMs <= timeMs < endMs` is the active window.
 * Past `endMs`, progress clamps to 1 for tail-hold rendering.
 */
export function getTimelineProgress(event: TimelineEvent, timeMs: number): TimelineProgress {
  const durationMs = event.durationMs;
  const clampedTime = Math.max(0, timeMs);

  if (clampedTime >= event.startMs && clampedTime < event.endMs) {
    const elapsedMs = clampedTime - event.startMs;
    return {
      elapsedMs,
      durationMs,
      progress: durationMs > 0 ? elapsedMs / durationMs : 1,
      isWithinWindow: true,
    };
  }

  if (clampedTime >= event.endMs) {
    return {
      elapsedMs: durationMs,
      durationMs,
      progress: 1,
      isWithinWindow: false,
    };
  }

  return {
    elapsedMs: 0,
    durationMs,
    progress: 0,
    isWithinWindow: false,
  };
}

function toActiveTimelineEvent<T extends TimelineEvent>(
  event: T,
  progress: TimelineProgress,
): ActiveTimelineEvent<T> {
  return {
    event,
    elapsedMs: progress.elapsedMs,
    durationMs: progress.durationMs,
    progress: progress.progress,
  };
}

/**
 * Resolves the active event at an absolute time using [startMs, endMs) comparison.
 * When `holdTail` is true, the last started event is held through the render tail
 * (including the end buffer up to `renderDurationMs`).
 */
function resolveActiveEventAtTime<T extends TimelineEvent>(
  events: T[],
  currentTimeMs: number,
  options: { holdTail?: boolean; renderDurationMs?: number } = {},
): ActiveTimelineEvent<T> | null {
  const holdTail = options.holdTail ?? true;
  const sorted = sortEventsByStart(events);
  if (sorted.length === 0) {
    return null;
  }

  const timeMs = Math.max(0, currentTimeMs);
  const renderDurationMs = options.renderDurationMs;

  for (const event of sorted) {
    const progress = getTimelineProgress(event, timeMs);
    if (progress.isWithinWindow) {
      return toActiveTimelineEvent(event, progress);
    }
  }

  if (!holdTail) {
    return null;
  }

  if (renderDurationMs != null && timeMs >= renderDurationMs) {
    return null;
  }

  let hold: T | null = null;
  for (const event of sorted) {
    if (timeMs >= event.startMs) {
      hold = event;
    }
  }

  if (!hold) {
    const first = sorted[0]!;
    return toActiveTimelineEvent(first, getTimelineProgress(first, timeMs));
  }

  const tailProgress = getTimelineProgress(hold, timeMs);
  return toActiveTimelineEvent(hold, {
    ...tailProgress,
    elapsedMs: Math.min(hold.durationMs, timeMs - hold.startMs),
    progress: hold.durationMs > 0 ? Math.min(1, (timeMs - hold.startMs) / hold.durationMs) : 1,
  });
}

function resolveActiveEventsOptions(masterTimeline: MasterTimeline) {
  return {
    holdTail: true,
    renderDurationMs: masterTimeline.renderDurationMs,
  };
}

export function getActiveSceneAtTime(
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
): ActiveTimelineEvent<SceneTimelineEvent> | null {
  const track = getTimelineTrackByType(masterTimeline.tracks, "scene");
  if (!track) {
    return null;
  }

  return resolveActiveEventAtTime(
    track.events as SceneTimelineEvent[],
    currentTimeMs,
    resolveActiveEventsOptions(masterTimeline),
  );
}

export function getActiveSubtitleAtTime(
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
): ActiveTimelineEvent<SubtitleTimelineEvent> | null {
  const track = getTimelineTrackByType(masterTimeline.tracks, "subtitle");
  if (!track) {
    return null;
  }

  return resolveActiveEventAtTime(
    track.events as SubtitleTimelineEvent[],
    currentTimeMs,
    resolveActiveEventsOptions(masterTimeline),
  );
}

export function getActiveCaptionAnimationAtTime(
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
): ActiveTimelineEvent<CaptionAnimationTimelineEvent> | null {
  const track = getTimelineTrackByType(masterTimeline.tracks, "caption-animation");
  if (!track) {
    return null;
  }

  return resolveActiveEventAtTime(
    track.events as CaptionAnimationTimelineEvent[],
    currentTimeMs,
    resolveActiveEventsOptions(masterTimeline),
  );
}

export function getActiveImageMotionAtTime(
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
): ActiveTimelineEvent<ImageMotionTimelineEvent> | null {
  const track = getTimelineTrackByType(masterTimeline.tracks, "image-motion");
  if (!track) {
    return null;
  }

  return resolveActiveEventAtTime(
    track.events as ImageMotionTimelineEvent[],
    currentTimeMs,
    resolveActiveEventsOptions(masterTimeline),
  );
}

export function getActiveTransitionAtTime(
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
): ActiveTimelineEvent<TransitionTimelineEvent> | null {
  const track = getTimelineTrackByType(masterTimeline.tracks, "transition");
  if (!track) {
    return null;
  }

  return resolveActiveEventAtTime(
    track.events as TransitionTimelineEvent[],
    currentTimeMs,
    { holdTail: false },
  );
}

/** Returns the image-motion event scheduled for one scene (if any). */
export function getImageMotionEventForScene(
  masterTimeline: MasterTimeline,
  sceneId: string,
): ImageMotionTimelineEvent | null {
  const track = getTimelineTrackByType(masterTimeline.tracks, "image-motion");
  if (!track) {
    return null;
  }

  return (
    (track.events as ImageMotionTimelineEvent[]).find(
      (event) => event.metadata.sceneId === sceneId,
    ) ?? null
  );
}

/** Maps active subtitle + animation events to chunk display state for one scene. */
export function resolveTimelineSubtitleChunkAtTime(
  sceneId: string,
  subtitle: ActiveTimelineEvent<SubtitleTimelineEvent> | null,
  captionAnimation: ActiveTimelineEvent<CaptionAnimationTimelineEvent> | null,
): TimelineSubtitleChunkState | null {
  if (!subtitle || subtitle.event.metadata.sceneId !== sceneId) {
    return null;
  }

  return {
    activeSubtitleChunk: subtitle.event.metadata.text,
    chunkProgress: captionAnimation?.progress ?? subtitle.progress,
    chunkElapsedMs: captionAnimation?.elapsedMs ?? subtitle.elapsedMs,
    chunkDurationMs: captionAnimation?.durationMs ?? subtitle.durationMs,
  };
}

/**
 * Shared preview/export frame resolver — scene, subtitle, and animation from
 * MasterTimeline absolute timestamps only.
 */
export function resolveTimelineSceneFrame<TScene extends { id: string; durationMs?: number }>(
  masterTimeline: MasterTimeline,
  scenes: TScene[],
  currentTimeMs: number,
): TimelineSceneFrame<TScene> | null {
  if (scenes.length === 0) {
    return null;
  }

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const fallbackScene = scenes[0]!;
  const sceneActive = getActiveSceneAtTime(masterTimeline, currentTimeMs);
  const subtitle = getActiveSubtitleAtTime(masterTimeline, currentTimeMs);
  const captionAnimation = getActiveCaptionAnimationAtTime(masterTimeline, currentTimeMs);
  const imageMotion = getActiveImageMotionAtTime(masterTimeline, currentTimeMs);

  if (!sceneActive) {
    return {
      scene: fallbackScene,
      sceneIndex: 0,
      sceneElapsedMs: 0,
      sceneDurationMs: fallbackScene.durationMs ?? 1000,
      sceneActive: null,
      subtitle,
      captionAnimation,
      imageMotion,
    };
  }

  const sceneId = sceneActive.event.metadata.sceneId;
  const sceneIndex = sceneActive.event.metadata.sceneIndex;
  const scene = sceneById.get(sceneId) ?? scenes[sceneIndex] ?? fallbackScene;

  return {
    scene,
    sceneIndex,
    sceneElapsedMs: sceneActive.elapsedMs,
    sceneDurationMs: sceneActive.durationMs,
    sceneActive,
    subtitle,
    captionAnimation,
    imageMotion,
  };
}
