"use client";

import { useState } from "react";

import type { ImageMotionPreset } from "@/features/timeline-intelligence/image-motion-presets.utils";
import {
  normalizeSceneImageMotion,
  normalizeSceneImageMotionIntensity,
  normalizeSceneImageMotionType,
} from "@/features/story/utils";
import type { SceneImageMotion } from "@/features/story/types";

import AnimatedPresetsSection from "./AnimatedPresetsSection";
import {
  studioMotionPanelDivider,
  studioMotionPanelRoot,
  studioMotionPanelSection,
} from "./motion-panel.ui";
import MotionSpeedControl from "./MotionSpeedControl";
import MotionTypeSelector from "./MotionTypeSelector";
import PreviewMotionCard from "./PreviewMotionCard";
import {
  inspectorPresetToMotionType,
  motionTypeToInspectorPreset,
  resolveMotionPanelCategory,
  type MotionPanelCategory,
} from "./motion-panel.utils";

export interface MotionPanelProps {
  controlId: string;
  imageMotion?: SceneImageMotion;
  onMotionChange: (patch: Partial<SceneImageMotion>) => void;
}

/**
 * Card-based Motion inspector — Static / Animated type, grouped presets, speed, preview.
 * Presentation only; preset IDs and intensity values map to existing runtime fields.
 */
export default function MotionPanel({ controlId, imageMotion, onMotionChange }: MotionPanelProps) {
  const [animatedPreview, setAnimatedPreview] = useState(false);

  const motion = normalizeSceneImageMotion(imageMotion);
  const activeType = normalizeSceneImageMotionType(motion.type);
  const activeIntensity = normalizeSceneImageMotionIntensity(motion.intensity);
  const activePreset = motionTypeToInspectorPreset(activeType);
  const motionCategory = resolveMotionPanelCategory(imageMotion, animatedPreview);
  const hasAnimatedPreset = activePreset !== "static";
  const showAnimatedControls = motionCategory === "animated" && hasAnimatedPreset;

  const handleCategoryChange = (category: MotionPanelCategory) => {
    if (category === "static") {
      setAnimatedPreview(false);
      onMotionChange({ type: "none" });
      return;
    }

    setAnimatedPreview(true);
  };

  const handlePresetSelect = (preset: ImageMotionPreset) => {
    setAnimatedPreview(false);
    onMotionChange({ type: inspectorPresetToMotionType(preset) });
  };

  const handleIntensityChange = (intensity: SceneImageMotion["intensity"]) => {
    onMotionChange({ intensity });
  };

  return (
    <div className={studioMotionPanelRoot}>
      <section className={studioMotionPanelSection}>
        <MotionTypeSelector
          controlId={controlId}
          value={motionCategory}
          onChange={handleCategoryChange}
        />
      </section>

      {motionCategory === "animated" ? (
        <section className={`${studioMotionPanelSection} ${studioMotionPanelDivider}`}>
          <AnimatedPresetsSection
            activePreset={activePreset}
            onPresetSelect={handlePresetSelect}
          />
        </section>
      ) : null}

      {showAnimatedControls ? (
        <>
          <section className={`${studioMotionPanelSection} ${studioMotionPanelDivider}`}>
            <MotionSpeedControl
              controlId={controlId}
              value={activeIntensity}
              onChange={handleIntensityChange}
            />
          </section>

          <section className={`${studioMotionPanelSection} ${studioMotionPanelDivider}`}>
            <PreviewMotionCard />
          </section>
        </>
      ) : null}
    </div>
  );
}
