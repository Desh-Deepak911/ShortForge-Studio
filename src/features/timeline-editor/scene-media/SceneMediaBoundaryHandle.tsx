"use client";

import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor";

import { sceneMediaBoundaryHandle } from "./scene-media-timeline.ui";

export interface SceneMediaBoundaryHandleProps {
  leftIndex: number;
  leftItemId: string;
  rightItemId: string;
  leftDurationMs: number;
  rightDurationMs: number;
  disabled?: boolean;
  onPointerDown: (leftIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (leftIndex: number, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

export default function SceneMediaBoundaryHandle({
  leftIndex,
  leftItemId,
  rightItemId,
  leftDurationMs,
  rightDurationMs,
  disabled = false,
  onPointerDown,
  onKeyDown,
}: SceneMediaBoundaryHandleProps) {
  const combined = leftDurationMs + rightDurationMs;
  const valueNow = Math.round(leftDurationMs);
  const minMs = SCENE_MEDIA_MIN_ITEM_DURATION_MS;

  return (
    <button
      type="button"
      role="slider"
      className={sceneMediaBoundaryHandle}
      style={{ left: "100%" }}
      disabled={disabled}
      aria-orientation="horizontal"
      aria-label={`Resize boundary between media items ${leftIndex + 1} and ${leftIndex + 2}`}
      aria-valuemin={minMs}
      aria-valuemax={Math.max(minMs, combined - minMs)}
      aria-valuenow={valueNow}
      aria-valuetext={`${leftDurationMs} milliseconds left, ${rightDurationMs} milliseconds right`}
      data-scene-media-boundary={`${leftItemId}:${rightItemId}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) {
          return;
        }
        onPointerDown(leftIndex, event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (disabled) {
          return;
        }
        onKeyDown(leftIndex, event);
      }}
    />
  );
}
