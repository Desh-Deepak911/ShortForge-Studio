"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import SceneFrameImage from "@/features/editor/components/SceneFrameImage";
import SceneFrameVideo from "@/features/editor/components/SceneFrameVideo";
import {
  resolveSceneMediaFraming,
  sceneHasFramableMedia,
} from "@/features/media-framing";
import { useDragScrollLock } from "@/hooks/useDragScrollLock";
import {
  applyReferencePanFromScreenDelta,
  getSceneMedia,
  getSceneMediaType,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import type { FootieScene } from "@/features/story/types";

interface MediaPickerProps {
  scene: FootieScene;
  alt: string;
  onInteractionStart?: () => void;
  onTransformChange: (patch: SceneImageTransformPatch) => void;
  /** Presentation-only — notifies when drag state changes. */
  onDraggingChange?: (dragging: boolean) => void;
  /** Presentation-only — live drag offset for canvas guide preview. */
  onDragOffsetChange?: (offset: { x: number; y: number } | null) => void;
  /**
   * When true, only the drag overlay is rendered (video stays in SceneBackdrop
   * so the element is not recreated during reposition).
   */
  overlayOnly?: boolean;
  className?: string;
}

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
};

/**
 * Direct media framing manipulation (image + video).
 * Local drag delta is temporary; pointer release commits one StoryDocument patch.
 */
export default function MediaPicker({
  scene,
  alt,
  onInteractionStart,
  onTransformChange,
  onDraggingChange,
  onDragOffsetChange,
  overlayOnly = false,
  className = "absolute inset-0 overflow-hidden",
}: MediaPickerProps) {
  const media = getSceneMedia(scene);
  const mediaType = getSceneMediaType(scene);
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useDragScrollLock(isDragging);

  useEffect(() => {
    onDraggingChange?.(isDragging);
  }, [isDragging, onDraggingChange]);

  useEffect(() => {
    onDragOffsetChange?.(isDragging ? dragOffset : null);
  }, [dragOffset, isDragging, onDragOffsetChange]);

  const interactionEnabled = sceneHasFramableMedia(scene);

  const commitDrag = useCallback(
    (deltaX: number, deltaY: number, pointerId: number) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== pointerId) {
        return;
      }

      const frame = overlayRef.current?.parentElement?.getBoundingClientRect();
      const nextPan = applyReferencePanFromScreenDelta(
        session.originX,
        session.originY,
        deltaX,
        deltaY,
        frame?.width ?? 0,
        frame?.height ?? 0,
      );

      // Clear session before releasing capture so onLostPointerCapture cannot double-commit.
      dragSessionRef.current = null;
      dragOffsetRef.current = { x: 0, y: 0 };
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });

      onTransformChange(nextPan);

      const overlay = overlayRef.current;
      if (overlay?.hasPointerCapture(pointerId)) {
        overlay.releasePointerCapture(pointerId);
      }
    },
    [onTransformChange],
  );

  const finishActiveDrag = (pointerId: number) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== pointerId) {
      return;
    }

    commitDrag(dragOffsetRef.current.x, dragOffsetRef.current.y, pointerId);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactionEnabled || !event.isPrimary) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const liveFraming = resolveSceneMediaFraming(scene);
    onInteractionStart?.();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    dragSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: liveFraming.positionX,
      originY: liveFraming.positionY,
    };

    dragOffsetRef.current = { x: 0, y: 0 };
    setIsDragging(true);
    setDragOffset({ x: 0, y: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const nextOffset = {
      x: event.clientX - session.startClientX,
      y: event.clientY - session.startClientY,
    };

    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  };

  if (!interactionEnabled) {
    return null;
  }

  const liveOffset = isDragging ? dragOffset : undefined;
  const showImage =
    !overlayOnly && mediaType !== "video" && Boolean(resolveSceneMediaFraming(scene));
  const showVideo =
    !overlayOnly && mediaType === "video" && media?.type === "video" && Boolean(media.url);

  return (
    <>
      {showImage ? (
        <SceneFrameImage
          scene={scene}
          alt={alt}
          className={className}
          transformOffset={liveOffset}
          isDragging={isDragging}
        />
      ) : null}
      {showVideo && media?.type === "video" ? (
        <SceneFrameVideo
          media={media}
          scene={scene}
          alt={alt}
          className={className}
          transformOffset={liveOffset}
          isDragging={isDragging}
          isPlaying={false}
          isActive
        />
      ) : null}
      <div
        ref={overlayRef}
        aria-hidden
        data-media-framing-drag="true"
        style={{ touchAction: "none" }}
        className={`absolute inset-0 z-[5] touch-none select-none ${
          interactionEnabled ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishActiveDrag(event.pointerId)}
        onPointerCancel={(event) => finishActiveDrag(event.pointerId)}
        onLostPointerCapture={(event) => finishActiveDrag(event.pointerId)}
      />
    </>
  );
}
