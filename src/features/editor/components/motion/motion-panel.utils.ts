import type { SceneImageMotion, SceneImageMotionIntensity, SceneImageMotionType } from "@/features/story/types";
import { normalizeSceneImageMotion, normalizeSceneImageMotionType } from "@/features/story/utils";
import type { ImageMotionPreset } from "@/features/timeline-intelligence/image-motion-presets.utils";

export type MotionPanelCategory = "static" | "animated";

export interface MotionSpeedOption {
  label: string;
  value: SceneImageMotionIntensity;
  title: string;
}

/** Display labels map to existing runtime intensity values. */
export const MOTION_SPEED_OPTIONS: readonly MotionSpeedOption[] = [
  { label: "Slow", value: "subtle", title: "Gentle movement" },
  { label: "Normal", value: "medium", title: "Moderate movement" },
  { label: "Fast", value: "strong", title: "Strong movement" },
] as const;

export function motionTypeToInspectorPreset(type: SceneImageMotionType): ImageMotionPreset {
  switch (type) {
    case "none":
      return "static";
    case "zoom-in":
      return "slow-zoom-in";
    case "zoom-out":
      return "slow-zoom-out";
    default:
      return type;
  }
}

export function inspectorPresetToMotionType(preset: ImageMotionPreset): SceneImageMotionType {
  switch (preset) {
    case "static":
      return "none";
    case "slow-zoom-in":
      return "zoom-in";
    case "slow-zoom-out":
      return "zoom-out";
    default:
      return preset;
  }
}

export function resolveMotionPanelCategory(
  imageMotion: SceneImageMotion | undefined,
  animatedPreview: boolean,
): MotionPanelCategory {
  const activeType = normalizeSceneImageMotionType(normalizeSceneImageMotion(imageMotion).type);
  const activePreset = motionTypeToInspectorPreset(activeType);

  if (activePreset !== "static") {
    return "animated";
  }

  return animatedPreview ? "animated" : "static";
}

/** Scrolls to the studio preview and triggers the existing Voice preview control. */
export function invokeStudioPreviewMotion(): void {
  document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });

  window.setTimeout(() => {
    document.querySelector<HTMLButtonElement>('[data-preview-action="voice"]')?.click();
  }, 320);
}
