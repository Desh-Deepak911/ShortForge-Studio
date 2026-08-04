"use client";

/**
 * Local-only keyframe selection for the media-motion inspector.
 * Never persisted into the story document.
 */

import { useState } from "react";

import type { MediaMotionKeyframe } from "@/features/story/types";

import {
  findNearestMediaMotionKeyframeIndex,
  resolveLocalMediaMotionKeyframeSelection,
} from "./media-motion-keyframe.commands";

export interface UseMediaMotionKeyframeSelectionResult {
  readonly selectedIndex: number | null;
  selectIndex: (index: number | null) => void;
  selectByOffsetMs: (offsetMs: number, keyframes: readonly MediaMotionKeyframe[]) => void;
}

function clampIndex(
  index: number | null,
  length: number,
): number | null {
  if (length <= 0) return null;
  if (index == null || !Number.isFinite(index)) return 0;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}

function offsetsSignature(keyframes: readonly MediaMotionKeyframe[] | undefined): string {
  if (!keyframes || keyframes.length === 0) return "";
  return keyframes.map((frame) => String(frame.offsetMs)).join(",");
}

/**
 * Restores a stable local selection when keyframe lists change externally.
 * Rule: retain preferred semantic offset when it survives; otherwise nearest
 * temporal survivor. Does not steal DOM focus — callers own focus management.
 */
export function useMediaMotionKeyframeSelection(
  keyframes: readonly MediaMotionKeyframe[] | undefined,
  externalSelectedIndex?: number | null,
): UseMediaMotionKeyframeSelectionResult {
  const frames = keyframes ?? [];
  const signature = offsetsSignature(keyframes);
  const syncKey = `${signature}|${String(externalSelectedIndex)}`;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(() =>
    frames.length > 0 ? 0 : null,
  );
  const [preferredOffsetMs, setPreferredOffsetMs] = useState<number | null>(
    () => (frames.length > 0 ? frames[0]!.offsetMs : null),
  );
  const [trackedSyncKey, setTrackedSyncKey] = useState(syncKey);

  if (trackedSyncKey !== syncKey) {
    setTrackedSyncKey(syncKey);

    if (typeof externalSelectedIndex === "number") {
      const next = clampIndex(externalSelectedIndex, frames.length);
      setSelectedIndex(next);
      setPreferredOffsetMs(
        next != null && frames[next] ? frames[next]!.offsetMs : null,
      );
    } else if (frames.length === 0) {
      setSelectedIndex(null);
      setPreferredOffsetMs(null);
    } else {
      const next = resolveLocalMediaMotionKeyframeSelection({
        keyframes: frames,
        preferredOffsetMs,
        fallbackIndex: selectedIndex,
      });
      setSelectedIndex(next);
      setPreferredOffsetMs(
        next != null && frames[next] ? frames[next]!.offsetMs : null,
      );
    }
  }

  const selectIndex = (index: number | null) => {
    const next = clampIndex(index, frames.length);
    setSelectedIndex(next);
    setPreferredOffsetMs(
      next != null && frames[next] ? frames[next]!.offsetMs : null,
    );
  };

  const selectByOffsetMs = (
    offsetMs: number,
    nextKeyframes: readonly MediaMotionKeyframe[],
  ) => {
    setPreferredOffsetMs(offsetMs);
    if (nextKeyframes.length === 0) {
      setSelectedIndex(null);
      return;
    }
    const next = findNearestMediaMotionKeyframeIndex(nextKeyframes, offsetMs);
    setSelectedIndex(next >= 0 ? next : 0);
  };

  return {
    selectedIndex: clampIndex(selectedIndex, frames.length),
    selectIndex,
    selectByOffsetMs,
  };
}
