"use client";

import { normalizeCaptionMode } from "@/features/story/utils";
import { studioFieldLabel, studioSegment, studioSegmentActive, studioSegmentedControl } from "@/lib/utils/studioUi";
import type { CaptionMode } from "@/features/story/types";

const CAPTION_STYLE_OPTIONS: { value: CaptionMode; label: string }[] = [
  { value: "generated", label: "Written Caption" },
  { value: "subtitles", label: "Narration Subtitles" },
];

interface CaptionModeControlProps {
  value: CaptionMode | undefined;
  onChange: (mode: CaptionMode) => void;
  disabled?: boolean;
}

export default function CaptionModeControl({
  value,
  onChange,
  disabled = false,
}: CaptionModeControlProps) {
  const activeMode = normalizeCaptionMode(value);

  return (
    <section aria-label="Caption style">
      <p className={studioFieldLabel}>Caption Style</p>
      <div
        className={studioSegmentedControl}
        role="radiogroup"
        aria-label="Caption style"
      >
        {CAPTION_STYLE_OPTIONS.map((option) => {
          const isActive = activeMode === option.value;
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
