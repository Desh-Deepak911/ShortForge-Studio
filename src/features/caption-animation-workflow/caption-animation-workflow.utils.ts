import {
  buildResetCaptionAnimationPatch,
  buildSceneCaptionAnimationPresetPatch,
  CAPTION_ANIMATION_VERSION,
  mergeCaptionAnimationSettings,
  type CaptionAnimation,
} from "@/features/caption-animation";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { normalizeSceneCaptionSettings } from "@/features/story/utils/caption.utils";
import { ensureTimelineItems, syncTimelineSceneRefs } from "@/features/story/utils/timeline.utils";

import type { CopyableCaptionAnimation } from "./caption-animation-workflow.types";

let captionAnimationClipboard: CopyableCaptionAnimation | null = null;

export function getCaptionAnimationClipboard(): CopyableCaptionAnimation | null {
  return captionAnimationClipboard;
}

export function copyCaptionAnimationToClipboard(animation: CopyableCaptionAnimation): void {
  captionAnimationClipboard = { ...animation };
}

export function clearCaptionAnimationClipboard(): void {
  captionAnimationClipboard = null;
}

export function extractCopyableCaptionAnimation(
  sceneAnimation?: Partial<CaptionAnimation> | null,
  projectAnimation?: Partial<CaptionAnimation> | null,
): CopyableCaptionAnimation {
  const effective = mergeCaptionAnimationSettings({
    sceneAnimation,
    projectAnimation,
  });

  return {
    version: effective.version ?? CAPTION_ANIMATION_VERSION,
    preset: effective.preset,
    ...(effective.motionPresetId ? { motionPresetId: effective.motionPresetId } : {}),
    ...(effective.durationMs != null ? { durationMs: effective.durationMs } : {}),
    delayMs: effective.delayMs,
    ...(effective.easing ? { easing: effective.easing } : {}),
    direction: effective.direction,
    intensity: effective.intensity,
  };
}

export function buildCaptionAnimationPastePatch(
  animation: CopyableCaptionAnimation,
): Pick<FootieScene, "captionAnimation" | "subtitleEffect"> {
  return buildSceneCaptionAnimationPresetPatch({
    ...animation,
    version: animation.version ?? CAPTION_ANIMATION_VERSION,
  });
}

export function buildProjectDefaultCaptionAnimationPatch(
  scene: Pick<FootieScene, "captionAnimation" | "subtitleEffect">,
  script: Pick<FootieScript, "defaultCaptionAnimation">,
): { defaultCaptionAnimation: CaptionAnimation } {
  return {
    defaultCaptionAnimation: extractCopyableCaptionAnimation(
      scene.captionAnimation,
      script.defaultCaptionAnimation,
    ),
  };
}

function syncPresentationScenes(script: FootieScript, scenes: FootieScene[]): FootieScript {
  const timelineItems = syncTimelineSceneRefs(
    scenes,
    ensureTimelineItems(scenes, script.timelineItems),
  );

  return { ...script, scenes, timelineItems };
}

export function applyCaptionAnimationToAllScenes(
  script: FootieScript,
  sourceSceneId: string,
): FootieScript {
  const sourceScene = script.scenes.find((scene) => scene.id === sourceSceneId);
  if (!sourceScene) {
    return script;
  }

  const patch = buildCaptionAnimationPastePatch(
    extractCopyableCaptionAnimation(
      sourceScene.captionAnimation,
      script.defaultCaptionAnimation,
    ),
  );

  const scenes = script.scenes.map((scene) =>
    normalizeSceneCaptionSettings({ ...scene, ...patch }),
  );

  return syncPresentationScenes(script, scenes);
}

export function resolveCaptionAnimationWorkflowContext(): { hasClipboard: boolean } {
  return {
    hasClipboard: getCaptionAnimationClipboard() != null,
  };
}

export { buildResetCaptionAnimationPatch };
