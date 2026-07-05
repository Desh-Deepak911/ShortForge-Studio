"use client";

import { ChevronDown } from "lucide-react";

import {
  buildApplyMotionPresetPatch,
  CAPTION_MOTION_PRESET_CATEGORY_LABELS,
  getCaptionMotionPresetsByCategory,
} from "@/features/caption-animation-presets";
import {
  buildSceneCaptionAnimationPresetPatch,
  CAPTION_ANIMATION_DELAY_DEFAULT_MS,
  CAPTION_ANIMATION_DELAY_MAX_MS,
  CAPTION_ANIMATION_DELAY_MIN_MS,
  CAPTION_ANIMATION_DURATION_DEFAULT_MS,
  CAPTION_ANIMATION_DURATION_MAX_MS,
  CAPTION_ANIMATION_DURATION_MIN_MS,
  CAPTION_ANIMATION_INTENSITY_DEFAULT,
  CAPTION_ANIMATION_INTENSITY_MAX,
  CAPTION_ANIMATION_INTENSITY_MIN,
  CAPTION_ANIMATION_VERSION,
  clampCaptionAnimationDelayMs,
  clampCaptionAnimationDurationMs,
  clampCaptionAnimationIntensity,
  mergeCaptionAnimationSettings,
  type CaptionAnimation,
  type CaptionAnimationDirection,
  type CaptionAnimationEasing,
  type CaptionAnimationPreset,
} from "@/features/caption-animation";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const PRESET_OPTIONS: { value: CaptionAnimationPreset; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "typewriter", label: "Typewriter" },
  { value: "highlight", label: "Highlight" },
  { value: "none", label: "None" },
];

const EASING_OPTIONS: { value: CaptionAnimationEasing; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "ease_in", label: "Ease In" },
  { value: "ease_out", label: "Ease Out" },
  { value: "ease_in_out", label: "Ease In Out" },
];

const DIRECTION_OPTIONS: { value: CaptionAnimationDirection; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "reverse", label: "Reverse" },
];

export interface CaptionAnimationControlProps {
  scene: FootieScene;
  script: FootieScript;
  onSceneAnimationChange: (patch: Partial<FootieScene>) => void;
}

function mergeStoredAnimation(
  scene: FootieScene,
  patch: Partial<CaptionAnimation>,
): CaptionAnimation {
  const next: CaptionAnimation = {
    version: CAPTION_ANIMATION_VERSION,
    ...(scene.captionAnimation ?? {}),
    ...patch,
  };

  if (patch.preset && !patch.motionPresetId) {
    delete next.motionPresetId;
  }

  return next;
}

export default function CaptionAnimationControl({
  scene,
  script,
  onSceneAnimationChange,
}: CaptionAnimationControlProps) {
  const effective = mergeCaptionAnimationSettings({
    sceneAnimation: scene.captionAnimation,
    projectAnimation: script.defaultCaptionAnimation,
    sceneSubtitleEffect: scene.subtitleEffect,
  });

  const motionPresetId =
    scene.captionAnimation?.motionPresetId ??
    script.defaultCaptionAnimation?.motionPresetId ??
    "";
  const preset = effective.preset ?? "fade";
  const durationValue = effective.durationMs ?? CAPTION_ANIMATION_DURATION_DEFAULT_MS;
  const delayValue = effective.delayMs ?? CAPTION_ANIMATION_DELAY_DEFAULT_MS;
  const easingValue = effective.easing ?? "ease_out";
  const directionValue = effective.direction ?? "normal";
  const intensityValue = effective.intensity ?? CAPTION_ANIMATION_INTENSITY_DEFAULT;

  const applySceneAnimation = (patch: Partial<CaptionAnimation>) => {
    onSceneAnimationChange(
      buildSceneCaptionAnimationPresetPatch(mergeStoredAnimation(scene, patch)),
    );
  };

  const handleMotionPresetChange = (nextMotionPresetId: string) => {
    if (!nextMotionPresetId) {
      return;
    }

    const patch = buildApplyMotionPresetPatch(nextMotionPresetId, scene.captionAnimation);
    if (patch) {
      onSceneAnimationChange(patch);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`caption-motion-preset-${scene.id}`} className={studioFieldLabel}>
          Motion Preset
        </label>
        <div className="relative mt-1.5">
          <select
            id={`caption-motion-preset-${scene.id}`}
            className={`${studioSelectCompact} w-full appearance-none pr-8`}
            value={motionPresetId}
            onChange={(event) => handleMotionPresetChange(event.target.value)}
          >
            <option value="">Custom</option>
            {getCaptionMotionPresetsByCategory().map(({ category, presets }) => (
              <optgroup key={category} label={CAPTION_MOTION_PRESET_CATEGORY_LABELS[category]}>
                {presets.map((motionPreset) => (
                  <option key={motionPreset.id} value={motionPreset.id}>
                    {motionPreset.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className={studioSelectChevronCompact} aria-hidden />
        </div>
        <p className={`${studioSubtleText} mt-1`}>
          Presets configure the engine — you can still customize every control below.
        </p>
      </div>

      <div>
        <label htmlFor={`caption-animation-preset-${scene.id}`} className={studioFieldLabel}>
          Animation Preset
        </label>
        <div className="relative mt-1.5">
          <select
            id={`caption-animation-preset-${scene.id}`}
            className={`${studioSelectCompact} w-full appearance-none pr-8`}
            value={preset}
            onChange={(event) =>
              applySceneAnimation({
                preset: event.target.value as CaptionAnimationPreset,
              })
            }
          >
            {PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevronCompact} aria-hidden />
        </div>
      </div>

      <div>
        <label htmlFor={`caption-animation-duration-${scene.id}`} className={studioFieldLabel}>
          Animation Duration
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id={`caption-animation-duration-${scene.id}`}
            type="range"
            min={CAPTION_ANIMATION_DURATION_MIN_MS}
            max={CAPTION_ANIMATION_DURATION_MAX_MS}
            step={50}
            value={durationValue}
            className="w-full accent-primary"
            onChange={(event) =>
              applySceneAnimation({
                durationMs: clampCaptionAnimationDurationMs(Number(event.target.value)),
              })
            }
          />
          <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-foreground/70">
            {durationValue}ms
          </span>
        </div>
        <p className={`${studioSubtleText} mt-1`}>
          Engine default is {CAPTION_ANIMATION_DURATION_DEFAULT_MS}ms when unset.
        </p>
      </div>

      <div>
        <label htmlFor={`caption-animation-delay-${scene.id}`} className={studioFieldLabel}>
          Animation Delay
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id={`caption-animation-delay-${scene.id}`}
            type="range"
            min={CAPTION_ANIMATION_DELAY_MIN_MS}
            max={CAPTION_ANIMATION_DELAY_MAX_MS}
            step={25}
            value={delayValue}
            className="w-full accent-primary"
            onChange={(event) =>
              applySceneAnimation({
                delayMs: clampCaptionAnimationDelayMs(Number(event.target.value)),
              })
            }
          />
          <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-foreground/70">
            {delayValue}ms
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={`caption-animation-easing-${scene.id}`} className={studioFieldLabel}>
          Easing
        </label>
        <div className="relative mt-1.5">
          <select
            id={`caption-animation-easing-${scene.id}`}
            className={`${studioSelectCompact} w-full appearance-none pr-8`}
            value={easingValue}
            onChange={(event) =>
              applySceneAnimation({
                easing: event.target.value as CaptionAnimationEasing,
              })
            }
          >
            {EASING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevronCompact} aria-hidden />
        </div>
      </div>

      <div>
        <label htmlFor={`caption-animation-direction-${scene.id}`} className={studioFieldLabel}>
          Direction
        </label>
        <div className="relative mt-1.5">
          <select
            id={`caption-animation-direction-${scene.id}`}
            className={`${studioSelectCompact} w-full appearance-none pr-8`}
            value={directionValue}
            onChange={(event) =>
              applySceneAnimation({
                direction: event.target.value as CaptionAnimationDirection,
              })
            }
          >
            {DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevronCompact} aria-hidden />
        </div>
      </div>

      <div>
        <label htmlFor={`caption-animation-intensity-${scene.id}`} className={studioFieldLabel}>
          Animation Intensity
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id={`caption-animation-intensity-${scene.id}`}
            type="range"
            min={CAPTION_ANIMATION_INTENSITY_MIN}
            max={CAPTION_ANIMATION_INTENSITY_MAX}
            step={1}
            value={intensityValue}
            className="w-full accent-primary"
            onChange={(event) =>
              applySceneAnimation({
                intensity: clampCaptionAnimationIntensity(Number(event.target.value)),
              })
            }
          />
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-foreground/70">
            {intensityValue}
          </span>
        </div>
      </div>
    </div>
  );
}
