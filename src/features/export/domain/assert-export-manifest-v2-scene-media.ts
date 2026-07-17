/**
 * Total ExportManifest v2 scene-media-timeline integrity validator (Sprint 8D.1A).
 *
 * Accepts runtime-unknown input. Never throws. Never normalizes or repairs.
 * Malformed manifests must be rejected as INVALID_MANIFEST before cost/preload/render.
 */

import { verifyExportManifestFingerprintCoherence } from "./export-manifest-fingerprint";
import {
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
} from "./export-manifest.types";

export interface ExportManifestV2IntegrityIssue {
  readonly code: string;
  readonly message: string;
  readonly sceneId?: string;
}

export interface ExportManifestV2IntegrityResult {
  readonly ok: boolean;
  readonly issues: readonly ExportManifestV2IntegrityIssue[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function issue(
  code: string,
  message: string,
  sceneId?: string,
): ExportManifestV2IntegrityIssue {
  return sceneId ? { code, message, sceneId } : { code, message };
}

function motionSemanticallyEqual(left: unknown, right: unknown): boolean {
  if (left === null && right === null) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  if (!isObject(left) || !isObject(right)) {
    return false;
  }
  return (
    left.enabled === right.enabled &&
    left.presetId === right.presetId &&
    left.easing === right.easing &&
    left.intensity === right.intensity
  );
}

/**
 * Defensive field-by-field media equality. Never throws.
 * Property insertion order is irrelevant.
 */
export function exportMediaManifestSemanticallyEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (!isObject(left) || !isObject(right)) {
    return false;
  }
  if (left.type !== right.type) {
    return false;
  }
  if (left.type === "placeholder") {
    return true;
  }
  if (left.type === "image") {
    return (
      left.source === right.source &&
      left.fitMode === right.fitMode &&
      left.positionX === right.positionX &&
      left.positionY === right.positionY &&
      left.zoom === right.zoom &&
      left.rotationDeg === right.rotationDeg &&
      motionSemanticallyEqual(left.motion, right.motion)
    );
  }
  if (left.type === "video") {
    return (
      left.source === right.source &&
      left.sourceDurationMs === right.sourceDurationMs &&
      left.trimStartMs === right.trimStartMs &&
      left.trimEndMs === right.trimEndMs &&
      left.playbackRate === right.playbackRate &&
      left.sourceAudioPolicy === right.sourceAudioPolicy &&
      left.fitMode === right.fitMode &&
      left.positionX === right.positionX &&
      left.positionY === right.positionY &&
      left.zoom === right.zoom &&
      left.rotationDeg === right.rotationDeg &&
      motionSemanticallyEqual(left.motion, right.motion)
    );
  }
  return false;
}

function isDrawableCanonicalMedia(media: unknown): boolean {
  if (!isObject(media)) {
    return false;
  }
  if (media.type !== "image" && media.type !== "video") {
    return false;
  }
  return typeof media.source === "string" && Boolean(media.source.trim());
}

function validateMotionShape(
  motion: unknown,
  sceneId: string,
  label: string,
): ExportManifestV2IntegrityIssue[] {
  if (motion === null) {
    return [];
  }
  if (!isObject(motion)) {
    return [
      issue(
        "INVALID_MEDIA_MOTION",
        `Scene "${sceneId}" ${label} motion must be null or an object.`,
        sceneId,
      ),
    ];
  }
  const issues: ExportManifestV2IntegrityIssue[] = [];
  if (typeof motion.enabled !== "boolean") {
    issues.push(
      issue(
        "INVALID_MEDIA_MOTION",
        `Scene "${sceneId}" ${label} motion.enabled must be a boolean.`,
        sceneId,
      ),
    );
  }
  if (typeof motion.presetId !== "string" || !motion.presetId.trim()) {
    issues.push(
      issue(
        "INVALID_MEDIA_MOTION",
        `Scene "${sceneId}" ${label} motion.presetId must be a non-empty string.`,
        sceneId,
      ),
    );
  }
  if (typeof motion.easing !== "string" || !motion.easing.trim()) {
    issues.push(
      issue(
        "INVALID_MEDIA_MOTION",
        `Scene "${sceneId}" ${label} motion.easing must be a non-empty string.`,
        sceneId,
      ),
    );
  }
  if (!isFiniteNumber(motion.intensity)) {
    issues.push(
      issue(
        "INVALID_MEDIA_MOTION",
        `Scene "${sceneId}" ${label} motion.intensity must be a finite number.`,
        sceneId,
      ),
    );
  }
  return issues;
}

/**
 * Structural media discriminated-union validation.
 * Empty-string sources are structurally allowed (MISSING_MEDIA later).
 * Non-string sources are structurally invalid.
 */
function validateMediaShape(
  media: unknown,
  sceneId: string,
  label: string,
): ExportManifestV2IntegrityIssue[] {
  if (media === null || media === undefined) {
    return [
      issue(
        "INVALID_MEDIA",
        `Scene "${sceneId}" ${label} media is null or missing.`,
        sceneId,
      ),
    ];
  }
  if (!isObject(media)) {
    return [
      issue(
        "INVALID_MEDIA",
        `Scene "${sceneId}" ${label} media must be an object.`,
        sceneId,
      ),
    ];
  }

  const type = media.type;
  if (type === "placeholder") {
    return [];
  }

  if (type !== "image" && type !== "video") {
    return [
      issue(
        "UNKNOWN_MEDIA_TYPE",
        `Scene "${sceneId}" ${label} has unknown media type.`,
        sceneId,
      ),
    ];
  }

  const issues: ExportManifestV2IntegrityIssue[] = [];

  if (typeof media.source !== "string") {
    issues.push(
      issue(
        "INVALID_MEDIA_SOURCE",
        `Scene "${sceneId}" ${label} media.source must be a string.`,
        sceneId,
      ),
    );
  }

  if (media.fitMode !== "fit" && media.fitMode !== "fill") {
    issues.push(
      issue(
        "INVALID_MEDIA_FIT_MODE",
        `Scene "${sceneId}" ${label} fitMode must be "fit" or "fill".`,
        sceneId,
      ),
    );
  }

  for (const field of ["positionX", "positionY", "zoom", "rotationDeg"] as const) {
    if (!isFiniteNumber(media[field])) {
      issues.push(
        issue(
          "INVALID_MEDIA_FRAMING",
          `Scene "${sceneId}" ${label} ${field} must be a finite number.`,
          sceneId,
        ),
      );
    }
  }

  issues.push(...validateMotionShape(media.motion, sceneId, label));

  if (type === "video") {
    for (const field of [
      "sourceDurationMs",
      "trimStartMs",
      "trimEndMs",
    ] as const) {
      if (!isFiniteNumber(media[field])) {
        issues.push(
          issue(
            "INVALID_VIDEO_MEDIA",
            `Scene "${sceneId}" ${label} ${field} must be a finite number.`,
            sceneId,
          ),
        );
      }
    }
    if (media.playbackRate !== 1) {
      issues.push(
        issue(
          "INVALID_VIDEO_PLAYBACK_RATE",
          `Scene "${sceneId}" ${label} playbackRate must be 1.`,
          sceneId,
        ),
      );
    }
    if (media.sourceAudioPolicy !== "muted") {
      issues.push(
        issue(
          "INVALID_VIDEO_AUDIO_POLICY",
          `Scene "${sceneId}" ${label} sourceAudioPolicy must be "muted".`,
          sceneId,
        ),
      );
    }
    if (
      isFiniteNumber(media.trimStartMs) &&
      isFiniteNumber(media.trimEndMs) &&
      media.trimEndMs < media.trimStartMs
    ) {
      issues.push(
        issue(
          "INVALID_VIDEO_TRIM",
          `Scene "${sceneId}" ${label} trimEndMs must be >= trimStartMs.`,
          sceneId,
        ),
      );
    }
    if (
      isFiniteNumber(media.sourceDurationMs) &&
      media.sourceDurationMs < 0
    ) {
      issues.push(
        issue(
          "INVALID_VIDEO_MEDIA",
          `Scene "${sceneId}" ${label} sourceDurationMs must be non-negative.`,
          sceneId,
        ),
      );
    }
  }

  return issues;
}

/**
 * Shared scene mediaTimeline integrity (v2/v3). Does not inspect mediaTransitions.
 * Exported so v3 can reuse frozen media/timing invariants without repairing.
 */
export function validateExportSceneMediaTimelineFields(
  scene: unknown,
  sceneIndex: number,
): ExportManifestV2IntegrityIssue[] {
  return validateScene(scene, sceneIndex);
}

function validateScene(scene: unknown, sceneIndex: number): ExportManifestV2IntegrityIssue[] {
  if (scene === null || scene === undefined) {
    return [
      issue(
        "INVALID_SCENE",
        `Scene at index ${sceneIndex} is null or missing.`,
      ),
    ];
  }
  if (!isObject(scene)) {
    return [
      issue(
        "INVALID_SCENE",
        `Scene at index ${sceneIndex} must be an object.`,
      ),
    ];
  }

  const issues: ExportManifestV2IntegrityIssue[] = [];
  const sceneId =
    typeof scene.id === "string" && scene.id.trim()
      ? scene.id
      : `index:${sceneIndex}`;

  if (typeof scene.id !== "string" || !scene.id.trim()) {
    issues.push(
      issue(
        "INVALID_SCENE_ID",
        `Scene at index ${sceneIndex} has a missing or empty id.`,
      ),
    );
  }

  if (
    !isFiniteNumber(scene.startMs) ||
    !isFiniteNumber(scene.durationMs) ||
    !isFiniteNumber(scene.endMs) ||
    scene.durationMs <= 0 ||
    scene.startMs + scene.durationMs !== scene.endMs
  ) {
    issues.push(
      issue(
        "INVALID_SCENE_TIMING",
        `Scene "${sceneId}" has invalid or non-finite scene timing.`,
        sceneId,
      ),
    );
  }

  if (typeof scene.hasDrawableMedia !== "boolean") {
    issues.push(
      issue(
        "INVALID_HAS_DRAWABLE_MEDIA",
        `Scene "${sceneId}" hasDrawableMedia must be a boolean.`,
        sceneId,
      ),
    );
  }

  const timeline = scene.mediaTimeline;
  if (timeline === null || timeline === undefined || !isObject(timeline)) {
    issues.push(
      issue(
        "INVALID_MEDIA_TIMELINE",
        `Scene "${sceneId}" mediaTimeline is missing or not an object.`,
        sceneId,
      ),
    );
    return issues;
  }

  if (timeline.version !== 1) {
    issues.push(
      issue(
        "INVALID_MEDIA_TIMELINE_VERSION",
        `Scene "${sceneId}" mediaTimeline.version must be 1.`,
        sceneId,
      ),
    );
    return issues;
  }

  const items = timeline.items;
  if (!Array.isArray(items) || items.length === 0) {
    issues.push(
      issue(
        "EMPTY_MEDIA_TIMELINE",
        `Scene "${sceneId}" mediaTimeline.items must be non-empty.`,
        sceneId,
      ),
    );
    return issues;
  }

  const seenIds = new Set<string>();
  let allItemsStructurallyTimed = true;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === null || item === undefined || !isObject(item)) {
      issues.push(
        issue(
          "INVALID_MEDIA_ITEM",
          `Scene "${sceneId}" mediaTimeline.items[${index}] is null or not an object.`,
          sceneId,
        ),
      );
      allItemsStructurallyTimed = false;
      continue;
    }

    if (typeof item.id !== "string" || !item.id.trim()) {
      issues.push(
        issue(
          "INVALID_MEDIA_ITEM_ID",
          `Scene "${sceneId}" has an empty media item id.`,
          sceneId,
        ),
      );
    } else if (seenIds.has(item.id)) {
      issues.push(
        issue(
          "DUPLICATE_MEDIA_ITEM_ID",
          `Scene "${sceneId}" has duplicate media item id.`,
          sceneId,
        ),
      );
    } else {
      seenIds.add(item.id);
    }

    if (!isFiniteNumber(item.index) || item.index !== index) {
      issues.push(
        issue(
          "INVALID_MEDIA_ITEM_INDEX",
          `Scene "${sceneId}" media item index must match array order.`,
          sceneId,
        ),
      );
    }

    const startOffsetMs = item.startOffsetMs;
    const endOffsetMs = item.endOffsetMs;
    const durationMs = item.durationMs;
    const timingOk =
      isFiniteNumber(startOffsetMs) &&
      isFiniteNumber(endOffsetMs) &&
      isFiniteNumber(durationMs) &&
      startOffsetMs >= 0 &&
      endOffsetMs >= 0 &&
      durationMs >= 0;
    if (!timingOk) {
      issues.push(
        issue(
          "INVALID_MEDIA_ITEM_TIMING",
          `Scene "${sceneId}" has non-finite or negative media window timing.`,
          sceneId,
        ),
      );
      allItemsStructurallyTimed = false;
    } else if (
      isFiniteNumber(startOffsetMs) &&
      isFiniteNumber(endOffsetMs) &&
      isFiniteNumber(durationMs) &&
      durationMs !== endOffsetMs - startOffsetMs
    ) {
      issues.push(
        issue(
          "INVALID_MEDIA_ITEM_DURATION",
          `Scene "${sceneId}" media durationMs must equal endOffsetMs - startOffsetMs.`,
          sceneId,
        ),
      );
    }

    issues.push(...validateMediaShape(item.media, sceneId, `item[${index}]`));
  }

  const first = items[0];
  const last = items[items.length - 1];

  if (isObject(first) && isFiniteNumber(first.startOffsetMs) && first.startOffsetMs !== 0) {
    issues.push(
      issue(
        "MEDIA_TIMELINE_MUST_START_AT_ZERO",
        `Scene "${sceneId}" first media item must start at 0.`,
        sceneId,
      ),
    );
  }

  if (allItemsStructurallyTimed) {
    for (let index = 1; index < items.length; index += 1) {
      const prev = items[index - 1];
      const curr = items[index];
      if (!isObject(prev) || !isObject(curr)) {
        continue;
      }
      if (
        !isFiniteNumber(prev.endOffsetMs) ||
        !isFiniteNumber(curr.startOffsetMs)
      ) {
        continue;
      }
      if (curr.startOffsetMs < prev.endOffsetMs) {
        issues.push(
          issue(
            "OVERLAPPING_MEDIA_WINDOWS",
            `Scene "${sceneId}" media windows must not overlap.`,
            sceneId,
          ),
        );
        break;
      }
      if (curr.startOffsetMs > prev.endOffsetMs) {
        issues.push(
          issue(
            "NON_CONTIGUOUS_MEDIA_WINDOWS",
            `Scene "${sceneId}" media windows must be contiguous.`,
            sceneId,
          ),
        );
        break;
      }
    }
  }

  if (
    isObject(last) &&
    isFiniteNumber(last.endOffsetMs) &&
    isFiniteNumber(scene.durationMs) &&
    last.endOffsetMs !== scene.durationMs
  ) {
    issues.push(
      issue(
        "MEDIA_TIMELINE_MUST_END_AT_SCENE_DURATION",
        `Scene "${sceneId}" final media item must end at scene duration.`,
        sceneId,
      ),
    );
  }

  issues.push(...validateMediaShape(scene.media, sceneId, "compatibility"));

  if (
    isObject(first) &&
    first.media !== undefined &&
    scene.media !== undefined &&
    !exportMediaManifestSemanticallyEqual(scene.media, first.media)
  ) {
    issues.push(
      issue(
        "COMPATIBILITY_MEDIA_MISMATCH",
        `Scene "${sceneId}" compatibility media must equal the first timeline item.`,
        sceneId,
      ),
    );
  }

  if (typeof scene.hasDrawableMedia === "boolean") {
    let expectedDrawable = false;
    for (const item of items) {
      if (isObject(item) && isDrawableCanonicalMedia(item.media)) {
        expectedDrawable = true;
        break;
      }
    }
    if (scene.hasDrawableMedia !== expectedDrawable) {
      issues.push(
        issue(
          "INVALID_HAS_DRAWABLE_MEDIA",
          `Scene "${sceneId}" hasDrawableMedia does not match canonical timeline media.`,
          sceneId,
        ),
      );
    }
  }

  return issues;
}

function validateExportManifestV2SceneMediaInner(
  manifest: unknown,
): ExportManifestV2IntegrityResult {
  if (manifest === null || manifest === undefined || !isObject(manifest)) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_MANIFEST",
          "ExportManifest must be a non-null object.",
        ),
      ],
    };
  }

  const issues: ExportManifestV2IntegrityIssue[] = [];

  if (manifest.version !== EXPORT_MANIFEST_V2_VERSION) {
    issues.push(
      issue(
        "UNSUPPORTED_MANIFEST_VERSION",
        `ExportManifest v2 version must be ${EXPORT_MANIFEST_V2_VERSION}.`,
      ),
    );
  }
  if (manifest.rendererContractVersion !== EXPORT_RENDERER_CONTRACT_V2) {
    issues.push(
      issue(
        "UNSUPPORTED_RENDERER_CONTRACT",
        `ExportManifest v2 renderer contract must be "${EXPORT_RENDERER_CONTRACT_V2}".`,
      ),
    );
  }
  // V3-only fields must not masquerade as valid v2.
  if (Array.isArray(manifest.scenes)) {
    for (let index = 0; index < manifest.scenes.length; index += 1) {
      const scene = manifest.scenes[index];
      if (
        isObject(scene) &&
        Object.prototype.hasOwnProperty.call(scene, "mediaTransitions")
      ) {
        issues.push(
          issue(
            "V3_FIELDS_ON_V2_MANIFEST",
            "ExportManifest v2 scenes must not include mediaTransitions.",
            typeof scene.id === "string" ? scene.id : undefined,
          ),
        );
      }
    }
  }

  const fingerprintIssue = verifyExportManifestFingerprintCoherence(manifest);
  if (fingerprintIssue) {
    issues.push(
      issue(fingerprintIssue.code, fingerprintIssue.message),
    );
  }

  if (!Array.isArray(manifest.scenes)) {
    issues.push(
      issue("MISSING_SCENES", "ExportManifest.scenes is required."),
    );
    return { ok: false, issues };
  }

  for (let index = 0; index < manifest.scenes.length; index += 1) {
    issues.push(...validateScene(manifest.scenes[index], index));
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Validates ExportManifest v2 + per-scene mediaTimeline integrity.
 * Total over runtime-unknown input — never throws.
 */
export function validateExportManifestV2SceneMedia(
  manifest: unknown,
): ExportManifestV2IntegrityResult {
  try {
    return validateExportManifestV2SceneMediaInner(manifest);
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

export function assertExportManifestV2SceneMedia(manifest: unknown): void {
  const result = validateExportManifestV2SceneMedia(manifest);
  if (!result.ok) {
    const first = result.issues[0]!;
    throw new Error(
      `ExportManifest v2 integrity failed (${first.code}): ${first.message}`,
    );
  }
}
