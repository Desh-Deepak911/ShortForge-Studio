"use client";

import {
  SCENE_IMAGE_MOTION_INTENSITY_OPTIONS,
  SCENE_IMAGE_MOTION_TYPE_OPTIONS,
  normalizeSceneImageMotion,
  normalizeSceneImageMotionIntensity,
  normalizeSceneImageMotionType,
} from "@/features/story/utils";
import {
  studioFieldLabel,
  studioImageFitSegment,
  studioImageFitSegmentActive,
  studioImageFitSegmentedControlStacked,
  studioSubtleText,
} from "@/lib/studioUi";
import type {
  SceneImageMotion,
  SceneImageMotionIntensity,
  SceneImageMotionType,
} from "@/features/story/types";

import { MotionPanel } from "./motion";

interface SceneImageMotionControlProps {
  imageMotion?: SceneImageMotion;
  controlId: string;
  onMotionChange: (patch: Partial<SceneImageMotion>) => void;
  variant?: "default" | "inspector";
}

export default function SceneImageMotionControl({
  imageMotion,
  controlId,
  onMotionChange,
  variant = "default",
}: SceneImageMotionControlProps) {
  if (variant === "inspector") {
    return (
      <MotionPanel
        controlId={controlId}
        imageMotion={imageMotion}
        onMotionChange={onMotionChange}
      />
    );
  }

  const motion = normalizeSceneImageMotion(imageMotion);
  const activeType = normalizeSceneImageMotionType(motion.type);
  const activeIntensity = normalizeSceneImageMotionIntensity(motion.intensity);
  const showKenBurnsIntensity = activeType !== "none";

  const handleTypeChange = (type: SceneImageMotionType) => {
    onMotionChange({ type });
  };

  const handleIntensityChange = (intensity: SceneImageMotionIntensity) => {
    onMotionChange({ intensity });
  };

  return (
    <section
      aria-labelledby={`${controlId}-motion-label`}
      className="space-y-2.5 border-t border-border/15 pt-4"
    >
      <div>
        <p id={`${controlId}-motion-label`} className={`${studioFieldLabel} mb-0`}>
          Image Motion
        </p>
      </div>
      <div
        className={studioImageFitSegmentedControlStacked}
        role="radiogroup"
        aria-labelledby={`${controlId}-motion-label`}
      >
        {SCENE_IMAGE_MOTION_TYPE_OPTIONS.map((option) => {
          const isActive = activeType === option.value;
          const title =
            option.value === "none"
              ? "No motion during playback"
              : option.value === "zoom-in"
                ? "Gradually zoom in during the scene"
                : "Start zoomed and pull back during the scene";

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={title}
              onClick={() => handleTypeChange(option.value)}
              className={isActive ? studioImageFitSegmentActive : studioImageFitSegment}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {showKenBurnsIntensity ? (
        <div className="space-y-1.5">
          <div>
            <p className={`${studioFieldLabel} mb-0`}>Intensity</p>
            <p className={`${studioSubtleText} mt-1`}>
              Controls how much the image moves during playback.
            </p>
          </div>
          <div
            className={studioImageFitSegmentedControlStacked}
            role="radiogroup"
            aria-label="Motion intensity"
          >
            {SCENE_IMAGE_MOTION_INTENSITY_OPTIONS.map((option) => {
              const isActive = activeIntensity === option.value;
              const intensityTitle =
                option.value === "subtle"
                  ? "Gentle movement"
                  : option.value === "medium"
                    ? "Moderate movement"
                    : "Strong movement";

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  title={intensityTitle}
                  onClick={() => handleIntensityChange(option.value)}
                  className={isActive ? studioImageFitSegmentActive : studioImageFitSegment}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
