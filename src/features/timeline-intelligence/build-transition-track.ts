import type { FootieScene, FootieScript, TransitionEffect } from "@/features/story/types";
import { ensureTimelineItems, normalizeTransitionEffect } from "@/features/story/utils/timeline.utils";
import {
  clampOverlayTransitionDurationMs,
  getTransitionToNextScene,
} from "@/features/story/utils/transition-overlay.utils";

import type {
  MasterTimeline,
  SceneTimelineEvent,
  TimelineTrack,
  TransitionTimelineEvent,
  TransitionTimelineEventMetadata,
} from "./timeline.types";
import {
  computeTimelineDurationMs,
  createTimelineTrack,
  getTimelineTrackByType,
  normalizeTimelineEvent,
} from "./timeline-utils";

/** Timeline-driven transition schedule for one outgoing scene window. */
export interface TransitionEvent {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  transitionType: TransitionEffect;
  metadata: TransitionTimelineEventMetadata;
}

export interface TransitionTrackDiagnostics {
  eventsScheduled: number;
  /** Overlapping transition windows on the transition lane. */
  overlapCollisionCount: number;
  /** Transition windows that would start before the outgoing scene is visible. */
  sceneVisibilityViolationCount: number;
  /** Transition windows extending beyond the outgoing scene boundary. */
  outOfBoundsCount: number;
}

export interface TransitionTrackBuildResult {
  events: TransitionTimelineEvent[];
  schedules: TransitionEvent[];
  diagnostics: TransitionTrackDiagnostics;
  warnings: string[];
}

export interface ScheduleTransitionEventOptions {
  scenes: FootieScene[];
  sceneEvent: SceneTimelineEvent;
  timelineItems: FootieScript["timelineItems"];
}

/** Schedules one transition overlay aligned to the outgoing scene tail. */
export function scheduleTransitionEvent(
  options: ScheduleTransitionEventOptions,
): TransitionEvent | null {
  const fromSceneIndex = options.sceneEvent.metadata.sceneIndex;
  const fromScene = options.scenes[fromSceneIndex];
  if (!fromScene) {
    return null;
  }

  const items = ensureTimelineItems(options.scenes, options.timelineItems);
  const transition = getTransitionToNextScene(fromScene.id, items);
  if (!transition) {
    return null;
  }

  const overlayMs = clampOverlayTransitionDurationMs(
    transition.durationMs,
    options.sceneEvent.durationMs,
  );
  if (overlayMs <= 0) {
    return null;
  }

  const toSceneIndex = options.scenes.findIndex((scene) => scene.id === transition.toSceneId);
  if (toSceneIndex < 0) {
    return null;
  }

  const endMs = options.sceneEvent.endMs;
  const startMs = Math.max(options.sceneEvent.startMs, endMs - overlayMs);
  const durationMs = computeTimelineDurationMs(startMs, endMs);
  if (durationMs <= 0) {
    return null;
  }

  const transitionType = normalizeTransitionEffect(transition.effect);

  return {
    id: `transition-${transition.id}`,
    fromSceneId: fromScene.id,
    toSceneId: transition.toSceneId,
    startMs,
    endMs,
    durationMs,
    transitionType,
    metadata: buildTransitionMetadata({
      transition,
      fromSceneId: fromScene.id,
      toSceneId: transition.toSceneId,
      fromSceneIndex,
      toSceneIndex,
      transitionType,
      startMs,
      endMs,
      durationMs,
    }),
  };
}

function buildTransitionMetadata(input: {
  transition: { id: string; effect: TransitionEffect; durationMs: number; label: string };
  fromSceneId: string;
  toSceneId: string;
  fromSceneIndex: number;
  toSceneIndex: number;
  transitionType: TransitionEffect;
  startMs: number;
  endMs: number;
  durationMs: number;
}): TransitionTimelineEventMetadata {
  return {
    transitionId: input.transition.id,
    fromSceneId: input.fromSceneId,
    toSceneId: input.toSceneId,
    fromSceneIndex: input.fromSceneIndex,
    toSceneIndex: input.toSceneIndex,
    transitionType: input.transitionType,
    effect: input.transitionType,
    startMs: input.startMs,
    endMs: input.endMs,
    durationMs: input.durationMs,
    overlay: true,
  };
}

function toTimelineEvent(schedule: TransitionEvent): TransitionTimelineEvent {
  return normalizeTimelineEvent({
    id: schedule.id,
    type: "transition",
    startMs: schedule.startMs,
    endMs: schedule.endMs,
    durationMs: schedule.durationMs,
    source: "derived-transition",
    metadata: schedule.metadata,
  });
}

function detectTransitionOverlaps(events: TransitionTimelineEvent[]): number {
  const sorted = [...events].sort((left, right) => left.startMs - right.startMs);
  let collisions = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.startMs < previous.endMs) {
      collisions += 1;
    }
  }

  return collisions;
}

function detectSceneVisibilityViolations(
  schedules: TransitionEvent[],
  sceneEvents: SceneTimelineEvent[],
): { visibilityViolations: number; outOfBounds: number } {
  const sceneById = new Map(sceneEvents.map((event) => [event.metadata.sceneId, event]));
  let visibilityViolations = 0;
  let outOfBounds = 0;

  for (const schedule of schedules) {
    const fromSceneEvent = sceneById.get(schedule.fromSceneId);
    if (!fromSceneEvent) {
      outOfBounds += 1;
      continue;
    }

    if (schedule.startMs < fromSceneEvent.startMs) {
      visibilityViolations += 1;
    }

    if (schedule.endMs > fromSceneEvent.endMs || schedule.startMs >= fromSceneEvent.endMs) {
      outOfBounds += 1;
    }
  }

  return { visibilityViolations, outOfBounds };
}

export interface BuildTransitionTrackOptions {
  scenes: FootieScene[];
  sceneEvents: SceneTimelineEvent[];
  timelineItems?: FootieScript["timelineItems"];
}

/** Builds transition track events from scene windows and editor timeline items. */
export function buildTransitionTrackFromScenes(
  options: BuildTransitionTrackOptions,
): TransitionTrackBuildResult {
  const schedules: TransitionEvent[] = [];
  const warnings: string[] = [];

  for (const sceneEvent of options.sceneEvents) {
    const schedule = scheduleTransitionEvent({
      scenes: options.scenes,
      sceneEvent,
      timelineItems: options.timelineItems,
    });

    if (schedule) {
      schedules.push(schedule);
    }
  }

  const events = schedules.map(toTimelineEvent);
  const overlapCollisionCount = detectTransitionOverlaps(events);
  const { visibilityViolations, outOfBounds } = detectSceneVisibilityViolations(
    schedules,
    options.sceneEvents,
  );

  if (overlapCollisionCount > 0) {
    warnings.push(
      `[transition] ${overlapCollisionCount} overlapping transition window(s) detected on the transition lane.`,
    );
  }

  if (visibilityViolations > 0) {
    warnings.push(
      `[transition] ${visibilityViolations} transition window(s) would start before the outgoing scene is visible.`,
    );
  }

  if (outOfBounds > 0) {
    warnings.push(
      `[transition] ${outOfBounds} transition window(s) extend outside the outgoing scene boundary.`,
    );
  }

  return {
    events,
    schedules,
    diagnostics: {
      eventsScheduled: events.length,
      overlapCollisionCount,
      sceneVisibilityViolationCount: visibilityViolations,
      outOfBoundsCount: outOfBounds,
    },
    warnings,
  };
}

/** Rebuilds transition scheduling from an existing MasterTimeline scene lane. */
export function buildTransitionTrack(
  masterTimeline: Pick<MasterTimeline, "tracks"> | { tracks: TimelineTrack[] },
  scenes: FootieScene[],
  timelineItems?: FootieScript["timelineItems"],
): TransitionTrackBuildResult {
  const sceneTrack = getTimelineTrackByType(masterTimeline.tracks, "scene");
  const sceneEvents = (sceneTrack?.events ?? []) as SceneTimelineEvent[];

  return buildTransitionTrackFromScenes({
    scenes,
    sceneEvents,
    timelineItems,
  });
}

/** Returns a transition track ready to attach to MasterTimeline.tracks. */
export function createTransitionTrack(
  masterTimeline: Pick<MasterTimeline, "tracks"> | { tracks: TimelineTrack[] },
  scenes: FootieScene[],
  timelineItems?: FootieScript["timelineItems"],
) {
  const build = buildTransitionTrack(masterTimeline, scenes, timelineItems);
  return {
    track: createTimelineTrack("transition", build.events),
    ...build,
  };
}
