/**
 * Structured source provenance for visual-beat plans.
 * Enables exact stale-reason derivation without storing narration text or media bytes.
 */

import {
  digestVisualBeatCanonicalPayload,
  normalizeVisualBeatNarrationText,
  normalizeVisualBeatUsableMedia,
} from "./fingerprint-visual-beat-input";
import {
  VISUAL_BEAT_GENERATOR_VERSION,
  type VisualBeatDensity,
  type VisualBeatUsableMediaIdentity,
} from "./visual-beat-plan";

export const VISUAL_BEAT_SOURCE_SNAPSHOT_VERSION = 1 as const;

export const VISUAL_BEAT_NARRATION_FINGERPRINT_PREFIX = "vbdn1:" as const;
export const VISUAL_BEAT_MEDIA_SET_FINGERPRINT_PREFIX = "vbdms1:" as const;
export const VISUAL_BEAT_ORDERED_MEDIA_FINGERPRINT_PREFIX = "vbdom1:" as const;

/**
 * Minimal versioned source snapshot.
 * No raw narration text, media bytes, secrets, or timestamps.
 */
export interface VisualBeatSourceSnapshotV1 {
  readonly version: typeof VISUAL_BEAT_SOURCE_SNAPSHOT_VERSION;
  /** Digest of normalized narration — not the narration string itself. */
  readonly narrationFingerprint: string;
  readonly sceneDurationMs: number;
  readonly mediaCount: number;
  /** Order-insensitive multiset membership digest (duplicates preserved). */
  readonly mediaSetFingerprint: string;
  /** Order-sensitive identity sequence digest. */
  readonly orderedMediaFingerprint: string;
  readonly density: VisualBeatDensity;
  /** Generator that produced the plan; compared exactly for GENERATOR_CHANGED. */
  readonly generatorVersion: number;
}

export interface BuildVisualBeatSourceSnapshotInput {
  readonly narrationText: string;
  readonly sceneDurationMs: number;
  readonly usableMedia: readonly VisualBeatUsableMediaIdentity[];
  readonly density: VisualBeatDensity;
  readonly generatorVersion?: typeof VISUAL_BEAT_GENERATOR_VERSION;
}

function mediaIdentityKey(item: VisualBeatUsableMediaIdentity): string {
  return `${item.itemId}\0${item.mediaKind}\0${item.sourceIdentity}`;
}

export function fingerprintVisualBeatNarrationText(narrationText: string): string {
  const normalized = normalizeVisualBeatNarrationText(narrationText);
  return `${VISUAL_BEAT_NARRATION_FINGERPRINT_PREFIX}${digestVisualBeatCanonicalPayload(
    { narration: normalized },
  )}`;
}

export function fingerprintVisualBeatMediaSet(
  usableMedia: readonly VisualBeatUsableMediaIdentity[],
): string {
  const normalized = normalizeVisualBeatUsableMedia(usableMedia);
  // Sort keys for order-insensitive multiset membership; duplicates remain.
  const keys = normalized.map(mediaIdentityKey).sort();
  return `${VISUAL_BEAT_MEDIA_SET_FINGERPRINT_PREFIX}${digestVisualBeatCanonicalPayload(
    { keys },
  )}`;
}

export function fingerprintVisualBeatOrderedMedia(
  usableMedia: readonly VisualBeatUsableMediaIdentity[],
): string {
  const normalized = normalizeVisualBeatUsableMedia(usableMedia);
  const keys = normalized.map(mediaIdentityKey);
  return `${VISUAL_BEAT_ORDERED_MEDIA_FINGERPRINT_PREFIX}${digestVisualBeatCanonicalPayload(
    { keys },
  )}`;
}

export function buildVisualBeatSourceSnapshot(
  input: BuildVisualBeatSourceSnapshotInput,
): VisualBeatSourceSnapshotV1 {
  const usableMedia = normalizeVisualBeatUsableMedia(input.usableMedia);
  const sceneDurationMs = Number.isFinite(input.sceneDurationMs)
    ? Math.max(0, Math.round(input.sceneDurationMs))
    : 0;
  return {
    version: VISUAL_BEAT_SOURCE_SNAPSHOT_VERSION,
    narrationFingerprint: fingerprintVisualBeatNarrationText(input.narrationText),
    sceneDurationMs,
    mediaCount: usableMedia.length,
    mediaSetFingerprint: fingerprintVisualBeatMediaSet(usableMedia),
    orderedMediaFingerprint: fingerprintVisualBeatOrderedMedia(usableMedia),
    density: input.density,
    generatorVersion: input.generatorVersion ?? VISUAL_BEAT_GENERATOR_VERSION,
  };
}

function isFiniteNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DENSITIES = new Set<VisualBeatDensity>(["fast", "balanced", "studio"]);

export function parseVisualBeatSourceSnapshot(value: unknown): {
  readonly snapshot: VisualBeatSourceSnapshotV1 | undefined;
  readonly invalid: boolean;
  readonly warning: string | undefined;
} {
  if (value === undefined || value === null) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: missing sourceSnapshot.",
    };
  }
  if (!isRecord(value)) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: malformed sourceSnapshot.",
    };
  }
  if (value.version !== VISUAL_BEAT_SOURCE_SNAPSHOT_VERSION) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: unsupported sourceSnapshot version.",
    };
  }
  if (
    typeof value.narrationFingerprint !== "string" ||
    !value.narrationFingerprint.startsWith(VISUAL_BEAT_NARRATION_FINGERPRINT_PREFIX)
  ) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid narrationFingerprint.",
    };
  }
  if (!isFiniteNonNegInt(value.sceneDurationMs)) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid sourceSnapshot.sceneDurationMs.",
    };
  }
  if (!isFiniteNonNegInt(value.mediaCount)) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid sourceSnapshot.mediaCount.",
    };
  }
  if (
    typeof value.mediaSetFingerprint !== "string" ||
    !value.mediaSetFingerprint.startsWith(VISUAL_BEAT_MEDIA_SET_FINGERPRINT_PREFIX)
  ) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid mediaSetFingerprint.",
    };
  }
  if (
    typeof value.orderedMediaFingerprint !== "string" ||
    !value.orderedMediaFingerprint.startsWith(
      VISUAL_BEAT_ORDERED_MEDIA_FINGERPRINT_PREFIX,
    )
  ) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid orderedMediaFingerprint.",
    };
  }
  if (
    typeof value.density !== "string" ||
    !DENSITIES.has(value.density as VisualBeatDensity)
  ) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid sourceSnapshot.density.",
    };
  }
  if (
    typeof value.generatorVersion !== "number" ||
    !Number.isFinite(value.generatorVersion) ||
    !Number.isInteger(value.generatorVersion) ||
    value.generatorVersion < 1
  ) {
    return {
      snapshot: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid sourceSnapshot.generatorVersion.",
    };
  }

  return {
    snapshot: {
      version: VISUAL_BEAT_SOURCE_SNAPSHOT_VERSION,
      narrationFingerprint: value.narrationFingerprint,
      sceneDurationMs: Math.round(value.sceneDurationMs),
      mediaCount: Math.round(value.mediaCount),
      mediaSetFingerprint: value.mediaSetFingerprint,
      orderedMediaFingerprint: value.orderedMediaFingerprint,
      density: value.density as VisualBeatDensity,
      generatorVersion: value.generatorVersion,
    },
    invalid: false,
    warning: undefined,
  };
}
