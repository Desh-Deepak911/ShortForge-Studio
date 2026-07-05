import { resolveCaptionAnimationDiagnostics } from "./caption-animation.engine";
import { resolveCaptionAnimationFieldSources } from "./caption-animation.utils";
import { resolveMotionPresetDiagnostics } from "@/features/caption-animation-presets";
import type { CaptionAnimationResolveInput } from "./caption-animation.types";

export interface CaptionAnimationDebugSummary {
  animationPreset: string;
  animationSource: string;
  progress: number;
  phase: string;
  visible: boolean;
  resolvedAnimationPreset: string;
  durationSource: string;
  delaySource: string;
  easingSource: string;
  directionSource: string;
  intensitySource: string;
  motionPresetId?: string;
  motionPresetSource: string;
  resolvedMotionPresetLabel?: string;
  sceneOverrideKeys: string[];
  projectDefaultKeys: string[];
}

/** Dev-only caption animation diagnostics — no production logging. */
export function buildCaptionAnimationDebugSummary(
  input: CaptionAnimationResolveInput = {},
): CaptionAnimationDebugSummary {
  const diagnostics = resolveCaptionAnimationDiagnostics(input);
  const fieldSources = resolveCaptionAnimationFieldSources(input);
  const motionPreset = resolveMotionPresetDiagnostics(input);

  return {
    animationPreset: diagnostics.animationPreset,
    animationSource: diagnostics.animationSource,
    progress: diagnostics.progress,
    phase: diagnostics.phase,
    visible: diagnostics.visible,
    resolvedAnimationPreset: diagnostics.resolvedAnimation.preset ?? "fade",
    durationSource: fieldSources.durationSource,
    delaySource: fieldSources.delaySource,
    easingSource: fieldSources.easingSource,
    directionSource: fieldSources.directionSource,
    intensitySource: fieldSources.intensitySource,
    motionPresetId: motionPreset.motionPresetId,
    motionPresetSource: motionPreset.motionPresetSource,
    resolvedMotionPresetLabel: motionPreset.resolvedMotionPreset?.label,
    sceneOverrideKeys: input.sceneAnimation ? Object.keys(input.sceneAnimation) : [],
    projectDefaultKeys: input.projectAnimation ? Object.keys(input.projectAnimation) : [],
  };
}

export function logCaptionAnimationDebugSummary(
  input: CaptionAnimationResolveInput = {},
  label = "caption-animation-debug",
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[FootieBitz ${label}]`, buildCaptionAnimationDebugSummary(input));
}
