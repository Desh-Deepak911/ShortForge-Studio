"use client";

import {
  studioMotionPanelDesc,
  studioMotionPanelHeading,
  studioMotionSegment,
  studioMotionSegmentActive,
  studioMotionSegmentedControl,
} from "./motion-panel.ui";
import type { SceneImageMotionIntensity } from "@/features/story/types";

import { MOTION_SPEED_OPTIONS } from "./motion-panel.utils";
import { handleMotionRadiogroupKeyDown } from "./motion-radiogroup.utils";

export interface MotionSpeedControlProps {
  controlId: string;
  value: SceneImageMotionIntensity;
  onChange: (intensity: SceneImageMotionIntensity) => void;
}

/**
 * Motion speed selector — Slow, Normal, Fast (maps to subtle / medium / strong).
 */
export default function MotionSpeedControl({ controlId, value, onChange }: MotionSpeedControlProps) {
  return (
    <div className="min-w-0">
      <p id={`${controlId}-motion-speed-label`} className={studioMotionPanelHeading}>
        Motion Speed
      </p>
      <p className={`${studioMotionPanelDesc} mb-2`}>
        Controls how much the image moves during playback.
      </p>
      <div
        className={studioMotionSegmentedControl}
        role="radiogroup"
        aria-labelledby={`${controlId}-motion-speed-label`}
        onKeyDown={(event) =>
          handleMotionRadiogroupKeyDown(event, MOTION_SPEED_OPTIONS, value, onChange)
        }
      >
        {MOTION_SPEED_OPTIONS.map((option) => {
          const isActive = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={option.title}
              data-motion-radiogroup-value={option.value}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={isActive ? studioMotionSegmentActive : studioMotionSegment}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
