/**
 * Immutable Visual Retention Preset Apply / Undo / Keep / Dismiss commands.
 *
 * Transactional Apply against an in-memory working copy. Failures return the
 * original story unchanged. Capability flags are explicit inputs — never read
 * from environment here. Reuses native write authorities; no parallel writers.
 */

import {
  disableBrandSting,
  enableBrandSting,
  setBrandStingDurationMs,
} from "@/features/brand-sting/editor/brand-sting.commands";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import {
  addEngagementOverlay,
  removeEngagementOverlay,
  setEngagementOverlayDurationMs,
  setEngagementOverlayKind,
  setEngagementOverlayPosition,
  setEngagementOverlayStartMs,
} from "@/features/engagement-overlays/editor/engagement-overlay.commands";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import {
  applyMediaVisualEffectPreset,
  resetMediaVisualEffect,
  setMediaVisualEffectIntensity,
} from "@/features/media-motion/editor/media-visual-effect.commands";
import { normalizeSceneMediaVisualEffect } from "@/features/media-motion/domain/resolve-media-visual-effect";
import {
  buildMediaMotionPatch,
  buildResetMediaMotionPatch,
} from "@/features/media-motion/media-motion-patch.utils";
import { getMediaMotionPreset } from "@/features/media-motion/media-motion.presets";
import {
  resolveSceneMediaMotion,
  resolveSceneMediaMotionFromMedia,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion/media-motion.normalize";
import { MEDIA_MOTION_VERSION } from "@/features/media-motion/media-motion.types";
import {
  readMixedMediaSequenceItems,
  writeMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  buildTemporarySceneForMediaItemEdit,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline/editor/scene-media-timeline.commands";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
  SceneMediaMotion,
} from "@/features/story/types";
import {
  normalizeVisualRetentionPresetProvenance,
  VISUAL_RETENTION_PRESET_PROVENANCE_CATALOG_VERSION,
  VISUAL_RETENTION_PRESET_PROVENANCE_VERSION,
  type VisualRetentionPresetProvenanceChangeV1,
  type VisualRetentionPresetProvenanceV1,
} from "@/features/story/types/visual-retention-preset-provenance.types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";
import {
  discardVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density/editor/visual-beat-plan.commands";
import { readStoredVisualBeatPlan } from "@/features/visual-beat-density/adapters/project-scene-visual-beat-plan";
import type { VisualBeatPlanV1 } from "@/features/visual-beat-density/domain/visual-beat-plan";
import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import { projectStoryVisualRetentionPresetInput } from "../adapters/project-story-visual-retention-preset-input";
import {
  buildVisualRetentionPresetApplicationPlan,
  type VisualRetentionPresetApplicationPlanV1,
  type VisualRetentionPresetPlanActionV1,
  type VisualRetentionPresetPlanningCapabilities,
} from "../domain/build-visual-retention-preset-plan";
import {
  evaluateVisualRetentionPresetStaleness,
  type VisualRetentionPresetStalenessCapabilities,
} from "../domain/evaluate-visual-retention-preset-staleness";
import {
  fingerprintVisualRetentionPresetCanonicalPayload,
  stableStringifyVisualRetentionPresetValue,
} from "../domain/visual-retention-preset-fingerprint";
import type { VisualRetentionPresetId } from "../domain/visual-retention-preset.types";

export type VisualRetentionPresetApplyTerminalCode =
  | "PRESET_APPLY_CAPABILITIES_NOT_READY"
  | "PRESET_APPLY_CAPABILITY_OFF"
  | "PRESET_APPLY_INVALID_PLAN"
  | "PRESET_APPLY_STALE_PLAN"
  | "PRESET_APPLY_GENERATED_AT_REQUIRED"
  | "PRESET_APPLY_NO_CHANGES"
  | "PRESET_APPLY_ACTION_FAILED"
  | "PRESET_APPLY_PROVENANCE_ACTIVE";

export type VisualRetentionPresetUndoTerminalCode =
  | "PRESET_UNDO_CAPABILITIES_NOT_READY"
  | "PRESET_UNDO_CAPABILITY_OFF"
  | "PRESET_UNDO_NOT_AVAILABLE"
  | "PRESET_UNDO_PROVENANCE_INVALID"
  | "PRESET_UNDO_MANUAL_OVERRIDE"
  | "PRESET_UNDO_UNDERLYING_CAPABILITY_OFF"
  | "PRESET_UNDO_ACTION_FAILED";

export type VisualRetentionPresetDismissTerminalCode =
  | "PRESET_DISMISS_CAPABILITIES_NOT_READY"
  | "PRESET_DISMISS_CAPABILITY_OFF";

export type VisualRetentionPresetCommandCapabilities =
  VisualRetentionPresetPlanningCapabilities;

export type VisualRetentionPresetFailedActionRef = {
  readonly kind: VisualRetentionPresetPlanActionV1["kind"] | VisualRetentionPresetProvenanceChangeV1["actionKind"];
  readonly sceneId?: string;
  readonly mediaItemId?: string | null;
  readonly orderedIndex?: number;
  readonly message?: string;
};

export type VisualRetentionPresetApplySuccess = {
  readonly ok: true;
  readonly script: FootieScript;
  readonly provenance: VisualRetentionPresetProvenanceV1;
  readonly warnings: readonly string[];
};

export type VisualRetentionPresetApplyFailure = {
  readonly ok: false;
  readonly script: FootieScript;
  readonly terminalCode: VisualRetentionPresetApplyTerminalCode;
  readonly failedAction?: VisualRetentionPresetFailedActionRef;
  readonly warnings: readonly string[];
};

export type VisualRetentionPresetApplyResult =
  | VisualRetentionPresetApplySuccess
  | VisualRetentionPresetApplyFailure;

export type VisualRetentionPresetUndoSuccess = {
  readonly ok: true;
  readonly script: FootieScript;
  readonly warnings: readonly string[];
};

export type VisualRetentionPresetUndoFailure = {
  readonly ok: false;
  readonly script: FootieScript;
  readonly terminalCode: VisualRetentionPresetUndoTerminalCode;
  readonly failedAction?: VisualRetentionPresetFailedActionRef;
  readonly warnings: readonly string[];
};

export type VisualRetentionPresetUndoResult =
  | VisualRetentionPresetUndoSuccess
  | VisualRetentionPresetUndoFailure;

export type VisualRetentionPresetDismissSuccess = {
  readonly ok: true;
  readonly script: FootieScript;
  readonly warnings: readonly string[];
};

export type VisualRetentionPresetDismissFailure = {
  readonly ok: false;
  readonly script: FootieScript;
  readonly terminalCode: VisualRetentionPresetDismissTerminalCode;
  readonly warnings: readonly string[];
};

export type VisualRetentionPresetDismissResult =
  | VisualRetentionPresetDismissSuccess
  | VisualRetentionPresetDismissFailure;

function cloneJson<T>(value: T): T {
  return value == null
    ? value
    : (JSON.parse(JSON.stringify(value)) as T);
}

function stableEqual(left: unknown, right: unknown): boolean {
  return (
    fingerprintVisualRetentionPresetCanonicalPayload(left ?? null) ===
    fingerprintVisualRetentionPresetCanonicalPayload(right ?? null)
  );
}

function motionEqual(left: unknown, right: unknown): boolean {
  return (
    serializeSceneMediaMotionFingerprint(left as never) ===
    serializeSceneMediaMotionFingerprint(right as never)
  );
}

function replaceScene(
  script: FootieScript,
  sceneId: string,
  nextScene: FootieScene,
): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) =>
      scene.id === sceneId ? nextScene : scene,
    ),
  };
}

function withProvenance(
  script: FootieScript,
  provenance: VisualRetentionPresetProvenanceV1 | undefined,
): FootieScript {
  const next: FootieScript = { ...script };
  if (provenance) {
    next.visualRetentionPresetProvenance = provenance;
  } else {
    delete next.visualRetentionPresetProvenance;
  }
  return next;
}

function resolveTargetMedia(
  scene: FootieScene,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): SceneMedia | null {
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

function writeMediaToScene(
  scene: FootieScene,
  mediaItemId: string | null,
  nextMedia: SceneMedia,
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  if (mediaItemId) {
    if (mixedMediaScenesEnabled) {
      const items = readMixedMediaSequenceItems(scene).map((item) =>
        item.id === mediaItemId ? { ...item, media: nextMedia } : { ...item },
      );
      if (!items.some((item) => item.id === mediaItemId)) return null;
      return writeMixedMediaSequenceItems(scene, items, {
        mixedMediaScenesEnabled: true,
      }).scene;
    }
    return updateSceneMediaItemMedia(scene, mediaItemId, nextMedia).scene;
  }
  return {
    ...scene,
    media: nextMedia,
  };
}

function snapshotBeatPlan(scene: FootieScene): unknown {
  return cloneJson(readStoredVisualBeatPlan(scene) ?? null);
}

function snapshotMotion(
  scene: FootieScene,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): unknown {
  if (mediaItemId) {
    const media = resolveTargetMedia(scene, mediaItemId, mixedMediaScenesEnabled);
    if (!media) return null;
    return cloneJson(resolveSceneMediaMotionFromMedia(media));
  }
  return cloneJson(resolveSceneMediaMotion(scene));
}

function snapshotLook(
  scene: FootieScene,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): unknown {
  const media = resolveTargetMedia(scene, mediaItemId, mixedMediaScenesEnabled);
  if (!media) return null;
  return cloneJson(normalizeSceneMediaVisualEffect(media.visualEffect) ?? null);
}

function snapshotEngagement(script: FootieScript, sceneId: string): unknown {
  return cloneJson(getSceneEngagementOverlay(script, sceneId) ?? null);
}

function snapshotBrandSting(script: FootieScript): unknown {
  return cloneJson(
    getShortForgeBrandSting(script.visualRetentionExtensions) ?? null,
  );
}

function plansSemanticallyIdentical(
  left: VisualRetentionPresetApplicationPlanV1,
  right: VisualRetentionPresetApplicationPlanV1,
): boolean {
  return (
    stableStringifyVisualRetentionPresetValue({
      version: left.version,
      catalogVersion: left.catalogVersion,
      plannerVersion: left.plannerVersion,
      presetId: left.presetId,
      status: left.status,
      terminalCode: left.terminalCode,
      terminalMessage: left.terminalMessage,
      inputFingerprint: left.inputFingerprint,
      planFingerprint: left.planFingerprint,
      actions: left.actions,
      skipped: left.skipped,
      conflicts: left.conflicts,
      warnings: left.warnings,
      summary: left.summary,
    }) ===
    stableStringifyVisualRetentionPresetValue({
      version: right.version,
      catalogVersion: right.catalogVersion,
      plannerVersion: right.plannerVersion,
      presetId: right.presetId,
      status: right.status,
      terminalCode: right.terminalCode,
      terminalMessage: right.terminalMessage,
      inputFingerprint: right.inputFingerprint,
      planFingerprint: right.planFingerprint,
      actions: right.actions,
      skipped: right.skipped,
      conflicts: right.conflicts,
      warnings: right.warnings,
      summary: right.summary,
    })
  );
}

export type VisualRetentionPresetBeforeActionHook = (input: {
  readonly action: VisualRetentionPresetPlanActionV1;
  readonly actionIndex: number;
  readonly workingScript: FootieScript;
}) =>
  | { readonly proceed: true }
  | { readonly proceed: false; readonly message: string };

function restoreBeatPlan(
  script: FootieScript,
  sceneId: string,
  previousValue: unknown,
): FootieScript | null {
  const scene = script.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return null;
  if (previousValue == null) {
    const discarded = discardVisualBeatPlan(script, { sceneId });
    return discarded.ok ? discarded.script : null;
  }
  const nextScene: FootieScene = {
    ...scene,
    visualBeatPlan: cloneJson(previousValue) as VisualBeatPlanV1,
  };
  return replaceScene(script, sceneId, nextScene);
}

function applyMotionToScene(
  scene: FootieScene,
  mediaItemId: string | null,
  motionInput: Partial<SceneMediaMotion> | "reset",
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  if (mediaItemId) {
    const media = resolveTargetMedia(scene, mediaItemId, mixedMediaScenesEnabled);
    if (!media) return null;
    const temp = buildTemporarySceneForMediaItemEdit(scene, media);
    const patched =
      motionInput === "reset"
        ? buildResetMediaMotionPatch(temp)
        : buildMediaMotionPatch(temp, motionInput);
    if (!patched?.media) return null;
    return writeMediaToScene(
      scene,
      mediaItemId,
      patched.media,
      mixedMediaScenesEnabled,
    );
  }
  const patched =
    motionInput === "reset"
      ? buildResetMediaMotionPatch(scene)
      : buildMediaMotionPatch(scene, motionInput);
  if (!patched?.media) return null;
  return {
    ...scene,
    ...patched.patch,
    media: patched.media,
  };
}

function applyLookToScene(
  scene: FootieScene,
  mediaItemId: string | null,
  nextMedia: SceneMedia,
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  return writeMediaToScene(scene, mediaItemId, nextMedia, mixedMediaScenesEnabled);
}

function restoreEngagement(
  script: FootieScript,
  sceneId: string,
  previousValue: unknown,
  engagementOverlaysEnabled: boolean,
): FootieScript | null {
  const options = { engagementOverlaysEnabled };
  if (previousValue == null) {
    const removed = removeEngagementOverlay(script, sceneId, options);
    return removed.status === "terminal" ? null : removed.script;
  }
  const previous = previousValue as SceneEngagementOverlayV1;
  let working = removeEngagementOverlay(script, sceneId, options).script;
  const added = addEngagementOverlay(working, sceneId, options);
  if (added.status === "terminal") return null;
  working = added.script;
  const kind = setEngagementOverlayKind(working, sceneId, previous.kind, options);
  if (kind.status === "terminal") return null;
  working = kind.script;
  const position = setEngagementOverlayPosition(
    working,
    sceneId,
    previous.position,
    options,
  );
  if (position.status === "terminal") return null;
  working = position.script;
  const duration = setEngagementOverlayDurationMs(
    working,
    sceneId,
    previous.durationMs,
    options,
  );
  if (duration.status === "terminal") return null;
  working = duration.script;
  const start = setEngagementOverlayStartMs(
    working,
    sceneId,
    previous.startOffsetMs,
    options,
  );
  if (start.status === "terminal") return null;
  return start.script;
}

function restoreBrandSting(
  script: FootieScript,
  previousValue: unknown,
  shortForgeBrandStingEnabled: boolean,
): FootieScript | null {
  const options = { shortForgeBrandStingEnabled };
  if (previousValue == null) {
    const disabled = disableBrandSting(script, options);
    return disabled.status === "terminal" ? null : disabled.script;
  }
  const previous = previousValue as NonNullable<
    ReturnType<typeof getShortForgeBrandSting>
  >;
  let working = enableBrandSting(script, options).script;
  const duration = setBrandStingDurationMs(
    working,
    previous.durationMs,
    options,
  );
  if (duration.status === "terminal") return null;
  working = duration.script;
  if (!previous.enabled) {
    const disabled = disableBrandSting(working, options);
    if (disabled.status === "terminal") return null;
    working = disabled.script;
  }
  return working;
}

type ActionApplyOutcome =
  | {
      readonly ok: true;
      readonly script: FootieScript;
      readonly change: VisualRetentionPresetProvenanceChangeV1 | null;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

function applyOneAction(
  script: FootieScript,
  action: VisualRetentionPresetPlanActionV1,
  capabilities: VisualRetentionPresetCommandCapabilities,
  generatedAtIso: string,
): ActionApplyOutcome {
  const mixed = capabilities.mixedMediaScenesEnabled === true;

  if (action.kind === "enable-brand-sting") {
    const previousValue = snapshotBrandSting(script);
    const working = enableBrandSting(script, {
      shortForgeBrandStingEnabled: capabilities.shortForgeBrandStingEnabled,
    });
    if (working.status === "terminal") {
      return { ok: false, message: working.message ?? "Brand sting enable failed." };
    }
    const duration = setBrandStingDurationMs(working.script, action.durationMs, {
      shortForgeBrandStingEnabled: capabilities.shortForgeBrandStingEnabled,
    });
    if (duration.status === "terminal") {
      return {
        ok: false,
        message: duration.message ?? "Brand sting duration failed.",
      };
    }
    const appliedValue = snapshotBrandSting(duration.script);
    if (stableEqual(previousValue, appliedValue)) {
      return { ok: true, script: duration.script, change: null };
    }
    return {
      ok: true,
      script: duration.script,
      change: {
        actionKind: "enable-brand-sting",
        field: "shortForgeBrandSting",
        target: { scope: "project" },
        previousValue,
        appliedValue,
      },
    };
  }

  if (action.kind === "suggest-pacing") {
    const scene = script.scenes.find((entry) => entry.id === action.sceneId);
    if (!scene) {
      return { ok: false, message: `Scene ${action.sceneId} missing for pacing.` };
    }
    const previousValue = snapshotBeatPlan(scene);
    const suggested = suggestVisualBeatPlan(script, {
      sceneId: action.sceneId,
      density: action.density,
      generatedAtIso,
      visualBeatDensityEnabled: capabilities.visualBeatDensityEnabled,
    });
    if (!suggested.ok) {
      return {
        ok: false,
        message: suggested.terminalCode ?? "Pacing suggest failed.",
      };
    }
    const nextScene = suggested.script.scenes.find(
      (entry) => entry.id === action.sceneId,
    );
    if (!nextScene) {
      return { ok: false, message: "Pacing suggest lost scene." };
    }
    const appliedValue = snapshotBeatPlan(nextScene);
    if (stableEqual(previousValue, appliedValue)) {
      return { ok: true, script: suggested.script, change: null };
    }
    return {
      ok: true,
      script: suggested.script,
      change: {
        actionKind: "suggest-pacing",
        field: "visualBeatPlan",
        target: { scope: "scene", sceneId: action.sceneId },
        previousValue,
        appliedValue,
      },
    };
  }

  if (action.kind === "add-engagement-overlay") {
    const previousValue = snapshotEngagement(script, action.sceneId);
    const options = {
      engagementOverlaysEnabled: capabilities.engagementOverlaysEnabled,
    };
    const working = addEngagementOverlay(script, action.sceneId, options);
    if (working.status === "terminal") {
      return {
        ok: false,
        message: working.message ?? "Engagement overlay add failed.",
      };
    }
    let next = working.script;
    const kind = setEngagementOverlayKind(
      next,
      action.sceneId,
      action.overlayKind,
      options,
    );
    if (kind.status === "terminal") {
      return { ok: false, message: kind.message ?? "Engagement kind failed." };
    }
    next = kind.script;
    const position = setEngagementOverlayPosition(
      next,
      action.sceneId,
      action.position,
      options,
    );
    if (position.status === "terminal") {
      return {
        ok: false,
        message: position.message ?? "Engagement position failed.",
      };
    }
    next = position.script;
    const duration = setEngagementOverlayDurationMs(
      next,
      action.sceneId,
      action.durationMs,
      options,
    );
    if (duration.status === "terminal") {
      return {
        ok: false,
        message: duration.message ?? "Engagement duration failed.",
      };
    }
    next = duration.script;
    const appliedValue = snapshotEngagement(next, action.sceneId);
    const appliedOverlay = getSceneEngagementOverlay(next, action.sceneId);
    if (
      !appliedOverlay ||
      appliedOverlay.id !== `engagement-${action.sceneId}`
    ) {
      return {
        ok: false,
        message: "Engagement overlay ID was not deterministic.",
      };
    }
    if (stableEqual(previousValue, appliedValue)) {
      return { ok: true, script: next, change: null };
    }
    return {
      ok: true,
      script: next,
      change: {
        actionKind: "add-engagement-overlay",
        field: "engagementOverlay",
        target: { scope: "scene", sceneId: action.sceneId },
        previousValue,
        appliedValue,
      },
    };
  }

  if (action.kind === "apply-motion-preset") {
    const scene = script.scenes.find((entry) => entry.id === action.sceneId);
    if (!scene) {
      return { ok: false, message: `Scene ${action.sceneId} missing for motion.` };
    }
    const previousValue = snapshotMotion(scene, action.mediaItemId, mixed);
    const preset = getMediaMotionPreset(action.presetId);
    const nextScene = applyMotionToScene(
      scene,
      action.mediaItemId,
      {
        version: MEDIA_MOTION_VERSION,
        enabled: true,
        presetId: preset.id,
        easing: preset.defaultEasing,
        intensity: action.intensity,
        startTransform: { ...preset.startDelta },
        endTransform: { ...preset.endDelta },
      },
      mixed,
    );
    if (!nextScene) {
      return { ok: false, message: "Motion write authority failed." };
    }
    const appliedValue = snapshotMotion(nextScene, action.mediaItemId, mixed);
    const nextScript = replaceScene(script, action.sceneId, nextScene);
    if (motionEqual(previousValue, appliedValue)) {
      return { ok: true, script: nextScript, change: null };
    }
    return {
      ok: true,
      script: nextScript,
      change: {
        actionKind: "apply-motion-preset",
        field: "motion",
        target: {
          scope: "media",
          sceneId: action.sceneId,
          mediaItemId: action.mediaItemId,
        },
        previousValue,
        appliedValue,
      },
    };
  }

  if (action.kind === "apply-media-look") {
    const scene = script.scenes.find((entry) => entry.id === action.sceneId);
    if (!scene) {
      return { ok: false, message: `Scene ${action.sceneId} missing for look.` };
    }
    const media = resolveTargetMedia(scene, action.mediaItemId, mixed);
    if (!media) {
      return { ok: false, message: "Look target media missing." };
    }
    const previousValue = snapshotLook(scene, action.mediaItemId, mixed);
    const lookOptions = {
      keyframedVisualEffectsEnabled: capabilities.keyframedVisualEffectsEnabled,
    };
    const presetResult = applyMediaVisualEffectPreset(
      media,
      action.presetId,
      lookOptions,
    );
    if (presetResult.status === "terminal") {
      return {
        ok: false,
        message: presetResult.message ?? "Look preset apply failed.",
      };
    }
    const intensityResult = setMediaVisualEffectIntensity(
      presetResult.media,
      action.intensity,
      lookOptions,
    );
    if (intensityResult.status === "terminal") {
      return {
        ok: false,
        message: intensityResult.message ?? "Look intensity failed.",
      };
    }
    const nextScene = applyLookToScene(
      scene,
      action.mediaItemId,
      intensityResult.media,
      mixed,
    );
    if (!nextScene) {
      return { ok: false, message: "Look write authority failed." };
    }
    const appliedValue = snapshotLook(nextScene, action.mediaItemId, mixed);
    const nextScript = replaceScene(script, action.sceneId, nextScene);
    if (stableEqual(previousValue, appliedValue)) {
      return { ok: true, script: nextScript, change: null };
    }
    return {
      ok: true,
      script: nextScript,
      change: {
        actionKind: "apply-media-look",
        field: "visualEffect",
        target: {
          scope: "media",
          sceneId: action.sceneId,
          mediaItemId: action.mediaItemId,
        },
        previousValue,
        appliedValue,
      },
    };
  }

  return { ok: false, message: "Unknown preset action." };
}

function currentMatchesApplied(
  script: FootieScript,
  change: VisualRetentionPresetProvenanceChangeV1,
  mixedMediaScenesEnabled: boolean,
): { readonly available: boolean; readonly matches: boolean } {
  if (change.field === "shortForgeBrandSting") {
    const current = snapshotBrandSting(script);
    return {
      available: true,
      matches: stableEqual(current, change.appliedValue),
    };
  }
  const target = change.target;
  if (target.scope === "project") {
    return { available: false, matches: false };
  }
  const scene = script.scenes.find((entry) => entry.id === target.sceneId);
  if (!scene) return { available: false, matches: false };

  if (change.field === "visualBeatPlan") {
    return {
      available: true,
      matches: stableEqual(snapshotBeatPlan(scene), change.appliedValue),
    };
  }
  if (change.field === "engagementOverlay") {
    return {
      available: true,
      matches: stableEqual(
        snapshotEngagement(script, target.sceneId),
        change.appliedValue,
      ),
    };
  }
  if (target.scope !== "media") {
    return { available: false, matches: false };
  }
  const media = resolveTargetMedia(
    scene,
    target.mediaItemId,
    mixedMediaScenesEnabled,
  );
  if (!media) return { available: false, matches: false };
  if (change.field === "motion") {
    return {
      available: true,
      matches: motionEqual(
        snapshotMotion(scene, target.mediaItemId, mixedMediaScenesEnabled),
        change.appliedValue,
      ),
    };
  }
  if (change.field === "visualEffect") {
    return {
      available: true,
      matches: stableEqual(
        snapshotLook(scene, target.mediaItemId, mixedMediaScenesEnabled),
        change.appliedValue,
      ),
    };
  }
  return { available: false, matches: false };
}

function restoreOneChange(
  script: FootieScript,
  change: VisualRetentionPresetProvenanceChangeV1,
  capabilities: VisualRetentionPresetCommandCapabilities,
): { readonly ok: true; readonly script: FootieScript } | { readonly ok: false; readonly message: string } {
  const mixed = capabilities.mixedMediaScenesEnabled === true;

  if (change.actionKind === "enable-brand-sting") {
    const restored = restoreBrandSting(
      script,
      change.previousValue,
      capabilities.shortForgeBrandStingEnabled,
    );
    if (!restored) {
      return { ok: false, message: "Brand sting undo failed." };
    }
    return { ok: true, script: restored };
  }

  if (change.actionKind === "suggest-pacing" && change.target.scope === "scene") {
    const restored = restoreBeatPlan(
      script,
      change.target.sceneId,
      change.previousValue,
    );
    if (!restored) {
      return { ok: false, message: "Pacing undo failed." };
    }
    return { ok: true, script: restored };
  }

  if (
    change.actionKind === "add-engagement-overlay" &&
    change.target.scope === "scene"
  ) {
    const restored = restoreEngagement(
      script,
      change.target.sceneId,
      change.previousValue,
      capabilities.engagementOverlaysEnabled,
    );
    if (!restored) {
      return { ok: false, message: "Engagement undo failed." };
    }
    return { ok: true, script: restored };
  }

  if (
    change.actionKind === "apply-motion-preset" &&
    change.target.scope === "media"
  ) {
    const mediaTarget = change.target;
    const scene = script.scenes.find(
      (entry) => entry.id === mediaTarget.sceneId,
    );
    if (!scene) {
      return { ok: false, message: "Motion undo target missing unexpectedly." };
    }
    const previous = change.previousValue;
    const nextScene =
      previous == null
        ? applyMotionToScene(scene, mediaTarget.mediaItemId, "reset", mixed)
        : applyMotionToScene(
            scene,
            mediaTarget.mediaItemId,
            cloneJson(previous) as SceneMediaMotion,
            mixed,
          );
    if (!nextScene) {
      return { ok: false, message: "Motion undo write failed." };
    }
    return {
      ok: true,
      script: replaceScene(script, mediaTarget.sceneId, nextScene),
    };
  }

  if (
    change.actionKind === "apply-media-look" &&
    change.target.scope === "media"
  ) {
    const mediaTarget = change.target;
    const scene = script.scenes.find(
      (entry) => entry.id === mediaTarget.sceneId,
    );
    if (!scene) {
      return { ok: false, message: "Look undo target missing unexpectedly." };
    }
    const media = resolveTargetMedia(scene, mediaTarget.mediaItemId, mixed);
    if (!media) {
      return { ok: false, message: "Look undo media missing unexpectedly." };
    }
    const lookOptions = {
      keyframedVisualEffectsEnabled: capabilities.keyframedVisualEffectsEnabled,
    };
    let nextMedia: SceneMedia;
    if (change.previousValue == null) {
      const reset = resetMediaVisualEffect(media, lookOptions);
      if (reset.status === "terminal") {
        return { ok: false, message: reset.message ?? "Look reset failed." };
      }
      nextMedia = reset.media;
    } else {
      const previous = change.previousValue as {
        readonly presetId: string;
        readonly intensity: number;
      };
      const presetResult = applyMediaVisualEffectPreset(
        media,
        previous.presetId,
        lookOptions,
      );
      if (presetResult.status === "terminal") {
        return {
          ok: false,
          message: presetResult.message ?? "Look restore preset failed.",
        };
      }
      const intensityResult = setMediaVisualEffectIntensity(
        presetResult.media,
        previous.intensity,
        lookOptions,
      );
      if (intensityResult.status === "terminal") {
        return {
          ok: false,
          message: intensityResult.message ?? "Look restore intensity failed.",
        };
      }
      nextMedia = intensityResult.media;
    }
    const nextScene = applyLookToScene(
      scene,
      mediaTarget.mediaItemId,
      nextMedia,
      mixed,
    );
    if (!nextScene) {
      return { ok: false, message: "Look undo write failed." };
    }
    return {
      ok: true,
      script: replaceScene(script, mediaTarget.sceneId, nextScene),
    };
  }

  return { ok: false, message: "Unknown provenance change." };
}

function underlyingCapabilityOffForChange(
  change: VisualRetentionPresetProvenanceChangeV1,
  capabilities: VisualRetentionPresetCommandCapabilities,
): boolean {
  switch (change.actionKind) {
    case "suggest-pacing":
      return capabilities.visualBeatDensityEnabled !== true;
    case "apply-media-look":
      return capabilities.keyframedVisualEffectsEnabled !== true;
    case "add-engagement-overlay":
      return capabilities.engagementOverlaysEnabled !== true;
    case "enable-brand-sting":
      return capabilities.shortForgeBrandStingEnabled !== true;
    case "apply-motion-preset":
      return false;
    default:
      return false;
  }
}

/**
 * Transactional Apply of a complete non-terminal Visual Retention Preset plan.
 * Fingerprint-only input never authorizes Apply. Never mutates the input story.
 */
export function applyVisualRetentionPresetPlan(input: {
  readonly script: FootieScript;
  readonly plan: VisualRetentionPresetApplicationPlanV1;
  readonly capabilities: VisualRetentionPresetCommandCapabilities;
  /**
   * Required only when the canonical plan contains at least one suggest-pacing
   * action. Never used as randomness for other actions; excluded from fingerprints.
   */
  readonly generatedAtIso?: string;
  /** Optional concurrency guard; never substitutes for the plan object. */
  readonly expectedPlanFingerprint?: string | null;
  readonly appliedAtIso?: string;
  /**
   * Optional per-call interceptor for verification. Production callers omit this.
   * Returning proceed:false aborts with ACTION_FAILED and the original story.
   */
  readonly beforeAction?: VisualRetentionPresetBeforeActionHook;
}): VisualRetentionPresetApplyResult {
  const original = input.script;
  const warnings: string[] = [];

  if (input.capabilities.ready !== true) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_CAPABILITIES_NOT_READY",
      warnings,
    };
  }
  if (input.capabilities.visualRetentionPresetsEnabled !== true) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_CAPABILITY_OFF",
      warnings,
    };
  }

  const plan = input.plan;
  if (
    !plan ||
    plan.version !== 1 ||
    plan.status !== "preview" ||
    plan.terminalCode != null ||
    !plan.presetId
  ) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_INVALID_PLAN",
      warnings,
    };
  }

  const existing = normalizeVisualRetentionPresetProvenance(
    original.visualRetentionPresetProvenance,
  );
  if (existing) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_PROVENANCE_ACTIVE",
      warnings,
    };
  }
  if (
    original.visualRetentionPresetProvenance != null &&
    existing == null
  ) {
    // Malformed active-looking field — clear is Keep/Dismiss responsibility.
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_PROVENANCE_ACTIVE",
      warnings: [
        "Malformed preset provenance is present; Keep/Dismiss or repair before Apply.",
      ],
    };
  }

  const facts = projectStoryVisualRetentionPresetInput(original, {
    mixedMediaScenesEnabled: input.capabilities.mixedMediaScenesEnabled === true,
  });
  const canonical = buildVisualRetentionPresetApplicationPlan({
    presetId: plan.presetId as VisualRetentionPresetId,
    facts,
    capabilities: input.capabilities,
  });

  if (
    canonical.status !== "preview" ||
    !plansSemanticallyIdentical(plan, canonical)
  ) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_STALE_PLAN",
      warnings,
    };
  }

  const expected =
    typeof input.expectedPlanFingerprint === "string" &&
    input.expectedPlanFingerprint.trim()
      ? input.expectedPlanFingerprint.trim()
      : null;
  if (expected && expected !== canonical.planFingerprint) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_STALE_PLAN",
      warnings,
    };
  }

  const needsGeneratedAt = canonical.actions.some(
    (action) => action.kind === "suggest-pacing",
  );
  const generatedAtIso =
    typeof input.generatedAtIso === "string" && input.generatedAtIso.trim()
      ? input.generatedAtIso.trim()
      : "";
  if (needsGeneratedAt && !generatedAtIso) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_GENERATED_AT_REQUIRED",
      warnings,
    };
  }

  let working: FootieScript = {
    ...original,
    scenes: original.scenes.map((scene) => ({ ...scene })),
  };
  const changes: VisualRetentionPresetProvenanceChangeV1[] = [];

  for (let actionIndex = 0; actionIndex < canonical.actions.length; actionIndex += 1) {
    const action = canonical.actions[actionIndex]!;
    if (input.beforeAction) {
      const gate = input.beforeAction({
        action,
        actionIndex,
        workingScript: working,
      });
      if (!gate.proceed) {
        return {
          ok: false,
          script: original,
          terminalCode: "PRESET_APPLY_ACTION_FAILED",
          failedAction: {
            kind: action.kind,
            sceneId: "sceneId" in action ? action.sceneId : undefined,
            mediaItemId: "mediaItemId" in action ? action.mediaItemId : undefined,
            orderedIndex:
              "orderedIndex" in action ? action.orderedIndex : undefined,
            message: gate.message,
          },
          warnings,
        };
      }
    }
    const outcome = applyOneAction(
      working,
      action,
      input.capabilities,
      generatedAtIso,
    );
    if (!outcome.ok) {
      return {
        ok: false,
        script: original,
        terminalCode: "PRESET_APPLY_ACTION_FAILED",
        failedAction: {
          kind: action.kind,
          sceneId: "sceneId" in action ? action.sceneId : undefined,
          mediaItemId: "mediaItemId" in action ? action.mediaItemId : undefined,
          orderedIndex:
            "orderedIndex" in action ? action.orderedIndex : undefined,
          message: outcome.message,
        },
        warnings,
      };
    }
    working = outcome.script;
    if (outcome.change) {
      changes.push(outcome.change);
    }
  }

  if (changes.length === 0) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_NO_CHANGES",
      warnings,
    };
  }

  const appliedAtIso =
    typeof input.appliedAtIso === "string" && input.appliedAtIso.trim()
      ? input.appliedAtIso.trim()
      : undefined;

  const provenance: VisualRetentionPresetProvenanceV1 = Object.freeze({
    version: VISUAL_RETENTION_PRESET_PROVENANCE_VERSION,
    catalogVersion: VISUAL_RETENTION_PRESET_PROVENANCE_CATALOG_VERSION,
    presetId: plan.presetId as VisualRetentionPresetProvenanceV1["presetId"],
    inputFingerprint: canonical.inputFingerprint,
    planFingerprint: canonical.planFingerprint,
    status: "applied" as const,
    changes: Object.freeze(changes.map((change) => Object.freeze(change))),
    ...(appliedAtIso ? { appliedAtIso } : {}),
  });

  // Fail-closed: if recorded transitions are somehow invalid, refuse rather than
  // persist malformed authoring metadata.
  if (!normalizeVisualRetentionPresetProvenance(provenance)) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_APPLY_ACTION_FAILED",
      failedAction: {
        kind: changes[0]!.actionKind,
        message: "Provenance transition validation failed after Apply.",
      },
      warnings,
    };
  }

  return {
    ok: true,
    script: withProvenance(working, provenance),
    provenance,
    warnings,
  };
}

/**
 * Exact Undo of stored preset provenance. Manual overrides refuse with zero mutation.
 * Missing targets are skipped with warnings; provenance is cleared after success.
 */
export function undoVisualRetentionPresetApplication(input: {
  readonly script: FootieScript;
  readonly capabilities: VisualRetentionPresetCommandCapabilities;
}): VisualRetentionPresetUndoResult {
  const original = input.script;
  const warnings: string[] = [];

  if (input.capabilities.ready !== true) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_UNDO_CAPABILITIES_NOT_READY",
      warnings,
    };
  }
  if (input.capabilities.visualRetentionPresetsEnabled !== true) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_UNDO_CAPABILITY_OFF",
      warnings,
    };
  }

  if (original.visualRetentionPresetProvenance == null) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_UNDO_NOT_AVAILABLE",
      warnings,
    };
  }

  const provenance = normalizeVisualRetentionPresetProvenance(
    original.visualRetentionPresetProvenance,
  );
  if (!provenance) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_UNDO_PROVENANCE_INVALID",
      warnings,
    };
  }

  const stalenessCaps: VisualRetentionPresetStalenessCapabilities = {
    ready: input.capabilities.ready,
    visualRetentionPresetsEnabled:
      input.capabilities.visualRetentionPresetsEnabled,
    visualBeatDensityEnabled: input.capabilities.visualBeatDensityEnabled,
    keyframedVisualEffectsEnabled:
      input.capabilities.keyframedVisualEffectsEnabled,
    engagementOverlaysEnabled: input.capabilities.engagementOverlaysEnabled,
    shortForgeBrandStingEnabled: input.capabilities.shortForgeBrandStingEnabled,
    mixedMediaScenesEnabled: input.capabilities.mixedMediaScenesEnabled,
  };
  const staleness = evaluateVisualRetentionPresetStaleness({
    script: original,
    capabilities: stalenessCaps,
  });
  if (
    staleness.reasons.includes("PRESET_MANUAL_OVERRIDE_AFTER_APPLY")
  ) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_UNDO_MANUAL_OVERRIDE",
      warnings,
    };
  }
  if (
    staleness.reasons.includes("PRESET_UNDERLYING_CAPABILITY_OFF")
  ) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_UNDO_UNDERLYING_CAPABILITY_OFF",
      warnings,
    };
  }

  const mixed = input.capabilities.mixedMediaScenesEnabled === true;
  const restorable: VisualRetentionPresetProvenanceChangeV1[] = [];
  for (const change of provenance.changes) {
    if (underlyingCapabilityOffForChange(change, input.capabilities)) {
      return {
        ok: false,
        script: original,
        terminalCode: "PRESET_UNDO_UNDERLYING_CAPABILITY_OFF",
        warnings,
      };
    }
    const current = currentMatchesApplied(original, change, mixed);
    if (!current.available) {
      warnings.push(
        `Preset undo skipped missing target (${change.actionKind}).`,
      );
      continue;
    }
    if (!current.matches) {
      // Any surviving manual override refuses the entire Undo with zero mutation.
      return {
        ok: false,
        script: original,
        terminalCode: "PRESET_UNDO_MANUAL_OVERRIDE",
        warnings: [],
      };
    }
    restorable.push(change);
  }

  if (restorable.length === 0) {
    // All targets missing — clear provenance without inventing/restoring data.
    return {
      ok: true,
      script: withProvenance(original, undefined),
      warnings: [
        ...warnings,
        "Preset undo cleared provenance; no restorable targets remained.",
      ],
    };
  }

  let working: FootieScript = {
    ...original,
    scenes: original.scenes.map((scene) => ({ ...scene })),
  };

  // Restore in reverse application order for nested field safety.
  for (const change of [...restorable].reverse()) {
    const current = currentMatchesApplied(working, change, mixed);
    if (!current.available) {
      continue;
    }
    const restored = restoreOneChange(working, change, input.capabilities);
    if (!restored.ok) {
      return {
        ok: false,
        script: original,
        terminalCode: "PRESET_UNDO_ACTION_FAILED",
        failedAction: {
          kind: change.actionKind,
          sceneId:
            change.target.scope === "project"
              ? undefined
              : change.target.sceneId,
          mediaItemId:
            change.target.scope === "media"
              ? change.target.mediaItemId
              : undefined,
          message: restored.message,
        },
        warnings,
      };
    }
    working = restored.script;
  }

  return {
    ok: true,
    script: withProvenance(working, undefined),
    warnings,
  };
}

function clearProvenanceOnly(input: {
  readonly script: FootieScript;
  readonly capabilities: VisualRetentionPresetCommandCapabilities;
}): VisualRetentionPresetDismissResult {
  const original = input.script;
  if (input.capabilities.ready !== true) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_DISMISS_CAPABILITIES_NOT_READY",
      warnings: [],
    };
  }
  if (input.capabilities.visualRetentionPresetsEnabled !== true) {
    return {
      ok: false,
      script: original,
      terminalCode: "PRESET_DISMISS_CAPABILITY_OFF",
      warnings: [],
    };
  }
  if (original.visualRetentionPresetProvenance == null) {
    return { ok: true, script: original, warnings: [] };
  }
  return {
    ok: true,
    script: withProvenance(original, undefined),
    warnings: [],
  };
}

/** Keep applied settings; clear authoring provenance only. */
export function keepVisualRetentionPresetApplication(input: {
  readonly script: FootieScript;
  readonly capabilities: VisualRetentionPresetCommandCapabilities;
}): VisualRetentionPresetDismissResult {
  return clearProvenanceOnly(input);
}

/** Dismiss provenance metadata only — identical to Keep for v1. */
export function dismissVisualRetentionPresetApplication(input: {
  readonly script: FootieScript;
  readonly capabilities: VisualRetentionPresetCommandCapabilities;
}): VisualRetentionPresetDismissResult {
  return clearProvenanceOnly(input);
}
