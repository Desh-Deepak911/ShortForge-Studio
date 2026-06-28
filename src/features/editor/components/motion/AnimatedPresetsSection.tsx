"use client";

import {
  studioMotionPanelDesc,
  studioMotionPanelHeading,
} from "./motion-panel.ui";
import type { ImageMotionPreset } from "@/features/timeline-intelligence/image-motion-presets.utils";

import MotionCategoryCard from "./MotionCategoryCard";
import {
  MOTION_CATEGORIES,
  resolveDefaultOpenCategoryId,
} from "./motion-categories.config";

export interface AnimatedPresetsSectionProps {
  activePreset: ImageMotionPreset;
  onPresetSelect: (preset: ImageMotionPreset) => void;
}

/**
 * Grouped animated preset categories — Zoom, Pan, Combination.
 */
export default function AnimatedPresetsSection({
  activePreset,
  onPresetSelect,
}: AnimatedPresetsSectionProps) {
  const defaultOpenCategoryId = resolveDefaultOpenCategoryId(activePreset);

  return (
    <div className="min-w-0">
      <p className={studioMotionPanelHeading}>Animated Presets</p>
      <p className={`${studioMotionPanelDesc} mb-3`}>Choose a pan or zoom animation.</p>
      <div className="flex flex-col gap-1.5">
        {MOTION_CATEGORIES.map((category) => (
          <MotionCategoryCard
            key={category.id}
            category={category}
            activePreset={activePreset}
            defaultOpen={category.id === defaultOpenCategoryId}
            onPresetSelect={onPresetSelect}
          />
        ))}
      </div>
    </div>
  );
}
