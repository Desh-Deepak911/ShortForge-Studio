/**
 * Pure Visual Retention Preset provenance staleness projection.
 * No React, commands, clocks, or story mutation.
 */

import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { normalizeSceneMediaVisualEffect } from "@/features/media-motion/domain/resolve-media-visual-effect";
import {
  resolveSceneMediaMotion,
  resolveSceneMediaMotionFromMedia,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion/media-motion.normalize";
import { readMixedMediaSequenceItems } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import type { FootieScript, SceneMedia } from "@/features/story/types";
import {
  normalizeVisualRetentionPresetProvenance,
  type VisualRetentionPresetProvenanceChangeV1,
  type VisualRetentionPresetProvenanceV1,
} from "@/features/story/types/visual-retention-preset-provenance.types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";
import { readStoredVisualBeatPlan } from "@/features/visual-beat-density/adapters/project-scene-visual-beat-plan";

import { getVisualRetentionPresetById } from "./visual-retention-preset.catalog";
import { fingerprintVisualRetentionPresetCanonicalPayload } from "./visual-retention-preset-fingerprint";
import { VISUAL_RETENTION_PRESET_CATALOG_VERSION } from "./visual-retention-preset.types";

export const VISUAL_RETENTION_PRESET_STALE_REASONS = {
  PRESET_CATALOG_CHANGED: "PRESET_CATALOG_CHANGED",
  PRESET_TARGET_MISSING: "PRESET_TARGET_MISSING",
  PRESET_MANUAL_OVERRIDE_AFTER_APPLY: "PRESET_MANUAL_OVERRIDE_AFTER_APPLY",
  PRESET_UNDERLYING_CAPABILITY_OFF: "PRESET_UNDERLYING_CAPABILITY_OFF",
  PRESET_PLAN_FINGERPRINT_MISMATCH: "PRESET_PLAN_FINGERPRINT_MISMATCH",
  PRESET_PROVENANCE_INVALID: "PRESET_PROVENANCE_INVALID",
} as const;

export type VisualRetentionPresetStaleReason =
  (typeof VISUAL_RETENTION_PRESET_STALE_REASONS)[keyof typeof VISUAL_RETENTION_PRESET_STALE_REASONS];

export type VisualRetentionPresetEffectiveStatus =
  | "absent"
  | "applied"
  | "stale"
  | "invalid";

export interface VisualRetentionPresetStalenessCapabilities {
  readonly ready: boolean;
  readonly visualRetentionPresetsEnabled: boolean;
  readonly visualBeatDensityEnabled: boolean;
  readonly keyframedVisualEffectsEnabled: boolean;
  readonly engagementOverlaysEnabled: boolean;
  readonly shortForgeBrandStingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}

export interface VisualRetentionPresetStalenessProjection {
  readonly effectiveStatus: VisualRetentionPresetEffectiveStatus;
  readonly reasons: readonly VisualRetentionPresetStaleReason[];
  readonly undoAllowed: boolean;
  readonly provenance: VisualRetentionPresetProvenanceV1 | undefined;
  readonly missingTargetWarnings: readonly string[];
}

function stableValueFingerprint(value: unknown): string {
  return fingerprintVisualRetentionPresetCanonicalPayload(value ?? null);
}

function resolveTargetMedia(
  script: FootieScript,
  sceneId: string,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): SceneMedia | null {
  const scene = script.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return null;
  if (mediaItemId) {
    if (mixedMediaScenesEnabled) {
      return (
        readMixedMediaSequenceItems(scene).find((item) => item.id === mediaItemId)
          ?.media ?? null
      );
    }
    return (
      scene.mediaTimeline?.items.find((item) => item.id === mediaItemId)?.media ??
      null
    );
  }
  return getSceneMedia(scene) ?? null;
}

function currentValueForChange(
  script: FootieScript,
  change: VisualRetentionPresetProvenanceChangeV1,
  mixedMediaScenesEnabled: boolean,
): { readonly available: boolean; readonly value: unknown } {
  if (change.field === "shortForgeBrandSting") {
    return {
      available: true,
      value: getShortForgeBrandSting(script.visualRetentionExtensions) ?? null,
    };
  }
  if (change.target.scope === "project") {
    return { available: false, value: null };
  }
  const sceneId = change.target.sceneId;
  const scene = script.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return { available: false, value: null };

  if (change.field === "visualBeatPlan") {
    return {
      available: true,
      value: readStoredVisualBeatPlan(scene) ?? null,
    };
  }
  if (change.field === "engagementOverlay") {
    return {
      available: true,
      value: getSceneEngagementOverlay(script, sceneId) ?? null,
    };
  }
  if (change.target.scope !== "media") {
    return { available: false, value: null };
  }
  const media = resolveTargetMedia(
    script,
    sceneId,
    change.target.mediaItemId,
    mixedMediaScenesEnabled,
  );
  if (!media) return { available: false, value: null };
  if (change.field === "motion") {
    const motion =
      change.target.mediaItemId == null
        ? resolveSceneMediaMotion(scene)
        : resolveSceneMediaMotionFromMedia(media);
    return { available: true, value: motion };
  }
  if (change.field === "visualEffect") {
    return {
      available: true,
      value: normalizeSceneMediaVisualEffect(media.visualEffect) ?? null,
    };
  }
  return { available: false, value: null };
}

function valuesMatch(field: string, left: unknown, right: unknown): boolean {
  if (field === "motion") {
    return (
      serializeSceneMediaMotionFingerprint(left as never) ===
      serializeSceneMediaMotionFingerprint(right as never)
    );
  }
  return stableValueFingerprint(left) === stableValueFingerprint(right);
}

function underlyingCapabilityForChange(
  change: VisualRetentionPresetProvenanceChangeV1,
  capabilities: VisualRetentionPresetStalenessCapabilities,
): boolean {
  switch (change.actionKind) {
    case "suggest-pacing":
      return capabilities.visualBeatDensityEnabled === true;
    case "apply-media-look":
      return capabilities.keyframedVisualEffectsEnabled === true;
    case "add-engagement-overlay":
      return capabilities.engagementOverlaysEnabled === true;
    case "enable-brand-sting":
      return capabilities.shortForgeBrandStingEnabled === true;
    case "apply-motion-preset":
      return true;
    default:
      return true;
  }
}

export function evaluateVisualRetentionPresetStaleness(input: {
  readonly script: FootieScript;
  readonly capabilities: VisualRetentionPresetStalenessCapabilities;
  /**
   * Optional rebuilt fingerprints from the planner adapter layer.
   * Used only when input fingerprint still matches — story-only edits that
   * change input fingerprints must not mark plan mismatch by themselves.
   */
  readonly rebuiltInputFingerprint?: string;
  readonly rebuiltPlanFingerprint?: string;
}): VisualRetentionPresetStalenessProjection {
  const raw = input.script.visualRetentionPresetProvenance;
  if (raw == null) {
    return Object.freeze({
      effectiveStatus: "absent",
      reasons: Object.freeze([]),
      undoAllowed: false,
      provenance: undefined,
      missingTargetWarnings: Object.freeze([]),
    });
  }

  const provenance = normalizeVisualRetentionPresetProvenance(raw);
  if (!provenance) {
    return Object.freeze({
      effectiveStatus: "invalid",
      reasons: Object.freeze([
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_PROVENANCE_INVALID,
      ]),
      undoAllowed: false,
      provenance: undefined,
      missingTargetWarnings: Object.freeze([]),
    });
  }

  const reasons = new Set<VisualRetentionPresetStaleReason>();
  const missingTargetWarnings: string[] = [];
  let manualOverride = false;
  let missingTarget = false;
  let underlyingOff = false;

  const preset = getVisualRetentionPresetById(provenance.presetId);
  if (
    !preset ||
    preset.version !== VISUAL_RETENTION_PRESET_CATALOG_VERSION ||
    provenance.catalogVersion !== VISUAL_RETENTION_PRESET_CATALOG_VERSION
  ) {
    // Catalog/recipe version drift alone — Undo remains allowed when snapshots match.
    reasons.add(VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_CATALOG_CHANGED);
  }

  // PRESET_PLAN_FINGERPRINT_MISMATCH only when an explicit rebuilt plan identity
  // is supplied for the same input fingerprint and differs. Absence of that
  // optional input must not falsely mark current provenance stale.
  // Same-input plan drift implies catalog/recipe identity change.
  if (
    typeof input.rebuiltPlanFingerprint === "string" &&
    input.rebuiltPlanFingerprint.startsWith("vrp1:") &&
    typeof input.rebuiltInputFingerprint === "string" &&
    input.rebuiltInputFingerprint === provenance.inputFingerprint &&
    input.rebuiltPlanFingerprint !== provenance.planFingerprint
  ) {
    reasons.add(
      VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_PLAN_FINGERPRINT_MISMATCH,
    );
    reasons.add(VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_CATALOG_CHANGED);
  }

  for (const change of provenance.changes) {
    if (!underlyingCapabilityForChange(change, input.capabilities)) {
      underlyingOff = true;
    }
    const current = currentValueForChange(
      input.script,
      change,
      input.capabilities.mixedMediaScenesEnabled === true,
    );
    if (!current.available) {
      missingTarget = true;
      missingTargetWarnings.push(
        `Preset change target is missing (${change.actionKind}).`,
      );
      continue;
    }
    if (!valuesMatch(change.field, current.value, change.appliedValue)) {
      manualOverride = true;
    }
  }

  if (missingTarget) {
    reasons.add(VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_TARGET_MISSING);
  }
  if (manualOverride) {
    reasons.add(
      VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_MANUAL_OVERRIDE_AFTER_APPLY,
    );
  }
  if (underlyingOff) {
    reasons.add(
      VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_UNDERLYING_CAPABILITY_OFF,
    );
  }

  const orderedReasons = (
    Object.values(VISUAL_RETENTION_PRESET_STALE_REASONS) as VisualRetentionPresetStaleReason[]
  ).filter((reason) => reasons.has(reason));

  const undoAllowed =
    !manualOverride &&
    !underlyingOff &&
    input.capabilities.ready === true &&
    input.capabilities.visualRetentionPresetsEnabled === true;

  const effectiveStatus: VisualRetentionPresetEffectiveStatus =
    orderedReasons.length === 0 ? "applied" : "stale";

  return Object.freeze({
    effectiveStatus,
    reasons: Object.freeze(orderedReasons),
    undoAllowed,
    provenance,
    missingTargetWarnings: Object.freeze(missingTargetWarnings),
  });
}
