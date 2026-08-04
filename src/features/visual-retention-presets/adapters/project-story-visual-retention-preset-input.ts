/**
 * Project a FootieScript into detached Visual Retention Preset planning facts.
 *
 * Read-only leaf adapter. Imports projection/normalize leaves directly — never
 * broad feature barrels or authoring commands. Does not mutate the story.
 *
 * Mixed-media authority is explicit via `mixedMediaScenesEnabled`:
 * - true: usable authoritative visualSequence wins through projectSceneVisualPlan
 * - false/omitted/malformed: force-off legacy/timeline projection; sequence ignored
 */

import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import {
  ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS,
  ENGAGEMENT_OVERLAY_KIND_OPTIONS,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS,
  ENGAGEMENT_OVERLAY_PRESET_ID,
} from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { resolveEngagementOverlayWindow } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-window";
import { resolveSceneMediaFraming } from "@/features/media-framing/resolve-scene-media-framing";
import { normalizeMediaMotionKeyframes } from "@/features/media-motion/domain/media-motion-keyframes";
import { normalizeSceneMediaVisualEffect } from "@/features/media-motion/domain/resolve-media-visual-effect";
import {
  resolveSceneMediaMotion,
  resolveSceneMediaMotionFromMedia,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion/media-motion.normalize";
import { freezeMediaVisualAdjustments } from "@/features/media-visual-adjustments/normalize-media-visual-adjustments";
import { projectSceneVisualPlan } from "@/features/mixed-media-scenes/adapters/project-visual-sequence";
import { toFramingSnapshot } from "@/features/source-quality/domain/source-quality-adjustment-provenance";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";
import {
  getSceneDurationMs,
  getSceneMedia,
} from "@/features/story/utils/scene.utils";
import {
  readStoredVisualBeatPlan,
  resolveSceneNarrationTextForVisualBeats,
  resolveVisualBeatSourceIdentity,
} from "@/features/visual-beat-density/adapters/project-scene-visual-beat-plan";
import { normalizeVisualBeatNarrationText } from "@/features/visual-beat-density/domain/fingerprint-visual-beat-input";

import type {
  VisualRetentionPresetMediaTargetFactV1,
  VisualRetentionPresetProjectFactsV1,
  VisualRetentionPresetSceneFactV1,
  VisualRetentionPresetStoredBeatPlanFactV1,
} from "../domain/build-visual-retention-preset-plan";
import {
  fingerprintVisualRetentionPresetCanonicalPayload,
  stableStringifyVisualRetentionPresetValue,
} from "../domain/visual-retention-preset-fingerprint";

export interface ProjectStoryVisualRetentionPresetInputOptions {
  /**
   * Explicit mixed-media capability. Only `true` enables sequence authority.
   * Omitted, false, or any non-true value is treated as false.
   */
  readonly mixedMediaScenesEnabled?: boolean;
}

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

function isUsableMediaKind(
  media: SceneMedia | null | undefined,
): media is SceneMedia & { type: "image" | "video" } {
  return media != null && (media.type === "image" || media.type === "video");
}

function projectStoredBeatPlan(
  scene: FootieScene,
  currentStartOffsetsMs: readonly number[],
): VisualRetentionPresetStoredBeatPlanFactV1 | null {
  const stored = readStoredVisualBeatPlan(scene);
  if (!stored) return null;
  // Detach a plain JSON-safe copy so planner never retains story references.
  try {
    return {
      storedPlan: JSON.parse(JSON.stringify(stored)) as unknown,
      currentStartOffsetsMs: Object.freeze([...currentStartOffsetsMs]),
    };
  } catch {
    return null;
  }
}

function projectMediaTarget(input: {
  readonly scene: FootieScene;
  readonly sceneId: string;
  readonly media: SceneMedia;
  readonly mediaItemId: string | null;
  readonly orderedIndex: number;
  readonly mediaWindowDurationMs: number;
  readonly useLegacySceneMotionFallback: boolean;
}): VisualRetentionPresetMediaTargetFactV1 {
  const motion = input.useLegacySceneMotionFallback
    ? resolveSceneMediaMotion(input.scene)
    : resolveSceneMediaMotionFromMedia(input.media);
  const keyframes = normalizeMediaMotionKeyframes(motion.keyframes, {
    mediaWindowDurationMs: input.mediaWindowDurationMs,
  });
  const look = normalizeSceneMediaVisualEffect(input.media.visualEffect);
  const freeform = freezeMediaVisualAdjustments(input.media.visualAdjustments);
  const framing = resolveSceneMediaFraming(input.scene, { media: input.media });
  const framingSnapshot = toFramingSnapshot(framing);

  return {
    sceneId: input.sceneId,
    mediaItemId: input.mediaItemId,
    orderedIndex: input.orderedIndex,
    mediaKind: input.media.type as "image" | "video",
    sourceIdentity: resolveVisualBeatSourceIdentity(input.media),
    hasUsableCustomKeyframes: (keyframes?.length ?? 0) >= 2,
    motionEnabled: motion.enabled !== false && motion.presetId !== "static",
    motionPresetId: motion.presetId ?? "static",
    motionIntensity:
      typeof motion.intensity === "number" && Number.isFinite(motion.intensity)
        ? motion.intensity
        : 0,
    motionEasing: motion.easing ?? "linear",
    motionFingerprint: serializeSceneMediaMotionFingerprint(motion),
    lookPresetId: look?.presetId ?? null,
    lookIntensity: look?.intensity ?? null,
    hasFreeformVisualAdjustments: freeform != null,
    freeformAdjustmentsFingerprint: freeform
      ? fingerprintVisualRetentionPresetCanonicalPayload(freeform)
      : null,
    framingFingerprint: fingerprintVisualRetentionPresetCanonicalPayload(
      framingSnapshot,
    ),
  };
}

function projectWinningMediaTargets(
  scene: FootieScene,
  sceneId: string,
  mixedMediaScenesEnabled: boolean,
): readonly VisualRetentionPresetMediaTargetFactV1[] {
  const projected = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled,
  });

  // Mixed-media on + usable authoritative visualSequence: enumerate sequence only.
  if (
    mixedMediaScenesEnabled &&
    projected.fromVisualSequence &&
    projected.windows.length > 0
  ) {
    const targets: VisualRetentionPresetMediaTargetFactV1[] = [];
    let orderedIndex = 0;
    for (const window of projected.windows) {
      if (!isUsableMediaKind(window.media)) continue;
      const itemId =
        typeof window.itemId === "string" ? window.itemId.trim() : "";
      if (!itemId) continue;
      targets.push(
        projectMediaTarget({
          scene,
          sceneId,
          media: window.media,
          mediaItemId: itemId,
          orderedIndex,
          mediaWindowDurationMs: Math.max(1, window.durationMs),
          useLegacySceneMotionFallback: false,
        }),
      );
      orderedIndex += 1;
    }
    return targets;
  }

  // Capability-off / sequence ignored: multi-item timeline windows keep real IDs.
  // Never plan against ignored sequence items.
  if (!mixedMediaScenesEnabled && projected.windows.length > 1) {
    const targets: VisualRetentionPresetMediaTargetFactV1[] = [];
    let orderedIndex = 0;
    for (const window of projected.windows) {
      if (!isUsableMediaKind(window.media)) continue;
      const itemId =
        typeof window.itemId === "string" ? window.itemId.trim() : "";
      if (!itemId) continue;
      targets.push(
        projectMediaTarget({
          scene,
          sceneId,
          media: window.media,
          mediaItemId: itemId,
          orderedIndex,
          mediaWindowDurationMs: Math.max(1, window.durationMs),
          useLegacySceneMotionFallback: false,
        }),
      );
      orderedIndex += 1;
    }
    if (targets.length > 0) return targets;
  }

  // When mixed-media is on but sequence is absent, multi-item timeline may still win.
  if (mixedMediaScenesEnabled && projected.windows.length > 1) {
    const targets: VisualRetentionPresetMediaTargetFactV1[] = [];
    let orderedIndex = 0;
    for (const window of projected.windows) {
      if (!isUsableMediaKind(window.media)) continue;
      const itemId =
        typeof window.itemId === "string" ? window.itemId.trim() : "";
      if (!itemId) continue;
      targets.push(
        projectMediaTarget({
          scene,
          sceneId,
          media: window.media,
          mediaItemId: itemId,
          orderedIndex,
          mediaWindowDurationMs: Math.max(1, window.durationMs),
          useLegacySceneMotionFallback: false,
        }),
      );
      orderedIndex += 1;
    }
    if (targets.length > 0) return targets;
  }

  // Legacy / single-media: canonical scene media with mediaItemId null.
  const media = getSceneMedia(scene);
  if (!isUsableMediaKind(media)) {
    return [];
  }
  const sceneDurationMs = getSceneDurationMs(scene);
  return [
    projectMediaTarget({
      scene,
      sceneId,
      media,
      mediaItemId: null,
      orderedIndex: 0,
      mediaWindowDurationMs: Math.max(1, sceneDurationMs),
      useLegacySceneMotionFallback: true,
    }),
  ];
}

/**
 * Eligible when a normalized window can fit at least the minimum overlay duration.
 * Recipe duration (2500ms) is carried for later command clamping.
 */
function isEngagementEligible(sceneDurationMs: number): boolean {
  if (!Number.isFinite(sceneDurationMs) || sceneDurationMs <= 0) return false;
  if (sceneDurationMs < ENGAGEMENT_OVERLAY_MIN_DURATION_MS) return false;
  const kind = ENGAGEMENT_OVERLAY_KIND_OPTIONS[0]?.id ?? "subscribe";
  const position = ENGAGEMENT_OVERLAY_POSITION_OPTIONS[0]?.id ?? "top-right";
  const startOffsetMs = Math.max(
    0,
    sceneDurationMs - ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS,
  );
  const resolved = resolveEngagementOverlayWindow({
    overlay: {
      version: 1,
      id: "preset-plan-eligibility",
      kind,
      position,
      startOffsetMs,
      durationMs: ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS,
      presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
    },
    sceneDurationMs,
  });
  return resolved.available === true;
}

function projectSceneFact(
  scene: FootieScene,
  storyOrderIndex: number,
  script: FootieScript,
  mixedMediaScenesEnabled: boolean,
): VisualRetentionPresetSceneFactV1 | null {
  const sceneId = typeof scene.id === "string" ? scene.id.trim() : "";
  if (!sceneId) return null;

  const sceneDurationMs = getSceneDurationMs(scene);
  const narrationText = normalizeVisualBeatNarrationText(
    resolveSceneNarrationTextForVisualBeats(scene),
  );
  // Authoritative normalized overlay only — malformed/orphan → absent (no false conflict).
  const overlay = getSceneEngagementOverlay(script, sceneId);
  const mediaTargets = projectWinningMediaTargets(
    scene,
    sceneId,
    mixedMediaScenesEnabled,
  );
  const currentStartOffsetsMs = mediaTargets.map((_, index) => {
    // Offsets are planning inventory markers; beat staleness uses stored starts.
    return index;
  });

  // Prefer sequence/timeline window starts when available via projection.
  const projected = projectSceneVisualPlan(scene, { mixedMediaScenesEnabled });
  const startOffsets =
    projected.windows.length > 0
      ? projected.windows
          .filter((window) => isUsableMediaKind(window.media))
          .map((window) => window.startMs)
      : currentStartOffsetsMs;

  return {
    sceneId,
    storyOrderIndex,
    sceneDurationMs,
    narrationText,
    narrationUsable: narrationText.length > 0,
    engagementEligible: isEngagementEligible(sceneDurationMs),
    hasEngagementOverlay: overlay != null,
    engagementFingerprint: overlay
      ? fingerprintVisualRetentionPresetCanonicalPayload(overlay)
      : null,
    mediaTargets,
    storedBeatPlan: projectStoredBeatPlan(scene, startOffsets),
  };
}

/**
 * Project immutable planning facts from a story. Never mutates `script`.
 */
export function projectStoryVisualRetentionPresetInput(
  script: FootieScript | null | undefined,
  options: ProjectStoryVisualRetentionPresetInputOptions = {},
): VisualRetentionPresetProjectFactsV1 {
  const mixedMediaScenesEnabled = options.mixedMediaScenesEnabled === true;

  if (!script || typeof script !== "object" || !Array.isArray(script.scenes)) {
    return deepFreezeInPlace({
      version: 1 as const,
      mixedMediaScenesEnabled,
      scenes: [],
      brandStingPresent: false,
      brandStingEnabled: false,
      brandStingDurationMs: null,
      brandStingFingerprint: null,
    });
  }

  const scenes: VisualRetentionPresetSceneFactV1[] = [];
  for (let index = 0; index < script.scenes.length; index += 1) {
    const scene = script.scenes[index];
    if (!scene) continue;
    const fact = projectSceneFact(
      scene,
      index,
      script,
      mixedMediaScenesEnabled,
    );
    if (fact) scenes.push(fact);
  }

  // Authoritative normalized sting only — malformed → absent; disabled → not enabled.
  const sting = getShortForgeBrandSting(script.visualRetentionExtensions);
  const brandStingPresent = sting != null;
  const brandStingEnabled = sting?.enabled === true;

  return deepFreezeInPlace({
    version: 1 as const,
    mixedMediaScenesEnabled,
    scenes: Object.freeze(scenes),
    brandStingPresent,
    brandStingEnabled,
    brandStingDurationMs: sting?.durationMs ?? null,
    brandStingFingerprint: sting
      ? fingerprintVisualRetentionPresetCanonicalPayload(sting)
      : null,
  });
}

/** Test helper: prove projection does not depend on object key insertion order. */
export function serializeVisualRetentionPresetFactsForCompare(
  facts: VisualRetentionPresetProjectFactsV1,
): string {
  return stableStringifyVisualRetentionPresetValue(facts);
}
