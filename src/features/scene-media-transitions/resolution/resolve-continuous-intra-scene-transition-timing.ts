/**
 * Continuous media timing for an intra-scene transition.
 *
 * The transition is centered on the existing media boundary. Both peers keep
 * advancing through the overlap and join ordinary item playback at the two
 * outer edges. This avoids the legacy head-of-incoming final-frame hold while
 * preserving the scene duration and the creator-selected effect duration.
 */

export const CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL =
  "centered-continuous-v1" as const;

export interface ContinuousIntraSceneTransitionTimingInput {
  /** Existing boundary between two contiguous media windows. */
  readonly boundaryMs: number;
  readonly effectiveDurationMs: number;
  readonly fromWindowDurationMs: number;
  readonly toWindowDurationMs: number;
  readonly sceneElapsedMs: number;
}

export interface ResolvedContinuousIntraSceneTransitionTiming {
  readonly model: typeof CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL;
  readonly overlayStartMs: number;
  readonly overlayEndMs: number;
  readonly progress: number;
  readonly outgoingItemLocalMs: number;
  readonly incomingItemLocalMs: number;
  readonly outgoingAdvanceMs: number;
  readonly incomingAdvanceMs: number;
}

export interface ContinuousTransitionMediaAvailabilityInput {
  readonly type?: string;
  readonly durationMs?: number;
  readonly sourceDurationMs?: number;
  readonly trimStartMs?: number;
  readonly trimEndMs?: number;
}

export interface ContinuousTransitionFootageAvailability {
  readonly allowed: boolean;
  readonly reason:
    | "sufficient_or_not_applicable"
    | "outgoing_source_exhausted"
    | "incoming_source_exhausted";
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function resolveKnownPlayableVideoDurationMs(
  media: ContinuousTransitionMediaAvailabilityInput | null | undefined,
): number | null {
  if (!media || media.type !== "video") return null;
  const sourceDurationMs =
    typeof media.sourceDurationMs === "number" &&
    Number.isFinite(media.sourceDurationMs)
      ? media.sourceDurationMs
      : typeof media.durationMs === "number" && Number.isFinite(media.durationMs)
        ? media.durationMs
        : null;
  if (sourceDurationMs === null || sourceDurationMs <= 0) return null;
  const trimStartMs =
    typeof media.trimStartMs === "number" && Number.isFinite(media.trimStartMs)
      ? Math.max(0, Math.min(sourceDurationMs, media.trimStartMs))
      : 0;
  const trimEndMs =
    typeof media.trimEndMs === "number" && Number.isFinite(media.trimEndMs)
      ? Math.max(trimStartMs, Math.min(sourceDurationMs, media.trimEndMs))
      : sourceDurationMs;
  return trimEndMs - trimStartMs;
}

/**
 * Fail to a hard cut when known video trims cannot provide moving frames for
 * the full outgoing window or the incoming half of the centered overlap.
 * Unknown metadata is not treated as exhaustion; runtime decode remains
 * non-terminal and uses the existing media fallback behavior.
 */
export function resolveContinuousTransitionFootageAvailability(input: {
  readonly fromMedia?: ContinuousTransitionMediaAvailabilityInput | null;
  readonly toMedia?: ContinuousTransitionMediaAvailabilityInput | null;
  readonly fromWindowDurationMs: number;
  readonly effectiveDurationMs: number;
}): ContinuousTransitionFootageAvailability {
  const outgoingPlayableMs = resolveKnownPlayableVideoDurationMs(input.fromMedia);
  if (
    outgoingPlayableMs !== null &&
    outgoingPlayableMs < input.fromWindowDurationMs
  ) {
    return { allowed: false, reason: "outgoing_source_exhausted" };
  }

  const incomingPlayableMs = resolveKnownPlayableVideoDurationMs(input.toMedia);
  const incomingRequiredMs = Math.ceil(input.effectiveDurationMs / 2);
  if (
    incomingPlayableMs !== null &&
    incomingPlayableMs < incomingRequiredMs
  ) {
    return { allowed: false, reason: "incoming_source_exhausted" };
  }

  return { allowed: true, reason: "sufficient_or_not_applicable" };
}

/**
 * Returns null outside the centered [start, end) overlap or for unusable
 * inputs. The effective duration is already bounded by the existing 40%
 * authority, so both halves remain inside their adjacent media windows.
 */
export function resolveContinuousIntraSceneTransitionTiming(
  input: ContinuousIntraSceneTransitionTimingInput,
): ResolvedContinuousIntraSceneTransitionTiming | null {
  const {
    boundaryMs,
    effectiveDurationMs,
    fromWindowDurationMs,
    toWindowDurationMs,
    sceneElapsedMs,
  } = input;

  if (
    !finiteNonNegative(boundaryMs) ||
    !Number.isFinite(effectiveDurationMs) ||
    effectiveDurationMs <= 0 ||
    !Number.isFinite(fromWindowDurationMs) ||
    fromWindowDurationMs <= 0 ||
    !Number.isFinite(toWindowDurationMs) ||
    toWindowDurationMs <= 0 ||
    !finiteNonNegative(sceneElapsedMs)
  ) {
    return null;
  }

  const outgoingSpanMs = Math.floor(effectiveDurationMs / 2);
  const incomingSpanMs = effectiveDurationMs - outgoingSpanMs;
  if (
    outgoingSpanMs <= 0 ||
    incomingSpanMs <= 0 ||
    outgoingSpanMs > fromWindowDurationMs ||
    incomingSpanMs > toWindowDurationMs
  ) {
    return null;
  }

  const overlayStartMs = boundaryMs - outgoingSpanMs;
  const overlayEndMs = boundaryMs + incomingSpanMs;
  if (
    overlayStartMs < 0 ||
    sceneElapsedMs < overlayStartMs ||
    sceneElapsedMs >= overlayEndMs
  ) {
    return null;
  }

  const elapsedMs = sceneElapsedMs - overlayStartMs;
  const progress = Math.min(1, Math.max(0, elapsedMs / effectiveDurationMs));
  const outgoingStartMs = fromWindowDurationMs - outgoingSpanMs;
  const outgoingAdvanceMs = progress * outgoingSpanMs;
  const incomingAdvanceMs = progress * incomingSpanMs;

  return {
    model: CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL,
    overlayStartMs,
    overlayEndMs,
    progress,
    outgoingItemLocalMs: outgoingStartMs + outgoingAdvanceMs,
    incomingItemLocalMs: incomingAdvanceMs,
    outgoingAdvanceMs,
    incomingAdvanceMs,
  };
}
