"use client";

import {
  getMediaMotionPreset,
  MEDIA_MOTION_EASING_OPTIONS,
  MEDIA_MOTION_HELPER_COPY,
  MEDIA_MOTION_INSPECTOR_CATEGORIES,
  MEDIA_MOTION_INTENSITY_MAX,
  MEDIA_MOTION_INTENSITY_MIN,
  MEDIA_MOTION_INTENSITY_STEP,
  type MediaMotionEasing,
  type SceneMediaMotion,
} from "@/features/media-motion";
import { StudioSwitch } from "@/components/ui";
import {
  studioFieldLabel,
  studioSecondaryButton,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface MediaMotionInspectorPanelProps {
  controlId: string;
  motion: SceneMediaMotion;
  disabled?: boolean;
  onMotionChange: (patch: Partial<SceneMediaMotion>) => void;
  onReset: () => void;
}

function formatIntensity(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function easingLabel(easing: MediaMotionEasing | undefined): string {
  const match = MEDIA_MOTION_EASING_OPTIONS.find((option) => option.value === easing);
  return match?.label ?? "Linear";
}

/**
 * Shared Motion inspector for image and video — writes scene.media.motion only.
 * Presentation only; parent commits via buildMediaMotionPatch + intent media.
 */
export default function MediaMotionInspectorPanel({
  controlId,
  motion,
  disabled = false,
  onMotionChange,
  onReset,
}: MediaMotionInspectorPanelProps) {
  const enabled = motion.enabled !== false && motion.presetId !== "static";
  const presetId = motion.presetId ?? "static";
  const preset = getMediaMotionPreset(presetId);
  const intensity =
    typeof motion.intensity === "number" && Number.isFinite(motion.intensity)
      ? Math.min(MEDIA_MOTION_INTENSITY_MAX, Math.max(MEDIA_MOTION_INTENSITY_MIN, motion.intensity))
      : preset.defaultIntensity;
  const easing = (motion.easing ?? preset.defaultEasing ?? "linear") as MediaMotionEasing;

  const categoryPresets = MEDIA_MOTION_INSPECTOR_CATEGORIES;

  const summary = enabled
    ? `${preset.label} · Intensity ${intensity.toFixed(1)} · ${easingLabel(easing)}`
    : "Motion Disabled";

  const handleEnableChange = (nextEnabled: boolean) => {
    if (!nextEnabled) {
      onMotionChange({
        version: 1,
        enabled: false,
        presetId: "static",
        intensity: 0,
        easing: "linear",
      });
      return;
    }

    const nextPresetId = presetId === "static" ? "slow-zoom-in" : presetId;
    const nextPreset = getMediaMotionPreset(nextPresetId);
    onMotionChange({
      version: 1,
      enabled: true,
      presetId: nextPreset.id,
      intensity: nextPreset.defaultIntensity > 0 ? nextPreset.defaultIntensity : 1,
      easing: nextPreset.defaultEasing,
      startTransform: nextPreset.startDelta,
      endTransform: nextPreset.endDelta,
    });
  };

  const handlePresetChange = (nextPresetId: string) => {
    if (nextPresetId === "static") {
      handleEnableChange(false);
      return;
    }
    const nextPreset = getMediaMotionPreset(nextPresetId);
    onMotionChange({
      version: 1,
      enabled: true,
      presetId: nextPreset.id,
      intensity: intensity > 0 ? intensity : nextPreset.defaultIntensity || 1,
      easing: motion.easing ?? nextPreset.defaultEasing,
      startTransform: nextPreset.startDelta,
      endTransform: nextPreset.endDelta,
    });
  };

  return (
    <div className="space-y-3" data-media-motion-panel="true">
      <StudioSwitch
        id={`${controlId}-enable`}
        checked={enabled}
        disabled={disabled}
        onChange={(event) => handleEnableChange(event.target.checked)}
        data-media-motion-enable="true"
        label="Motion"
        description={summary}
      />

      {enabled ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor={`${controlId}-preset`} className={studioFieldLabel}>
              Preset
            </label>
            <select
              id={`${controlId}-preset`}
              className={studioSelectCompact}
              value={presetId}
              disabled={disabled}
              onChange={(event) => handlePresetChange(event.target.value)}
              data-media-motion-preset="true"
            >
              {categoryPresets.map((category) => (
                <optgroup key={category.id} label={category.label}>
                  {category.presetIds.map((id) => {
                    const entry = getMediaMotionPreset(id);
                    return (
                      <option key={id} value={id}>
                        {entry.label}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${controlId}-intensity`} className={studioFieldLabel}>
                Intensity
              </label>
              <span className="text-[10px] tabular-nums text-muted" data-media-motion-intensity-value>
                {formatIntensity(intensity)}
              </span>
            </div>
            <input
              id={`${controlId}-intensity`}
              type="range"
              min={MEDIA_MOTION_INTENSITY_MIN}
              max={MEDIA_MOTION_INTENSITY_MAX}
              step={MEDIA_MOTION_INTENSITY_STEP}
              value={intensity}
              disabled={disabled}
              onChange={(event) =>
                onMotionChange({
                  intensity: Number(event.target.value),
                  enabled: true,
                  presetId,
                })
              }
              data-media-motion-intensity="true"
              className="w-full accent-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${controlId}-easing`} className={studioFieldLabel}>
              Easing
            </label>
            <select
              id={`${controlId}-easing`}
              className={studioSelectCompact}
              value={easing}
              disabled={disabled}
              onChange={(event) =>
                onMotionChange({
                  easing: event.target.value as MediaMotionEasing,
                  enabled: true,
                  presetId,
                })
              }
              data-media-motion-easing="true"
            >
              {MEDIA_MOTION_EASING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p className={studioSubtleText}>Static media — enable motion to choose a preset.</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className={studioSecondaryButton}
          disabled={disabled}
          onClick={onReset}
          data-media-motion-reset="true"
        >
          Reset Motion
        </button>
      </div>

      <p className={studioSubtleText}>{MEDIA_MOTION_HELPER_COPY}</p>
    </div>
  );
}
