/**
 * Fail-closed normalization for VisualRetentionProjectExtensionsV1.engagement overlays.
 * Malformed metadata is dropped without blocking project open.
 */

import type { FootieScript } from "@/features/story/types/story.types";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  SceneEngagementOverlayV1,
  VisualRetentionProjectExtensionsV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import { normalizeShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";

import {
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_PRESET_ID,
} from "./engagement-overlay.presets";

const KINDS = new Set<EngagementOverlayKind>([
  "like",
  "share",
  "subscribe",
  "combined",
]);

const POSITIONS = new Set<EngagementOverlayPosition>([
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSceneEngagementOverlay(
  value: unknown,
): SceneEngagementOverlayV1 | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return undefined;
  if (!KINDS.has(value.kind as EngagementOverlayKind)) return undefined;
  if (!POSITIONS.has(value.position as EngagementOverlayPosition)) return undefined;
  if (
    typeof value.startOffsetMs !== "number" ||
    !Number.isFinite(value.startOffsetMs) ||
    value.startOffsetMs < 0
  ) {
    return undefined;
  }
  if (
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < ENGAGEMENT_OVERLAY_MIN_DURATION_MS ||
    value.durationMs > ENGAGEMENT_OVERLAY_MAX_DURATION_MS
  ) {
    return undefined;
  }
  const presetId =
    typeof value.presetId === "string" && value.presetId.trim()
      ? value.presetId.trim()
      : ENGAGEMENT_OVERLAY_PRESET_ID;

  return {
    version: 1,
    id,
    kind: value.kind as EngagementOverlayKind,
    startOffsetMs: value.startOffsetMs,
    durationMs: value.durationMs,
    position: value.position as EngagementOverlayPosition,
    presetId,
  };
}

/**
 * Normalize project extensions, keeping at most one overlay per scene.
 * Orphan scene ids (not in `knownSceneIds`) are dropped.
 * Brand-sting payloads are preserved structurally but never enabled here.
 */
export function normalizeVisualRetentionProjectExtensions(
  value: unknown,
  knownSceneIds?: ReadonlySet<string> | readonly string[],
): VisualRetentionProjectExtensionsV1 | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || value.version !== 1) return undefined;

  const known =
    knownSceneIds == null
      ? null
      : knownSceneIds instanceof Set
        ? knownSceneIds
        : new Set(knownSceneIds);

  const next: {
    version: 1;
    engagementOverlaysBySceneId?: Record<string, SceneEngagementOverlayV1[]>;
    shortForgeBrandSting?: VisualRetentionProjectExtensionsV1["shortForgeBrandSting"];
  } = { version: 1 };

  const groups = value.engagementOverlaysBySceneId;
  if (isRecord(groups)) {
    const normalizedGroups: Record<string, SceneEngagementOverlayV1[]> = {};
    for (const [sceneIdRaw, overlays] of Object.entries(groups)) {
      const sceneId = sceneIdRaw.trim();
      if (!sceneId || !Array.isArray(overlays)) continue;
      if (known && !known.has(sceneId)) continue;
      // Authoring policy: at most one configured overlay per narration scene.
      for (const entry of overlays) {
        const overlay = normalizeSceneEngagementOverlay(entry);
        if (!overlay) continue;
        normalizedGroups[sceneId] = [overlay];
        break;
      }
    }
    if (Object.keys(normalizedGroups).length > 0) {
      next.engagementOverlaysBySceneId = normalizedGroups;
    }
  }

  // Preserve brand-sting only when contract-valid; never invent/enable.
  const sting = normalizeShortForgeBrandSting(value.shortForgeBrandSting);
  if (sting) {
    next.shortForgeBrandSting = sting;
  }

  if (!next.engagementOverlaysBySceneId && !next.shortForgeBrandSting) {
    return undefined;
  }
  return next;
}

export function getSceneEngagementOverlay(
  script: Pick<FootieScript, "visualRetentionExtensions"> | null | undefined,
  sceneId: string,
): SceneEngagementOverlayV1 | undefined {
  const id = sceneId.trim();
  if (!id) return undefined;
  const group =
    script?.visualRetentionExtensions?.engagementOverlaysBySceneId?.[id];
  if (!group || group.length === 0) return undefined;
  return normalizeSceneEngagementOverlay(group[0]);
}

/** Drop overlays for missing scenes; strip empty extension objects. */
export function pruneEngagementOverlaysToScenes(
  script: FootieScript,
): FootieScript {
  const sceneIds = script.scenes.map((scene) => scene.id);
  const normalized = normalizeVisualRetentionProjectExtensions(
    script.visualRetentionExtensions,
    sceneIds,
  );
  if (!normalized) {
    if (!script.visualRetentionExtensions) return script;
    const next = { ...script };
    delete next.visualRetentionExtensions;
    return next;
  }
  return { ...script, visualRetentionExtensions: normalized };
}
