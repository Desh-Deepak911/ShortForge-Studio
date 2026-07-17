"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  Clapperboard,
  Film,
  Flag,
  Frame,
  GripVertical,
  ImageIcon,
  Info,
  MoreVertical,
  Snowflake,
  Sparkles,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getSceneImageUrl, sceneHasImage } from "@/features/story/utils";
import type { FootieScene, SceneType } from "@/features/story/types";

import { formatSceneTimelineCaption } from "./timeline-display.utils";
import {
  timelineInsertIndicator,
  timelineInsertIndicatorCap,
  timelineInsertIndicatorLine,
  timelineSceneBlockBase,
  timelineSceneBlockCaption,
  timelineSceneBlockClipDurationBadge,
  timelineSceneBlockDragging,
  timelineSceneBlockDurationBadge,
  timelineSceneBlockHoldBadge,
  timelineSceneBlockKebab,
  timelineSceneBlockDragHandle,
  timelineSceneBlockMediaBadge,
  timelineSceneBlockMediaBadgeMissing,
  timelineSceneBlockMetaIcon,
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
  timelineSceneBlockTrimDurationBadge,
  timelineSceneBlockTrimHandle,
  timelineSceneBlockTrimHandleActive,
  timelineSceneBlockTrimInspectorHint,
  timelineSceneBlockTrimStrip,
  timelineSceneBlockTrimStripDiscard,
  timelineSceneBlockTrimStripHoldPattern,
  timelineSceneBlockTrimStripSelection,
  timelineSceneBlockTrimStripSelectionPattern,
} from "./timeline-editor.ui";
import type { TimelineSceneBlockVM, TimelineVideoTrimState } from "./timeline-editor.types";
import { resolveTimelineMediaVisualization } from "./timeline-media-visualization.utils";
import {
  resolveDurationNudgeDeltaSec,
  TIMELINE_RESIZE_MAX_DURATION_SEC,
  TIMELINE_RESIZE_MIN_DURATION_SEC,
} from "./timeline-resize.utils";
import {
  buildTimelineTrimMarkerPercents,
  MIN_VIDEO_TRIM_DURATION_MS,
  resolveTimelineVideoTrimEligibility,
  resolveTimelineVideoTrimWindow,
  trimTimeMsToPercent,
  type TimelineVideoTrimHandle,
} from "./timeline-video-trim.utils";
import {
  formatTimelineTrimHandleAriaValueText,
  formatTimelineTrimHandleTooltip,
  formatTimelineTrimTrackAriaLabel,
  formatTimelineTrimUnavailableTooltip,
} from "./timeline-trim-interaction.utils";

export interface TimelineSceneBlockProps {
  block: TimelineSceneBlockVM;
  scene: FootieScene;
  isSelected: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
  isTrimming?: boolean;
  trimState?: TimelineVideoTrimState | null;
  reorderDisabled?: boolean;
  resizeDisabled?: boolean;
  trimDisabled?: boolean;
  /** Blocks scene context menu while a timeline trim session is active. */
  contextMenuDisabled?: boolean;
  isFinePointer?: boolean;
  showInsertBefore?: boolean;
  onSelect: () => void;
  onMenuOpen: (position: { x: number; y: number }) => void;
  onDragHandlePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizeHandlePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Keyboard nudge — commits through the same duration path as pointer resize. */
  onDurationNudge?: (deltaSec: number) => void;
  onTrimHandlePointerDown?: (
    handle: TimelineVideoTrimHandle,
    event: React.PointerEvent<HTMLButtonElement>,
    stripRect: DOMRect,
  ) => void;
  onTrimHandleKeyDown?: (
    handle: TimelineVideoTrimHandle,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => void;
  blockRef?: (element: HTMLButtonElement | null) => void;
  wrapperRef?: (element: HTMLDivElement | null) => void;
  /**
   * Optional sibling media lane (Sprint 8B) — rendered outside the scene button
   * so interactive controls are never nested inside the scene button.
   */
  mediaLane?: ReactNode;
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
    <span className="absolute right-1 top-6 z-[2] flex h-3.5 w-3.5 items-center justify-center rounded-md bg-black/55 text-white/90 ring-1 ring-white/10 backdrop-blur-sm">
      <Icon className="h-2 w-2" strokeWidth={2} aria-hidden />
    </span>
  );
}

export default function TimelineSceneBlock({
  block,
  scene,
  isSelected,
  isDragging = false,
  isResizing = false,
  isTrimming = false,
  trimState = null,
  reorderDisabled = false,
  resizeDisabled = false,
  trimDisabled = false,
  contextMenuDisabled = false,
  isFinePointer = true,
  showInsertBefore = false,
  onSelect,
  onMenuOpen,
  onDragHandlePointerDown,
  onResizeHandlePointerDown,
  onDurationNudge,
  onTrimHandlePointerDown,
  onTrimHandleKeyDown,
  blockRef,
  wrapperRef,
  mediaLane,
}: TimelineSceneBlockProps) {
  const kebabRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const localWrapperRef = useRef<HTMLDivElement | null>(null);
  const keyboardHighlightTimeoutRef = useRef<number | null>(null);
  const [keyboardHighlight, setKeyboardHighlight] = useState(false);
  const [blockWidthPx, setBlockWidthPx] = useState(0);
  const [trimHandleHighlight, setTrimHandleHighlight] = useState(false);

  const imageUrl = getSceneImageUrl(scene);
  const hasImage = sceneHasImage(scene);
  const sceneCaption = formatSceneTimelineCaption(scene);
  const durationSec = Math.max(
    TIMELINE_RESIZE_MIN_DURATION_SEC,
    Math.round(block.durationLabelSec),
  );
  const showResizeActive = isResizing || keyboardHighlight;

  const committedWindow = resolveTimelineVideoTrimWindow(scene);
  const previewStartMs =
    isTrimming && trimState?.sceneId === block.sceneId
      ? trimState.previewTrimStartMs
      : committedWindow?.trimStartMs ?? 0;
  const previewEndMs =
    isTrimming && trimState?.sceneId === block.sceneId
      ? trimState.previewTrimEndMs
      : committedWindow?.trimEndMs ?? 0;
  const sourceDurationMs = committedWindow?.sourceDurationMs ?? 0;

  const eligibility = resolveTimelineVideoTrimEligibility({
    scene,
    blockWidthPx,
    isFinePointer,
    playbackLocked: false,
    reorderActive: false,
    resizeActive: false,
  });

  const showVideoBadge = eligibility.showVideoBadge;
  const showMiniTrack =
    eligibility.isVideo &&
    eligibility.hasSourceDuration &&
    eligibility.wideEnough &&
    isFinePointer;
  const showHandles = showMiniTrack && !trimDisabled;
  const showInspectorFallback =
    eligibility.showVideoBadge &&
    (!isFinePointer || !eligibility.wideEnough || !eligibility.hasSourceDuration);

  const unavailableReason = !eligibility.wideEnough
    ? "narrow-block"
    : !isFinePointer
      ? "coarse-pointer"
      : !eligibility.hasSourceDuration
        ? "missing-duration"
        : trimDisabled
          ? reorderDisabled && !resizeDisabled
            ? "reorder-active"
            : resizeDisabled && !reorderDisabled
              ? "resize-active"
              : "playback-locked"
          : null;

  const inspectorFallbackTooltip =
    formatTimelineTrimUnavailableTooltip(unavailableReason);
  const startHandleTooltip = trimDisabled
    ? formatTimelineTrimUnavailableTooltip(unavailableReason ?? "playback-locked")
    : formatTimelineTrimHandleTooltip("start", previewStartMs);
  const endHandleTooltip = trimDisabled
    ? formatTimelineTrimUnavailableTooltip(unavailableReason ?? "playback-locked")
    : formatTimelineTrimHandleTooltip("end", previewEndMs);
  const startAriaValueText = formatTimelineTrimHandleAriaValueText(
    "start",
    previewStartMs,
  );
  const endAriaValueText = formatTimelineTrimHandleAriaValueText("end", previewEndMs);
  const trimTrackAriaLabel = formatTimelineTrimTrackAriaLabel({
    trimStartMs: previewStartMs,
    trimEndMs: previewEndMs,
    sceneDurationMs: block.durationMs,
  });

  const startPercent = trimTimeMsToPercent(previewStartMs, sourceDurationMs);
  const endPercent = trimTimeMsToPercent(previewEndMs, sourceDurationMs);
  const selectedWidth = Math.max(0, endPercent - startPercent);
  const markers = buildTimelineTrimMarkerPercents(sourceDurationMs, 6);

  const mediaViz = useMemo(
    () =>
      resolveTimelineMediaVisualization({
        scene,
        sceneDurationMs: block.durationMs,
        blockWidthPx,
        previewTrimStartMs:
          isTrimming && trimState?.sceneId === block.sceneId
            ? trimState.previewTrimStartMs
            : undefined,
        previewTrimEndMs:
          isTrimming && trimState?.sceneId === block.sceneId
            ? trimState.previewTrimEndMs
            : undefined,
      }),
    [block.durationMs, block.sceneId, blockWidthPx, isTrimming, scene, trimState],
  );

  useEffect(() => {
    return () => {
      if (keyboardHighlightTimeoutRef.current != null) {
        window.clearTimeout(keyboardHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = localWrapperRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      setBlockWidthPx(element?.getBoundingClientRect().width ?? 0);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setBlockWidthPx(width);
    });
    observer.observe(element);
    setBlockWidthPx(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const setWrapperRef = (element: HTMLDivElement | null) => {
    localWrapperRef.current = element;
    wrapperRef?.(element);
  };

  const openMenuAt = (x: number, y: number) => {
    if (contextMenuDisabled || isTrimming) {
      return;
    }
    onSelect();
    onMenuOpen({ x, y });
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (contextMenuDisabled || isTrimming) {
      return;
    }
    openMenuAt(event.clientX, event.clientY);
  };

  const handleKebabClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (contextMenuDisabled || isTrimming) {
      return;
    }

    const anchor = kebabRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    openMenuAt(rect.left, rect.bottom + 4);
  };

  const handleDragHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reorderDisabled || isTrimming) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onDragHandlePointerDown?.(event);
  };

  const handleResizeHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (resizeDisabled || isTrimming) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onResizeHandlePointerDown?.(event);
  };

  const handleTrimPointerDown = (
    handle: TimelineVideoTrimHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const strip = stripRef.current;
    if (!strip || !showHandles) {
      return;
    }
    onTrimHandlePointerDown?.(handle, event, strip.getBoundingClientRect());
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

  const handleTrimKeyDown = (
    handle: TimelineVideoTrimHandle,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!showHandles || trimDisabled) {
      return;
    }
    onTrimHandleKeyDown?.(handle, event);
  };

  const MediaBadgeIcon =
    mediaViz.kind === "video" ? Film : mediaViz.kind === "image" ? ImageIcon : AlertTriangle;

  const emptyThumbLabel =
    mediaViz.kind === "video"
      ? "Video"
      : mediaViz.kind === "image"
        ? "Image"
        : "Missing Media";

  const selectionBackgroundImage = mediaViz.holdsLastFrame
    ? `${timelineSceneBlockTrimStripSelectionPattern}, ${timelineSceneBlockTrimStripHoldPattern}`
    : timelineSceneBlockTrimStripSelectionPattern;

  return (
    <div
      ref={setWrapperRef}
      className="group/scene-block relative shrink-0"
      style={{ flexGrow: block.widthPercent, flexShrink: 0, flexBasis: 0, minWidth: "3.5rem" }}
      onContextMenu={handleContextMenu}
      data-scene-id={block.sceneId}
      data-scene-selected={isSelected ? "true" : "false"}
      data-scene-dragging={isDragging ? "true" : "false"}
      data-scene-resizing={showResizeActive ? "true" : "false"}
      data-scene-trimming={isTrimming ? "true" : "false"}
      data-scene-video-trim={showHandles ? "ready" : showVideoBadge ? "fallback" : "none"}
      data-timeline-media-kind={mediaViz.kind}
      data-timeline-media-density={mediaViz.density}
      data-timeline-hold-frame={mediaViz.holdsLastFrame ? "true" : "false"}
      title={mediaViz.tooltip}
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
        aria-label={`Scene ${block.sceneNumber}, ${sceneCaption}, ${mediaViz.ariaSummary}`}
        aria-haspopup="menu"
        className={`${timelineSceneBlockBase} w-full ${isSelected ? timelineSceneBlockSelected : ""} ${isDragging ? timelineSceneBlockDragging : ""}`}
      >
        {isSelected ? <span aria-hidden className={timelineSceneBlockSelectedAccent} /> : null}

        <div
          className={`${timelineSceneBlockThumb} ${hasImage || mediaViz.kind === "video" ? "" : timelineSceneBlockThumbEmpty}`}
        >
          {hasImage && imageUrl ? (
            // Timeline thumbs are tiny scene previews; next/image is unnecessary here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition duration-200 group-hover/scene-block:scale-[1.03]"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
              <MediaBadgeIcon
                className={`h-4 w-4 ${mediaViz.kind === "missing" ? "text-amber-200/70" : "text-muted/50"}`}
                strokeWidth={1.75}
                aria-hidden
              />
              {mediaViz.density !== "icon" ? (
                <span
                  className={`text-center text-[8px] font-medium uppercase tracking-wide ${
                    mediaViz.kind === "missing" ? "text-amber-100/70" : "text-muted/45"
                  }`}
                >
                  {emptyThumbLabel}
                </span>
              ) : null}
            </div>
          )}

          <span aria-hidden className={timelineSceneBlockThumbOverlay} />

          <span
            className={`${timelineSceneBlockMediaBadge} ${
              mediaViz.kind === "missing" ? timelineSceneBlockMediaBadgeMissing : ""
            }`}
            data-timeline-media-badge={mediaViz.kind}
            aria-label={
              mediaViz.kind === "video"
                ? "Video scene"
                : mediaViz.kind === "image"
                  ? "Image scene"
                  : "Missing media"
            }
          >
            <MediaBadgeIcon className="h-2.5 w-2.5 shrink-0" aria-hidden />
            {mediaViz.showMediaBadgeText ? mediaViz.mediaBadgeLabel : null}
            {mediaViz.showMetaIcons && mediaViz.isMuted ? (
              <span className={timelineSceneBlockMetaIcon} aria-label="Muted clip" title="Muted clip">
                <VolumeX className="h-2 w-2" aria-hidden />
              </span>
            ) : null}
            {mediaViz.showMetaIcons && mediaViz.hasPoster ? (
              <span
                className={timelineSceneBlockMetaIcon}
                aria-label="Poster selected"
                title="Poster selected"
              >
                <Frame className="h-2 w-2" aria-hidden />
              </span>
            ) : null}
          </span>

          {mediaViz.density !== "icon" ? (
            <span className={timelineSceneBlockNumberBadge} aria-hidden>
              {block.sceneNumber}
            </span>
          ) : null}

          {scene.sceneType && mediaViz.density === "full" ? (
            <SceneTypeBadge sceneType={scene.sceneType} />
          ) : null}

          <span
            className={`${timelineSceneBlockDurationBadge} ${showResizeActive ? "ring-accent/40" : ""}`}
            aria-label={`Scene duration ${mediaViz.sceneDurationLabel}`}
            data-timeline-scene-duration="true"
          >
            {mediaViz.sceneDurationLabel}
          </span>

          {mediaViz.showClipDurationLabel ? (
            <span
              className={timelineSceneBlockClipDurationBadge}
              aria-label={`Clip duration ${mediaViz.sourceDurationMs / 1000}s`}
              data-timeline-clip-duration="true"
            >
              {mediaViz.clipDurationLabel}
            </span>
          ) : null}

          {mediaViz.showTrimDurationLabel ? (
            <span
              className={timelineSceneBlockTrimDurationBadge}
              aria-label={`Trim duration ${mediaViz.trimDurationMs / 1000}s`}
              data-timeline-trim-duration="true"
            >
              {mediaViz.trimDurationLabel}
            </span>
          ) : null}

          {mediaViz.showHoldBadge ? (
            <span
              className={timelineSceneBlockHoldBadge}
              aria-label="Hold last frame"
              data-timeline-hold-badge="true"
              title="Clip is shorter than the scene — last frame holds until scene end"
            >
              <Snowflake className="h-2.5 w-2.5" aria-hidden />
              {mediaViz.holdLabel}
            </span>
          ) : null}

          {mediaViz.showHoldIconOnly ? (
            <span
              className={timelineSceneBlockHoldBadge}
              aria-label="Hold last frame"
              data-timeline-hold-badge="icon"
              title="Hold last frame — clip is shorter than the scene"
            >
              <Snowflake className="h-2.5 w-2.5" aria-hidden />
              {mediaViz.density === "secondary" ? mediaViz.holdShortLabel : null}
            </span>
          ) : null}

          {showMiniTrack ? (
            <div
              ref={stripRef}
              className={timelineSceneBlockTrimStrip}
              data-timeline-video-trim-strip="true"
              role="img"
              aria-label={trimTrackAriaLabel}
            >
              {markers.map((percent, index) => (
                <span
                  key={index}
                  className="absolute bottom-0 top-0 w-px bg-white/20"
                  style={{ left: `${percent}%` }}
                  aria-hidden
                />
              ))}
              <span
                className={timelineSceneBlockTrimStripDiscard}
                style={{ left: 0, width: `${startPercent}%` }}
                aria-hidden
              />
              <span
                className={timelineSceneBlockTrimStripDiscard}
                style={{ left: `${endPercent}%`, right: 0 }}
                aria-hidden
              />
              <span
                className={`${timelineSceneBlockTrimStripSelection} ${
                  trimHandleHighlight || isTrimming ? "brightness-110" : ""
                }`}
                style={{
                  left: `${startPercent}%`,
                  width: `${selectedWidth}%`,
                  backgroundImage: selectionBackgroundImage,
                }}
                data-timeline-video-trim-selection="true"
                data-timeline-hold-hatch={mediaViz.holdsLastFrame ? "true" : "false"}
                aria-hidden
              />
            </div>
          ) : null}

          {showInspectorFallback ? (
            <span
              className={timelineSceneBlockTrimInspectorHint}
              data-timeline-video-trim-fallback="true"
              title={inspectorFallbackTooltip}
            >
              Trim in inspector
            </span>
          ) : null}
        </div>

        <span className={timelineSceneBlockSceneLabel}>Scene {block.sceneNumber}</span>
        <span className={timelineSceneBlockCaption} title={sceneCaption}>
          {sceneCaption}
        </span>
      </button>

      {showHandles ? (
        <>
          <button
            type="button"
            role="slider"
            tabIndex={trimDisabled ? -1 : 0}
            aria-label="Trim clip start"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, previewEndMs - MIN_VIDEO_TRIM_DURATION_MS)}
            aria-valuenow={previewStartMs}
            aria-valuetext={startAriaValueText}
            aria-disabled={trimDisabled ? true : undefined}
            disabled={trimDisabled}
            title={startHandleTooltip}
            className={`group/trim-handle ${timelineSceneBlockTrimHandle} ${isTrimming && trimState?.activeHandle === "start" ? timelineSceneBlockTrimHandleActive : ""}`}
            style={{
              left: `calc(0.25rem + (100% - 0.5rem) * ${startPercent / 100})`,
              top: "2.65rem",
            }}
            onPointerDown={(event) => handleTrimPointerDown("start", event)}
            onPointerEnter={() => setTrimHandleHighlight(true)}
            onPointerLeave={() => setTrimHandleHighlight(false)}
            onFocus={() => {
              setTrimHandleHighlight(true);
              onSelect();
            }}
            onBlur={() => setTrimHandleHighlight(false)}
            onKeyDown={(event) => handleTrimKeyDown("start", event)}
            data-timeline-video-trim-handle="start"
            data-timeline-cursor="trim-clip"
          />
          <button
            type="button"
            role="slider"
            tabIndex={trimDisabled ? -1 : 0}
            aria-label="Trim clip end"
            aria-valuemin={Math.min(sourceDurationMs, previewStartMs + MIN_VIDEO_TRIM_DURATION_MS)}
            aria-valuemax={sourceDurationMs}
            aria-valuenow={previewEndMs}
            aria-valuetext={endAriaValueText}
            aria-disabled={trimDisabled ? true : undefined}
            disabled={trimDisabled}
            title={endHandleTooltip}
            className={`group/trim-handle ${timelineSceneBlockTrimHandle} ${isTrimming && trimState?.activeHandle === "end" ? timelineSceneBlockTrimHandleActive : ""}`}
            style={{
              left: `calc(0.25rem + (100% - 0.5rem) * ${endPercent / 100})`,
              top: "2.65rem",
            }}
            onPointerDown={(event) => handleTrimPointerDown("end", event)}
            onPointerEnter={() => setTrimHandleHighlight(true)}
            onPointerLeave={() => setTrimHandleHighlight(false)}
            onFocus={() => {
              setTrimHandleHighlight(true);
              onSelect();
            }}
            onBlur={() => setTrimHandleHighlight(false)}
            onKeyDown={(event) => handleTrimKeyDown("end", event)}
            data-timeline-video-trim-handle="end"
            data-timeline-cursor="trim-clip"
          />
        </>
      ) : null}

      <button
        ref={kebabRef}
        type="button"
        aria-label={`Scene ${block.sceneNumber} actions`}
        aria-haspopup="menu"
        aria-disabled={contextMenuDisabled ? true : undefined}
        disabled={contextMenuDisabled}
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
        title={
          reorderDisabled
            ? isTrimming || contextMenuDisabled
              ? "Finish trimming before reordering"
              : "Scene reorder is unavailable during playback"
            : "Drag to reorder scene"
        }
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
            ? isTrimming || contextMenuDisabled
              ? "Finish trimming before resizing scene duration"
              : "Pause playback to resize scene duration"
            : "Resize scene duration"
        }
        className={`${timelineSceneBlockResizeHandle} ${showResizeActive ? timelineSceneBlockResizeHandleActive : ""}`}
        onPointerDown={handleResizeHandlePointerDown}
        onKeyDown={handleResizeKeyDown}
        data-timeline-resize-handle={block.sceneId}
        data-timeline-cursor="resize-duration"
      >
        <span
          aria-hidden
          className={`${timelineSceneBlockResizeHandleBar} ${showResizeActive ? timelineSceneBlockResizeHandleBarActive : ""}`}
        />
      </button>

      {mediaLane ? (
        <div className="relative z-[1] w-full" data-scene-media-lane-slot>
          {mediaLane}
        </div>
      ) : null}
    </div>
  );
}
