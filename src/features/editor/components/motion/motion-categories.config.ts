import { Layers2, MoveHorizontal, ZoomIn, type LucideIcon } from "lucide-react";

import type { ImageMotionPreset } from "@/features/timeline-intelligence/image-motion-presets.utils";

export interface MotionPresetOption {
  id: ImageMotionPreset;
  label: string;
}

export interface MotionCategoryDefinition {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  presets: MotionPresetOption[];
}

/** Grouped animated presets — IDs match runtime ImageMotionPreset values. */
export const MOTION_CATEGORIES: readonly MotionCategoryDefinition[] = [
  {
    id: "zoom",
    title: "Zoom",
    description: "Gradually zoom in or out during the scene.",
    icon: ZoomIn,
    presets: [
      { id: "slow-zoom-in", label: "Zoom In" },
      { id: "slow-zoom-out", label: "Zoom Out" },
    ],
  },
  {
    id: "pan",
    title: "Pan",
    description: "Pan across the frame during playback.",
    icon: MoveHorizontal,
    presets: [
      { id: "pan-left", label: "Left" },
      { id: "pan-right", label: "Right" },
      { id: "pan-up", label: "Up" },
      { id: "pan-down", label: "Down" },
    ],
  },
  {
    id: "combination",
    title: "Combination",
    description: "Pan and zoom together for dynamic movement.",
    icon: Layers2,
    presets: [
      { id: "pan-left-zoom-in", label: "Pan Left + Zoom" },
      { id: "pan-right-zoom-in", label: "Pan Right + Zoom" },
      { id: "pan-up-zoom-in", label: "Pan Up + Zoom" },
      { id: "pan-down-zoom-in", label: "Pan Down + Zoom" },
    ],
  },
] as const;

export function motionCategoryContainsPreset(
  category: MotionCategoryDefinition,
  preset: ImageMotionPreset,
): boolean {
  return category.presets.some((option) => option.id === preset);
}

export function resolveDefaultOpenCategoryId(activePreset: ImageMotionPreset): string {
  if (activePreset === "static") {
    return "zoom";
  }

  const match = MOTION_CATEGORIES.find((category) => motionCategoryContainsPreset(category, activePreset));
  return match?.id ?? "zoom";
}
