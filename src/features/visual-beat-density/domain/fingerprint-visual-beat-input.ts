/**
 * Canonical fingerprint for visual-beat plan inputs.
 * Property-order independent; locale-independent; excludes generation timestamps.
 */

import {
  VISUAL_BEAT_GENERATOR_VERSION,
  type VisualBeatDensity,
  type VisualBeatUsableMediaIdentity,
} from "./visual-beat-plan";

export const VISUAL_BEAT_INPUT_FINGERPRINT_PREFIX = "vbd1:" as const;

export interface VisualBeatFingerprintInput {
  readonly narrationText: string;
  readonly sceneDurationMs: number;
  readonly usableMedia: readonly VisualBeatUsableMediaIdentity[];
  readonly density: VisualBeatDensity;
  readonly generatorVersion?: typeof VISUAL_BEAT_GENERATOR_VERSION;
}

/** Collapse whitespace and trim; preserve case (case changes are semantic). */
export function normalizeVisualBeatNarrationText(value: string): string {
  if (typeof value !== "string") {
    return "";
  }
  const nfc =
    typeof value.normalize === "function" ? value.normalize("NFC") : value;
  return nfc.replace(/\s+/g, " ").trim();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** FNV-1a 32-bit → base36 — feature-local; client-safe; no crypto/network. */
function visualBeatStableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeMediaIdentity(
  media: VisualBeatUsableMediaIdentity,
): VisualBeatUsableMediaIdentity | null {
  const itemId = typeof media.itemId === "string" ? media.itemId.trim() : "";
  const sourceIdentity =
    typeof media.sourceIdentity === "string" ? media.sourceIdentity.trim() : "";
  if (!itemId || !sourceIdentity) {
    return null;
  }
  if (media.mediaKind !== "image" && media.mediaKind !== "video") {
    return null;
  }
  return {
    itemId,
    mediaKind: media.mediaKind,
    sourceIdentity,
  };
}

/** Ordered usable media identities for fingerprinting and generation. */
export function normalizeVisualBeatUsableMedia(
  media: readonly VisualBeatUsableMediaIdentity[],
): readonly VisualBeatUsableMediaIdentity[] {
  const out: VisualBeatUsableMediaIdentity[] = [];
  for (const item of media) {
    const normalized = normalizeMediaIdentity(item);
    if (normalized) {
      out.push(normalized);
    }
  }
  return out;
}

export function fingerprintVisualBeatInput(
  input: VisualBeatFingerprintInput,
): string {
  const generatorVersion = input.generatorVersion ?? VISUAL_BEAT_GENERATOR_VERSION;
  const sceneDurationMs = Number.isFinite(input.sceneDurationMs)
    ? Math.max(0, Math.round(input.sceneDurationMs))
    : 0;
  const payload = {
    density: input.density,
    generatorVersion,
    media: normalizeVisualBeatUsableMedia(input.usableMedia).map((item) => ({
      itemId: item.itemId,
      mediaKind: item.mediaKind,
      sourceIdentity: item.sourceIdentity,
    })),
    narration: normalizeVisualBeatNarrationText(input.narrationText),
    sceneDurationMs,
  };
  return `${VISUAL_BEAT_INPUT_FINGERPRINT_PREFIX}${visualBeatStableHash(
    stableStringify(payload),
  )}`;
}
