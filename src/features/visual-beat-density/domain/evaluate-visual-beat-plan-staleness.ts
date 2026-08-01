/**
 * Derived visual-beat plan staleness from structured source snapshots.
 * Correctness comes from evaluation — not from every editor write setting "stale".
 */

import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";

import {
  fingerprintVisualBeatInput,
  normalizeVisualBeatNarrationText,
  normalizeVisualBeatUsableMedia,
} from "./fingerprint-visual-beat-input";
import {
  VISUAL_BEAT_GENERATOR_VERSION,
  VISUAL_BEAT_PLAN_VERSION,
  type VisualBeatAnchor,
  type VisualBeatAnchorKind,
  type VisualBeatDensity,
  type VisualBeatPlanStatus,
  type VisualBeatPlanV1,
  type VisualBeatPlanWarningCode,
  type VisualBeatUsableMediaIdentity,
} from "./visual-beat-plan";
import {
  buildVisualBeatSourceSnapshot,
  parseVisualBeatSourceSnapshot,
  type VisualBeatSourceSnapshotV1,
} from "./visual-beat-source-snapshot";

export type VisualBeatPlanStaleReason =
  | "NARRATION_CHANGED"
  | "DURATION_CHANGED"
  | "DENSITY_CHANGED"
  | "MEDIA_CHANGED"
  | "MEDIA_ORDER_CHANGED"
  | "GENERATOR_CHANGED"
  | "TIMING_CHANGED"
  | "PLAN_INVALID";

export type VisualBeatPlanPresenceStatus =
  | VisualBeatPlanStatus
  | "absent"
  | "invalid";

export interface EvaluateVisualBeatPlanStalenessInput {
  readonly storedPlan: unknown;
  readonly narrationText: string;
  readonly sceneDurationMs: number;
  readonly usableMedia: readonly VisualBeatUsableMediaIdentity[];
  readonly currentStartOffsetsMs: readonly number[];
  /** Current density control; when omitted, density is taken from the stored snapshot. */
  readonly selectedDensity?: VisualBeatDensity;
}

export interface VisualBeatPlanStalenessProjection {
  readonly storedStatus: VisualBeatPlanPresenceStatus;
  readonly effectiveStatus: VisualBeatPlanPresenceStatus;
  readonly staleReasons: readonly VisualBeatPlanStaleReason[];
  readonly plan: VisualBeatPlanV1 | undefined;
  readonly applyAllowed: boolean;
  readonly recoverableWarning: string | undefined;
}

const DENSITIES = new Set<VisualBeatDensity>(["fast", "balanced", "studio"]);
const STATUSES = new Set<VisualBeatPlanStatus>(["draft", "applied", "stale"]);
const WARNING_CODES = new Set<VisualBeatPlanWarningCode>([
  "BEATS_ANCHORS_FALLBACK",
  "BEATS_EQUAL_SPLIT_USED",
  "BEATS_FEWER_VISUALS_THAN_TARGET",
  "BEATS_MORE_VISUALS_THAN_TARGET",
]);

const REASON_ORDER: readonly VisualBeatPlanStaleReason[] = [
  "PLAN_INVALID",
  "GENERATOR_CHANGED",
  "DENSITY_CHANGED",
  "NARRATION_CHANGED",
  "DURATION_CHANGED",
  "MEDIA_CHANGED",
  "MEDIA_ORDER_CHANGED",
  "TIMING_CHANGED",
];

function isFiniteNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function startsEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (Math.round(left[i]!) !== Math.round(right[i]!)) return false;
  }
  return true;
}

function proposedStartsAreValid(
  starts: readonly number[],
  sceneDurationMs: number,
): boolean {
  if (starts.length === 0 || starts[0] !== 0) return false;
  const minMs = SCENE_MEDIA_MIN_ITEM_DURATION_MS;
  if (starts.length * minMs > sceneDurationMs) return false;
  for (let i = 1; i < starts.length; i++) {
    if (!(starts[i]! > starts[i - 1]!)) return false;
    if (starts[i]! - starts[i - 1]! < minMs) return false;
  }
  const last = starts[starts.length - 1]!;
  return sceneDurationMs - last >= minMs;
}

/**
 * Derive exact stale reasons from structured snapshots.
 * Multiple reasons only when independent dimensions actually differ.
 */
export function deriveVisualBeatStaleReasonsFromSnapshots(input: {
  readonly stored: VisualBeatSourceSnapshotV1;
  readonly current: VisualBeatSourceSnapshotV1;
  readonly planStatus: VisualBeatPlanStatus;
  readonly proposedStartOffsetsMs: readonly number[];
  readonly currentStartOffsetsMs: readonly number[];
}): readonly VisualBeatPlanStaleReason[] {
  const reasons: VisualBeatPlanStaleReason[] = [];
  const { stored, current } = input;

  if (current.generatorVersion !== stored.generatorVersion) {
    reasons.push("GENERATOR_CHANGED");
  }
  if (current.density !== stored.density) {
    reasons.push("DENSITY_CHANGED");
  }
  if (current.narrationFingerprint !== stored.narrationFingerprint) {
    reasons.push("NARRATION_CHANGED");
  }
  if (current.sceneDurationMs !== stored.sceneDurationMs) {
    reasons.push("DURATION_CHANGED");
  }

  if (current.mediaSetFingerprint !== stored.mediaSetFingerprint) {
    reasons.push("MEDIA_CHANGED");
  } else if (
    current.orderedMediaFingerprint !== stored.orderedMediaFingerprint
  ) {
    reasons.push("MEDIA_ORDER_CHANGED");
  }

  if (input.planStatus === "applied" || input.planStatus === "stale") {
    if (
      !startsEqual(input.currentStartOffsetsMs, input.proposedStartOffsetsMs)
    ) {
      reasons.push("TIMING_CHANGED");
    }
  }

  return REASON_ORDER.filter((reason) => reasons.includes(reason));
}

/**
 * Parse persisted plan metadata. Malformed values become absent/invalid —
 * never throw, never block project open / preview / export.
 */
export function parseStoredVisualBeatPlan(value: unknown): {
  readonly plan: VisualBeatPlanV1 | undefined;
  readonly invalid: boolean;
  readonly warning: string | undefined;
} {
  if (value === undefined || value === null) {
    return { plan: undefined, invalid: false, warning: undefined };
  }
  if (!isRecord(value)) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: malformed object.",
    };
  }
  if (value.version !== VISUAL_BEAT_PLAN_VERSION) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: unsupported version.",
    };
  }
  if (value.generatorVersion !== VISUAL_BEAT_GENERATOR_VERSION) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: unsupported generatorVersion.",
    };
  }
  if (
    typeof value.density !== "string" ||
    !DENSITIES.has(value.density as VisualBeatDensity)
  ) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: unknown density.",
    };
  }
  if (
    typeof value.status !== "string" ||
    !STATUSES.has(value.status as VisualBeatPlanStatus)
  ) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: unknown status.",
    };
  }
  if (
    typeof value.sourceFingerprint !== "string" ||
    value.sourceFingerprint.length === 0
  ) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: missing sourceFingerprint.",
    };
  }

  const snapshotParsed = parseVisualBeatSourceSnapshot(value.sourceSnapshot);
  if (!snapshotParsed.snapshot) {
    return {
      plan: undefined,
      invalid: true,
      warning:
        snapshotParsed.warning ??
        "visualBeatPlan ignored: missing sourceSnapshot.",
    };
  }

  if (
    !Array.isArray(value.proposedStartOffsetsMs) ||
    value.proposedStartOffsetsMs.length === 0 ||
    !value.proposedStartOffsetsMs.every(isFiniteNonNegInt)
  ) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid proposedStartOffsetsMs.",
    };
  }
  if (
    !isFiniteNonNegInt(value.preferredBeatCount) ||
    !isFiniteNonNegInt(value.achievedMediaWindowCount)
  ) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid beat counts.",
    };
  }
  if (!Array.isArray(value.warningCodes)) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: invalid warningCodes.",
    };
  }

  const warningCodes: VisualBeatPlanWarningCode[] = [];
  for (const code of value.warningCodes) {
    if (
      typeof code === "string" &&
      WARNING_CODES.has(code as VisualBeatPlanWarningCode)
    ) {
      warningCodes.push(code as VisualBeatPlanWarningCode);
    }
  }

  const starts = value.proposedStartOffsetsMs.map((n) => Math.round(n as number));
  if (starts[0] !== 0) {
    return {
      plan: undefined,
      invalid: true,
      warning: "visualBeatPlan ignored: first start must be 0.",
    };
  }

  const plan: VisualBeatPlanV1 = {
    version: VISUAL_BEAT_PLAN_VERSION,
    generatorVersion: VISUAL_BEAT_GENERATOR_VERSION,
    density: value.density as VisualBeatDensity,
    sourceFingerprint: value.sourceFingerprint,
    sourceSnapshot: snapshotParsed.snapshot,
    status: value.status as VisualBeatPlanStatus,
    proposedStartOffsetsMs: starts,
    preferredBeatCount: Math.round(value.preferredBeatCount),
    achievedMediaWindowCount: Math.round(value.achievedMediaWindowCount),
    warningCodes,
    ...(typeof value.generatedAtIso === "string"
      ? { generatedAtIso: value.generatedAtIso }
      : {}),
  };

  if (Array.isArray(value.anchors)) {
    const anchors: VisualBeatAnchor[] = [];
    for (const anchor of value.anchors) {
      if (!isRecord(anchor)) continue;
      const kind = anchor.kind;
      if (
        !isFiniteNonNegInt(anchor.offsetMs) ||
        !isFiniteNonNegInt(anchor.charIndex) ||
        (kind !== "sentence" && kind !== "phrase" && kind !== "fallback")
      ) {
        continue;
      }
      anchors.push({
        offsetMs: Math.round(anchor.offsetMs),
        kind: kind as VisualBeatAnchorKind,
        charIndex: Math.round(anchor.charIndex),
      });
    }
    if (anchors.length > 0) {
      return { plan: { ...plan, anchors }, invalid: false, warning: undefined };
    }
  }

  return { plan, invalid: false, warning: undefined };
}

export function evaluateVisualBeatPlanStaleness(
  input: EvaluateVisualBeatPlanStalenessInput,
): VisualBeatPlanStalenessProjection {
  const parsed = parseStoredVisualBeatPlan(input.storedPlan);
  if (!parsed.plan) {
    const status: VisualBeatPlanPresenceStatus = parsed.invalid
      ? "invalid"
      : "absent";
    return {
      storedStatus: status,
      effectiveStatus: status,
      staleReasons: parsed.invalid ? ["PLAN_INVALID"] : [],
      plan: undefined,
      applyAllowed: false,
      recoverableWarning: parsed.warning,
    };
  }

  const plan = parsed.plan;
  const narrationText = normalizeVisualBeatNarrationText(input.narrationText);
  const usableMedia = normalizeVisualBeatUsableMedia(input.usableMedia);
  const sceneDurationMs = Number.isFinite(input.sceneDurationMs)
    ? Math.max(0, Math.round(input.sceneDurationMs))
    : 0;
  const selectedDensity = input.selectedDensity ?? plan.sourceSnapshot.density;

  const currentSnapshot = buildVisualBeatSourceSnapshot({
    narrationText,
    sceneDurationMs,
    usableMedia,
    density: selectedDensity,
    generatorVersion: VISUAL_BEAT_GENERATOR_VERSION,
  });

  const uniqueReasons = [
    ...deriveVisualBeatStaleReasonsFromSnapshots({
      stored: plan.sourceSnapshot,
      current: currentSnapshot,
      planStatus: plan.status,
      proposedStartOffsetsMs: plan.proposedStartOffsetsMs,
      currentStartOffsetsMs: input.currentStartOffsetsMs,
    }),
  ];

  // Impossible proposed starts against current duration are a duration/plan problem
  // only when duration already changed or starts are intrinsically invalid.
  if (
    !uniqueReasons.includes("DURATION_CHANGED") &&
    !proposedStartsAreValid(plan.proposedStartOffsetsMs, sceneDurationMs) &&
    usableMedia.length === plan.proposedStartOffsetsMs.length
  ) {
    if (usableMedia.length * SCENE_MEDIA_MIN_ITEM_DURATION_MS > sceneDurationMs) {
      uniqueReasons.push("DURATION_CHANGED");
    } else if (
      currentSnapshot.narrationFingerprint ===
        plan.sourceSnapshot.narrationFingerprint &&
      currentSnapshot.mediaSetFingerprint ===
        plan.sourceSnapshot.mediaSetFingerprint &&
      currentSnapshot.orderedMediaFingerprint ===
        plan.sourceSnapshot.orderedMediaFingerprint &&
      currentSnapshot.density === plan.sourceSnapshot.density &&
      currentSnapshot.generatorVersion === plan.sourceSnapshot.generatorVersion
    ) {
      uniqueReasons.push("PLAN_INVALID");
    }
  }

  const orderedReasons = REASON_ORDER.filter((reason) =>
    uniqueReasons.includes(reason),
  );
  const isStale = orderedReasons.length > 0;
  const effectiveStatus: VisualBeatPlanPresenceStatus = isStale
    ? "stale"
    : plan.status === "stale"
      ? "applied"
      : plan.status;

  const expectedFingerprint = fingerprintVisualBeatInput({
    narrationText,
    sceneDurationMs,
    usableMedia,
    density: plan.sourceSnapshot.density,
    generatorVersion: plan.sourceSnapshot.generatorVersion,
  });

  const applyAllowed =
    !isStale &&
    (effectiveStatus === "draft" || effectiveStatus === "applied") &&
    usableMedia.length === plan.proposedStartOffsetsMs.length &&
    usableMedia.length > 0 &&
    expectedFingerprint === plan.sourceFingerprint &&
    proposedStartsAreValid(plan.proposedStartOffsetsMs, sceneDurationMs);

  return {
    storedStatus: plan.status,
    effectiveStatus,
    staleReasons: orderedReasons,
    plan,
    applyAllowed,
    recoverableWarning: parsed.warning,
  };
}
