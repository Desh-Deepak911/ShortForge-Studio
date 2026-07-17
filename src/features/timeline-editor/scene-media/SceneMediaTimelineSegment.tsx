"use client";

import type { ReactNode } from "react";

import type { ResolvedSceneMediaWindow } from "@/features/scene-media-timeline";

import {
  sceneMediaSegmentBase,
  sceneMediaSegmentIdle,
  sceneMediaSegmentLabel,
  sceneMediaSegmentSelected,
} from "./scene-media-timeline.ui";

export interface SceneMediaTimelineSegmentProps {
  window: ResolvedSceneMediaWindow;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: (mediaItemId: string) => void;
  boundaryHandle?: ReactNode;
}

function formatDurationLabel(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 1)}s`;
  }
  return `${durationMs}ms`;
}

export default function SceneMediaTimelineSegment({
  window,
  isSelected,
  disabled = false,
  onSelect,
  boundaryHandle,
}: SceneMediaTimelineSegmentProps) {
  const thumbUrl =
    window.media.type === "image"
      ? window.media.url
      : window.media.posterUrl ?? window.media.url;
  const orderLabel = `${window.itemIndex + 1}`;
  const durationLabel = formatDurationLabel(window.durationMs);
  const flexGrow = Math.max(window.durationMs, 1);

  return (
    <div
      className="relative flex h-full min-w-0"
      style={{ flexGrow, flexBasis: 0 }}
      data-scene-media-item-id={window.itemId}
      data-scene-media-item-index={window.itemIndex}
      data-scene-media-provenance={window.provenance}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) {
            return;
          }
          onSelect(window.itemId);
        }}
        className={`${sceneMediaSegmentBase} w-full ${
          isSelected ? sceneMediaSegmentSelected : sceneMediaSegmentIdle
        }`}
        aria-pressed={isSelected}
        aria-label={`Media item ${orderLabel}, ${durationLabel}${
          window.provenance === "legacy_virtual" ? ", legacy" : ""
        }`}
      >
        {thumbUrl && window.media.type === "image" ? (
          // Tiny timeline strip thumbnails; next/image is unnecessary here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            draggable={false}
          />
        ) : null}
        <span className={`relative z-[1] ${sceneMediaSegmentLabel}`}>
          {orderLabel} · {durationLabel}
        </span>
      </button>
      {boundaryHandle}
    </div>
  );
}
