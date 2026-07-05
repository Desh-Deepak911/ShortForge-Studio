import {
  buildSceneCaptionAnimationPresetPatch,
  CAPTION_ANIMATION_VERSION,
  type CaptionAnimation,
  type CaptionAnimationResolveInput,
} from "@/features/caption-animation";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { normalizeSceneCaptionSettings } from "@/features/story/utils/caption.utils";
import { ensureTimelineItems, syncTimelineSceneRefs } from "@/features/story/utils/timeline.utils";

import {
  CAPTION_MOTION_PRESET_CATEGORY_ORDER,
  CAPTION_MOTION_PRESETS,
  type CaptionMotionPresetCategory,
  type CaptionMotionPresetDefinition,
} from "./caption-animation-presets";

export type CaptionMotionPresetSource = "scene" | "project" | "engine";

const motionPresetById = new Map(
  CAPTION_MOTION_PRESETS.map((preset) => [preset.id, preset]),
);

let motionPresetClipboard: string | null = null;

export function getCaptionMotionPresetRegistry(): CaptionMotionPresetDefinition[] {
  return CAPTION_MOTION_PRESETS;
}

export function getCaptionMotionPreset(
  motionPresetId: string | null | undefined,
): CaptionMotionPresetDefinition | null {
  if (!motionPresetId) {
    return null;
  }

  return motionPresetById.get(motionPresetId) ?? null;
}

export function isKnownCaptionMotionPresetId(motionPresetId: string | null | undefined): boolean {
  return motionPresetId != null && motionPresetById.has(motionPresetId);
}

export function resolveStoredMotionPresetId(
  input: CaptionAnimationResolveInput = {},
): string | undefined {
  return input.sceneAnimation?.motionPresetId ?? input.projectAnimation?.motionPresetId ?? undefined;
}

export function resolveMotionPresetSource(
  input: CaptionAnimationResolveInput = {},
): CaptionMotionPresetSource {
  if (input.sceneAnimation?.motionPresetId) {
    return "scene";
  }

  if (input.projectAnimation?.motionPresetId) {
    return "project";
  }

  return "engine";
}

/** Motion preset config layer — used between project default and engine defaults. */
export function resolveMotionPresetAnimationConfig(
  input: CaptionAnimationResolveInput = {},
): Partial<CaptionAnimation> {
  const motionPresetId = resolveStoredMotionPresetId(input);
  const definition = getCaptionMotionPreset(motionPresetId);
  if (!definition) {
    return {};
  }

  return { ...definition.config };
}

export function getCaptionMotionPresetsByCategory(): Array<{
  category: CaptionMotionPresetCategory;
  presets: CaptionMotionPresetDefinition[];
}> {
  return CAPTION_MOTION_PRESET_CATEGORY_ORDER.map((category) => ({
    category,
    presets: CAPTION_MOTION_PRESETS.filter((preset) => preset.category === category),
  }));
}

export function buildCaptionAnimationFromMotionPreset(
  motionPresetId: string,
  existing?: Partial<CaptionAnimation> | null,
): CaptionAnimation | null {
  const definition = getCaptionMotionPreset(motionPresetId);
  if (!definition) {
    return null;
  }

  return {
    version: CAPTION_ANIMATION_VERSION,
    ...(existing ?? {}),
    motionPresetId,
    ...definition.config,
  };
}

export function buildApplyMotionPresetPatch(
  motionPresetId: string,
  existing?: Partial<CaptionAnimation> | null,
): Pick<FootieScene, "captionAnimation" | "subtitleEffect"> | null {
  const animation = buildCaptionAnimationFromMotionPreset(motionPresetId, existing);
  if (!animation) {
    return null;
  }

  return buildSceneCaptionAnimationPresetPatch(animation);
}

export function buildResetMotionPresetPatch(
  scene: Pick<FootieScene, "captionAnimation">,
): Pick<FootieScene, "captionAnimation" | "subtitleEffect"> | null {
  if (!scene.captionAnimation?.motionPresetId) {
    return null;
  }

  const rest = { ...scene.captionAnimation };
  delete rest.motionPresetId;
  const remainingKeys = Object.keys(rest).filter((key) => key !== "version");

  if (remainingKeys.length === 0) {
    return { captionAnimation: undefined, subtitleEffect: "fade-up" };
  }

  return buildSceneCaptionAnimationPresetPatch({
    version: CAPTION_ANIMATION_VERSION,
    ...rest,
  });
}

export function getMotionPresetClipboard(): string | null {
  return motionPresetClipboard;
}

export function copyMotionPresetToClipboard(motionPresetId: string): void {
  if (!isKnownCaptionMotionPresetId(motionPresetId)) {
    return;
  }

  motionPresetClipboard = motionPresetId;
}

export function clearMotionPresetClipboard(): void {
  motionPresetClipboard = null;
}

export function buildMotionPresetPastePatch(
  scene: Pick<FootieScene, "captionAnimation">,
): Pick<FootieScene, "captionAnimation" | "subtitleEffect"> | null {
  if (!motionPresetClipboard) {
    return null;
  }

  return buildApplyMotionPresetPatch(motionPresetClipboard, scene.captionAnimation);
}

export function buildProjectDefaultMotionPresetPatch(
  scene: Pick<FootieScene, "captionAnimation">,
  script: Pick<FootieScript, "defaultCaptionAnimation">,
): { defaultCaptionAnimation: CaptionAnimation } | null {
  const motionPresetId =
    scene.captionAnimation?.motionPresetId ?? script.defaultCaptionAnimation?.motionPresetId;
  if (!motionPresetId) {
    return null;
  }

  const animation = buildCaptionAnimationFromMotionPreset(
    motionPresetId,
    script.defaultCaptionAnimation,
  );
  if (!animation) {
    return null;
  }

  return { defaultCaptionAnimation: animation };
}

function syncPresentationScenes(script: FootieScript, scenes: FootieScene[]): FootieScript {
  const timelineItems = syncTimelineSceneRefs(
    scenes,
    ensureTimelineItems(scenes, script.timelineItems),
  );

  return { ...script, scenes, timelineItems };
}

export function applyMotionPresetToAllScenes(
  script: FootieScript,
  sourceSceneId: string,
): FootieScript | null {
  const sourceScene = script.scenes.find((scene) => scene.id === sourceSceneId);
  const motionPresetId = sourceScene?.captionAnimation?.motionPresetId;
  if (!sourceScene || !motionPresetId) {
    return null;
  }

  const patch = buildApplyMotionPresetPatch(motionPresetId);
  if (!patch) {
    return null;
  }

  const scenes = script.scenes.map((scene) =>
    normalizeSceneCaptionSettings({ ...scene, ...patch }),
  );

  return syncPresentationScenes(script, scenes);
}

export function resolveMotionPresetWorkflowContext(
  scene: Pick<FootieScene, "captionAnimation">,
): { hasMotionPresetClipboard: boolean; hasMotionPreset: boolean } {
  return {
    hasMotionPresetClipboard: motionPresetClipboard != null,
    hasMotionPreset: Boolean(scene.captionAnimation?.motionPresetId),
  };
}

export interface ResolvedMotionPresetDiagnostics {
  motionPresetId?: string;
  motionPresetSource: CaptionMotionPresetSource;
  resolvedMotionPreset: CaptionMotionPresetDefinition | null;
}

export function resolveMotionPresetDiagnostics(
  input: CaptionAnimationResolveInput = {},
): ResolvedMotionPresetDiagnostics {
  const motionPresetId = resolveStoredMotionPresetId(input);
  return {
    motionPresetId,
    motionPresetSource: resolveMotionPresetSource(input),
    resolvedMotionPreset: getCaptionMotionPreset(motionPresetId),
  };
}
