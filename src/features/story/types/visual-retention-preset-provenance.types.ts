/**
 * Authoring-only Visual Retention Preset Apply provenance (story-owned).
 *
 * Optional on FootieScript. Preview / Browser / Headless / ExportManifest ignore it.
 * Malformed values normalize as absent. No story-type imports, React, commands,
 * catalog runtime, preview, or export coupling.
 *
 * Transition validators are structural closed-shape checks only — they mirror
 * what native preset commands can produce without importing those features.
 */

export const VISUAL_RETENTION_PRESET_PROVENANCE_VERSION = 1 as const;
export const VISUAL_RETENTION_PRESET_PROVENANCE_CATALOG_VERSION = 1 as const;
export const VISUAL_RETENTION_PRESET_PROVENANCE_FINGERPRINT_PREFIX = "vrp1:" as const;

/** Closed preset IDs known to provenance v1 (mirrors catalog; no feature import). */
export const VISUAL_RETENTION_PRESET_PROVENANCE_PRESET_IDS = [
  "visual-retention-balanced-clarity",
  "visual-retention-pulse-edit",
  "visual-retention-cinematic-hold",
  "visual-retention-share-ready",
] as const;

export type VisualRetentionPresetProvenancePresetId =
  (typeof VISUAL_RETENTION_PRESET_PROVENANCE_PRESET_IDS)[number];

export type VisualRetentionPresetProvenanceActionKind =
  | "suggest-pacing"
  | "apply-motion-preset"
  | "apply-media-look"
  | "add-engagement-overlay"
  | "enable-brand-sting";

export type VisualRetentionPresetProvenanceField =
  | "visualBeatPlan"
  | "motion"
  | "visualEffect"
  | "engagementOverlay"
  | "shortForgeBrandSting";

export type VisualRetentionPresetProvenanceTargetV1 =
  | { readonly scope: "project" }
  | { readonly scope: "scene"; readonly sceneId: string }
  | {
      readonly scope: "media";
      readonly sceneId: string;
      readonly mediaItemId: string | null;
    };

/**
 * One actual field diff recorded by Apply.
 * previousValue/appliedValue are JSON-safe snapshots for that field only.
 */
export interface VisualRetentionPresetProvenanceChangeV1 {
  readonly actionKind: VisualRetentionPresetProvenanceActionKind;
  readonly field: VisualRetentionPresetProvenanceField;
  readonly target: VisualRetentionPresetProvenanceTargetV1;
  readonly previousValue: unknown;
  readonly appliedValue: unknown;
}

export interface VisualRetentionPresetProvenanceV1 {
  readonly version: typeof VISUAL_RETENTION_PRESET_PROVENANCE_VERSION;
  readonly catalogVersion: typeof VISUAL_RETENTION_PRESET_PROVENANCE_CATALOG_VERSION;
  readonly presetId: VisualRetentionPresetProvenancePresetId;
  readonly inputFingerprint: string;
  readonly planFingerprint: string;
  readonly status: "applied";
  readonly changes: readonly VisualRetentionPresetProvenanceChangeV1[];
  /** Optional caller-supplied audit timestamp — excluded from Undo identity. */
  readonly appliedAtIso?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownPresetId(
  value: unknown,
): value is VisualRetentionPresetProvenancePresetId {
  return (
    typeof value === "string" &&
    (VISUAL_RETENTION_PRESET_PROVENANCE_PRESET_IDS as readonly string[]).includes(
      value,
    )
  );
}

function isVrpFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(VISUAL_RETENTION_PRESET_PROVENANCE_FINGERPRINT_PREFIX) &&
    value.length > VISUAL_RETENTION_PRESET_PROVENANCE_FINGERPRINT_PREFIX.length
  );
}

function normalizeTarget(
  value: unknown,
): VisualRetentionPresetProvenanceTargetV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (value.scope === "project") {
    if ("sceneId" in value || "mediaItemId" in value) return undefined;
    return Object.freeze({ scope: "project" as const });
  }
  if (value.scope === "scene") {
    if (typeof value.sceneId !== "string" || !value.sceneId.trim()) {
      return undefined;
    }
    if ("mediaItemId" in value) return undefined;
    return Object.freeze({
      scope: "scene" as const,
      sceneId: value.sceneId.trim(),
    });
  }
  if (value.scope === "media") {
    if (typeof value.sceneId !== "string" || !value.sceneId.trim()) {
      return undefined;
    }
    // Explicit null (legacy single-media) or non-empty string id — never omitted.
    if (!("mediaItemId" in value)) return undefined;
    if (value.mediaItemId !== null && typeof value.mediaItemId !== "string") {
      return undefined;
    }
    if (typeof value.mediaItemId === "string" && !value.mediaItemId.trim()) {
      return undefined;
    }
    return Object.freeze({
      scope: "media" as const,
      sceneId: value.sceneId.trim(),
      mediaItemId:
        value.mediaItemId === null ? null : (value.mediaItemId as string).trim(),
    });
  }
  return undefined;
}

const ACTION_FIELDS: Record<
  VisualRetentionPresetProvenanceActionKind,
  VisualRetentionPresetProvenanceField
> = {
  "suggest-pacing": "visualBeatPlan",
  "apply-motion-preset": "motion",
  "apply-media-look": "visualEffect",
  "add-engagement-overlay": "engagementOverlay",
  "enable-brand-sting": "shortForgeBrandSting",
};

const CLOSED_MOTION_PRESETS = new Set([
  "slow-zoom-in",
  "slow-zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "pan-left-zoom-in",
  "pan-right-zoom-in",
  "pan-up-zoom-in",
  "pan-down-zoom-in",
  "gentle-drift",
  "sports-punch",
  "static",
]);

const RECIPE_MOTION_PRESETS = new Set([
  "slow-zoom-in",
  "sports-punch",
  "gentle-drift",
]);

const LOOK_PRESETS = new Set(["vivid", "cinematic", "monochrome"]);

const ENGAGEMENT_KINDS = new Set(["like", "share", "subscribe", "combined"]);
const ENGAGEMENT_POSITIONS = new Set([
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

function changeIdentity(change: VisualRetentionPresetProvenanceChangeV1): string {
  const target = change.target;
  if (target.scope === "project") {
    return `${change.actionKind}:project:${change.field}`;
  }
  if (target.scope === "scene") {
    return `${change.actionKind}:scene:${target.sceneId}:${change.field}`;
  }
  return `${change.actionKind}:media:${target.sceneId}:${
    target.mediaItemId === null ? "null" : target.mediaItemId
  }:${change.field}`;
}

function targetFieldIdentity(change: VisualRetentionPresetProvenanceChangeV1): string {
  const target = change.target;
  if (target.scope === "project") {
    return `project:${change.field}`;
  }
  if (target.scope === "scene") {
    return `scene:${target.sceneId}:${change.field}`;
  }
  return `media:${target.sceneId}:${
    target.mediaItemId === null ? "null" : target.mediaItemId
  }:${change.field}`;
}

function isJsonSafe(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonSafe(item, depth + 1));
  }
  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonSafe(item, depth + 1));
  }
  return false;
}

function freezeJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeJson(item)));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = freezeJson(child);
  }
  return Object.freeze(out);
}

function hasForbiddenSiblingKeys(
  value: Record<string, unknown>,
  forbidden: readonly string[],
): boolean {
  return forbidden.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/** Stored plan shape — previous may be draft/applied/stale; applied Suggest must be draft. */
function isValidStoredBeatPlan(
  value: unknown,
  options: { readonly requireDraft: boolean },
): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.generatorVersion !== "number" || !Number.isFinite(value.generatorVersion)) {
    return false;
  }
  if (
    value.density !== "fast" &&
    value.density !== "balanced" &&
    value.density !== "studio"
  ) {
    return false;
  }
  if (typeof value.sourceFingerprint !== "string" || !value.sourceFingerprint.trim()) {
    return false;
  }
  if (!isRecord(value.sourceSnapshot)) return false;
  if (options.requireDraft) {
    if (value.status !== "draft") return false;
  } else if (
    value.status !== "draft" &&
    value.status !== "applied" &&
    value.status !== "stale"
  ) {
    return false;
  }
  if (
    !Array.isArray(value.proposedStartOffsetsMs) ||
    !value.proposedStartOffsetsMs.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  ) {
    return false;
  }
  if (
    typeof value.preferredBeatCount !== "number" ||
    !Number.isFinite(value.preferredBeatCount)
  ) {
    return false;
  }
  if (
    typeof value.achievedMediaWindowCount !== "number" ||
    !Number.isFinite(value.achievedMediaWindowCount)
  ) {
    return false;
  }
  if (!Array.isArray(value.warningCodes)) return false;
  // Suggest provenance records plan metadata only — never sequence/timeline mutations.
  if (
    hasForbiddenSiblingKeys(value, [
      "visualSequence",
      "mediaTimeline",
      "media",
      "items",
    ])
  ) {
    return false;
  }
  return true;
}

function hasAuthoritativeCustomKeyframes(motion: Record<string, unknown>): boolean {
  if (!Array.isArray(motion.keyframes)) return false;
  return motion.keyframes.length >= 2;
}

function isValidMotionSnapshot(
  value: unknown,
  options: { readonly requireRecipeApplied: boolean },
): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.presetId !== "string" || !value.presetId.trim()) return false;
  if (!CLOSED_MOTION_PRESETS.has(value.presetId) && value.presetId !== "custom") {
    return false;
  }
  if (
    typeof value.intensity !== "number" ||
    !Number.isFinite(value.intensity) ||
    value.intensity < 0
  ) {
    return false;
  }
  // Motion snapshots must not smuggle look/adjustment/keyframe-authoring payloads.
  if (
    hasForbiddenSiblingKeys(value, [
      "visualEffect",
      "visualAdjustments",
      "framing",
      "sourceQualityAdjustmentProvenance",
    ])
  ) {
    return false;
  }
  if (options.requireRecipeApplied) {
    if (value.enabled !== true) return false;
    if (!RECIPE_MOTION_PRESETS.has(value.presetId)) return false;
    if (hasAuthoritativeCustomKeyframes(value)) return false;
  } else if (hasAuthoritativeCustomKeyframes(value)) {
    // Previous side cannot be authoritative custom-keyframe motion — presets skip those.
    return false;
  }
  return true;
}

function isValidLookSnapshot(
  value: unknown,
  options: { readonly requireApplied: boolean },
): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.presetId !== "string") return false;
  if (options.requireApplied) {
    if (!LOOK_PRESETS.has(value.presetId)) return false;
  } else if (value.presetId === "none" || !LOOK_PRESETS.has(value.presetId)) {
    return false;
  }
  if (
    typeof value.intensity !== "number" ||
    !Number.isFinite(value.intensity) ||
    !(value.intensity > 0) ||
    value.intensity > 1
  ) {
    return false;
  }
  // Freeform adjustments must never appear in look change payloads.
  if (
    hasForbiddenSiblingKeys(value, [
      "visualAdjustments",
      "motion",
      "keyframes",
      "brightness",
      "contrast",
      "saturation",
    ])
  ) {
    return false;
  }
  return true;
}

function isValidEngagementOverlay(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (!ENGAGEMENT_KINDS.has(value.kind as string)) return false;
  if (!ENGAGEMENT_POSITIONS.has(value.position as string)) return false;
  if (
    typeof value.startOffsetMs !== "number" ||
    !Number.isFinite(value.startOffsetMs) ||
    value.startOffsetMs < 0
  ) {
    return false;
  }
  if (
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 250 ||
    value.durationMs > 10_000
  ) {
    return false;
  }
  if (
    hasForbiddenSiblingKeys(value, [
      "shortForgeBrandSting",
      "visualBeatPlan",
      "motion",
      "visualEffect",
    ])
  ) {
    return false;
  }
  return true;
}

function isValidEnabledBrandSting(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (value.enabled !== true) return false;
  if (value.title !== "ShortForge Studio") return false;
  if (
    value.durationMs !== 2000 &&
    value.durationMs !== 2500 &&
    value.durationMs !== 3000
  ) {
    return false;
  }
  if (value.narrationPolicy !== "none") return false;
  if (value.captionPolicy !== "none") return false;
  if (value.playbackSpeedPolicy !== "fixed") return false;
  if (
    hasForbiddenSiblingKeys(value, [
      "engagementOverlaysBySceneId",
      "visualBeatPlan",
      "motion",
    ])
  ) {
    return false;
  }
  return true;
}

function validateTransition(
  actionKind: VisualRetentionPresetProvenanceActionKind,
  target: VisualRetentionPresetProvenanceTargetV1,
  previousValue: unknown,
  appliedValue: unknown,
): boolean {
  switch (actionKind) {
    case "suggest-pacing": {
      if (target.scope !== "scene") return false;
      if (previousValue != null && !isValidStoredBeatPlan(previousValue, { requireDraft: false })) {
        return false;
      }
      if (!isValidStoredBeatPlan(appliedValue, { requireDraft: true })) return false;
      return true;
    }
    case "apply-motion-preset": {
      if (target.scope !== "media") return false;
      if (!("mediaItemId" in target)) return false;
      if (previousValue != null && !isValidMotionSnapshot(previousValue, { requireRecipeApplied: false })) {
        return false;
      }
      if (!isValidMotionSnapshot(appliedValue, { requireRecipeApplied: true })) {
        return false;
      }
      return true;
    }
    case "apply-media-look": {
      if (target.scope !== "media") return false;
      if (!("mediaItemId" in target)) return false;
      if (previousValue != null && !isValidLookSnapshot(previousValue, { requireApplied: false })) {
        return false;
      }
      if (!isValidLookSnapshot(appliedValue, { requireApplied: true })) return false;
      return true;
    }
    case "add-engagement-overlay": {
      if (target.scope !== "scene") return false;
      if (previousValue != null) return false;
      if (!isValidEngagementOverlay(appliedValue)) return false;
      return true;
    }
    case "enable-brand-sting": {
      if (target.scope !== "project") return false;
      if (previousValue != null) return false;
      if (!isValidEnabledBrandSting(appliedValue)) return false;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Canonical relative order constraints (matches planner action phases):
 * brand → pacing → engagement → motion/look (motion before look for same media).
 */
function changesRespectCanonicalOrder(
  changes: readonly VisualRetentionPresetProvenanceChangeV1[],
): boolean {
  let seenPacing = false;
  let seenEngagement = false;
  let seenMediaPhase = false;
  const mediaMotionSeen = new Set<string>();

  for (const change of changes) {
    if (change.actionKind === "enable-brand-sting") {
      if (seenPacing || seenEngagement || seenMediaPhase) return false;
      continue;
    }
    if (change.actionKind === "suggest-pacing") {
      if (seenEngagement || seenMediaPhase) return false;
      seenPacing = true;
      continue;
    }
    if (change.actionKind === "add-engagement-overlay") {
      if (seenMediaPhase) return false;
      seenEngagement = true;
      continue;
    }
    seenMediaPhase = true;
    if (change.target.scope !== "media") return false;
    const mediaKey = `${change.target.sceneId}:${
      change.target.mediaItemId === null ? "null" : change.target.mediaItemId
    }`;
    if (change.actionKind === "apply-motion-preset") {
      mediaMotionSeen.add(mediaKey);
      continue;
    }
    if (change.actionKind === "apply-media-look") {
      // Look for a media target must not precede that target's motion change when both exist.
      // When only look is recorded, allow.
      continue;
    }
  }

  // Pairwise: when both motion and look exist for same media, motion index < look index.
  for (let i = 0; i < changes.length; i += 1) {
    const look = changes[i]!;
    if (look.actionKind !== "apply-media-look" || look.target.scope !== "media") {
      continue;
    }
    const mediaKey = `${look.target.sceneId}:${
      look.target.mediaItemId === null ? "null" : look.target.mediaItemId
    }`;
    if (!mediaMotionSeen.has(mediaKey)) continue;
    let motionIndex = -1;
    for (let j = 0; j < changes.length; j += 1) {
      const motion = changes[j]!;
      if (
        motion.actionKind === "apply-motion-preset" &&
        motion.target.scope === "media" &&
        motion.target.sceneId === look.target.sceneId &&
        motion.target.mediaItemId === look.target.mediaItemId
      ) {
        motionIndex = j;
        break;
      }
    }
    if (motionIndex >= 0 && motionIndex > i) return false;
  }

  return true;
}

function normalizeChange(
  value: unknown,
): VisualRetentionPresetProvenanceChangeV1 | undefined {
  if (!isRecord(value)) return undefined;
  const actionKind = value.actionKind;
  if (
    actionKind !== "suggest-pacing" &&
    actionKind !== "apply-motion-preset" &&
    actionKind !== "apply-media-look" &&
    actionKind !== "add-engagement-overlay" &&
    actionKind !== "enable-brand-sting"
  ) {
    return undefined;
  }
  const field = ACTION_FIELDS[actionKind];
  if (value.field !== field) return undefined;
  const target = normalizeTarget(value.target);
  if (!target) return undefined;
  if (actionKind === "enable-brand-sting" && target.scope !== "project") {
    return undefined;
  }
  if (actionKind === "suggest-pacing" || actionKind === "add-engagement-overlay") {
    if (target.scope !== "scene") return undefined;
  }
  if (
    actionKind === "apply-motion-preset" ||
    actionKind === "apply-media-look"
  ) {
    if (target.scope !== "media") return undefined;
  }
  if (!isJsonSafe(value.previousValue) || !isJsonSafe(value.appliedValue)) {
    return undefined;
  }
  if (
    !validateTransition(
      actionKind,
      target,
      value.previousValue,
      value.appliedValue,
    )
  ) {
    return undefined;
  }
  return Object.freeze({
    actionKind,
    field,
    target,
    previousValue: freezeJson(value.previousValue),
    appliedValue: freezeJson(value.appliedValue),
  });
}

/**
 * Fail-closed provenance normalizer. Malformed values parse as absent.
 * Does not throw; opening/preview/export remain unaffected.
 */
export function normalizeVisualRetentionPresetProvenance(
  value: unknown,
): VisualRetentionPresetProvenanceV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (value.version !== VISUAL_RETENTION_PRESET_PROVENANCE_VERSION) {
    return undefined;
  }
  if (value.catalogVersion !== VISUAL_RETENTION_PRESET_PROVENANCE_CATALOG_VERSION) {
    return undefined;
  }
  if (!isKnownPresetId(value.presetId)) return undefined;
  if (!isVrpFingerprint(value.inputFingerprint)) return undefined;
  if (!isVrpFingerprint(value.planFingerprint)) return undefined;
  if (value.status !== "applied") return undefined;
  if (!Array.isArray(value.changes) || value.changes.length === 0) {
    return undefined;
  }

  const changes: VisualRetentionPresetProvenanceChangeV1[] = [];
  const seenAction = new Set<string>();
  const seenTargetField = new Set<string>();
  for (const entry of value.changes) {
    const change = normalizeChange(entry);
    if (!change) return undefined;
    const actionId = changeIdentity(change);
    const fieldId = targetFieldIdentity(change);
    if (seenAction.has(actionId) || seenTargetField.has(fieldId)) {
      return undefined;
    }
    seenAction.add(actionId);
    seenTargetField.add(fieldId);
    changes.push(change);
  }

  if (!changesRespectCanonicalOrder(changes)) {
    return undefined;
  }

  const appliedAtIso =
    typeof value.appliedAtIso === "string" && value.appliedAtIso.trim()
      ? value.appliedAtIso.trim()
      : undefined;

  return Object.freeze({
    version: VISUAL_RETENTION_PRESET_PROVENANCE_VERSION,
    catalogVersion: VISUAL_RETENTION_PRESET_PROVENANCE_CATALOG_VERSION,
    presetId: value.presetId,
    inputFingerprint: value.inputFingerprint.trim(),
    planFingerprint: value.planFingerprint.trim(),
    status: "applied" as const,
    changes: Object.freeze(changes),
    ...(appliedAtIso ? { appliedAtIso } : {}),
  });
}

export function visualRetentionPresetProvenanceChangeIdentity(
  change: VisualRetentionPresetProvenanceChangeV1,
): string {
  return changeIdentity(change);
}
