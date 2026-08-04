/**
 * Pure Visual Retention Preset application planner.
 *
 * Consumes detached planning facts + a catalog preset + explicit capability
 * booleans. Never imports story types, React, commands, preview, export,
 * environment, network, storage, clocks, or randomness.
 *
 * Closing-scene engagement policy: walk backward through stable story order and
 * select the last eligible narration scene. Eligibility requires a non-empty
 * scene ID, finite positive duration, usable narration, and a normalized
 * engagement window that fits the minimum overlay duration. The recipe carries
 * 2500ms; later commands clamp. No wall-clock or UI selection influence.
 */

import { evaluateVisualBeatPlanStaleness } from "@/features/visual-beat-density/domain/evaluate-visual-beat-plan-staleness";
import type { VisualBeatDensity } from "@/features/visual-beat-density/domain/visual-beat-plan";
import { getMediaMotionPreset } from "@/features/media-motion/media-motion.presets";
import { serializeSceneMediaMotionFingerprint } from "@/features/media-motion/media-motion.normalize";
import { MEDIA_MOTION_VERSION } from "@/features/media-motion/media-motion.types";
import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import { getVisualRetentionPresetById } from "./visual-retention-preset.catalog";
import {
  fingerprintVisualRetentionPresetCanonicalPayload,
  VISUAL_RETENTION_PRESET_PLANNER_VERSION,
} from "./visual-retention-preset-fingerprint";
import {
  VISUAL_RETENTION_PRESET_CATALOG_VERSION,
  type VisualRetentionPresetDefinitionV1,
  type VisualRetentionPresetId,
  type VisualRetentionPresetLookPresetId,
  type VisualRetentionPresetMotionPresetId,
  type VisualRetentionPresetRecipeV1,
} from "./visual-retention-preset.types";

export const VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES = {
  PRESET_PLAN_CAPABILITIES_NOT_READY: "PRESET_PLAN_CAPABILITIES_NOT_READY",
  PRESET_PLAN_CAPABILITY_OFF: "PRESET_PLAN_CAPABILITY_OFF",
  PRESET_PLAN_UNKNOWN_PRESET: "PRESET_PLAN_UNKNOWN_PRESET",
  PRESET_PLAN_INVALID_INPUT: "PRESET_PLAN_INVALID_INPUT",
} as const;

export type VisualRetentionPresetPlanTerminalCode =
  (typeof VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES)[keyof typeof VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES];

export const VISUAL_RETENTION_PRESET_PLAN_REASON_CODES = {
  PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE:
    "PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE",
  PRESET_PLAN_INVALID_SCENE_DURATION: "PRESET_PLAN_INVALID_SCENE_DURATION",
  PRESET_PLAN_NARRATION_UNAVAILABLE: "PRESET_PLAN_NARRATION_UNAVAILABLE",
  PRESET_PLAN_INSUFFICIENT_MEDIA: "PRESET_PLAN_INSUFFICIENT_MEDIA",
  PRESET_PLAN_NO_USABLE_MEDIA: "PRESET_PLAN_NO_USABLE_MEDIA",
  PRESET_PLAN_MANUAL_KEYFRAMES_PRESERVED:
    "PRESET_PLAN_MANUAL_KEYFRAMES_PRESERVED",
  PRESET_PLAN_ALREADY_MATCHES: "PRESET_PLAN_ALREADY_MATCHES",
  PRESET_PLAN_NO_ELIGIBLE_CLOSING_SCENE:
    "PRESET_PLAN_NO_ELIGIBLE_CLOSING_SCENE",
  PRESET_PLAN_ENGAGEMENT_PRESENT: "PRESET_PLAN_ENGAGEMENT_PRESENT",
  PRESET_PLAN_OUTRO_PRESENT: "PRESET_PLAN_OUTRO_PRESENT",
} as const;

export type VisualRetentionPresetPlanReasonCode =
  (typeof VISUAL_RETENTION_PRESET_PLAN_REASON_CODES)[keyof typeof VISUAL_RETENTION_PRESET_PLAN_REASON_CODES];

export type VisualRetentionPresetPlanEntryCategory = "skipped" | "conflict";

export interface VisualRetentionPresetPlanningCapabilities {
  readonly ready: boolean;
  readonly visualRetentionPresetsEnabled: boolean;
  readonly visualBeatDensityEnabled: boolean;
  readonly keyframedVisualEffectsEnabled: boolean;
  readonly engagementOverlaysEnabled: boolean;
  readonly shortForgeBrandStingEnabled: boolean;
  /** Explicit mixed-media authority. Omitted/malformed treated as false. */
  readonly mixedMediaScenesEnabled: boolean;
}

export interface VisualRetentionPresetMediaTargetFactV1 {
  readonly sceneId: string;
  readonly mediaItemId: string | null;
  readonly orderedIndex: number;
  readonly mediaKind: "image" | "video";
  /** Stable source/media fingerprint — never a credentialed URL payload. */
  readonly sourceIdentity: string;
  readonly hasUsableCustomKeyframes: boolean;
  readonly motionEnabled: boolean;
  readonly motionPresetId: string;
  readonly motionIntensity: number;
  readonly motionEasing: string;
  readonly motionFingerprint: string;
  readonly lookPresetId: string | null;
  readonly lookIntensity: number | null;
  readonly hasFreeformVisualAdjustments: boolean;
  readonly freeformAdjustmentsFingerprint: string | null;
  readonly framingFingerprint: string;
}

export interface VisualRetentionPresetStoredBeatPlanFactV1 {
  /** Opaque stored plan for parse/staleness leaf authority. */
  readonly storedPlan: unknown;
  readonly currentStartOffsetsMs: readonly number[];
}

export interface VisualRetentionPresetSceneFactV1 {
  readonly sceneId: string;
  readonly storyOrderIndex: number;
  readonly sceneDurationMs: number;
  readonly narrationText: string;
  readonly narrationUsable: boolean;
  readonly engagementEligible: boolean;
  readonly hasEngagementOverlay: boolean;
  readonly engagementFingerprint: string | null;
  readonly mediaTargets: readonly VisualRetentionPresetMediaTargetFactV1[];
  readonly storedBeatPlan: VisualRetentionPresetStoredBeatPlanFactV1 | null;
}

export interface VisualRetentionPresetProjectFactsV1 {
  readonly version: 1;
  readonly mixedMediaScenesEnabled: boolean;
  readonly scenes: readonly VisualRetentionPresetSceneFactV1[];
  readonly brandStingPresent: boolean;
  readonly brandStingEnabled: boolean;
  readonly brandStingDurationMs: number | null;
  readonly brandStingFingerprint: string | null;
}

export type VisualRetentionPresetPlanActionV1 =
  | {
      readonly kind: "enable-brand-sting";
      readonly durationMs: 2000 | 2500 | 3000;
    }
  | {
      readonly kind: "suggest-pacing";
      readonly sceneId: string;
      readonly density: VisualBeatDensity;
    }
  | {
      readonly kind: "add-engagement-overlay";
      readonly sceneId: string;
      readonly overlayKind: EngagementOverlayKind;
      readonly position: EngagementOverlayPosition;
      readonly durationMs: number;
      readonly timingPolicy: "closing-scene";
    }
  | {
      readonly kind: "apply-motion-preset";
      readonly sceneId: string;
      readonly mediaItemId: string | null;
      readonly orderedIndex: number;
      readonly presetId: VisualRetentionPresetMotionPresetId;
      readonly intensity: number;
    }
  | {
      readonly kind: "apply-media-look";
      readonly sceneId: string;
      readonly mediaItemId: string | null;
      readonly orderedIndex: number;
      readonly presetId: VisualRetentionPresetLookPresetId;
      readonly intensity: number;
    };

export interface VisualRetentionPresetPlanSkipV1 {
  readonly category: "skipped";
  readonly reason: VisualRetentionPresetPlanReasonCode;
  readonly actionKind: VisualRetentionPresetPlanActionV1["kind"] | "scene";
  readonly message: string;
  readonly sceneId?: string;
  readonly mediaItemId?: string | null;
  readonly orderedIndex?: number;
}

export interface VisualRetentionPresetPlanConflictV1 {
  readonly category: "conflict";
  readonly reason: VisualRetentionPresetPlanReasonCode;
  readonly actionKind: "add-engagement-overlay" | "enable-brand-sting";
  readonly message: string;
  readonly sceneId?: string;
}

export interface VisualRetentionPresetPlanWarningV1 {
  readonly code: VisualRetentionPresetPlanReasonCode;
  readonly actionKind: string;
  readonly message: string;
  readonly sceneId?: string;
  readonly mediaItemId?: string | null;
}

export interface VisualRetentionPresetPlanSummaryV1 {
  readonly actionCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly warningCount: number;
  readonly suggestPacingCount: number;
  readonly applyMotionCount: number;
  readonly applyLookCount: number;
  readonly addEngagementCount: number;
  readonly enableBrandStingCount: number;
}

export interface VisualRetentionPresetApplicationPlanV1 {
  readonly version: 1;
  readonly catalogVersion: 1;
  readonly plannerVersion: 1;
  readonly presetId: VisualRetentionPresetId | null;
  readonly status: "preview" | "terminal";
  readonly terminalCode: VisualRetentionPresetPlanTerminalCode | null;
  readonly terminalMessage: string | null;
  readonly inputFingerprint: string;
  readonly planFingerprint: string;
  readonly actions: readonly VisualRetentionPresetPlanActionV1[];
  readonly skipped: readonly VisualRetentionPresetPlanSkipV1[];
  readonly conflicts: readonly VisualRetentionPresetPlanConflictV1[];
  readonly warnings: readonly VisualRetentionPresetPlanWarningV1[];
  readonly summary: VisualRetentionPresetPlanSummaryV1;
}

export interface BuildVisualRetentionPresetApplicationPlanInput {
  readonly facts: VisualRetentionPresetProjectFactsV1 | null | undefined;
  readonly presetId: unknown;
  readonly capabilities: VisualRetentionPresetPlanningCapabilities;
  readonly preset?: VisualRetentionPresetDefinitionV1 | null;
}

const REASON_MESSAGES: Record<VisualRetentionPresetPlanReasonCode, string> = {
  PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE:
    "This adjustment is unavailable until its feature is enabled.",
  PRESET_PLAN_INVALID_SCENE_DURATION:
    "This scene’s duration is too short for a pacing suggestion.",
  PRESET_PLAN_NARRATION_UNAVAILABLE:
    "Add narration before suggesting pacing for this scene.",
  PRESET_PLAN_INSUFFICIENT_MEDIA:
    "Pacing suggestions need at least two visuals in this scene.",
  PRESET_PLAN_NO_USABLE_MEDIA: "This scene has no usable visuals to adjust.",
  PRESET_PLAN_MANUAL_KEYFRAMES_PRESERVED:
    "Custom keyframes are kept; motion preset was not changed.",
  PRESET_PLAN_ALREADY_MATCHES: "This setting already matches the preset.",
  PRESET_PLAN_NO_ELIGIBLE_CLOSING_SCENE:
    "No scene is long enough for a closing engagement prompt.",
  PRESET_PLAN_ENGAGEMENT_PRESENT:
    "An engagement prompt already exists on the closing scene and was kept.",
  PRESET_PLAN_OUTRO_PRESENT:
    "A ShortForge Studio outro already exists and was kept.",
};

const TERMINAL_MESSAGES: Record<VisualRetentionPresetPlanTerminalCode, string> =
  {
    PRESET_PLAN_CAPABILITIES_NOT_READY:
      "Visual retention capabilities are still loading.",
    PRESET_PLAN_CAPABILITY_OFF:
      "Visual Retention Presets are not enabled for this project.",
    PRESET_PLAN_UNKNOWN_PRESET: "That Visual Retention Preset is not recognized.",
    PRESET_PLAN_INVALID_INPUT:
      "The project state could not be read safely for preset planning.",
  };

function deepFreezeInPlace<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeInPlace(item, seen);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value as object)) {
    deepFreezeInPlace((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function intensitiesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

function normalizeCapabilities(
  value: VisualRetentionPresetPlanningCapabilities | null | undefined,
): VisualRetentionPresetPlanningCapabilities {
  return deepFreezeInPlace({
    ready: value?.ready === true,
    visualRetentionPresetsEnabled: value?.visualRetentionPresetsEnabled === true,
    visualBeatDensityEnabled: value?.visualBeatDensityEnabled === true,
    keyframedVisualEffectsEnabled: value?.keyframedVisualEffectsEnabled === true,
    engagementOverlaysEnabled: value?.engagementOverlaysEnabled === true,
    shortForgeBrandStingEnabled: value?.shortForgeBrandStingEnabled === true,
    mixedMediaScenesEnabled: value?.mixedMediaScenesEnabled === true,
  });
}

function summarize(
  actions: readonly VisualRetentionPresetPlanActionV1[],
  skipped: readonly VisualRetentionPresetPlanSkipV1[],
  conflicts: readonly VisualRetentionPresetPlanConflictV1[],
  warnings: readonly VisualRetentionPresetPlanWarningV1[],
): VisualRetentionPresetPlanSummaryV1 {
  return deepFreezeInPlace({
    actionCount: actions.length,
    skippedCount: skipped.length,
    conflictCount: conflicts.length,
    warningCount: warnings.length,
    suggestPacingCount: actions.filter((a) => a.kind === "suggest-pacing")
      .length,
    applyMotionCount: actions.filter((a) => a.kind === "apply-motion-preset")
      .length,
    applyLookCount: actions.filter((a) => a.kind === "apply-media-look").length,
    addEngagementCount: actions.filter(
      (a) => a.kind === "add-engagement-overlay",
    ).length,
    enableBrandStingCount: actions.filter((a) => a.kind === "enable-brand-sting")
      .length,
  });
}

/**
 * Strict fact validation. Duplicate/ambiguous identities fail closed.
 */
export function validateVisualRetentionPresetProjectFacts(
  facts: VisualRetentionPresetProjectFactsV1 | null | undefined,
): facts is VisualRetentionPresetProjectFactsV1 {
  if (!facts || typeof facts !== "object") return false;
  if (facts.version !== 1) return false;
  if (typeof facts.mixedMediaScenesEnabled !== "boolean") return false;
  if (!Array.isArray(facts.scenes)) return false;

  const sceneIds = new Set<string>();
  const orderIndexes = new Set<number>();

  for (let i = 0; i < facts.scenes.length; i += 1) {
    const scene = facts.scenes[i];
    if (!scene || typeof scene !== "object") return false;
    if (typeof scene.sceneId !== "string" || !scene.sceneId.trim()) return false;
    if (sceneIds.has(scene.sceneId)) return false;
    sceneIds.add(scene.sceneId);
    if (
      typeof scene.storyOrderIndex !== "number" ||
      !Number.isInteger(scene.storyOrderIndex) ||
      scene.storyOrderIndex < 0 ||
      orderIndexes.has(scene.storyOrderIndex)
    ) {
      return false;
    }
    orderIndexes.add(scene.storyOrderIndex);
    if (!Number.isFinite(scene.sceneDurationMs) || scene.sceneDurationMs < 0) {
      return false;
    }
    if (typeof scene.narrationText !== "string") return false;
    if (typeof scene.narrationUsable !== "boolean") return false;
    if (typeof scene.engagementEligible !== "boolean") return false;
    if (typeof scene.hasEngagementOverlay !== "boolean") return false;
    if (!Array.isArray(scene.mediaTargets)) return false;

    const mediaIds = new Set<string>();
    let nullCount = 0;
    const sorted = [...scene.mediaTargets].sort(
      (a, b) => a.orderedIndex - b.orderedIndex,
    );
    for (let m = 0; m < sorted.length; m += 1) {
      const media = sorted[m];
      if (!media || typeof media !== "object") return false;
      if (media.sceneId !== scene.sceneId) return false;
      if (media.orderedIndex !== m) return false;
      if (media.mediaItemId === null) {
        nullCount += 1;
        if (nullCount > 1) return false;
      } else if (
        typeof media.mediaItemId !== "string" ||
        !media.mediaItemId.trim()
      ) {
        return false;
      } else if (mediaIds.has(media.mediaItemId)) {
        return false;
      } else {
        mediaIds.add(media.mediaItemId);
      }
      if (media.mediaKind !== "image" && media.mediaKind !== "video") return false;
      if (
        typeof media.sourceIdentity !== "string" ||
        !media.sourceIdentity.trim()
      ) {
        return false;
      }
      if (typeof media.hasUsableCustomKeyframes !== "boolean") return false;
      if (typeof media.motionEnabled !== "boolean") return false;
      if (typeof media.motionPresetId !== "string") return false;
      if (!Number.isFinite(media.motionIntensity)) return false;
      if (typeof media.motionEasing !== "string") return false;
      if (typeof media.motionFingerprint !== "string") return false;
      if (
        media.lookPresetId != null &&
        typeof media.lookPresetId !== "string"
      ) {
        return false;
      }
      if (
        media.lookIntensity != null &&
        !Number.isFinite(media.lookIntensity)
      ) {
        return false;
      }
    }
  }
  return true;
}

function capabilityPayload(
  capabilities: VisualRetentionPresetPlanningCapabilities,
): Record<string, boolean> {
  return {
    engagementOverlaysEnabled: capabilities.engagementOverlaysEnabled,
    keyframedVisualEffectsEnabled: capabilities.keyframedVisualEffectsEnabled,
    mixedMediaScenesEnabled: capabilities.mixedMediaScenesEnabled,
    ready: capabilities.ready,
    shortForgeBrandStingEnabled: capabilities.shortForgeBrandStingEnabled,
    visualBeatDensityEnabled: capabilities.visualBeatDensityEnabled,
    visualRetentionPresetsEnabled: capabilities.visualRetentionPresetsEnabled,
  };
}

function buildInputFingerprintPayload(input: {
  readonly catalogVersion: number;
  readonly plannerVersion: number;
  readonly presetId: VisualRetentionPresetId | null;
  readonly recipe: VisualRetentionPresetRecipeV1 | null;
  readonly capabilities: VisualRetentionPresetPlanningCapabilities;
  readonly facts: VisualRetentionPresetProjectFactsV1 | null;
}): unknown {
  return {
    brandSting: input.facts
      ? {
          durationMs: input.facts.brandStingDurationMs,
          enabled: input.facts.brandStingEnabled,
          fingerprint: input.facts.brandStingFingerprint,
          present: input.facts.brandStingPresent,
        }
      : null,
    capabilities: capabilityPayload(input.capabilities),
    catalogVersion: input.catalogVersion,
    factsMixedMediaScenesEnabled: input.facts?.mixedMediaScenesEnabled ?? null,
    plannerVersion: input.plannerVersion,
    presetId: input.presetId,
    recipe: input.recipe,
    scenes: (input.facts?.scenes ?? []).map((scene) => ({
      engagementEligible: scene.engagementEligible,
      engagementFingerprint: scene.engagementFingerprint,
      hasEngagementOverlay: scene.hasEngagementOverlay,
      mediaTargets: scene.mediaTargets.map((media) => ({
        framingFingerprint: media.framingFingerprint,
        freeformAdjustmentsFingerprint: media.freeformAdjustmentsFingerprint,
        hasFreeformVisualAdjustments: media.hasFreeformVisualAdjustments,
        hasUsableCustomKeyframes: media.hasUsableCustomKeyframes,
        lookIntensity: media.lookIntensity,
        lookPresetId: media.lookPresetId,
        mediaItemId: media.mediaItemId,
        mediaKind: media.mediaKind,
        motionEasing: media.motionEasing,
        motionEnabled: media.motionEnabled,
        motionFingerprint: media.motionFingerprint,
        motionIntensity: media.motionIntensity,
        motionPresetId: media.motionPresetId,
        orderedIndex: media.orderedIndex,
        sceneId: media.sceneId,
        sourceIdentity: media.sourceIdentity,
      })),
      narrationText: scene.narrationText,
      narrationUsable: scene.narrationUsable,
      sceneDurationMs: scene.sceneDurationMs,
      sceneId: scene.sceneId,
      storedBeatPlan: scene.storedBeatPlan
        ? {
            currentStartOffsetsMs: scene.storedBeatPlan.currentStartOffsetsMs,
            // Fingerprint opaque plan via stable stringify of the stored object.
            storedPlan: scene.storedBeatPlan.storedPlan,
          }
        : null,
      storyOrderIndex: scene.storyOrderIndex,
    })),
  };
}

function finishPlan(input: {
  readonly presetId: VisualRetentionPresetId | null;
  readonly status: "preview" | "terminal";
  readonly terminalCode: VisualRetentionPresetPlanTerminalCode | null;
  readonly capabilities: VisualRetentionPresetPlanningCapabilities;
  readonly facts: VisualRetentionPresetProjectFactsV1 | null;
  readonly recipe: VisualRetentionPresetRecipeV1 | null;
  readonly actions: VisualRetentionPresetPlanActionV1[];
  readonly skipped: VisualRetentionPresetPlanSkipV1[];
  readonly conflicts: VisualRetentionPresetPlanConflictV1[];
  readonly warnings: VisualRetentionPresetPlanWarningV1[];
}): VisualRetentionPresetApplicationPlanV1 {
  const inputFingerprint = fingerprintVisualRetentionPresetCanonicalPayload(
    buildInputFingerprintPayload({
      catalogVersion: VISUAL_RETENTION_PRESET_CATALOG_VERSION,
      plannerVersion: VISUAL_RETENTION_PRESET_PLANNER_VERSION,
      presetId: input.presetId,
      recipe: input.recipe,
      capabilities: input.capabilities,
      facts: input.facts,
    }),
  );
  const planFingerprint = fingerprintVisualRetentionPresetCanonicalPayload({
    actions: input.actions,
    catalogVersion: VISUAL_RETENTION_PRESET_CATALOG_VERSION,
    conflicts: input.conflicts,
    inputFingerprint,
    plannerVersion: VISUAL_RETENTION_PRESET_PLANNER_VERSION,
    presetId: input.presetId,
    skipped: input.skipped,
    status: input.status,
    terminalCode: input.terminalCode,
    warnings: input.warnings,
  });
  return deepFreezeInPlace({
    version: 1 as const,
    catalogVersion: VISUAL_RETENTION_PRESET_CATALOG_VERSION,
    plannerVersion: VISUAL_RETENTION_PRESET_PLANNER_VERSION,
    presetId: input.presetId,
    status: input.status,
    terminalCode: input.terminalCode,
    terminalMessage: input.terminalCode
      ? TERMINAL_MESSAGES[input.terminalCode]
      : null,
    inputFingerprint,
    planFingerprint,
    actions: Object.freeze([...input.actions]),
    skipped: Object.freeze([...input.skipped]),
    conflicts: Object.freeze([...input.conflicts]),
    warnings: Object.freeze([...input.warnings]),
    summary: summarize(
      input.actions,
      input.skipped,
      input.conflicts,
      input.warnings,
    ),
  });
}

function terminalPlan(input: {
  readonly code: VisualRetentionPresetPlanTerminalCode;
  readonly capabilities: VisualRetentionPresetPlanningCapabilities;
  readonly facts: VisualRetentionPresetProjectFactsV1 | null;
  readonly presetId: VisualRetentionPresetId | null;
  readonly recipe: VisualRetentionPresetRecipeV1 | null;
}): VisualRetentionPresetApplicationPlanV1 {
  return finishPlan({
    presetId: input.presetId,
    status: "terminal",
    terminalCode: input.code,
    capabilities: input.capabilities,
    facts: input.facts,
    recipe: input.recipe,
    actions: [],
    skipped: [],
    conflicts: [],
    warnings: [],
  });
}

function beatUsableMedia(scene: VisualRetentionPresetSceneFactV1) {
  return scene.mediaTargets.map((media) => ({
    itemId:
      media.mediaItemId ??
      `legacy-scene:${scene.sceneId}:${media.sourceIdentity}`,
    mediaKind: media.mediaKind,
    sourceIdentity: media.sourceIdentity,
  }));
}

/**
 * Already-matches only when the stored draft/applied plan is proven current for
 * density, narration, duration, ordered media, and generator/source snapshot.
 */
function pacingAlreadyMatches(
  scene: VisualRetentionPresetSceneFactV1,
  density: VisualBeatDensity,
): boolean {
  const stored = scene.storedBeatPlan;
  if (!stored) return false;
  const usableMedia = beatUsableMedia(scene);
  const projection = evaluateVisualBeatPlanStaleness({
    storedPlan: stored.storedPlan,
    narrationText: scene.narrationText,
    sceneDurationMs: scene.sceneDurationMs,
    usableMedia,
    currentStartOffsetsMs: stored.currentStartOffsetsMs,
    selectedDensity: density,
  });
  if (!projection.plan) return false;
  if (projection.plan.sourceSnapshot.density !== density) return false;
  if (projection.staleReasons.length > 0) return false;
  if (
    projection.effectiveStatus !== "draft" &&
    projection.effectiveStatus !== "applied"
  ) {
    return false;
  }
  // Require full source equivalence, not density alone.
  return projection.applyAllowed === true;
}

function pushSkip(
  skipped: VisualRetentionPresetPlanSkipV1[],
  entry: Omit<VisualRetentionPresetPlanSkipV1, "category" | "message"> & {
    readonly message?: string;
  },
): void {
  skipped.push({
    category: "skipped",
    reason: entry.reason,
    actionKind: entry.actionKind,
    message: entry.message ?? REASON_MESSAGES[entry.reason],
    sceneId: entry.sceneId,
    mediaItemId: entry.mediaItemId,
    orderedIndex: entry.orderedIndex,
  });
}

function pushConflict(
  conflicts: VisualRetentionPresetPlanConflictV1[],
  entry: Omit<VisualRetentionPresetPlanConflictV1, "category" | "message"> & {
    readonly message?: string;
  },
): void {
  conflicts.push({
    category: "conflict",
    reason: entry.reason,
    actionKind: entry.actionKind,
    message: entry.message ?? REASON_MESSAGES[entry.reason],
    sceneId: entry.sceneId,
  });
}

function planPacingForScene(input: {
  readonly scene: VisualRetentionPresetSceneFactV1;
  readonly density: VisualBeatDensity;
  readonly visualBeatDensityEnabled: boolean;
  readonly actions: VisualRetentionPresetPlanActionV1[];
  readonly skipped: VisualRetentionPresetPlanSkipV1[];
}): void {
  const { scene } = input;
  if (!input.visualBeatDensityEnabled) {
    pushSkip(input.skipped, {
      reason:
        VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE,
      actionKind: "suggest-pacing",
      sceneId: scene.sceneId,
    });
    return;
  }
  if (
    !isFiniteNonNegative(scene.sceneDurationMs) ||
    scene.sceneDurationMs <= 0 ||
    scene.mediaTargets.length * SCENE_MEDIA_MIN_ITEM_DURATION_MS >
      scene.sceneDurationMs
  ) {
    pushSkip(input.skipped, {
      reason:
        VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_INVALID_SCENE_DURATION,
      actionKind: "suggest-pacing",
      sceneId: scene.sceneId,
    });
    return;
  }
  if (!scene.narrationUsable) {
    pushSkip(input.skipped, {
      reason:
        VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_NARRATION_UNAVAILABLE,
      actionKind: "suggest-pacing",
      sceneId: scene.sceneId,
    });
    return;
  }
  if (scene.mediaTargets.length < 2) {
    pushSkip(input.skipped, {
      reason:
        VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_INSUFFICIENT_MEDIA,
      actionKind: "suggest-pacing",
      sceneId: scene.sceneId,
    });
    return;
  }
  if (pacingAlreadyMatches(scene, input.density)) {
    pushSkip(input.skipped, {
      reason: VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_ALREADY_MATCHES,
      actionKind: "suggest-pacing",
      sceneId: scene.sceneId,
    });
    return;
  }
  input.actions.push({
    kind: "suggest-pacing",
    sceneId: scene.sceneId,
    density: input.density,
  });
}

function expectedMotionFingerprint(
  recipe: VisualRetentionPresetRecipeV1["motion"],
): string {
  const preset = getMediaMotionPreset(recipe.presetId);
  return serializeSceneMediaMotionFingerprint({
    version: MEDIA_MOTION_VERSION,
    enabled: true,
    presetId: recipe.presetId,
    easing: preset.defaultEasing,
    intensity: recipe.intensity,
    startTransform: { ...preset.startDelta },
    endTransform: { ...preset.endDelta },
  });
}

function planMotionForMedia(input: {
  readonly media: VisualRetentionPresetMediaTargetFactV1;
  readonly recipe: VisualRetentionPresetRecipeV1["motion"];
  readonly actions: VisualRetentionPresetPlanActionV1[];
  readonly skipped: VisualRetentionPresetPlanSkipV1[];
}): void {
  const { media, recipe } = input;
  if (media.hasUsableCustomKeyframes) {
    pushSkip(input.skipped, {
      reason:
        VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_MANUAL_KEYFRAMES_PRESERVED,
      actionKind: "apply-motion-preset",
      sceneId: media.sceneId,
      mediaItemId: media.mediaItemId,
      orderedIndex: media.orderedIndex,
    });
    return;
  }
  const expectedFingerprint = expectedMotionFingerprint(recipe);
  const preset = getMediaMotionPreset(recipe.presetId);
  if (
    media.motionEnabled === true &&
    media.motionPresetId === recipe.presetId &&
    intensitiesMatch(media.motionIntensity, recipe.intensity) &&
    media.motionEasing === preset.defaultEasing &&
    media.motionFingerprint === expectedFingerprint
  ) {
    pushSkip(input.skipped, {
      reason: VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_ALREADY_MATCHES,
      actionKind: "apply-motion-preset",
      sceneId: media.sceneId,
      mediaItemId: media.mediaItemId,
      orderedIndex: media.orderedIndex,
    });
    return;
  }
  input.actions.push({
    kind: "apply-motion-preset",
    sceneId: media.sceneId,
    mediaItemId: media.mediaItemId,
    orderedIndex: media.orderedIndex,
    presetId: recipe.presetId,
    intensity: recipe.intensity,
  });
}

function planLookForMedia(input: {
  readonly media: VisualRetentionPresetMediaTargetFactV1;
  readonly recipe: VisualRetentionPresetRecipeV1["look"];
  readonly keyframedVisualEffectsEnabled: boolean;
  readonly actions: VisualRetentionPresetPlanActionV1[];
  readonly skipped: VisualRetentionPresetPlanSkipV1[];
}): void {
  if (input.recipe.mode === "preserve") return;
  if (!input.keyframedVisualEffectsEnabled) {
    pushSkip(input.skipped, {
      reason:
        VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE,
      actionKind: "apply-media-look",
      sceneId: input.media.sceneId,
      mediaItemId: input.media.mediaItemId,
      orderedIndex: input.media.orderedIndex,
    });
    return;
  }
  const { media, recipe } = input;
  if (
    media.lookPresetId === recipe.presetId &&
    media.lookIntensity != null &&
    intensitiesMatch(media.lookIntensity, recipe.intensity)
  ) {
    pushSkip(input.skipped, {
      reason: VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_ALREADY_MATCHES,
      actionKind: "apply-media-look",
      sceneId: media.sceneId,
      mediaItemId: media.mediaItemId,
      orderedIndex: media.orderedIndex,
    });
    return;
  }
  input.actions.push({
    kind: "apply-media-look",
    sceneId: media.sceneId,
    mediaItemId: media.mediaItemId,
    orderedIndex: media.orderedIndex,
    presetId: recipe.presetId,
    intensity: recipe.intensity,
  });
}

/** Last eligible scene by walking backward through stable story order. */
function selectClosingScene(
  scenes: readonly VisualRetentionPresetSceneFactV1[],
): VisualRetentionPresetSceneFactV1 | null {
  for (let i = scenes.length - 1; i >= 0; i -= 1) {
    const scene = scenes[i]!;
    if (
      scene.sceneId.trim().length > 0 &&
      scene.narrationUsable &&
      scene.engagementEligible
    ) {
      return scene;
    }
  }
  return null;
}

/**
 * Build an immutable preview plan. Expected invalid inputs return a typed
 * terminal plan with zero actions (never throws for those cases).
 */
export function buildVisualRetentionPresetApplicationPlan(
  input: BuildVisualRetentionPresetApplicationPlanInput,
): VisualRetentionPresetApplicationPlanV1 {
  const capabilities = normalizeCapabilities(input.capabilities);

  if (capabilities.ready !== true) {
    return terminalPlan({
      code: VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_CAPABILITIES_NOT_READY,
      capabilities,
      facts: validateVisualRetentionPresetProjectFacts(input.facts)
        ? input.facts
        : null,
      presetId: null,
      recipe: null,
    });
  }

  if (capabilities.visualRetentionPresetsEnabled !== true) {
    return terminalPlan({
      code: VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_CAPABILITY_OFF,
      capabilities,
      facts: validateVisualRetentionPresetProjectFacts(input.facts)
        ? input.facts
        : null,
      presetId: null,
      recipe: null,
    });
  }

  const preset =
    input.preset ??
    (typeof input.presetId === "string"
      ? getVisualRetentionPresetById(input.presetId)
      : null);
  if (!preset) {
    return terminalPlan({
      code: VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_UNKNOWN_PRESET,
      capabilities,
      facts: validateVisualRetentionPresetProjectFacts(input.facts)
        ? input.facts
        : null,
      presetId: null,
      recipe: null,
    });
  }

  if (!validateVisualRetentionPresetProjectFacts(input.facts)) {
    return terminalPlan({
      code: VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_INVALID_INPUT,
      capabilities,
      facts: null,
      presetId: preset.id,
      recipe: preset.recipe,
    });
  }

  // Capability/fact mixed-media mismatch is invalid — never silently diverge.
  if (
    input.facts.mixedMediaScenesEnabled !== capabilities.mixedMediaScenesEnabled
  ) {
    return terminalPlan({
      code: VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_INVALID_INPUT,
      capabilities,
      facts: null,
      presetId: preset.id,
      recipe: preset.recipe,
    });
  }

  const facts = input.facts;
  const recipe = preset.recipe;
  const actions: VisualRetentionPresetPlanActionV1[] = [];
  const skipped: VisualRetentionPresetPlanSkipV1[] = [];
  const conflicts: VisualRetentionPresetPlanConflictV1[] = [];
  const warnings: VisualRetentionPresetPlanWarningV1[] = [];

  // 1. Project-level brand sting
  if (recipe.outro.mode === "enable-if-absent") {
    if (!capabilities.shortForgeBrandStingEnabled) {
      pushSkip(skipped, {
        reason:
          VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE,
        actionKind: "enable-brand-sting",
      });
    } else if (facts.brandStingPresent && facts.brandStingEnabled) {
      // Existing authoritative enabled sting — never "already matches" for add.
      pushConflict(conflicts, {
        reason: VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_OUTRO_PRESENT,
        actionKind: "enable-brand-sting",
      });
    } else {
      actions.push({
        kind: "enable-brand-sting",
        durationMs: recipe.outro.durationMs,
      });
    }
  }

  const scenes = [...facts.scenes].sort(
    (a, b) => a.storyOrderIndex - b.storyOrderIndex,
  );

  for (const scene of scenes) {
    if (recipe.pacing.mode === "suggest") {
      planPacingForScene({
        scene,
        density: recipe.pacing.density,
        visualBeatDensityEnabled: capabilities.visualBeatDensityEnabled,
        actions,
        skipped,
      });
    }
  }

  if (recipe.engagement.mode === "add-if-absent") {
    if (!capabilities.engagementOverlaysEnabled) {
      pushSkip(skipped, {
        reason:
          VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_UNDERLYING_CAPABILITY_UNAVAILABLE,
        actionKind: "add-engagement-overlay",
      });
    } else {
      const target = selectClosingScene(scenes);
      if (!target) {
        pushSkip(skipped, {
          reason:
            VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_NO_ELIGIBLE_CLOSING_SCENE,
          actionKind: "add-engagement-overlay",
        });
      } else if (target.hasEngagementOverlay) {
        // Any authoritative overlay on the closing scene — never replace.
        pushConflict(conflicts, {
          reason:
            VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_ENGAGEMENT_PRESENT,
          actionKind: "add-engagement-overlay",
          sceneId: target.sceneId,
        });
      } else {
        actions.push({
          kind: "add-engagement-overlay",
          sceneId: target.sceneId,
          overlayKind: recipe.engagement.kind,
          position: recipe.engagement.position,
          durationMs: recipe.engagement.durationMs,
          timingPolicy: "closing-scene",
        });
      }
    }
  }

  for (const scene of scenes) {
    if (scene.mediaTargets.length === 0) {
      pushSkip(skipped, {
        reason:
          VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_NO_USABLE_MEDIA,
        actionKind: "scene",
        sceneId: scene.sceneId,
      });
      continue;
    }
    const mediaTargets = [...scene.mediaTargets].sort(
      (a, b) => a.orderedIndex - b.orderedIndex,
    );
    for (const media of mediaTargets) {
      planMotionForMedia({
        media,
        recipe: recipe.motion,
        actions,
        skipped,
      });
      planLookForMedia({
        media,
        recipe: recipe.look,
        keyframedVisualEffectsEnabled:
          capabilities.keyframedVisualEffectsEnabled,
        actions,
        skipped,
      });
    }
  }

  return finishPlan({
    presetId: preset.id,
    status: "preview",
    terminalCode: null,
    capabilities,
    facts,
    recipe,
    actions,
    skipped,
    conflicts,
    warnings,
  });
}
