/**
 * Normalize/clamp engagement overlay timing to a narration scene window.
 */

import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
} from "./engagement-overlay.presets";
import { normalizeSceneEngagementOverlay } from "./normalize-engagement-overlays";

export interface ResolveEngagementOverlayWindowInput {
  readonly overlay: unknown;
  /** Authoritative narration scene duration in ms. */
  readonly sceneDurationMs: number;
}

export interface ResolvedEngagementOverlayWindow {
  readonly available: boolean;
  readonly overlay: SceneEngagementOverlayV1 | undefined;
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly endOffsetMs: number;
  readonly warnings: readonly string[];
  readonly omitReason?: "missing" | "malformed" | "scene_too_short" | "clamped_away";
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Clamp overlay timing into [0, sceneDurationMs).
 * Does not mutate authoring input. Unusable windows return available=false.
 */
export function resolveEngagementOverlayWindow(
  input: ResolveEngagementOverlayWindowInput,
): ResolvedEngagementOverlayWindow {
  const warnings: string[] = [];
  const sceneDurationMs = finiteNonNegative(input.sceneDurationMs) ?? 0;
  const overlay = normalizeSceneEngagementOverlay(input.overlay);

  if (!overlay) {
    return {
      available: false,
      overlay: undefined,
      startOffsetMs: 0,
      durationMs: 0,
      endOffsetMs: 0,
      warnings,
      omitReason: input.overlay == null ? "missing" : "malformed",
    };
  }

  if (sceneDurationMs < ENGAGEMENT_OVERLAY_MIN_DURATION_MS) {
    warnings.push("This scene is too short for an engagement prompt.");
    return {
      available: false,
      overlay,
      startOffsetMs: 0,
      durationMs: 0,
      endOffsetMs: 0,
      warnings,
      omitReason: "scene_too_short",
    };
  }

  let startOffsetMs = Math.min(overlay.startOffsetMs, sceneDurationMs);
  let durationMs = Math.min(
    ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
    Math.max(ENGAGEMENT_OVERLAY_MIN_DURATION_MS, overlay.durationMs),
  );

  if (startOffsetMs + durationMs > sceneDurationMs) {
    const overflow = startOffsetMs + durationMs - sceneDurationMs;
    if (startOffsetMs >= overflow) {
      startOffsetMs -= overflow;
      warnings.push("Engagement prompt start was adjusted to fit this scene.");
    } else {
      startOffsetMs = 0;
      durationMs = sceneDurationMs;
      warnings.push("Engagement prompt length was adjusted to fit this scene.");
    }
  }

  durationMs = Math.min(durationMs, sceneDurationMs - startOffsetMs);
  if (durationMs < ENGAGEMENT_OVERLAY_MIN_DURATION_MS) {
    warnings.push("Engagement prompt could not fit in this scene.");
    return {
      available: false,
      overlay,
      startOffsetMs: 0,
      durationMs: 0,
      endOffsetMs: 0,
      warnings,
      omitReason: "clamped_away",
    };
  }

  if (
    startOffsetMs !== overlay.startOffsetMs ||
    durationMs !== overlay.durationMs
  ) {
    if (!warnings.length) {
      warnings.push("Engagement prompt timing was adjusted to fit this scene.");
    }
  }

  return {
    available: true,
    overlay,
    startOffsetMs,
    durationMs,
    endOffsetMs: startOffsetMs + durationMs,
    warnings,
  };
}
