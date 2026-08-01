/**
 * Approximate narration anchors for visual-beat placement.
 * Text-derived cues only — not TTS word timings or speech alignment.
 */

import { normalizeVisualBeatNarrationText } from "./fingerprint-visual-beat-input";
import type { VisualBeatAnchor, VisualBeatAnchorKind } from "./visual-beat-plan";

const SENTENCE_BOUNDARY = /[.!?…。？！]/u;
const PHRASE_BOUNDARY = /[,;:，；：]/u;

function isWordChar(ch: string): boolean {
  return /[0-9A-Za-z\u00C0-\u024F\u0400-\u04FF\u0900-\u097F]/u.test(ch);
}

function characterWeight(ch: string): number {
  if (/\s/u.test(ch)) {
    return 0;
  }
  return isWordChar(ch) ? 2 : 1;
}

function mapWeightToOffsetMs(
  weightBefore: number,
  totalWeight: number,
  sceneDurationMs: number,
): number {
  if (totalWeight <= 0 || sceneDurationMs <= 0) {
    return 0;
  }
  const ratio = weightBefore / totalWeight;
  return Math.max(0, Math.min(sceneDurationMs, Math.round(ratio * sceneDurationMs)));
}

function classifyBoundary(ch: string): VisualBeatAnchorKind | null {
  if (SENTENCE_BOUNDARY.test(ch)) {
    return "sentence";
  }
  if (PHRASE_BOUNDARY.test(ch)) {
    return "phrase";
  }
  return null;
}

/**
 * Extract scene-local narration anchors via deterministic character weighting.
 * Empty/unusable narration yields a single fallback cue at mid-scene.
 */
export function extractNarrationAnchors(
  narrationText: string,
  sceneDurationMs: number,
): readonly VisualBeatAnchor[] {
  const durationMs = Number.isFinite(sceneDurationMs)
    ? Math.max(0, Math.round(sceneDurationMs))
    : 0;
  const normalized = normalizeVisualBeatNarrationText(narrationText);

  if (!normalized || durationMs <= 0) {
    return [
      {
        offsetMs: Math.floor(durationMs / 2),
        kind: "fallback",
        charIndex: 0,
      },
    ];
  }

  let totalWeight = 0;
  for (let i = 0; i < normalized.length; i++) {
    totalWeight += characterWeight(normalized[i]!);
  }

  if (totalWeight <= 0) {
    return [
      {
        offsetMs: Math.floor(durationMs / 2),
        kind: "fallback",
        charIndex: 0,
      },
    ];
  }

  const byOffset = new Map<number, VisualBeatAnchor>();
  let weightBefore = 0;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    const kind = classifyBoundary(ch);
    weightBefore += characterWeight(ch);

    if (!kind) {
      continue;
    }

    const offsetMs = mapWeightToOffsetMs(weightBefore, totalWeight, durationMs);
    // Internal cues only — starts/ends are not useful snap targets.
    if (offsetMs <= 0 || offsetMs >= durationMs) {
      continue;
    }

    const existing = byOffset.get(offsetMs);
    if (!existing || (existing.kind === "phrase" && kind === "sentence")) {
      byOffset.set(offsetMs, {
        offsetMs,
        kind,
        charIndex: i,
      });
    }
  }

  const anchors = [...byOffset.values()].sort((a, b) => {
    if (a.offsetMs !== b.offsetMs) {
      return a.offsetMs - b.offsetMs;
    }
    return a.charIndex - b.charIndex;
  });

  if (anchors.length === 0) {
    return [
      {
        offsetMs: Math.floor(durationMs / 2),
        kind: "fallback",
        charIndex: Math.max(0, Math.floor(normalized.length / 2)),
      },
    ];
  }

  return anchors;
}

export function narrationAnchorsAreFallbackOnly(
  anchors: readonly VisualBeatAnchor[],
): boolean {
  return anchors.length === 0 || anchors.every((anchor) => anchor.kind === "fallback");
}
