/**
 * Optional future-facing project contracts reserved by visual-retention foundation.
 * They are not attached to Story/ExportManifest until their gated phase lands.
 */

export type EngagementOverlayKind =
  | "like"
  | "share"
  | "subscribe"
  | "combined";

export type EngagementOverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface SceneEngagementOverlayV1 {
  readonly version: 1;
  readonly id: string;
  readonly kind: EngagementOverlayKind;
  /** Scene-relative timing. Never changes the owning scene duration. */
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly position: EngagementOverlayPosition;
  readonly presetId: string;
}

export interface ShortForgeBrandStingV1 {
  readonly version: 1;
  readonly enabled: boolean;
  readonly title: "ShortForge Studio";
  readonly durationMs: 2000 | 2500 | 3000;
  readonly presetId: string;
  /** Voice, captions, and project playback-speed transformations are forbidden. */
  readonly narrationPolicy: "none";
  readonly captionPolicy: "none";
  readonly playbackSpeedPolicy: "fixed";
}

export interface VisualRetentionProjectExtensionsV1 {
  readonly version: 1;
  readonly engagementOverlaysBySceneId?: Readonly<
    Record<string, readonly SceneEngagementOverlayV1[]>
  >;
  /** Absence means no promotional segment and zero added render duration. */
  readonly shortForgeBrandSting?: ShortForgeBrandStingV1;
}

export interface VisualRetentionExtensionValidationResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

const ENGAGEMENT_KINDS = new Set<EngagementOverlayKind>([
  "like",
  "share",
  "subscribe",
  "combined",
]);
const ENGAGEMENT_POSITIONS = new Set<EngagementOverlayPosition>([
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);
const BRAND_STING_DURATIONS = new Set([2000, 2500, 3000]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateVisualRetentionProjectExtensions(
  value: unknown,
): VisualRetentionExtensionValidationResult {
  if (value === undefined || value === null) {
    return Object.freeze({ ok: true, issues: Object.freeze([]) });
  }
  if (!isRecord(value) || value.version !== 1) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(["Visual-retention extensions must be a version 1 object."]),
    });
  }

  const issues: string[] = [];
  const overlayGroups = value.engagementOverlaysBySceneId;
  if (overlayGroups !== undefined) {
    if (!isRecord(overlayGroups)) {
      issues.push("engagementOverlaysBySceneId must be an object when present.");
    } else {
      for (const [sceneId, overlays] of Object.entries(overlayGroups)) {
        if (!sceneId.trim() || !Array.isArray(overlays)) {
          issues.push("Each engagement overlay group requires a scene id and array.");
          continue;
        }
        const ids = new Set<string>();
        for (const overlay of overlays) {
          if (!isRecord(overlay) || overlay.version !== 1) {
            issues.push(`Scene ${sceneId} contains an invalid engagement overlay.`);
            continue;
          }
          const id = typeof overlay.id === "string" ? overlay.id.trim() : "";
          if (!id || ids.has(id)) {
            issues.push(`Scene ${sceneId} engagement overlay ids must be unique and non-empty.`);
          }
          ids.add(id);
          if (!ENGAGEMENT_KINDS.has(overlay.kind as EngagementOverlayKind)) {
            issues.push(`Scene ${sceneId} contains an unsupported engagement overlay kind.`);
          }
          if (!ENGAGEMENT_POSITIONS.has(overlay.position as EngagementOverlayPosition)) {
            issues.push(`Scene ${sceneId} contains an unsupported engagement overlay position.`);
          }
          if (
            typeof overlay.startOffsetMs !== "number" ||
            !Number.isFinite(overlay.startOffsetMs) ||
            overlay.startOffsetMs < 0
          ) {
            issues.push(`Scene ${sceneId} engagement overlay startOffsetMs is invalid.`);
          }
          if (
            typeof overlay.durationMs !== "number" ||
            !Number.isFinite(overlay.durationMs) ||
            overlay.durationMs < 250 ||
            overlay.durationMs > 10_000
          ) {
            issues.push(`Scene ${sceneId} engagement overlay durationMs is invalid.`);
          }
          if (typeof overlay.presetId !== "string" || !overlay.presetId.trim()) {
            issues.push(`Scene ${sceneId} engagement overlay presetId is required.`);
          }
        }
      }
    }
  }

  const sting = value.shortForgeBrandSting;
  if (sting !== undefined) {
    if (!isRecord(sting)) {
      issues.push("shortForgeBrandSting must be an object when present.");
    } else {
      if (
        sting.version !== 1 ||
        typeof sting.enabled !== "boolean" ||
        sting.title !== "ShortForge Studio" ||
        !BRAND_STING_DURATIONS.has(sting.durationMs as number) ||
        typeof sting.presetId !== "string" ||
        !sting.presetId.trim() ||
        sting.narrationPolicy !== "none" ||
        sting.captionPolicy !== "none" ||
        sting.playbackSpeedPolicy !== "fixed"
      ) {
        issues.push("shortForgeBrandSting violates its fixed promotional contract.");
      }
    }
  }

  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export function addedBrandStingDurationMs(
  extensions: VisualRetentionProjectExtensionsV1 | null | undefined,
): number {
  const sting = extensions?.shortForgeBrandSting;
  return sting?.enabled === true ? sting.durationMs : 0;
}
