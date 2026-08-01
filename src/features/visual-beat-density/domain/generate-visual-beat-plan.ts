/**
 * Deterministic narration-driven visual-beat plan generation.
 * Suggestion only — does not mutate visualSequence or mediaTimeline.
 * Music is never accepted, fingerprinted, or referenced.
 */

import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";

import {
  extractNarrationAnchors,
  narrationAnchorsAreFallbackOnly,
} from "./extract-narration-anchors";
import {
  fingerprintVisualBeatInput,
  normalizeVisualBeatUsableMedia,
} from "./fingerprint-visual-beat-input";
import {
  computePreferredBeatCount,
  resolveVisualBeatDensityPolicy,
} from "./visual-beat-density-policy";
import {
  VISUAL_BEAT_GENERATOR_VERSION,
  VISUAL_BEAT_PLAN_TERMINAL_CODES,
  VISUAL_BEAT_PLAN_VERSION,
  VISUAL_BEAT_PLAN_WARNING_CODES,
  type GenerateVisualBeatPlanResult,
  type VisualBeatAnchor,
  type VisualBeatDensity,
  type VisualBeatPlanInput,
  type VisualBeatPlanWarningCode,
  type VisualBeatPlanV1,
} from "./visual-beat-plan";

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pushUniqueWarning(
  warnings: VisualBeatPlanWarningCode[],
  code: VisualBeatPlanWarningCode,
): void {
  if (!warnings.includes(code)) {
    warnings.push(code);
  }
}

/**
 * Equal-split starts covering the full scene with minimum-duration invariants.
 * First start is always 0; starts are strictly increasing.
 */
export function buildEqualSplitStartOffsetsMs(
  itemCount: number,
  sceneDurationMs: number,
  minItemDurationMs: number = SCENE_MEDIA_MIN_ITEM_DURATION_MS,
): number[] {
  if (itemCount <= 0) {
    return [];
  }
  if (itemCount === 1) {
    return [0];
  }

  const starts: number[] = new Array(itemCount);
  starts[0] = 0;

  for (let i = 1; i < itemCount; i++) {
    const raw = Math.round((i * sceneDurationMs) / itemCount);
    const minAllowed = i * minItemDurationMs;
    const maxAllowed = sceneDurationMs - (itemCount - i) * minItemDurationMs;
    starts[i] = clampInt(raw, minAllowed, maxAllowed);
  }

  for (let i = 1; i < itemCount; i++) {
    const minAllowed = starts[i - 1]! + minItemDurationMs;
    const maxAllowed = sceneDurationMs - (itemCount - i) * minItemDurationMs;
    starts[i] = clampInt(starts[i]!, minAllowed, maxAllowed);
  }

  return starts;
}

function anchorKindRank(kind: VisualBeatAnchor["kind"]): number {
  if (kind === "sentence") return 0;
  if (kind === "phrase") return 1;
  return 2;
}

function snapStartOffsetsTowardAnchors(input: {
  readonly equalStarts: readonly number[];
  readonly anchors: readonly VisualBeatAnchor[];
  readonly density: VisualBeatDensity;
  readonly sceneDurationMs: number;
  readonly minItemDurationMs: number;
  readonly preferredDwellMs: number;
  readonly anchorSnapRatio: number;
}): { readonly starts: number[]; readonly snappedCount: number } {
  const {
    equalStarts,
    anchors,
    density,
    sceneDurationMs,
    minItemDurationMs,
    preferredDwellMs,
    anchorSnapRatio,
  } = input;

  const itemCount = equalStarts.length;
  const starts = [...equalStarts];
  if (itemCount <= 1 || anchors.length === 0) {
    return { starts, snappedCount: 0 };
  }

  // Fast never snaps. Balanced uses a local radius. Studio may use any
  // invariant-valid sentence/phrase anchor (stronger narration preference).
  if (density === "fast" || anchorSnapRatio < 0) {
    return { starts, snappedCount: 0 };
  }

  const snapRadius =
    density === "studio"
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.round(preferredDwellMs * anchorSnapRatio));
  if (!(snapRadius > 0)) {
    return { starts, snappedCount: 0 };
  }

  const usableAnchors = anchors.filter(
    (anchor) =>
      anchor.kind !== "fallback" &&
      anchor.offsetMs > 0 &&
      anchor.offsetMs < sceneDurationMs,
  );

  let snappedCount = 0;
  const claimedOffsets = new Set<number>();

  for (let i = 1; i < itemCount; i++) {
    const minAllowed = starts[i - 1]! + minItemDurationMs;
    const maxAllowed = sceneDurationMs - (itemCount - i) * minItemDurationMs;
    if (minAllowed > maxAllowed) {
      starts[i] = minAllowed;
      continue;
    }

    const baseline = clampInt(starts[i]!, minAllowed, maxAllowed);
    const windowMin =
      density === "studio"
        ? minAllowed
        : Math.max(minAllowed, baseline - snapRadius);
    const windowMax =
      density === "studio"
        ? maxAllowed
        : Math.min(maxAllowed, baseline + snapRadius);

    let best: VisualBeatAnchor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const anchor of usableAnchors) {
      if (claimedOffsets.has(anchor.offsetMs)) {
        continue;
      }
      if (anchor.offsetMs < windowMin || anchor.offsetMs > windowMax) {
        continue;
      }
      const distance = Math.abs(anchor.offsetMs - baseline);
      if (
        !best ||
        distance < bestDistance ||
        (distance === bestDistance &&
          anchorKindRank(anchor.kind) < anchorKindRank(best.kind))
      ) {
        best = anchor;
        bestDistance = distance;
      }
    }

    if (best) {
      starts[i] = best.offsetMs;
      claimedOffsets.add(best.offsetMs);
      snappedCount += 1;
    } else {
      starts[i] = baseline;
    }
  }

  // Re-enforce invariants after snaps.
  for (let i = 1; i < itemCount; i++) {
    const minAllowed = starts[i - 1]! + minItemDurationMs;
    const maxAllowed = sceneDurationMs - (itemCount - i) * minItemDurationMs;
    starts[i] = clampInt(starts[i]!, minAllowed, maxAllowed);
  }

  return { starts, snappedCount };
}

function assertPlanInvariants(
  starts: readonly number[],
  sceneDurationMs: number,
  minItemDurationMs: number,
): void {
  if (starts.length === 0) {
    throw new Error("visual-beat plan produced empty starts");
  }
  if (starts[0] !== 0) {
    throw new Error("visual-beat plan first start must be 0");
  }
  for (let i = 1; i < starts.length; i++) {
    if (!(starts[i]! > starts[i - 1]!)) {
      throw new Error("visual-beat plan starts must be strictly increasing");
    }
    if (starts[i]! - starts[i - 1]! < minItemDurationMs) {
      throw new Error("visual-beat plan violated minimum item duration");
    }
  }
  const lastStart = starts[starts.length - 1]!;
  if (sceneDurationMs - lastStart < minItemDurationMs) {
    throw new Error("visual-beat plan final window below minimum duration");
  }
  if (lastStart >= sceneDurationMs) {
    throw new Error("visual-beat plan start out of scene bounds");
  }
}

/**
 * Generate a draft visual-beat plan from narration + duration + ordered media identity.
 * Deterministic for identical semantic inputs. Never invents/clones/removes/reorders media.
 */
export function generateVisualBeatPlan(
  input: VisualBeatPlanInput,
): GenerateVisualBeatPlanResult {
  const warningCodes: VisualBeatPlanWarningCode[] = [];

  if (
    typeof input.sceneDurationMs !== "number" ||
    !Number.isFinite(input.sceneDurationMs) ||
    input.sceneDurationMs <= 0
  ) {
    return {
      ok: false,
      terminalCode: VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_INVALID_DURATION,
      warningCodes,
    };
  }

  const sceneDurationMs = Math.round(input.sceneDurationMs);
  if (sceneDurationMs <= 0) {
    return {
      ok: false,
      terminalCode: VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_INVALID_DURATION,
      warningCodes,
    };
  }

  const usableMedia = normalizeVisualBeatUsableMedia(input.usableMedia);
  const itemCount = usableMedia.length;
  if (itemCount === 0) {
    return {
      ok: false,
      terminalCode: VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_NO_USABLE_VISUALS,
      warningCodes,
    };
  }

  const minItemDurationMs = SCENE_MEDIA_MIN_ITEM_DURATION_MS;
  if (itemCount * minItemDurationMs > sceneDurationMs) {
    return {
      ok: false,
      terminalCode: VISUAL_BEAT_PLAN_TERMINAL_CODES.BEATS_SCENE_TOO_SHORT,
      warningCodes,
    };
  }

  const generatorVersion = input.generatorVersion ?? VISUAL_BEAT_GENERATOR_VERSION;
  const density = input.density;
  const policy = resolveVisualBeatDensityPolicy(density);
  const preferredBeatCount = computePreferredBeatCount(sceneDurationMs, density);

  if (itemCount < preferredBeatCount) {
    pushUniqueWarning(
      warningCodes,
      VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_FEWER_VISUALS_THAN_TARGET,
    );
  } else if (itemCount > preferredBeatCount) {
    pushUniqueWarning(
      warningCodes,
      VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_MORE_VISUALS_THAN_TARGET,
    );
  }

  const sourceFingerprint = fingerprintVisualBeatInput({
    narrationText: input.narrationText,
    sceneDurationMs,
    usableMedia,
    density,
    generatorVersion,
  });

  const anchors = extractNarrationAnchors(input.narrationText, sceneDurationMs);
  if (narrationAnchorsAreFallbackOnly(anchors)) {
    pushUniqueWarning(
      warningCodes,
      VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_ANCHORS_FALLBACK,
    );
  }

  const equalStarts = buildEqualSplitStartOffsetsMs(
    itemCount,
    sceneDurationMs,
    minItemDurationMs,
  );

  let proposedStartOffsetsMs = equalStarts;
  let usedEqualSplit = true;

  if (itemCount > 1 && policy.anchorSnapRatio > 0 && !narrationAnchorsAreFallbackOnly(anchors)) {
    const snapped = snapStartOffsetsTowardAnchors({
      equalStarts,
      anchors,
      density,
      sceneDurationMs,
      minItemDurationMs,
      preferredDwellMs: policy.preferredDwellMs,
      anchorSnapRatio: policy.anchorSnapRatio,
    });
    proposedStartOffsetsMs = snapped.starts;
    usedEqualSplit = snapped.snappedCount === 0;
  }

  if (usedEqualSplit) {
    pushUniqueWarning(
      warningCodes,
      VISUAL_BEAT_PLAN_WARNING_CODES.BEATS_EQUAL_SPLIT_USED,
    );
  }

  assertPlanInvariants(proposedStartOffsetsMs, sceneDurationMs, minItemDurationMs);

  const plan: VisualBeatPlanV1 = {
    version: VISUAL_BEAT_PLAN_VERSION,
    generatorVersion: VISUAL_BEAT_GENERATOR_VERSION,
    density,
    sourceFingerprint,
    status: "draft",
    proposedStartOffsetsMs,
    anchors,
    preferredBeatCount,
    achievedMediaWindowCount: itemCount,
    warningCodes,
    ...(input.generatedAtIso !== undefined
      ? { generatedAtIso: input.generatedAtIso }
      : {}),
  };

  return { ok: true, plan };
}
