"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type CSSProperties,
} from "react";

import {
  resolvePreviewCaptionLayoutForScene,
  resolvePreviewCaptionLayoutScene,
  resolvePreviewCaptionOverlayStyle,
  resolvePreviewCaptionPillStyle,
} from "@/features/caption-engine/caption-layout.utils";
import { resolvePreviewCaptionPillCombinedStyle } from "@/features/caption-style";
import { mergeCaptionLayoutSettings } from "@/features/caption-layout";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { useFrameSize } from "@/hooks/useFrameSize";

import CaptionLayoutGuides from "./CaptionLayoutGuides";
import {
  applyCaptionDragDelta,
  buildCaptionLayoutOffsetCommitPatch,
  measureContentBoxInReferencePx,
  resolveCaptionKeyboardStep,
  resolvePreviewCaptionLayoutForDrag,
  resolveStoredCaptionOffsets,
  type CaptionDragOffset,
} from "./caption-layout-drag.utils";

export interface CaptionPreviewOverlayProps {
  scene: Pick<FootieScene, "captionLayout" | "captionStyle"> & { id?: string };
  script?: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle" | "scenes">;
  sceneIndex?: number;
  children: ReactNode;
  overlayClassName?: string;
  pillClassName: string;
  draggable: boolean;
  /** When false, caption overlay must not capture pointer events (image edit / playback). */
  allowPointerEvents?: boolean;
  onOffsetCommit?: (offsetX: number, offsetY: number) => void;
  onResetLayout?: () => void;
}

interface DragSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originOffsetX: number;
  originOffsetY: number;
}

export default function CaptionPreviewOverlay({
  scene,
  script,
  sceneIndex,
  children,
  overlayClassName = "",
  pillClassName,
  draggable,
  allowPointerEvents = true,
  onOffsetCommit,
  onResetLayout,
}: CaptionPreviewOverlayProps) {
  const layoutScene = resolvePreviewCaptionLayoutScene(script, scene, sceneIndex);
  const { ref: frameRef, width: frameWidth, height: frameHeight } = useFrameSize<HTMLDivElement>();
  const pillRef = useRef<HTMLDivElement>(null);
  const [pillSize, setPillSize] = useState({ width: 0, height: 0 });
  const [draftOffsets, setDraftOffsets] = useState<CaptionDragOffset | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dragSessionRef = useRef<DragSession | null>(null);
  const rafRef = useRef(0);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);

  const [boundingBoxStyle, setBoundingBoxStyle] = useState<CSSProperties>();

  const storedOffsets = useMemo(
    () => resolveStoredCaptionOffsets(layoutScene, script),
    [layoutScene, script],
  );

  const effectiveOffsets = draftOffsets ?? storedOffsets;

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) {
      return;
    }

    const updateSize = () => {
      const rect = pill.getBoundingClientRect();
      setPillSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(pill);
    return () => observer.disconnect();
  }, [children, effectiveOffsets.offsetX, effectiveOffsets.offsetY]);

  const contentBox = measureContentBoxInReferencePx(
    pillSize.width,
    pillSize.height,
    frameWidth,
    frameHeight,
  );

  const mergedSettings = mergeCaptionLayoutSettings(
    layoutScene.captionLayout,
    script?.defaultCaptionLayout,
  );
  const usesEnginePlacement = isDragging || draftOffsets != null;

  const resolvedLayout = usesEnginePlacement
    ? resolvePreviewCaptionLayoutForDrag(
        layoutScene,
        script,
        effectiveOffsets.offsetX,
        effectiveOffsets.offsetY,
        contentBox.width,
        contentBox.height,
      )
    : resolvePreviewCaptionLayoutForScene(
        layoutScene,
        script,
        sceneIndex,
        contentBox.width,
        contentBox.height,
      );

  const usesLegacyBottomCenter = resolvedLayout.usesLegacyBottomCenter;

  const overlayStyle = usesLegacyBottomCenter
    ? undefined
    : resolvePreviewCaptionOverlayStyle(resolvedLayout);
  const pillStyle = usesLegacyBottomCenter
    ? resolvePreviewCaptionPillCombinedStyle(layoutScene, script, {})
    : resolvePreviewCaptionPillCombinedStyle(
        layoutScene,
        script,
        resolvePreviewCaptionPillStyle(resolvedLayout),
      );

  const boxCenterY = resolvedLayout.boxTopY + (resolvedLayout.boxBottomY - resolvedLayout.boxTopY) / 2;
  const captionInteractive = draggable && allowPointerEvents;
  const showBoundingBox = captionInteractive;

  useEffect(() => {
    if (captionInteractive) {
      return;
    }

    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    dragSessionRef.current = null;
    pendingPointerRef.current = null;
    // Clear in-flight drag when preview interaction mode changes (e.g. image edit).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- interaction handoff must reset drag chrome
    setDraftOffsets(null);
    setIsDragging(false);
    setIsFocused(false);
  }, [captionInteractive]);

  useLayoutEffect(() => {
    if (!showBoundingBox || !pillRef.current || !frameRef.current) {
      setBoundingBoxStyle(undefined);
      return;
    }

    const pillRect = pillRef.current.getBoundingClientRect();
    const frameRect = frameRef.current.getBoundingClientRect();
    setBoundingBoxStyle({
      left: pillRect.left - frameRect.left,
      top: pillRect.top - frameRect.top,
      width: pillRect.width,
      height: pillRect.height,
    });
  }, [
    showBoundingBox,
    usesLegacyBottomCenter,
    usesEnginePlacement,
    pillSize.width,
    pillSize.height,
    frameWidth,
    frameHeight,
    effectiveOffsets.offsetX,
    effectiveOffsets.offsetY,
    children,
    frameRef,
  ]);

  const commitOffsets = useCallback(
    (offsetX: number, offsetY: number) => {
      if (!onOffsetCommit) {
        return;
      }

      const patch = buildCaptionLayoutOffsetCommitPatch(layoutScene, script, offsetX, offsetY);
      onOffsetCommit(patch.captionLayout.offsetX ?? 0, patch.captionLayout.offsetY ?? 0);
    },
    [layoutScene, onOffsetCommit, script],
  );

  const applyPointerDelta = useCallback(
    (clientX: number, clientY: number) => {
      const session = dragSessionRef.current;
      if (!session || frameWidth <= 0 || frameHeight <= 0) {
        return;
      }

      const next = applyCaptionDragDelta(
        session.originOffsetX,
        session.originOffsetY,
        clientX - session.startClientX,
        clientY - session.startClientY,
        frameWidth,
        frameHeight,
      );

      setDraftOffsets(next);
    },
    [frameHeight, frameWidth],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!captionInteractive) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);

      dragSessionRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originOffsetX: storedOffsets.offsetX,
        originOffsetY: storedOffsets.offsetY,
      };
      setDraftOffsets(storedOffsets);
      setIsDragging(true);
    },
    [captionInteractive, storedOffsets],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }

      pendingPointerRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current) {
        return;
      }

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        const pending = pendingPointerRef.current;
        if (pending) {
          applyPointerDelta(pending.x, pending.y);
        }
      });
    },
    [applyPointerDelta, isDragging],
  );

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }

      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const finalOffsets = draftOffsets ?? storedOffsets;
      commitOffsets(finalOffsets.offsetX, finalOffsets.offsetY);
      dragSessionRef.current = null;
      pendingPointerRef.current = null;
      setDraftOffsets(null);
      setIsDragging(false);
    },
    [commitOffsets, draftOffsets, isDragging, storedOffsets],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!captionInteractive) {
        return;
      }

      const step = resolveCaptionKeyboardStep(event);
      if (!step) {
        return;
      }

      event.preventDefault();
      const next = {
        offsetX: storedOffsets.offsetX + step.deltaX,
        offsetY: storedOffsets.offsetY + step.deltaY,
      };
      const patch = buildCaptionLayoutOffsetCommitPatch(layoutScene, script, next.offsetX, next.offsetY);
      commitOffsets(patch.captionLayout.offsetX ?? 0, patch.captionLayout.offsetY ?? 0);
    },
    [commitOffsets, captionInteractive, layoutScene, script, storedOffsets.offsetX, storedOffsets.offsetY],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!captionInteractive) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onResetLayout?.();
    },
    [captionInteractive, onResetLayout],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const showChrome = captionInteractive && (isDragging || isFocused);

  return (
    <div ref={frameRef} className="pointer-events-none absolute inset-0 z-[15]">
      <CaptionLayoutGuides
        visible={isDragging}
        safeAreaEnabled={mergedSettings.safeAreaEnabled !== false}
        centerX={resolvedLayout.centerX}
        centerY={boxCenterY}
      />

      {showBoundingBox && boundingBoxStyle ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute z-[16] rounded-xl ring-2 transition-shadow duration-150 ${
            isDragging || isFocused
              ? "ring-accent/80 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
              : "ring-white/35"
          }`}
          style={boundingBoxStyle}
          data-caption-drag-box={usesLegacyBottomCenter ? "legacy" : "engine"}
        >
          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-white/80 ring-1 ring-black/40" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-white/80 ring-1 ring-black/40" />
          <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full bg-white/80 ring-1 ring-black/40" />
          <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-white/80 ring-1 ring-black/40" />
        </div>
      ) : null}

      {showChrome ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[14%] left-1/2 z-[17] -translate-x-1/2 rounded-md bg-black/70 px-2 py-1 text-[10px] tabular-nums text-white/90 ring-1 ring-white/15"
        >
          X: {effectiveOffsets.offsetX} · Y: {effectiveOffsets.offsetY}
        </div>
      ) : null}

      <div
        className={`${usesLegacyBottomCenter ? "preview-narration-subtitle-overlay" : ""} ${overlayClassName}`.trim()}
        style={{
          ...overlayStyle,
          pointerEvents: captionInteractive ? "auto" : "none",
          cursor: captionInteractive ? (isDragging ? "grabbing" : "move") : undefined,
        }}
      >
        <div
          ref={pillRef}
          role={captionInteractive ? "button" : undefined}
          tabIndex={captionInteractive ? 0 : -1}
          aria-label={captionInteractive ? "Move caption" : undefined}
          className={`${pillClassName} ${captionInteractive ? "outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40" : ""}`.trim()}
          style={pillStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
          onDoubleClick={handleDoubleClick}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}