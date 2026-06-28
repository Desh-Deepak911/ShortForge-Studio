"use client";

import {
  studioMotionPanelDesc,
  studioMotionPanelHeading,
  studioMotionSegment,
  studioMotionSegmentActive,
  studioMotionSegmentedControl,
} from "./motion-panel.ui";
import type { MotionPanelCategory } from "./motion-panel.utils";
import { handleMotionRadiogroupKeyDown } from "./motion-radiogroup.utils";

export interface MotionTypeSelectorProps {
  controlId: string;
  value: MotionPanelCategory;
  onChange: (category: MotionPanelCategory) => void;
}

const MOTION_TYPE_OPTIONS: { value: MotionPanelCategory; label: string; title: string }[] = [
  { value: "static", label: "Static", title: "No motion during playback" },
  { value: "animated", label: "Animated", title: "Pan and zoom animation during playback" },
];

/**
 * Static vs animated motion category — presentation only.
 */
export default function MotionTypeSelector({
  controlId,
  value,
  onChange,
}: MotionTypeSelectorProps) {
  return (
    <div className="min-w-0">
      <p id={`${controlId}-motion-type-label`} className={studioMotionPanelHeading}>
        Motion Type
      </p>
      <p className={`${studioMotionPanelDesc} mb-2`}>Fixed frame or animated movement.</p>
      <div
        className={studioMotionSegmentedControl}
        role="radiogroup"
        aria-labelledby={`${controlId}-motion-type-label`}
        onKeyDown={(event) =>
          handleMotionRadiogroupKeyDown(event, MOTION_TYPE_OPTIONS, value, onChange)
        }
      >
        {MOTION_TYPE_OPTIONS.map((option) => {
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
