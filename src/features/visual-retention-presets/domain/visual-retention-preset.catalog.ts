/**
 * Immutable built-in Visual Retention Preset catalog (version 1).
 *
 * Pure data + lookup helpers. No React, commands, story mutation, preview,
 * export, environment, network, or provider coupling.
 *
 * `requiredAuthoringCapabilities` is always produced by
 * `deriveVisualRetentionPresetAuthoringCapabilities` — never hand-maintained
 * beside each preset definition.
 */

import { isBrandStingDurationMs } from "@/features/brand-sting/domain/brand-sting.presets";
import {
  ENGAGEMENT_OVERLAY_KIND_OPTIONS,
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS,
} from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import { MEDIA_MOTION_PRESETS } from "@/features/media-motion/media-motion.presets";
import { isMediaVisualEffectPresetId } from "@/features/media-motion/domain/media-visual-effect-presets";
import {
  VISUAL_RETENTION_CAPABILITY_IDS,
  type VisualRetentionCapabilityId,
} from "@/features/visual-retention/domain/visual-retention-capabilities";

import {
  isVisualRetentionPresetId,
  VISUAL_RETENTION_PRESET_CATALOG_VERSION,
  type VisualRetentionPresetDefinitionV1,
  type VisualRetentionPresetId,
  type VisualRetentionPresetMotionPresetId,
  type VisualRetentionPresetPreservationV1,
  type VisualRetentionPresetRecipeV1,
} from "./visual-retention-preset.types";

const VALID_DENSITIES = new Set(["fast", "balanced", "studio"]);

const REGISTERED_MOTION_IDS = new Set(
  MEDIA_MOTION_PRESETS.map((preset) => preset.id),
);

const ALLOWED_MOTION_RECIPE_IDS = new Set<VisualRetentionPresetMotionPresetId>([
  "slow-zoom-in",
  "sports-punch",
  "gentle-drift",
]);

const ENGAGEMENT_KINDS = new Set(
  ENGAGEMENT_OVERLAY_KIND_OPTIONS.map((option) => option.id),
);
const ENGAGEMENT_POSITIONS = new Set(
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS.map((option) => option.id),
);

const UNIVERSAL_PRESERVATION: VisualRetentionPresetPreservationV1 =
  Object.freeze({
    version: 1 as const,
    narrationAndVoice: true,
    musicAudioMixer: true,
    sceneDurations: true,
    mediaOrdering: true,
    manualFraming: true,
    freeformVisualAdjustments: true,
    captionStyleAndAnimation: true,
    subjectFocus: true,
    sourceQualityProvenance: true,
    subjectAwareFramingProvenance: true,
    customKeyframes: true,
    engagementOverlays: true,
    shortForgeOutro: true,
  });

function deepFreezeInPlace<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreezeInPlace(item, seen);
    }
    return Object.freeze(value);
  }
  for (const key of Object.keys(value as object)) {
    deepFreezeInPlace((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function assertFiniteInRange(
  value: number,
  min: number,
  max: number,
  label: string,
  exclusiveMin = false,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  const below = exclusiveMin ? value <= min : value < min;
  if (below || value > max) {
    throw new Error(
      `${label} must be in ${exclusiveMin ? "(" : "["}${min}, ${max}].`,
    );
  }
}

/**
 * Construction-time recipe validation against existing closed contracts.
 * Fails loudly if a catalog author introduces an impossible recipe state.
 */
export function assertValidVisualRetentionPresetRecipe(
  recipe: VisualRetentionPresetRecipeV1,
): void {
  if (recipe.version !== 1) {
    throw new Error("Preset recipe version must be 1.");
  }
  if (recipe.pacing.mode !== "suggest") {
    throw new Error("Pacing mode must be suggest.");
  }
  if (!VALID_DENSITIES.has(recipe.pacing.density)) {
    throw new Error(`Unknown pacing density: ${recipe.pacing.density}`);
  }

  if (recipe.motion.mode !== "apply-if-no-keyframes") {
    throw new Error("Motion mode must be apply-if-no-keyframes.");
  }
  // Widen for construction-time defense against unsafe casts at catalog edges.
  const motionPresetId = recipe.motion.presetId as string;
  if (!REGISTERED_MOTION_IDS.has(motionPresetId)) {
    throw new Error(`Motion preset is not registered: ${motionPresetId}`);
  }
  if (
    motionPresetId === "static" ||
    motionPresetId === "custom" ||
    !ALLOWED_MOTION_RECIPE_IDS.has(
      motionPresetId as VisualRetentionPresetMotionPresetId,
    )
  ) {
    throw new Error(
      `Motion preset cannot be static/custom/unlisted: ${motionPresetId}`,
    );
  }
  assertFiniteInRange(recipe.motion.intensity, 0, 1, "Motion intensity");

  if (recipe.look.mode === "preserve") {
    if ("presetId" in recipe.look || "intensity" in recipe.look) {
      throw new Error("Look preserve must not carry presetId/intensity.");
    }
  } else if (recipe.look.mode === "apply") {
    const lookPresetId = recipe.look.presetId as string;
    if (!isMediaVisualEffectPresetId(lookPresetId) || lookPresetId === "none") {
      throw new Error(`Look apply rejects none/unknown: ${lookPresetId}`);
    }
    assertFiniteInRange(recipe.look.intensity, 0, 1, "Look intensity", true);
  } else {
    throw new Error("Look mode must be preserve or apply.");
  }

  if (recipe.engagement.mode === "preserve") {
    if (
      "kind" in recipe.engagement ||
      "position" in recipe.engagement ||
      "durationMs" in recipe.engagement ||
      "timingPolicy" in recipe.engagement
    ) {
      throw new Error("Engagement preserve must not carry CTA fields.");
    }
  } else if (recipe.engagement.mode === "add-if-absent") {
    if (!ENGAGEMENT_KINDS.has(recipe.engagement.kind)) {
      throw new Error(`Unknown engagement kind: ${recipe.engagement.kind}`);
    }
    if (!ENGAGEMENT_POSITIONS.has(recipe.engagement.position)) {
      throw new Error(
        `Engagement position not in UI allowlist: ${recipe.engagement.position}`,
      );
    }
    if (recipe.engagement.timingPolicy !== "closing-scene") {
      throw new Error("Engagement timingPolicy must be closing-scene.");
    }
    assertFiniteInRange(
      recipe.engagement.durationMs,
      ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
      ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
      "Engagement durationMs",
    );
  } else {
    throw new Error("Engagement mode must be preserve or add-if-absent.");
  }

  if (recipe.outro.mode === "preserve") {
    if ("durationMs" in recipe.outro) {
      throw new Error("Outro preserve must not carry durationMs.");
    }
  } else if (recipe.outro.mode === "enable-if-absent") {
    if (!isBrandStingDurationMs(recipe.outro.durationMs)) {
      throw new Error(`Outro duration must be fixed brand-sting value.`);
    }
  } else {
    throw new Error("Outro mode must be preserve or enable-if-absent.");
  }
}

/**
 * Derive required authoring capabilities from recipe actions only.
 * Deduplicated and ordered by VISUAL_RETENTION_CAPABILITY_IDS.
 * Never infers one capability from another; never adds renderer-only IDs.
 */
export function deriveVisualRetentionPresetAuthoringCapabilities(
  recipe: VisualRetentionPresetRecipeV1,
): readonly VisualRetentionCapabilityId[] {
  const needed = new Set<VisualRetentionCapabilityId>([
    "visual-retention-presets-v1",
  ]);

  if (recipe.pacing.mode === "suggest") {
    needed.add("visual-beat-density-v1");
  }
  // Legacy motion apply-if-no-keyframes adds no capability.
  if (recipe.look.mode === "apply") {
    needed.add("keyframed-visual-effects-v1");
  }
  if (recipe.engagement.mode === "add-if-absent") {
    needed.add("engagement-overlays-v1");
  }
  if (recipe.outro.mode === "enable-if-absent") {
    needed.add("shortforge-brand-sting-v1");
  }

  return Object.freeze(
    VISUAL_RETENTION_CAPABILITY_IDS.filter((id) => needed.has(id)),
  );
}

function definePreset(
  input: Omit<
    VisualRetentionPresetDefinitionV1,
    "version" | "preserves" | "requiredAuthoringCapabilities"
  > & {
    readonly recipe: VisualRetentionPresetRecipeV1;
  },
): VisualRetentionPresetDefinitionV1 {
  assertValidVisualRetentionPresetRecipe(input.recipe);
  const recipe = deepFreezeInPlace(input.recipe);
  return deepFreezeInPlace({
    version: 1 as const,
    id: input.id,
    title: input.title,
    description: input.description,
    recommendedFor: input.recommendedFor,
    previewCopy: input.previewCopy,
    recipe,
    preserves: UNIVERSAL_PRESERVATION,
    requiredAuthoringCapabilities:
      deriveVisualRetentionPresetAuthoringCapabilities(recipe),
  });
}

const BALANCED_CLARITY = definePreset({
  id: "visual-retention-balanced-clarity",
  title: "Balanced Clarity",
  description:
    "Clear, moderate pacing and gentle motion without promotional additions.",
  recommendedFor: "most stories, explainers, balanced narration",
  previewCopy:
    "Balanced pacing and light motion. Existing looks, prompts, and outro stay unchanged.",
  recipe: {
    version: 1,
    pacing: { mode: "suggest", density: "balanced" },
    motion: {
      mode: "apply-if-no-keyframes",
      presetId: "slow-zoom-in",
      intensity: 0.45,
    },
    look: { mode: "preserve" },
    engagement: { mode: "preserve" },
    outro: { mode: "preserve" },
  },
});

const PULSE_EDIT = definePreset({
  id: "visual-retention-pulse-edit",
  title: "Pulse Edit",
  description:
    "Faster visual beats with punchier motion and a vivid look.",
  recommendedFor: "highlights, fast narration, energetic match content",
  previewCopy:
    "Faster cuts, punchy motion, and a vivid look. Captions, audio, prompts, and outro stay unchanged.",
  recipe: {
    version: 1,
    pacing: { mode: "suggest", density: "fast" },
    motion: {
      mode: "apply-if-no-keyframes",
      presetId: "sports-punch",
      intensity: 0.7,
    },
    look: { mode: "apply", presetId: "vivid", intensity: 0.6 },
    engagement: { mode: "preserve" },
    outro: { mode: "preserve" },
  },
});

const CINEMATIC_HOLD = definePreset({
  id: "visual-retention-cinematic-hold",
  title: "Cinematic Hold",
  description:
    "Longer visual holds, restrained camera movement, and a cinematic grade.",
  recommendedFor: "documentary storytelling, analysis, history",
  previewCopy:
    "Longer holds and a cinematic grade. Existing prompts and outro stay unchanged.",
  recipe: {
    version: 1,
    pacing: { mode: "suggest", density: "studio" },
    motion: {
      mode: "apply-if-no-keyframes",
      presetId: "slow-zoom-in",
      intensity: 0.5,
    },
    look: { mode: "apply", presetId: "cinematic", intensity: 0.5 },
    engagement: { mode: "preserve" },
    outro: { mode: "preserve" },
  },
});

const SHARE_READY = definePreset({
  id: "visual-retention-share-ready",
  title: "Share Ready",
  description:
    "Balanced visual polish with an optional subscribe prompt and ShortForge Studio outro.",
  recommendedFor: "creators explicitly preparing promotional publishing",
  previewCopy:
    "Balanced polish with a subscribe prompt and a 2.5-second ShortForge Studio outro.",
  recipe: {
    version: 1,
    pacing: { mode: "suggest", density: "balanced" },
    motion: {
      mode: "apply-if-no-keyframes",
      presetId: "gentle-drift",
      intensity: 0.6,
    },
    look: { mode: "apply", presetId: "vivid", intensity: 0.4 },
    engagement: {
      mode: "add-if-absent",
      kind: "subscribe",
      position: "top-right",
      durationMs: 2500,
      timingPolicy: "closing-scene",
    },
    outro: { mode: "enable-if-absent", durationMs: 2500 },
  },
});

const CATALOG: readonly VisualRetentionPresetDefinitionV1[] = deepFreezeInPlace([
  BALANCED_CLARITY,
  PULSE_EDIT,
  CINEMATIC_HOLD,
  SHARE_READY,
]);

const BY_ID: ReadonlyMap<
  VisualRetentionPresetId,
  VisualRetentionPresetDefinitionV1
> = new Map(CATALOG.map((preset) => [preset.id, preset]));

if (BY_ID.size !== CATALOG.length) {
  throw new Error("Visual Retention Preset catalog contains duplicate IDs.");
}

if (CATALOG.length !== 4) {
  throw new Error("Visual Retention Preset catalog must contain exactly four presets.");
}

/** Catalog schema version for built-in definitions. */
export function getVisualRetentionPresetCatalogVersion(): typeof VISUAL_RETENTION_PRESET_CATALOG_VERSION {
  return VISUAL_RETENTION_PRESET_CATALOG_VERSION;
}

/**
 * Returns a detached readonly copy of the built-in catalog in stable order.
 * Mutating the returned array cannot affect the backing catalog.
 */
export function listVisualRetentionPresets(): readonly VisualRetentionPresetDefinitionV1[] {
  return Object.freeze([...CATALOG]);
}

/** Fail-closed lookup — unknown IDs return null (never a silent fallback). */
export function getVisualRetentionPresetById(
  id: unknown,
): VisualRetentionPresetDefinitionV1 | null {
  if (!isVisualRetentionPresetId(id)) {
    return null;
  }
  return BY_ID.get(id) ?? null;
}

export function isPromotionalVisualRetentionPreset(
  preset: VisualRetentionPresetDefinitionV1,
): boolean {
  return (
    preset.recipe.engagement.mode === "add-if-absent" ||
    preset.recipe.outro.mode === "enable-if-absent"
  );
}
