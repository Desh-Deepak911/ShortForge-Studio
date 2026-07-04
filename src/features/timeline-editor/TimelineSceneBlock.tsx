"use client";

import {
  ArrowLeftRight,
  Clapperboard,
  Flag,
  GripVertical,
  ImageIcon,
  Info,
  MoreVertical,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getSceneImageUrl, sceneHasImage } from "@/features/story/utils";
import type { FootieScene, SceneType } from "@/features/story/types";

import { formatTimelineDurationLabel } from "./derive-timeline-layout.utils";
import { formatSceneTimelineCaption } from "./timeline-display.utils";
import {
  timelineInsertIndicator,
  timelineInsertIndicatorCap,
  timelineInsertIndicatorLine,
  timelineSceneBlockBase,
  timelineSceneBlockCaption,
  timelineSceneBlockDragging,
  timelineSceneBlockDurationBadge,
  timelineSceneBlockKebab,
  timelineSceneBlockDragHandle,
  timelineSceneBlockNumberBadge,
  timelineSceneBlockResizeHandle,
  timelineSceneBlockResizeHandleActive,
  timelineSceneBlockResizeHandleBar,
  timelineSceneBlockResizeHandleBarActive,
  timelineSceneBlockSceneLabel,
  timelineSceneBlockSelected,
  timelineSceneBlockSelectedAccent,
  timelineSceneBlockThumb,
  timelineSceneBlockThumbEmpty,
  timelineSceneBlockThumbOverlay,
} from "./timeline-editor.ui";
import type { TimelineSceneBlockVM } from "./timeline-editor.types";
import {
  resolveDurationNudgeDeltaSec,
  TIMELINE_RESIZE_MAX_DURATION_SEC,
  TIMELINE_RESIZE_MIN_DURATION_SEC,
} from "./timeline-resize.utils";

export interface TimelineSceneBlockProps {
  block: TimelineSceneBlockVM;
  scene: FootieScene;
  isSelected: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
  reorderDisabled?: boolean;
  resizeDisabled?: boolean;
  showInsertBefore?: boolean;
  onSelect: () => void;
  onMenuOpen: (position: { x: number; y: number }) => void;
  onDragHandlePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizeHandlePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Keyboard nudge — commits through the same duration path as pointer resize. */
  onDurationNudge?: (deltaSec: number) => void;
  blockRef?: (element: HTMLButtonElement | null) => void;
  wrapperRef?: (element: HTMLDivElement | null) => void;
}

const KEYBOARD_HIGHLIGHT_MS = 220;

const SCENE_TYPE_ICONS: Record<SceneType, typeof Sparkles> = {
  intro: Sparkles,
  context: Info,
  match: Clapperboard,
  transition: ArrowLeftRight,
  ending: Flag,
};

function SceneTypeBadge({ sceneType }: { sceneType: SceneType }) {
  const Icon = SCENE_TYPE_ICONS[sceneType];

  return (
    <span className="absolute right-1 top-1 z-[2] flex h-4 w-4 items-center justify-center rounded-md bg-black/60 text-white/95 ring-1 ring-white/12 backdrop-blur-sm">
      <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
    </span>
  );
}

export default function TimelineSceneBlock({
  block,
  scene,
  isSelected,
  isDragging = false,
  isResizing = false,
  reorderDisabled = false,
  resizeDisabled = false,
  showInsertBefore = false,
  onSelect,
  onMenuOpen,
  onDragHandlePointerDown,
  onResizeHandlePointerDown,
  onDurationNudge,
  blockRef,
  wrapperRef,
}: TimelineSceneBlockProps) {
  const kebabRef = useRef<HTMLButtonElement>(null);
  const keyboardHighlightTimeoutRef = useRef<number | null>(null);
  const [keyboardHighlight, setKeyboardHighlight] = useState(false);
  const imageUrl = getSceneImageUrl(scene);
  const hasImage = sceneHasImage(scene);
  const sceneCaption = formatSceneTimelineCaption(scene);
  const durationSec = Math.max(
    TIMELINE_RESIZE_MIN_DURATION_SEC,
    Math.round(block.durationLabelSec),
  );
  const durationLabel = formatTimelineDurationLabel(block.durationLabelSec);
  const showResizeActive = isResizing || keyboardHighlight;

  useEffect(() => {
    return () => {
      if (keyboardHighlightTimeoutRef.current != null) {
        window.clearTimeout(keyboardHighlightTimeoutRef.current);
      }
    };
  }, []);

  const openMenuAt = (x: number, y: number) => {
    onSelect();
    onMenuOpen({ x, y });
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openMenuAt(event.clientX, event.clientY);
  };

  const handleKebabClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const anchor = kebabRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    openMenuAt(rect.left, rect.bottom + 4);
  };

  const handleDragHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onDragHandlePointerDown?.(event);
  };

  const handleResizeHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onResizeHandlePointerDown?.(event);
  };

  const flashKeyboardHighlight = () => {
    setKeyboardHighlight(true);
    if (keyboardHighlightTimeoutRef.current != null) {
      window.clearTimeout(keyboardHighlightTimeoutRef.current);
    }
    keyboardHighlightTimeoutRef.current = window.setTimeout(() => {
      setKeyboardHighlight(false);
      keyboardHighlightTimeoutRef.current = null;
    }, KEYBOARD_HIGHLIGHT_MS);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (resizeDisabled) {
      return;
    }

    const deltaSec = resolveDurationNudgeDeltaSec(event.key, event.shiftKey);
    if (deltaSec === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onDurationNudge?.(deltaSec);
    flashKeyboardHighlight();
  };

  return (
    <div
      ref={wrapperRef}
      className="group/scene-block relative shrink-0"
      style={{ flexGrow: block.widthPercent, flexShrink: 0, flexBasis: 0, minWidth: "3.5rem" }}
      onContextMenu={handleContextMenu}
      data-scene-id={block.sceneId}
      data-scene-selected={isSelected ? "true" : "false"}
      data-scene-dragging={isDragging ? "true" : "false"}
      data-scene-resizing={showResizeActive ? "true" : "false"}
    >
      {showInsertBefore ? (
        <span aria-hidden className={timelineInsertIndicator}>
          <span className={timelineInsertIndicatorCap} />
          <span className={timelineInsertIndicatorLine} />
          <span className={timelineInsertIndicatorCap} />
        </span>
      ) : null}

      <button
        ref={blockRef}
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
        aria-grabbed={isDragging ? true : undefined}
        aria-label={`Scene ${block.sceneNumber}, ${sceneCaption}, ${durationLabel}`}
        aria-haspopup="menu"
        className={`${timelineSceneBlockBase} w-full ${isSelected ? timelineSceneBlockSelected : ""} ${isDragging ? timelineSceneBlockDragging : ""}`}
      >
        {isSelected ? <span aria-hidden className={timelineSceneBlockSelectedAccent} /> : null}

        <div
          className={`${timelineSceneBlockThumb} ${hasImage ? "" : timelineSceneBlockThumbEmpty}`}
        >
          {hasImage && imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition duration-200 group-hover/scene-block:scale-[1.03]"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1">
              <ImageIcon className="h-4 w-4 text-muted/50" strokeWidth={1.75} aria-hidden />
              <span className="text-[8px] font-medium uppercase tracking-wide text-muted/45">
                No image
              </span>
            </div>
          )}

          <span aria-hidden className={timelineSceneBlockThumbOverlay} />
          <span className={timelineSceneBlockNumberBadge}>{block.sceneNumber}</span>
          {scene.sceneType ? <SceneTypeBadge sceneType={scene.sceneType} /> : null}
          <span
            className={`${timelineSceneBlockDurationBadge} ${showResizeActive ? "ring-accent/40" : ""}`}
          >
            {durationLabel}
          </span>
        </div>

        <span className={timelineSceneBlockSceneLabel}>Scene {block.sceneNumber}</span>
        <span className={timelineSceneBlockCaption} title={sceneCaption}>
          {sceneCaption}
        </span>
      </button>

      <button
        ref={kebabRef}
        type="button"
        aria-label={`Scene ${block.sceneNumber} actions`}
        aria-haspopup="menu"
        className={timelineSceneBlockKebab}
        onClick={handleKebabClick}
      >
        <MoreVertical className="h-3 w-3" aria-hidden />
      </button>

      <button
        type="button"
        aria-label={`Reorder scene ${block.sceneNumber}`}
        aria-disabled={reorderDisabled ? true : undefined}
        disabled={reorderDisabled}
        title={reorderDisabled ? "Scene reorder is unavailable during playback" : "Drag to reorder scene"}
        className={timelineSceneBlockDragHandle}
        onPointerDown={handleDragHandlePointerDown}
      >
        <GripVertical className="h-3 w-3" aria-hidden />
      </button>

      <button
        type="button"
        role="slider"
        tabIndex={resizeDisabled ? -1 : 0}
        aria-label="Resize scene duration"
        aria-valuemin={TIMELINE_RESIZE_MIN_DURATION_SEC}
        aria-valuemax={TIMELINE_RESIZE_MAX_DURATION_SEC}
        aria-valuenow={durationSec}
        aria-valuetext={`${durationSec} ${durationSec === 1 ? "second" : "seconds"}`}
        aria-disabled={resizeDisabled ? true : undefined}
        disabled={resizeDisabled}
        title={
          resizeDisabled
            ? "Pause playback to resize scene duration"
            : "Drag or use arrow keys to resize scene duration"
        }
        className={`${timelineSceneBlockResizeHandle} ${showResizeActive ? timelineSceneBlockResizeHandleActive : ""}`}
        onPointerDown={handleResizeHandlePointerDown}
        onKeyDown={handleResizeKeyDown}
        data-timeline-resize-handle={block.sceneId}
      >
        <span
          aria-hidden
          className={`${timelineSceneBlockResizeHandleBar} ${showResizeActive ? timelineSceneBlockResizeHandleBarActive : ""}`}
        />
      </button>
    </div>
  );
}
