"use client";

import {
  MAX_SCENE_IMAGE_SCALE,
  MIN_SCENE_IMAGE_SCALE,
  clampSceneImageScale,
  normalizeSceneImageFitMode,
} from "@/lib/sceneImage";
import {
  studioCompactButton,
  studioFieldLabel,
  studioImageControlDock,
  studioImageFitSegment,
  studioImageFitSegmentActive,
  studioImageFitSegmentedControl,
  studioRange,
  studioRangeTouchHost,
} from "@/lib/studioUi";
import type { SceneImageFitMode } from "@/types/footiebitz";

const FIT_MODE_OPTIONS: { value: SceneImageFitMode; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: "fill", label: "Fill" },
];

interface SceneImageZoomControlProps {
  scale: number;
  fitMode?: SceneImageFitMode;
  onScaleChange: (scale: number) => void;
  onFitModeChange: (fitMode: SceneImageFitMode) => void;
  onReset: () => void;
  controlId: string;
  variant?: "standalone" | "attached";
}

export default function SceneImageZoomControl({
  scale,
  fitMode,
  onScaleChange,
  onFitModeChange,
  onReset,
  controlId,
  variant = "standalone",
}: SceneImageZoomControlProps) {
  const clampedScale = clampSceneImageScale(scale);
  const activeFitMode = normalizeSceneImageFitMode(fitMode);
  const containerClassName =
    variant === "attached"
      ? `${studioImageControlDock} space-y-2.5`
      : "mt-2.5 space-y-2.5 rounded-xl bg-surface-elevated/30 p-2.5 ring-1 ring-border/20 sm:mt-3 sm:p-3";

  return (
    <div className={containerClassName}>
      <div className="flex items-center gap-2">
        <div
          className={studioImageFitSegmentedControl}
          role="radiogroup"
          aria-label="Image fit mode"
        >
          {FIT_MODE_OPTIONS.map((option) => {
            const isActive = activeFitMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onFitModeChange(option.value)}
                className={isActive ? studioImageFitSegmentActive : studioImageFitSegment}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onReset}
          className={`${studioCompactButton} min-h-[2rem] shrink-0 sm:min-h-0`}
        >
          Reset
        </button>
      </div>

      <section aria-label="Image zoom">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={controlId} className={`${studioFieldLabel} mb-0`}>
            Zoom
          </label>
          <span className="text-[11px] font-medium tabular-nums text-muted sm:text-xs">
            {clampedScale.toFixed(2)}×
          </span>
        </div>
        <div className={studioRangeTouchHost}>
          <input
            id={controlId}
            type="range"
            min={MIN_SCENE_IMAGE_SCALE}
            max={MAX_SCENE_IMAGE_SCALE}
            step={0.01}
            value={clampedScale}
            onChange={(event) => onScaleChange(Number(event.target.value))}
            aria-valuemin={MIN_SCENE_IMAGE_SCALE}
            aria-valuemax={MAX_SCENE_IMAGE_SCALE}
            aria-valuenow={clampedScale}
            className={studioRange}
          />
        </div>
      </section>
    </div>
  );
}
