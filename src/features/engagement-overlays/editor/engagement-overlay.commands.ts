/**
 * Immutable engagement-overlay authoring commands.
 * Scene-scoped — never depends on mixed-media item selection.
 */

import type { FootieScript } from "@/features/story/types";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  EngagementOverlaySize,
  SceneEngagementOverlayV1,
  VisualRetentionProjectExtensionsV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS,
  ENGAGEMENT_OVERLAY_DEFAULT_POSITION,
  ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
  ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_MAX_SCALE,
  ENGAGEMENT_OVERLAY_MIN_SCALE,
  ENGAGEMENT_OVERLAY_PRESET_ID,
  isUiEngagementOverlayPosition,
} from "../domain/engagement-overlay.presets";
import {
  getSceneEngagementOverlay,
  normalizeVisualRetentionProjectExtensions,
  pruneEngagementOverlaysToScenes,
} from "../domain/normalize-engagement-overlays";
import { resolveEngagementOverlayWindow } from "../domain/resolve-engagement-overlay-window";

export type EngagementOverlayCommandStatus = "ok" | "recoverable" | "terminal";

export interface EngagementOverlayCommandOptions {
  readonly engagementOverlaysEnabled?: boolean;
}

export interface EngagementOverlayCommandResult {
  readonly status: EngagementOverlayCommandStatus;
  readonly script: FootieScript;
  readonly overlay: SceneEngagementOverlayV1 | undefined;
  readonly warnings: readonly string[];
  readonly message?: string;
  readonly focusTarget?: "add" | "kind" | "remove";
}

export const ENGAGEMENT_OVERLAY_CAPABILITY_OFF_MESSAGE =
  "Engagement prompts are turned off for this project.";

export const ENGAGEMENT_OVERLAY_SCENE_MISSING_MESSAGE =
  "That scene is no longer available.";

function cloneScript(script: FootieScript): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => ({ ...scene })),
    ...(script.visualRetentionExtensions
      ? {
          visualRetentionExtensions: normalizeVisualRetentionProjectExtensions(
            script.visualRetentionExtensions,
            script.scenes.map((scene) => scene.id),
          ),
        }
      : {}),
  };
}

function refuseCapability(
  script: FootieScript,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult | null {
  if (options?.engagementOverlaysEnabled !== true) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings: [],
      message: ENGAGEMENT_OVERLAY_CAPABILITY_OFF_MESSAGE,
      focusTarget: "add",
    };
  }
  return null;
}

function sceneDurationMs(script: FootieScript, sceneId: string): number {
  const scene = script.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return 0;
  if (typeof scene.durationMs === "number" && Number.isFinite(scene.durationMs)) {
    return Math.max(0, scene.durationMs);
  }
  if (typeof scene.duration === "number" && Number.isFinite(scene.duration)) {
    return Math.max(0, Math.round(scene.duration * 1000));
  }
  return 0;
}

function withOverlay(
  script: FootieScript,
  sceneId: string,
  overlay: SceneEngagementOverlayV1 | undefined,
): FootieScript {
  const pruned = pruneEngagementOverlaysToScenes(cloneScript(script));
  const groups: Record<string, SceneEngagementOverlayV1[]> = {};
  for (const [id, entries] of Object.entries(
    pruned.visualRetentionExtensions?.engagementOverlaysBySceneId ?? {},
  )) {
    groups[id] = [...entries];
  }
  if (!overlay) {
    delete groups[sceneId];
  } else {
    groups[sceneId] = [overlay];
  }
  const extensions: VisualRetentionProjectExtensionsV1 | undefined =
    Object.keys(groups).length > 0 ||
    pruned.visualRetentionExtensions?.shortForgeBrandSting
      ? {
          version: 1,
          ...(Object.keys(groups).length > 0
            ? { engagementOverlaysBySceneId: groups }
            : {}),
          ...(pruned.visualRetentionExtensions?.shortForgeBrandSting
            ? {
                shortForgeBrandSting:
                  pruned.visualRetentionExtensions.shortForgeBrandSting,
              }
            : {}),
        }
      : undefined;
  const next = { ...pruned };
  if (extensions) {
    next.visualRetentionExtensions = extensions;
  } else {
    delete next.visualRetentionExtensions;
  }
  return next;
}

function requireScene(
  script: FootieScript,
  sceneId: string,
): EngagementOverlayCommandResult | null {
  if (!script.scenes.some((scene) => scene.id === sceneId)) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings: [],
      message: ENGAGEMENT_OVERLAY_SCENE_MISSING_MESSAGE,
      focusTarget: "add",
    };
  }
  return null;
}

function missingOverlay(script: FootieScript): EngagementOverlayCommandResult {
  return {
    status: "terminal",
    script: cloneScript(script),
    overlay: undefined,
    warnings: [],
    message: "Add an engagement prompt first.",
    focusTarget: "add",
  };
}

function invalidValue(
  script: FootieScript,
  overlay: SceneEngagementOverlayV1,
  message: string,
): EngagementOverlayCommandResult {
  return {
    status: "terminal",
    script: cloneScript(script),
    overlay,
    warnings: [],
    message,
    focusTarget: "kind",
  };
}

function okResult(
  script: FootieScript,
  overlay: SceneEngagementOverlayV1,
): EngagementOverlayCommandResult {
  return { status: "ok", script, overlay, warnings: [], focusTarget: "kind" };
}

function createDefaultOverlay(
  script: FootieScript,
  sceneId: string,
): SceneEngagementOverlayV1 {
  const durationMs = Math.min(
    ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS,
    Math.max(ENGAGEMENT_OVERLAY_MIN_DURATION_MS, sceneDurationMs(script, sceneId)),
  );
  const startOffsetMs = Math.max(0, sceneDurationMs(script, sceneId) - durationMs);
  return {
    version: 1,
    id: `engagement-${sceneId}`,
    kind: "like",
    startOffsetMs,
    durationMs,
    position: ENGAGEMENT_OVERLAY_DEFAULT_POSITION,
    size: ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
    scale: ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
    presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
  };
}

function applyWindowWarnings(
  script: FootieScript,
  sceneId: string,
  overlay: SceneEngagementOverlayV1,
): { overlay: SceneEngagementOverlayV1; warnings: string[] } {
  const resolved = resolveEngagementOverlayWindow({
    overlay,
    sceneDurationMs: sceneDurationMs(script, sceneId),
  });
  if (!resolved.available || !resolved.overlay) {
    return {
      overlay,
      warnings: [...resolved.warnings],
    };
  }
  return {
    overlay: {
      ...resolved.overlay,
      startOffsetMs: resolved.startOffsetMs,
      durationMs: resolved.durationMs,
    },
    warnings: [...resolved.warnings],
  };
}

/** Explicit add — never auto-created by opening the inspector. */
export function addEngagementOverlay(
  script: FootieScript,
  sceneId: string,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;

  const existing = getSceneEngagementOverlay(script, sceneId);
  if (existing) {
    return {
      status: "ok",
      script: cloneScript(script),
      overlay: existing,
      warnings: [],
      focusTarget: "kind",
    };
  }

  const created = createDefaultOverlay(script, sceneId);
  const { overlay, warnings } = applyWindowWarnings(script, sceneId, created);
  if (!resolveEngagementOverlayWindow({
    overlay,
    sceneDurationMs: sceneDurationMs(script, sceneId),
  }).available) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings,
      message: warnings[0] ?? "This scene is too short for an engagement prompt.",
      focusTarget: "add",
    };
  }

  const next = withOverlay(script, sceneId, overlay);
  return {
    status: warnings.length ? "recoverable" : "ok",
    script: next,
    overlay,
    warnings,
    focusTarget: "kind",
  };
}

export function setEngagementOverlayKind(
  script: FootieScript,
  sceneId: string,
  kind: unknown,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  const current = getSceneEngagementOverlay(script, sceneId);
  if (!current) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings: [],
      message: "Add an engagement prompt first.",
      focusTarget: "add",
    };
  }
  if (
    kind !== "like" &&
    kind !== "share" &&
    kind !== "subscribe" &&
    kind !== "combined"
  ) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: current,
      warnings: [],
      message: "Choose a supported engagement prompt.",
      focusTarget: "kind",
    };
  }
  const nextOverlay = { ...current, kind: kind as EngagementOverlayKind };
  return {
    status: "ok",
    script: withOverlay(script, sceneId, nextOverlay),
    overlay: nextOverlay,
    warnings: [],
    focusTarget: "kind",
  };
}

export function setEngagementOverlayPosition(
  script: FootieScript,
  sceneId: string,
  position: unknown,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  const current = getSceneEngagementOverlay(script, sceneId);
  if (!current) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings: [],
      message: "Add an engagement prompt first.",
      focusTarget: "add",
    };
  }
  if (!isUiEngagementOverlayPosition(position)) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: current,
      warnings: [],
      message: "Choose a supported position.",
      focusTarget: "kind",
    };
  }
  const nextOverlay = {
    ...current,
    position: position as EngagementOverlayPosition,
  };
  return {
    status: "ok",
    script: withOverlay(script, sceneId, nextOverlay),
    overlay: nextOverlay,
    warnings: [],
  };
}

export function setEngagementOverlaySize(
  script: FootieScript,
  sceneId: string,
  size: EngagementOverlaySize,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  const current = getSceneEngagementOverlay(script, sceneId);
  if (!current) return missingOverlay(script);
  if (size !== "small" && size !== "medium" && size !== "large") {
    return invalidValue(script, current, "Choose Small, Medium, or Large.");
  }
  const overlay = { ...current, size };
  return okResult(withOverlay(script, sceneId, overlay), overlay);
}

export function setEngagementOverlayScale(
  script: FootieScript,
  sceneId: string,
  scale: number,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  const current = getSceneEngagementOverlay(script, sceneId);
  if (!current) return missingOverlay(script);
  if (!Number.isFinite(scale)) {
    return invalidValue(script, current, "Enter a valid overlay scale.");
  }
  const bounded = Math.min(
    ENGAGEMENT_OVERLAY_MAX_SCALE,
    Math.max(ENGAGEMENT_OVERLAY_MIN_SCALE, scale),
  );
  const overlay = { ...current, scale: bounded };
  return okResult(withOverlay(script, sceneId, overlay), overlay);
}

/** UI steppers pass seconds; values above 120 are treated as milliseconds. */
function timingInputToMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallbackMs;
  if (value > 120) return Math.round(value);
  return Math.round(value * 1000);
}

export function setEngagementOverlayStartMs(
  script: FootieScript,
  sceneId: string,
  startInput: unknown,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  const current = getSceneEngagementOverlay(script, sceneId);
  if (!current) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings: [],
      message: "Add an engagement prompt first.",
      focusTarget: "add",
    };
  }
  const asMs = timingInputToMs(startInput, current.startOffsetMs);

  const { overlay, warnings } = applyWindowWarnings(script, sceneId, {
    ...current,
    startOffsetMs: Math.max(0, asMs),
  });
  return {
    status: warnings.length ? "recoverable" : "ok",
    script: withOverlay(script, sceneId, overlay),
    overlay,
    warnings,
  };
}

export function setEngagementOverlayDurationMs(
  script: FootieScript,
  sceneId: string,
  durationInput: unknown,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  const current = getSceneEngagementOverlay(script, sceneId);
  if (!current) {
    return {
      status: "terminal",
      script: cloneScript(script),
      overlay: undefined,
      warnings: [],
      message: "Add an engagement prompt first.",
      focusTarget: "add",
    };
  }
  const asMs = timingInputToMs(durationInput, current.durationMs);

  const clamped = Math.min(
    ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
    Math.max(ENGAGEMENT_OVERLAY_MIN_DURATION_MS, asMs),
  );
  const { overlay, warnings } = applyWindowWarnings(script, sceneId, {
    ...current,
    durationMs: clamped,
  });
  return {
    status: warnings.length ? "recoverable" : "ok",
    script: withOverlay(script, sceneId, overlay),
    overlay,
    warnings,
  };
}

export function removeEngagementOverlay(
  script: FootieScript,
  sceneId: string,
  options?: EngagementOverlayCommandOptions,
): EngagementOverlayCommandResult {
  const refused = refuseCapability(script, options);
  if (refused) return refused;
  const missing = requireScene(script, sceneId);
  if (missing) return missing;
  return {
    status: "ok",
    script: withOverlay(script, sceneId, undefined),
    overlay: undefined,
    warnings: [],
    focusTarget: "add",
  };
}
