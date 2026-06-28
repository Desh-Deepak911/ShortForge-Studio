import type { TimelineAuthorityMode, TimelineEventSource } from "./timeline.types";

/** Supported authority modes in priority order for export-style pipelines. */
export const TIMELINE_AUTHORITY_MODES = [
  "editor-scene-timing",
  "export-refit-timing",
] as const satisfies readonly TimelineAuthorityMode[];

/** Event sources that map directly to a timing authority mode. */
export const TIMELINE_AUTHORITY_EVENT_SOURCES = [
  "editor-scene-timing",
  "export-refit-timing",
] as const satisfies readonly TimelineEventSource[];

export interface TimelineAuthorityDescriptor {
  mode: TimelineAuthorityMode;
  label: string;
  description: string;
  /** True when voiceover duration can override scene totals during build. */
  prefersVoiceoverDuration: boolean;
}

const AUTHORITY_DESCRIPTORS: Record<TimelineAuthorityMode, TimelineAuthorityDescriptor> = {
  "editor-scene-timing": {
    mode: "editor-scene-timing",
    label: "Editor scene timing",
    description:
      "Uses persisted scene start/end windows from the story editor. Matches current preview narration mapping.",
    prefersVoiceoverDuration: false,
  },
  "export-refit-timing": {
    mode: "export-refit-timing",
    label: "Export refit timing",
    description:
      "Proportionally refits scene durations to voiceover length before render. Matches export preflight today.",
    prefersVoiceoverDuration: true,
  },
};

export interface ResolveTimelineAuthorityInput {
  /** Explicit override — used by future callers (preview vs export). */
  requestedAuthority?: TimelineAuthorityMode;
  /** True when a valid voiceover URL and duration are present. */
  hasVoiceover?: boolean;
  /** True when export-style refit should be preferred (e.g. export path). */
  preferExportRefit?: boolean;
}

export interface ResolvedTimelineAuthority {
  mode: TimelineAuthorityMode;
  descriptor: TimelineAuthorityDescriptor;
  /** Human-readable reason for downstream diagnostics. */
  reason: string;
}

/** Selects the timing authority mode without building a timeline. */
export function resolveTimelineAuthority(
  input: ResolveTimelineAuthorityInput = {},
): ResolvedTimelineAuthority {
  if (input.requestedAuthority) {
    const descriptor = AUTHORITY_DESCRIPTORS[input.requestedAuthority];
    return {
      mode: input.requestedAuthority,
      descriptor,
      reason: `Requested authority: ${descriptor.label}.`,
    };
  }

  if (input.preferExportRefit && input.hasVoiceover) {
    const descriptor = AUTHORITY_DESCRIPTORS["export-refit-timing"];
    return {
      mode: "export-refit-timing",
      descriptor,
      reason: "Export path with voiceover — refit timing is preferred.",
    };
  }

  const descriptor = AUTHORITY_DESCRIPTORS["editor-scene-timing"];
  return {
    mode: "editor-scene-timing",
    descriptor,
    reason: input.hasVoiceover
      ? "Default editor scene timing (voiceover present but refit not requested)."
      : "Default editor scene timing (no voiceover refit required).",
  };
}

export function isTimelineAuthorityMode(value: string): value is TimelineAuthorityMode {
  return TIMELINE_AUTHORITY_MODES.includes(value as TimelineAuthorityMode);
}

export function isTimelineAuthorityEventSource(
  value: string,
): value is (typeof TIMELINE_AUTHORITY_EVENT_SOURCES)[number] {
  return TIMELINE_AUTHORITY_EVENT_SOURCES.includes(
    value as (typeof TIMELINE_AUTHORITY_EVENT_SOURCES)[number],
  );
}

export function getTimelineAuthorityDescriptor(
  mode: TimelineAuthorityMode,
): TimelineAuthorityDescriptor {
  return AUTHORITY_DESCRIPTORS[mode];
}

/** Maps an authority mode to the primary scene event source label. */
export function authorityToSceneEventSource(
  authority: TimelineAuthorityMode,
): TimelineEventSource {
  return authority;
}

/** True when two authority modes would typically produce different scene windows. */
export function authoritiesMayDiverge(options: {
  editorSceneDurationMs: number;
  voiceoverDurationMs?: number | null;
  toleranceMs?: number;
}): boolean {
  const toleranceMs = options.toleranceMs ?? 50;
  const voiceoverDurationMs = options.voiceoverDurationMs;

  if (voiceoverDurationMs == null || voiceoverDurationMs <= 0) {
    return false;
  }

  return Math.abs(options.editorSceneDurationMs - voiceoverDurationMs) > toleranceMs;
}
