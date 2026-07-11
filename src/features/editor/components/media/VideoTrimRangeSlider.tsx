"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { formatTrimSeconds } from "@/features/editor/components/media/scene-video-inspector.utils";
import {
  applyTrimHandleDrag,
  clampPosterMarkerToDraft,
  clientXToTrimTimeMs,
  formatTrimHandleValueText,
  nudgeTrimHandle,
  trimTimeMsToPercent,
  type VideoTrimHandle,
  type VideoTrimRangeDraft,
} from "@/features/editor/components/media/video-trim-range-slider.utils";
import { MIN_VIDEO_TRIM_DURATION_MS } from "@/features/media-playback";
import { studioSubtleText } from "@/lib/utils/studioUi";

export interface VideoTrimFilmstripMarker {
  timeMs: number;
  percentage: number;
  index: number;
}

export interface VideoTrimSliderPreviewPayload {
  handle: VideoTrimHandle;
  trimStartMs: number;
  trimEndMs: number;
}

export interface VideoTrimRangeSliderProps {
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  filmstripMarkers?: VideoTrimFilmstripMarker[];
  posterTimeMs?: number;
  disabled?: boolean;
  /** Local draft update — no script commit. */
  onDraftChange: (next: VideoTrimRangeDraft) => void;
  /** Commit once on pointer release / keyboard settle. */
  onCommit: (next: VideoTrimRangeDraft) => void;
  /** Escape during drag — restore committed values. */
  onCancelDrag: () => void;
  /** Preview-only: scrub begins (pause playback / set override). */
  onPreviewStart?: (payload: VideoTrimSliderPreviewPayload) => void;
  /** Preview-only: draft moved — seek frame, no script commit. */
  onPreviewChange?: (payload: VideoTrimSliderPreviewPayload) => void;
  /** Preview-only: clear override after commit. */
  onPreviewCommit?: () => void;
  /** Preview-only: clear override after cancel. */
  onPreviewCancel?: () => void;
}

/**
 * Two-handle trim range slider.
 * Updates local draft while dragging; commits only on pointer-up.
 * Optional preview callbacks drive a temporary scrub override (no script writes).
 */
export default function VideoTrimRangeSlider({
  sourceDurationMs,
  trimStartMs,
  trimEndMs,
  filmstripMarkers = [],
  posterTimeMs,
  disabled = false,
  onDraftChange,
  onCommit,
  onCancelDrag,
  onPreviewStart,
  onPreviewChange,
  onPreviewCommit,
  onPreviewCancel,
}: VideoTrimRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<VideoTrimHandle | null>(null);
  const dragRef = useRef<{
    handle: VideoTrimHandle;
    pointerId: number;
    draft: VideoTrimRangeDraft;
  } | null>(null);

  const available =
    !disabled &&
    sourceDurationMs >= MIN_VIDEO_TRIM_DURATION_MS &&
    trimEndMs > trimStartMs;

  const startPercent = trimTimeMsToPercent(trimStartMs, sourceDurationMs);
  const endPercent = trimTimeMsToPercent(trimEndMs, sourceDurationMs);
  const selectedWidth = Math.max(0, endPercent - startPercent);
  const posterMarkerMs = clampPosterMarkerToDraft(posterTimeMs, {
    trimStartMs,
    trimEndMs,
  });
  const posterPercent = trimTimeMsToPercent(posterMarkerMs, sourceDurationMs);

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !dragRef.current) {
        return;
      }
      event.preventDefault();
      dragRef.current = null;
      setActiveHandle(null);
      onCancelDrag();
      onPreviewCancel?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeHandle, onCancelDrag, onPreviewCancel]);

  const emitPreview = (
    handle: VideoTrimHandle,
    draft: VideoTrimRangeDraft,
    phase: "start" | "change",
  ) => {
    const payload: VideoTrimSliderPreviewPayload = {
      handle,
      trimStartMs: draft.trimStartMs,
      trimEndMs: draft.trimEndMs,
    };
    if (phase === "start") {
      onPreviewStart?.(payload);
    }
    onPreviewChange?.(payload);
  };

  const resolvePointerDraft = (handle: VideoTrimHandle, clientX: number) => {
    const track = trackRef.current;
    if (!track) {
      return null;
    }

    const rect = track.getBoundingClientRect();
    const pointerTimeMs = clientXToTrimTimeMs(
      clientX,
      rect.left,
      rect.width,
      sourceDurationMs,
    );
    const base = dragRef.current?.draft ?? { trimStartMs, trimEndMs };
    return applyTrimHandleDrag(handle, pointerTimeMs, base, sourceDurationMs);
  };

  const handlePointerDown = (
    handle: VideoTrimHandle,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (!available) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveHandle(handle);
    const initialDraft = { trimStartMs, trimEndMs };
    dragRef.current = {
      handle,
      pointerId: event.pointerId,
      draft: initialDraft,
    };
    emitPreview(handle, initialDraft, "start");
    const next = resolvePointerDraft(handle, event.clientX);
    if (next) {
      dragRef.current = {
        handle,
        pointerId: event.pointerId,
        draft: next,
      };
      onDraftChange(next);
      emitPreview(handle, next, "change");
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const next = resolvePointerDraft(drag.handle, event.clientX);
    if (!next) {
      return;
    }

    dragRef.current = { ...drag, draft: next };
    onDraftChange(next);
    emitPreview(drag.handle, next, "change");
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released.
    }

    const finalDraft = drag.draft;
    dragRef.current = null;
    setActiveHandle(null);

    if (commit) {
      onCommit(finalDraft);
      onPreviewCommit?.();
    } else {
      onCancelDrag();
      onPreviewCancel?.();
    }
  };

  const handleKeyDown = (
    handle: VideoTrimHandle,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!available) {
      return;
    }

    if (event.key === "Escape") {
      if (dragRef.current) {
        event.preventDefault();
        dragRef.current = null;
        setActiveHandle(null);
        onCancelDrag();
        onPreviewCancel?.();
      }
      return;
    }

    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();
    const next = nudgeTrimHandle(
      handle,
      event.key,
      { trimStartMs, trimEndMs },
      sourceDurationMs,
      event.shiftKey,
    );
    emitPreview(handle, next, "start");
    onDraftChange(next);
    onCommit(next);
    onPreviewCommit?.();
  };

  if (!available) {
    return (
      <p
        className={`${studioSubtleText} text-[11px] leading-snug`}
        data-scene-video-trim-slider-unavailable="true"
      >
        Trim range unavailable until video metadata is loaded.
      </p>
    );
  }

  return (
    <div className="space-y-1.5" data-scene-video-trim-slider="true">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${studioSubtleText} text-[10px]`}>
          {formatTrimSeconds(trimStartMs)}s → {formatTrimSeconds(trimEndMs)}s
        </span>
        <span className={`${studioSubtleText} text-[10px] tabular-nums`}>
          {(Math.max(0, trimEndMs - trimStartMs) / 1000).toFixed(3)}s selected
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-8 select-none rounded-md bg-background/40 ring-1 ring-border/25"
        data-scene-video-trim-track="true"
      >
        <div className="pointer-events-none absolute inset-x-1 bottom-1 top-1 overflow-hidden rounded-sm">
          {filmstripMarkers.map((marker) => (
            <div
              key={marker.index}
              className="absolute bottom-0 top-0 w-px bg-border/35"
              style={{ left: `${trimTimeMsToPercent(marker.timeMs, sourceDurationMs)}%` }}
              data-scene-video-trim-marker="true"
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-elevated/50"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/80"
          style={{
            left: `${startPercent}%`,
            width: `${selectedWidth}%`,
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.18) 3px, rgba(255,255,255,0.18) 4px)",
          }}
          data-scene-video-trim-selection="true"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute top-1 h-6 w-px -translate-x-1/2 bg-foreground/50"
          style={{ left: `${posterPercent}%` }}
          data-scene-video-trim-poster-marker="true"
          aria-hidden
        />

        <button
          type="button"
          role="slider"
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, trimEndMs - MIN_VIDEO_TRIM_DURATION_MS)}
          aria-valuenow={trimStartMs}
          aria-valuetext={formatTrimHandleValueText(trimStartMs)}
          disabled={!available}
          className={`absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            activeHandle === "start" ? "scale-110" : ""
          }`}
          style={{ left: `${startPercent}%` }}
          data-scene-video-trim-handle="start"
          onPointerDown={(event) => handlePointerDown("start", event)}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishDrag(event, true)}
          onPointerCancel={(event) => finishDrag(event, false)}
          onKeyDown={(event) => handleKeyDown("start", event)}
        />

        <button
          type="button"
          role="slider"
          aria-label="Trim end"
          aria-valuemin={Math.min(sourceDurationMs, trimStartMs + MIN_VIDEO_TRIM_DURATION_MS)}
          aria-valuemax={sourceDurationMs}
          aria-valuenow={trimEndMs}
          aria-valuetext={formatTrimHandleValueText(trimEndMs)}
          disabled={!available}
          className={`absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            activeHandle === "end" ? "scale-110" : ""
          }`}
          style={{ left: `${endPercent}%` }}
          data-scene-video-trim-handle="end"
          onPointerDown={(event) => handlePointerDown("end", event)}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishDrag(event, true)}
          onPointerCancel={(event) => finishDrag(event, false)}
          onKeyDown={(event) => handleKeyDown("end", event)}
        />
      </div>
    </div>
  );
}
