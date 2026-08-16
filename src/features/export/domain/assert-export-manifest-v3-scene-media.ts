/**
 * Total ExportManifest v3 scene-media + intra-scene transition integrity (Sprint 9C).
 *
 * Accepts runtime-unknown input. Never throws. Never normalizes or repairs.
 * Malformed manifests must be rejected as INVALID_MANIFEST before cost/preload/render.
 */

import {
  isSupportedIntraSceneTransitionDuration,
  isSupportedIntraSceneTransitionEffect,
} from "@/features/scene-media-transitions/domain/effect-support";
import { resolveEffectiveIntraSceneTransitionDurationMs } from "@/features/scene-media-transitions/resolution/resolve-effective-duration";

import {
  validateExportSceneMediaTimelineFields,
  type ExportManifestV2IntegrityIssue,
  type ExportManifestV2IntegrityResult,
} from "./assert-export-manifest-v2-scene-media";
import { verifyExportManifestFingerprintCoherence } from "./export-manifest-fingerprint";
import {
  EXPORT_MANIFEST_V3_VERSION,
  EXPORT_RENDERER_CONTRACT_V3,
} from "./export-manifest.types";

export type ExportManifestV3IntegrityIssue = ExportManifestV2IntegrityIssue;
export type ExportManifestV3IntegrityResult = ExportManifestV2IntegrityResult;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function issue(
  code: string,
  message: string,
  sceneId?: string,
): ExportManifestV3IntegrityIssue {
  return sceneId ? { code, message, sceneId } : { code, message };
}

function validateMediaTransitions(
  scene: Record<string, unknown>,
  sceneId: string,
  timingAuthority: "legacy" | "centered-continuous",
): ExportManifestV3IntegrityIssue[] {
  const issues: ExportManifestV3IntegrityIssue[] = [];
  const track = scene.mediaTransitions;

  if (track === null || track === undefined || !isObject(track)) {
    issues.push(
      issue(
        "MISSING_MEDIA_TRANSITIONS",
        `Scene "${sceneId}" mediaTransitions is required on ExportManifest v3.`,
        sceneId,
      ),
    );
    return issues;
  }

  if (track.version !== 1) {
    issues.push(
      issue(
        "INVALID_MEDIA_TRANSITIONS_VERSION",
        `Scene "${sceneId}" mediaTransitions.version must be 1.`,
        sceneId,
      ),
    );
    return issues;
  }

  if (!Array.isArray(track.boundaries)) {
    issues.push(
      issue(
        "INVALID_MEDIA_TRANSITIONS_BOUNDARIES",
        `Scene "${sceneId}" mediaTransitions.boundaries must be an array.`,
        sceneId,
      ),
    );
    return issues;
  }

  const timeline = isObject(scene.mediaTimeline) ? scene.mediaTimeline : null;
  const items = Array.isArray(timeline?.items) ? timeline.items : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    if (isObject(item) && typeof item.id === "string") {
      byId.set(item.id, item);
    }
  }

  const seenPairs = new Set<string>();
  /** Canonical order: strictly increasing fromItemIndex (A→B then B→C is valid). */
  let previousFromItemIndex = Number.NEGATIVE_INFINITY;

  for (let bi = 0; bi < track.boundaries.length; bi += 1) {
    const boundary = track.boundaries[bi];
    if (!isObject(boundary)) {
      issues.push(
        issue(
          "INVALID_MEDIA_TRANSITION_BOUNDARY",
          `Scene "${sceneId}" mediaTransitions.boundaries[${bi}] must be an object.`,
          sceneId,
        ),
      );
      continue;
    }

    const fromItemId = boundary.fromItemId;
    const toItemId = boundary.toItemId;
    if (typeof fromItemId !== "string" || !fromItemId.trim()) {
      issues.push(
        issue(
          "INVALID_MEDIA_TRANSITION_FROM_ID",
          `Scene "${sceneId}" boundary[${bi}] fromItemId must be a non-empty string.`,
          sceneId,
        ),
      );
    }
    if (typeof toItemId !== "string" || !toItemId.trim()) {
      issues.push(
        issue(
          "INVALID_MEDIA_TRANSITION_TO_ID",
          `Scene "${sceneId}" boundary[${bi}] toItemId must be a non-empty string.`,
          sceneId,
        ),
      );
    }
    if (fromItemId === toItemId) {
      issues.push(
        issue(
          "INVALID_MEDIA_TRANSITION_PAIR",
          `Scene "${sceneId}" boundary[${bi}] from/to must be distinct.`,
          sceneId,
        ),
      );
    }

    if (boundary.effect === "cut") {
      issues.push(
        issue(
          "CUT_NOT_STORED",
          `Scene "${sceneId}" boundary[${bi}] must not store cut — cut is absence.`,
          sceneId,
        ),
      );
    } else if (!isSupportedIntraSceneTransitionEffect(boundary.effect)) {
      issues.push(
        issue(
          "UNSUPPORTED_MEDIA_TRANSITION_EFFECT",
          `Scene "${sceneId}" boundary[${bi}] has an unsupported effect.`,
          sceneId,
        ),
      );
    }

    if (
      !isFiniteInteger(boundary.requestedDurationMs) ||
      !isSupportedIntraSceneTransitionDuration(boundary.requestedDurationMs)
    ) {
      issues.push(
        issue(
          "UNSUPPORTED_MEDIA_TRANSITION_DURATION",
          `Scene "${sceneId}" boundary[${bi}] requestedDurationMs is unsupported.`,
          sceneId,
        ),
      );
    }

    if (
      !isFiniteInteger(boundary.effectiveDurationMs) ||
      boundary.effectiveDurationMs <= 0
    ) {
      issues.push(
        issue(
          "INVALID_MEDIA_TRANSITION_EFFECTIVE_DURATION",
          `Scene "${sceneId}" boundary[${bi}] effectiveDurationMs must be a positive integer.`,
          sceneId,
        ),
      );
    }

    for (const field of [
      "fromItemIndex",
      "toItemIndex",
      "overlayStartOffsetMs",
      "overlayEndOffsetMs",
    ] as const) {
      if (!isFiniteInteger(boundary[field])) {
        issues.push(
          issue(
            "INVALID_MEDIA_TRANSITION_TIMING",
            `Scene "${sceneId}" boundary[${bi}] ${field} must be a finite integer.`,
            sceneId,
          ),
        );
      }
    }

    const fromItem = typeof fromItemId === "string" ? byId.get(fromItemId) : undefined;
    const toItem = typeof toItemId === "string" ? byId.get(toItemId) : undefined;

    if (!fromItem || !toItem) {
      issues.push(
        issue(
          "UNKNOWN_MEDIA_TRANSITION_ITEM",
          `Scene "${sceneId}" boundary[${bi}] references unknown media item ids.`,
          sceneId,
        ),
      );
      continue;
    }

    if (
      isFiniteInteger(boundary.fromItemIndex) &&
      fromItem.index !== boundary.fromItemIndex
    ) {
      issues.push(
        issue(
          "MEDIA_TRANSITION_INDEX_MISMATCH",
          `Scene "${sceneId}" boundary[${bi}] fromItemIndex must match mediaTimeline.`,
          sceneId,
        ),
      );
    }
    if (
      isFiniteInteger(boundary.toItemIndex) &&
      toItem.index !== boundary.toItemIndex
    ) {
      issues.push(
        issue(
          "MEDIA_TRANSITION_INDEX_MISMATCH",
          `Scene "${sceneId}" boundary[${bi}] toItemIndex must match mediaTimeline.`,
          sceneId,
        ),
      );
    }

    if (
      !isFiniteInteger(fromItem.index) ||
      !isFiniteInteger(toItem.index) ||
      toItem.index !== fromItem.index + 1
    ) {
      issues.push(
        issue(
          "NON_ADJACENT_MEDIA_TRANSITION",
          `Scene "${sceneId}" boundary[${bi}] must reference adjacent mediaTimeline items.`,
          sceneId,
        ),
      );
    }

    const orderIndex = isFiniteInteger(boundary.fromItemIndex)
      ? boundary.fromItemIndex
      : isFiniteInteger(fromItem.index)
        ? fromItem.index
        : null;
    if (orderIndex !== null) {
      if (orderIndex <= previousFromItemIndex) {
        issues.push(
          issue(
            "MEDIA_TRANSITION_ORDER",
            `Scene "${sceneId}" boundaries must be ordered by strictly increasing fromItemIndex.`,
            sceneId,
          ),
        );
      }
      previousFromItemIndex = orderIndex;
    }

    const pairKey = JSON.stringify([fromItemId, toItemId]);
    if (seenPairs.has(pairKey)) {
      issues.push(
        issue(
          "DUPLICATE_MEDIA_TRANSITION",
          `Scene "${sceneId}" boundary[${bi}] duplicates an earlier pair.`,
          sceneId,
        ),
      );
    }
    seenPairs.add(pairKey);

    // No outgoing transition from the final media item.
    if (
      isFiniteInteger(fromItem.index) &&
      fromItem.index === items.length - 1
    ) {
      issues.push(
        issue(
          "FINAL_ITEM_OUTGOING_TRANSITION",
          `Scene "${sceneId}" boundary[${bi}] cannot originate from the final media item.`,
          sceneId,
        ),
      );
    }

    if (
      isFiniteInteger(boundary.requestedDurationMs) &&
      isFiniteInteger(fromItem.durationMs) &&
      isFiniteInteger(toItem.durationMs) &&
      isFiniteInteger(boundary.effectiveDurationMs)
    ) {
      const expected = resolveEffectiveIntraSceneTransitionDurationMs({
        requestedDurationMs: boundary.requestedDurationMs,
        fromWindowDurationMs: fromItem.durationMs,
        toWindowDurationMs: toItem.durationMs,
      });
      if (boundary.effectiveDurationMs !== expected) {
        issues.push(
          issue(
            "MEDIA_TRANSITION_EFFECTIVE_DURATION_MISMATCH",
            `Scene "${sceneId}" boundary[${bi}] effectiveDurationMs must equal the frozen 40% clamp.`,
            sceneId,
          ),
        );
      }
    }

    const usesContinuousTiming = timingAuthority === "centered-continuous";
    if (
      usesContinuousTiming &&
      boundary.timingModel !== "centered-continuous-v1"
    ) {
      issues.push(
        issue(
          "INVALID_MEDIA_TRANSITION_TIMING_MODEL",
          `Scene "${sceneId}" boundary[${bi}] must use centered-continuous-v1 timing.`,
          sceneId,
        ),
      );
    }
    if (!usesContinuousTiming && boundary.timingModel !== undefined) {
      issues.push(
        issue(
          "UNSUPPORTED_MEDIA_TRANSITION_TIMING_MODEL",
          `Scene "${sceneId}" boundary[${bi}] timingModel requires the continuous transition capability.`,
          sceneId,
        ),
      );
    }

    const expectedOverlayStart =
      isFiniteInteger(toItem.startOffsetMs) &&
      isFiniteInteger(boundary.effectiveDurationMs)
        ? usesContinuousTiming
          ? toItem.startOffsetMs - Math.floor(boundary.effectiveDurationMs / 2)
          : toItem.startOffsetMs
        : null;
    if (
      expectedOverlayStart !== null &&
      isFiniteInteger(boundary.overlayStartOffsetMs) &&
      boundary.overlayStartOffsetMs !== expectedOverlayStart
    ) {
      issues.push(
        issue(
          "MEDIA_TRANSITION_OVERLAY_START_MISMATCH",
          `Scene "${sceneId}" boundary[${bi}] overlayStartOffsetMs does not match its timing model.`,
          sceneId,
        ),
      );
    }

    if (
      isFiniteInteger(boundary.overlayStartOffsetMs) &&
      isFiniteInteger(boundary.effectiveDurationMs) &&
      isFiniteInteger(boundary.overlayEndOffsetMs) &&
      boundary.overlayEndOffsetMs !==
        boundary.overlayStartOffsetMs + boundary.effectiveDurationMs
    ) {
      issues.push(
        issue(
          "MEDIA_TRANSITION_OVERLAY_END_MISMATCH",
          `Scene "${sceneId}" boundary[${bi}] overlayEndOffsetMs must equal start + effective duration.`,
          sceneId,
        ),
      );
    }

    if (
      isFiniteInteger(boundary.overlayStartOffsetMs) &&
      isFiniteInteger(boundary.overlayEndOffsetMs) &&
      isFiniteInteger(fromItem.startOffsetMs) &&
      isFiniteInteger(toItem.startOffsetMs) &&
      isFiniteInteger(toItem.endOffsetMs) &&
      (boundary.overlayStartOffsetMs <
          (usesContinuousTiming ? fromItem.startOffsetMs : toItem.startOffsetMs) ||
        boundary.overlayEndOffsetMs > toItem.endOffsetMs)
    ) {
      issues.push(
        issue(
          "MEDIA_TRANSITION_OVERLAY_OUT_OF_WINDOW",
          `Scene "${sceneId}" boundary[${bi}] overlay exceeds its adjacent media windows.`,
          sceneId,
        ),
      );
    }
  }

  return issues;
}

function validateV3HasNoMediaVisualAdjustments(
  manifest: unknown,
): ExportManifestV3IntegrityIssue[] {
  if (!isObject(manifest) || !Array.isArray(manifest.scenes)) return [];
  const issues: ExportManifestV3IntegrityIssue[] = [];
  for (let sceneIndex = 0; sceneIndex < manifest.scenes.length; sceneIndex += 1) {
    const scene = manifest.scenes[sceneIndex];
    if (!isObject(scene)) continue;
    if (isObject(scene.media) && scene.media.visualAdjustments !== undefined) {
      issues.push(
        issue(
          "UNSUPPORTED_MEDIA_VISUAL_ADJUSTMENTS",
          `Scene "${String(scene.id ?? sceneIndex)}" visual adjustments require ExportManifest v4.`,
          typeof scene.id === "string" ? scene.id : undefined,
        ),
      );
    }
    const timeline = isObject(scene.mediaTimeline) ? scene.mediaTimeline : null;
    const items = Array.isArray(timeline?.items) ? timeline.items : [];
    if (
      items.some(
        (item) =>
          isObject(item) &&
          isObject(item.media) &&
          item.media.visualAdjustments !== undefined,
      )
    ) {
      issues.push(
        issue(
          "UNSUPPORTED_MEDIA_VISUAL_ADJUSTMENTS",
          `Scene "${String(scene.id ?? sceneIndex)}" timeline visual adjustments require ExportManifest v4.`,
          typeof scene.id === "string" ? scene.id : undefined,
        ),
      );
    }
  }
  return issues;
}

function validateFingerprintCoherence(
  manifest: Record<string, unknown>,
): ExportManifestV3IntegrityIssue[] {
  const coherence = verifyExportManifestFingerprintCoherence(manifest);
  if (!coherence) {
    return [];
  }
  return [issue(coherence.code, coherence.message)];
}

function validateExportManifestV3SceneMediaInner(
  manifest: unknown,
  authority: {
    version: number;
    rendererContractVersion: string;
    label: string;
    transitionTimingModel?: "legacy" | "centered-continuous";
  },
): ExportManifestV3IntegrityResult {
  if (manifest === null || manifest === undefined || !isObject(manifest)) {
    return {
      ok: false,
      issues: [
        issue("INVALID_MANIFEST", "ExportManifest must be a non-null object."),
      ],
    };
  }

  const issues: ExportManifestV3IntegrityIssue[] = [];

  if (manifest.version !== authority.version) {
    issues.push(
      issue(
        "UNSUPPORTED_MANIFEST_VERSION",
        `ExportManifest ${authority.label} version must be ${authority.version}.`,
      ),
    );
  }
  if (manifest.rendererContractVersion !== authority.rendererContractVersion) {
    issues.push(
      issue(
        "UNSUPPORTED_RENDERER_CONTRACT",
        `ExportManifest ${authority.label} renderer contract must be "${authority.rendererContractVersion}".`,
      ),
    );
  }

  issues.push(...validateFingerprintCoherence(manifest));

  if (!Array.isArray(manifest.scenes)) {
    issues.push(issue("MISSING_SCENES", "ExportManifest.scenes is required."));
    return { ok: false, issues };
  }

  for (let index = 0; index < manifest.scenes.length; index += 1) {
    const scene = manifest.scenes[index];
    issues.push(...validateExportSceneMediaTimelineFields(scene, index));
    if (isObject(scene)) {
      const sceneId =
        typeof scene.id === "string" && scene.id.trim()
          ? scene.id
          : `index:${index}`;
      issues.push(
        ...validateMediaTransitions(
          scene,
          sceneId,
          authority.transitionTimingModel ?? "legacy",
        ),
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Validates ExportManifest v3 + mediaTimeline + mediaTransitions integrity.
 * Total over runtime-unknown input — never throws.
 */
export function validateExportManifestV3SceneMedia(
  manifest: unknown,
): ExportManifestV3IntegrityResult {
  try {
    const base = validateExportManifestV3SceneMediaInner(manifest, {
      version: EXPORT_MANIFEST_V3_VERSION,
      rendererContractVersion: EXPORT_RENDERER_CONTRACT_V3,
      label: "v3",
    });
    const issues = [
      ...base.issues,
      ...validateV3HasNoMediaVisualAdjustments(manifest),
    ];
    return { ok: issues.length === 0, issues };
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_MANIFEST",
          error instanceof Error
            ? `Manifest validation failed unexpectedly: ${error.message}`
            : "Manifest validation failed unexpectedly.",
        ),
      ],
    };
  }
}

export function validateExportManifestTransitionSceneMedia(
  manifest: unknown,
  authority: {
    version: number;
    rendererContractVersion: string;
    label: string;
    transitionTimingModel?: "legacy" | "centered-continuous";
  },
): ExportManifestV3IntegrityResult {
  try {
    return validateExportManifestV3SceneMediaInner(manifest, authority);
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_MANIFEST",
          error instanceof Error
            ? `Manifest validation failed unexpectedly: ${error.message}`
            : "Manifest validation failed unexpectedly.",
        ),
      ],
    };
  }
}

export function assertExportManifestV3SceneMedia(manifest: unknown): void {
  const result = validateExportManifestV3SceneMedia(manifest);
  if (!result.ok) {
    const first = result.issues[0]!;
    throw new Error(
      `ExportManifest v3 integrity failed (${first.code}): ${first.message}`,
    );
  }
}
