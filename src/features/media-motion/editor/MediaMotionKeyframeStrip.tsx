"use client";

import type { KeyboardEvent, Ref } from "react";

import type { MediaMotionKeyframe } from "@/features/story/types";
import { studioSubtleText } from "@/lib/utils/studioUi";

export interface MediaMotionKeyframeStripProps {
  controlId: string;
  keyframes: readonly MediaMotionKeyframe[];
  selectedIndex: number | null;
  disabled?: boolean;
  listRef?: Ref<HTMLDivElement>;
  onSelectIndex: (index: number) => void;
  onMoveSelection: (delta: -1 | 1) => void;
  onSelectFirst: () => void;
  onSelectLast: () => void;
}

function formatSeconds(offsetMs: number): string {
  const seconds = offsetMs / 1000;
  if (!Number.isFinite(seconds)) return "0s";
  const digits = Math.abs(seconds) < 10 && seconds % 1 !== 0 ? 2 : 1;
  return `${seconds.toFixed(digits)}s`;
}

/**
 * Compact horizontal keyframe strip for the Adjust inspector.
 */
export default function MediaMotionKeyframeStrip({
  controlId,
  keyframes,
  selectedIndex,
  disabled = false,
  listRef,
  onSelectIndex,
  onMoveSelection,
  onSelectFirst,
  onSelectLast,
}: MediaMotionKeyframeStripProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || keyframes.length === 0) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onMoveSelection(-1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onMoveSelection(1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onSelectFirst();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onSelectLast();
    }
  };

  if (keyframes.length === 0) {
    return (
      <p className={studioSubtleText} data-media-motion-keyframe-strip-empty="true">
        No keyframes yet.
      </p>
    );
  }

  const activeOptionId =
    selectedIndex != null && keyframes[selectedIndex]
      ? `${controlId}-option-${selectedIndex}`
      : undefined;

  return (
    <div
      ref={listRef}
      id={`${controlId}-strip`}
      role="listbox"
      aria-label="Keyframes"
      aria-activedescendant={activeOptionId}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className="flex gap-1.5 overflow-x-auto pb-0.5"
      data-media-motion-keyframe-strip="true"
    >
      {keyframes.map((frame, index) => {
        const selected = index === selectedIndex;
        const timeLabel = formatSeconds(frame.offsetMs);
        return (
          <button
            key={`${frame.offsetMs}-${index}`}
            id={`${controlId}-option-${index}`}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            title={`Keyframe at ${timeLabel}`}
            aria-label={`Keyframe at ${timeLabel}`}
            data-media-motion-keyframe-chip={index}
            data-selected={selected ? "true" : "false"}
            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] tabular-nums transition-colors ${
              selected
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-background text-muted hover:text-foreground"
            }`}
            onClick={() => onSelectIndex(index)}
          >
            {timeLabel}
          </button>
        );
      })}
    </div>
  );
}
