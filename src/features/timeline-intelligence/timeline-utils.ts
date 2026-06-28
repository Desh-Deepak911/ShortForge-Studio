import { authorityToSceneEventSource, resolveTimelineAuthority } from "./timeline-authority";
import type {
  MasterTimeline,
  MasterTimelineDiagnostics,
  TimelineAuthorityMode,
  TimelineEvent,
  TimelineEventType,
  TimelineTrack,
  TimelineTrackType,
} from "./timeline.types";
import { TIMELINE_INTELLIGENCE_SCHEMA_VERSION } from "./timeline.types";

export interface CreateEmptyMasterTimelineOptions {
  id?: string;
  authority?: TimelineAuthorityMode;
  warnings?: string[];
  diagnostics?: Partial<MasterTimelineDiagnostics>;
}

/** Computes span from absolute timestamps. */
export function computeTimelineDurationMs(startMs: number, endMs: number): number {
  return Math.max(0, endMs - startMs);
}

/** Returns a copy with consistent durationMs derived from start/end. */
export function normalizeTimelineEvent<T extends TimelineEvent>(event: T): T {
  const durationMs = computeTimelineDurationMs(event.startMs, event.endMs);

  if (event.durationMs === durationMs) {
    return event;
  }

  return {
    ...event,
    durationMs,
  };
}

export interface TimelineEventValidationIssue {
  eventId: string;
  message: string;
}

/** Validates absolute timestamps and duration consistency for one event. */
export function validateTimelineEvent(event: TimelineEvent): TimelineEventValidationIssue[] {
  const issues: TimelineEventValidationIssue[] = [];

  if (event.startMs < 0) {
    issues.push({ eventId: event.id, message: "startMs must be >= 0." });
  }

  if (event.endMs < event.startMs) {
    issues.push({ eventId: event.id, message: "endMs must be >= startMs." });
  }

  const expectedDurationMs = computeTimelineDurationMs(event.startMs, event.endMs);
  if (event.durationMs !== expectedDurationMs) {
    issues.push({
      eventId: event.id,
      message: `durationMs (${event.durationMs}) must equal endMs - startMs (${expectedDurationMs}).`,
    });
  }

  return issues;
}

export interface MasterTimelineValidationResult {
  valid: boolean;
  issues: TimelineEventValidationIssue[];
}

/** Validates all events on a master timeline. */
export function validateMasterTimeline(timeline: MasterTimeline): MasterTimelineValidationResult {
  const issues = timeline.tracks.flatMap((track) =>
    track.events.flatMap((event) => validateTimelineEvent(event)),
  );

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** Latest exclusive end across all events (zero when empty). */
export function getTimelineContentEndMs(timeline: Pick<MasterTimeline, "tracks">): number {
  let endMs = 0;

  for (const track of timeline.tracks) {
    for (const event of track.events) {
      endMs = Math.max(endMs, event.endMs);
    }
  }

  return endMs;
}

/** Union span across events on a single track type. */
export function getTrackUnionDurationMs(
  tracks: TimelineTrack[],
  type: TimelineTrackType,
): number {
  const track = getTimelineTrackByType(tracks, type);
  if (!track || track.events.length === 0) {
    return 0;
  }

  const startMs = Math.min(...track.events.map((event) => event.startMs));
  const endMs = Math.max(...track.events.map((event) => event.endMs));
  return computeTimelineDurationMs(startMs, endMs);
}

export function getTimelineTrackByType(
  tracks: TimelineTrack[],
  type: TimelineTrackType,
): TimelineTrack | undefined {
  return tracks.find((track) => track.type === type);
}

/** Events active at `timeMs` — half-open interval [startMs, endMs). */
export function getTimelineEventsAtTime(
  tracks: TimelineTrack[],
  timeMs: number,
  type?: TimelineEventType,
): TimelineEvent[] {
  const clampedTimeMs = Math.max(0, timeMs);
  const matchingTracks = type
    ? tracks.filter((track) => track.type === type)
    : tracks;

  return matchingTracks.flatMap((track) =>
    track.events.filter(
      (event) => event.startMs <= clampedTimeMs && clampedTimeMs < event.endMs,
    ),
  );
}

export function createTimelineTrack(
  type: TimelineTrackType,
  events: TimelineEvent[] = [],
  options: { id?: string; label?: string } = {},
): TimelineTrack {
  return {
    id: options.id ?? `track-${type}`,
    type,
    label: options.label,
    events: events.map((event) => normalizeTimelineEvent(event)),
  };
}

export function createDefaultTimelineTracks(): TimelineTrack[] {
  const trackTypes: TimelineTrackType[] = [
    "scene",
    "subtitle",
    "caption-animation",
    "audio",
    "image-motion",
    "transition",
  ];

  return trackTypes.map((type) => createTimelineTrack(type));
}

/** Empty canonical timeline scaffold — no story/build wiring yet. */
export function createEmptyMasterTimeline(
  options: CreateEmptyMasterTimelineOptions = {},
): MasterTimeline {
  const authority =
    options.authority ??
    resolveTimelineAuthority().mode;
  const tracks = createDefaultTimelineTracks();
  const builtAtIso = new Date().toISOString();

  const diagnostics: MasterTimelineDiagnostics = {
    schemaVersion: TIMELINE_INTELLIGENCE_SCHEMA_VERSION,
    authority,
    builtAtIso,
    sceneCount: 0,
    eventCount: 0,
    ...options.diagnostics,
  };

  return {
    id: options.id ?? `timeline-${authority}-${builtAtIso}`,
    authority,
    renderDurationMs: 0,
    audioDurationMs: 0,
    narrationDurationMs: 0,
    sceneDurationMs: 0,
    subtitleDurationMs: 0,
    animationDurationMs: 0,
    transitionDurationMs: 0,
    tracks,
    warnings: options.warnings ?? [],
    diagnostics,
  };
}

/** Recomputes top-level duration fields from track contents (structural helper only). */
export function summarizeMasterTimelineDurations(
  timeline: MasterTimeline,
): Pick<
  MasterTimeline,
  | "renderDurationMs"
  | "sceneDurationMs"
  | "subtitleDurationMs"
  | "animationDurationMs"
  | "transitionDurationMs"
  | "diagnostics"
> {
  const contentEndMs = getTimelineContentEndMs(timeline);
  const sceneDurationMs = getTrackUnionDurationMs(timeline.tracks, "scene");
  const subtitleDurationMs = getTrackUnionDurationMs(timeline.tracks, "subtitle");
  const animationDurationMs = getTrackUnionDurationMs(
    timeline.tracks,
    "caption-animation",
  );
  const transitionDurationMs = getTrackUnionDurationMs(timeline.tracks, "transition");
  const eventCount = timeline.tracks.reduce(
    (count, track) => count + track.events.length,
    0,
  );
  const sceneCount =
    getTimelineTrackByType(timeline.tracks, "scene")?.events.length ?? 0;

  return {
    renderDurationMs: Math.max(timeline.renderDurationMs, contentEndMs),
    sceneDurationMs,
    subtitleDurationMs,
    animationDurationMs,
    transitionDurationMs,
    diagnostics: {
      ...timeline.diagnostics,
      authority: timeline.authority,
      sceneCount,
      eventCount,
    },
  };
}

/** Primary scene event source for a timeline authority (for future builders). */
export function resolveSceneEventSourceForAuthority(
  authority: TimelineAuthorityMode,
) {
  return authorityToSceneEventSource(authority);
}
