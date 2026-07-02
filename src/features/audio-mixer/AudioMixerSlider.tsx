"use client";

import {
  formatDuckingStrengthPercent,
  formatMixerVolumePercent,
} from "@/features/audio-mixer/audio-mixer.utils";
import {
  studioFieldLabel,
  studioRange,
  studioRangeTouchHost,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface AudioMixerSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  minLabel?: string;
  midLabel?: string;
  maxLabel?: string;
  /** When true, formats value as ducking strength percent (0–100%). */
  duckingStrength?: boolean;
}

export default function AudioMixerSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
  minLabel,
  midLabel,
  maxLabel,
  duckingStrength = false,
}: AudioMixerSliderProps) {
  const displayValue = duckingStrength
    ? formatDuckingStrengthPercent(value)
    : formatMixerVolumePercent(value);

  return (
    <section aria-label={label}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label htmlFor={id} className={studioFieldLabel}>
          {label}
        </label>
        <span className="text-[11px] font-medium tabular-nums text-muted">{displayValue}</span>
      </div>

      <div className={studioRangeTouchHost}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className={studioRange}
        />
      </div>

      {minLabel || midLabel || maxLabel ? (
        <div className={`${studioSubtleText} mt-1 flex justify-between text-[10px] tabular-nums`}>
          <span>{minLabel ?? ""}</span>
          <span>{midLabel ?? ""}</span>
          <span>{maxLabel ?? ""}</span>
        </div>
      ) : null}
    </section>
  );
}
