"use client";

import { normalizeSubtitleEffect } from "@/features/story/utils";
import {
  studioFieldLabel,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
} from "@/lib/utils/studioUi";
import type { SubtitleEffect } from "@/features/story/types";

const SUBTITLE_EFFECT_OPTIONS: { value: SubtitleEffect; label: string }[] = [
  { value: "fade-up", label: "Fade Up" },
  { value: "typewriter", label: "Typewriter" },
  { value: "highlight", label: "Highlight" },
];

interface SubtitleEffectControlProps {
  value: SubtitleEffect | undefined;
  onChange: (effect: SubtitleEffect) => void;
  disabled?: boolean;
}

export default function SubtitleEffectControl({
  value,
  onChange,
  disabled = false,
}: SubtitleEffectControlProps) {
  const activeEffect = normalizeSubtitleEffect(value);

  return (
    <section aria-label="Subtitle effect">
      <p className={studioFieldLabel}>Subtitle Effect</p>
      <div
        className={studioSegmentedControl}
        role="radiogroup"
        aria-label="Subtitle effect"
      >
        {SUBTITLE_EFFECT_OPTIONS.map((option) => {
          const isActive = activeEffect === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={isActive ? studioSegmentActive : studioSegment}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
