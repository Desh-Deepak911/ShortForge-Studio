"use client";

import {
  IMAGE_MOTION_PRESETS,
  IMAGE_MOTION_PRESET_LABELS,
  isZoomImageMotionPreset,
  type ImageMotionPreset,
} from "@/features/timeline-intelligence/image-motion-presets.utils";
import {
  normalizeSceneImageMotion,
  normalizeSceneImageMotionIntensity,
  normalizeSceneImageMotionType,
  SCENE_IMAGE_MOTION_INTENSITY_OPTIONS,
  SCENE_IMAGE_MOTION_TYPE_OPTIONS,
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

function motionTypeToInspectorPreset(type: SceneImageMotionType): ImageMotionPreset {
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

function inspectorPresetToMotionType(preset: ImageMotionPreset): SceneImageMotionType {
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
  const motion = normalizeSceneImageMotion(imageMotion);
  const activeType = normalizeSceneImageMotionType(motion.type);
  const activeIntensity = normalizeSceneImageMotionIntensity(motion.intensity);
  const isInspector = variant === "inspector";
  const activePreset = motionTypeToInspectorPreset(activeType);
  const showKenBurnsIntensity = isInspector
    ? activePreset !== "static" && isZoomImageMotionPreset(activePreset)
    : activeType !== "none";

  const handleTypeChange = (type: SceneImageMotionType) => {
    onMotionChange({ type });
  };

  const handlePresetChange = (preset: ImageMotionPreset) => {
    onMotionChange({ type: inspectorPresetToMotionType(preset) });
  };

  const handleIntensityChange = (intensity: SceneImageMotionIntensity) => {
    onMotionChange({ intensity });
  };

  const motionSectionLabel = isInspector ? "Motion" : "Image Motion";
  const motionSectionDesc = isInspector
    ? "Add slow movement during playback. Static keeps the frame fixed."
    : undefined;

  return (
    <section
      aria-labelledby={`${controlId}-motion-label`}
      className="space-y-2.5 border-t border-border/15 pt-4"
    >
      <div>
        <p id={`${controlId}-motion-label`} className={`${studioFieldLabel} mb-0`}>
          {motionSectionLabel}
        </p>
        {motionSectionDesc ? (
          <p className={`${studioSubtleText} mt-1`}>{motionSectionDesc}</p>
        ) : null}
      </div>
      <div
        className={studioImageFitSegmentedControlStacked}
        role="radiogroup"
        aria-labelledby={`${controlId}-motion-label`}
      >
        {isInspector
          ? IMAGE_MOTION_PRESETS.map((preset) => {
              const isActive = activePreset === preset;
              const label = IMAGE_MOTION_PRESET_LABELS[preset];
              const title =
                preset === "static"
                  ? "No motion during playback"
                  : preset.includes("pan-") && preset.includes("-zoom-in")
                    ? "Pan and zoom during the scene"
                    : preset.includes("pan-")
                      ? "Pan across the scene during playback"
                      : preset === "slow-zoom-in"
                        ? "Gradually zoom in during the scene"
                        : preset === "slow-zoom-out"
                          ? "Start zoomed and pull back during the scene"
                          : "Motion during playback";

              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  title={title}
                  onClick={() => handlePresetChange(preset)}
                  className={isActive ? studioImageFitSegmentActive : studioImageFitSegment}
                >
                  {label}
                </button>
              );
            })
          : SCENE_IMAGE_MOTION_TYPE_OPTIONS.map((option) => {
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
