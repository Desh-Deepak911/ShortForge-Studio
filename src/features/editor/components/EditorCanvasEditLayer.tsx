"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CanvasGuideLayer from "@/features/editor/components/CanvasGuideLayer";
import CanvasInteractionOverlay from "@/features/editor/components/CanvasInteractionOverlay";
import EditorCanvasSelectionLayer from "@/features/editor/components/EditorCanvasSelectionLayer";
import MediaPicker from "@/features/editor/components/MediaPicker";
import {
  areCanvasEditHintsDismissed,
  dismissCanvasEditHints,
} from "@/features/editor/components/canvasOverlayStorage";
import { useEditorSelection } from "@/features/editor/selection";
import type { FootieScene } from "@/features/story/types";
import {
  clampSceneImageScale,
  getSceneImage,
  sceneHasImage,
  withScreenDragOffset,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import { useFrameSize } from "@/hooks/useFrameSize";

const WHEEL_ZOOM_STEP = 0.05;
const WHEEL_FEEDBACK_MS = 700;
const HINT_AUTO_DISMISS_MS = 5000;

export interface EditorCanvasEditLayerProps {
  scene: FootieScene;
  sceneIndex: number;
  onTransformChange: (patch: SceneImageTransformPatch) => void;
  /** Resets pan/zoom via existing scene image reset (preserves motion presets). */
  onResetFrame?: () => void;
  /** When false, the layer must not intercept pointer events (playback). */
  allowPointerEvents?: boolean;
  /** Layer positioning class — elevated above caption overlays during image edit. */
  layerClassName?: string;
}

/**
 * Canvas interaction layer for the editor preview frame.
 * Edit mode is owned by EditorSelectionProvider — this layer reads SelectionContext only.
 */
export default function EditorCanvasEditLayer({
  scene,
  sceneIndex,
  onTransformChange,
  onResetFrame,
  allowPointerEvents = true,
  layerClassName = "absolute inset-0 z-[4]",
}: EditorCanvasEditLayerProps) {
  const { canvasEditMode, selectImage, setImageHover } = useEditorSelection();
  const mode = canvasEditMode;

  const { ref: frameRef, width: frameWidth, height: frameHeight } = useFrameSize<HTMLDivElement>();
  const wheelFeedbackTimeoutRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [wheelActive, setWheelActive] = useState(false);
  const [hintsDismissed, setHintsDismissed] = useState(areCanvasEditHintsDismissed);

  const sceneImage = getSceneImage(scene);
  const guideImage = useMemo(() => {
    if (!sceneImage) {
      return null;
    }

    if (dragOffset && frameWidth > 0 && frameHeight > 0) {
      return withScreenDragOffset(sceneImage, dragOffset, frameWidth, frameHeight);
    }

    return sceneImage;
  }, [dragOffset, frameHeight, frameWidth, sceneImage]);
  const displayScale = sceneImage?.scale ?? 1;
  const displayPanX = sceneImage?.x ?? 0;
  const displayPanY = sceneImage?.y ?? 0;

  const enterFrameEdit = useCallback(() => {
    selectImage(scene.id);
  }, [scene.id, selectImage]);

  const dismissHints = useCallback(() => {
    setHintsDismissed((current) => {
      if (current) {
        return current;
      }

      dismissCanvasEditHints();
      return true;
    });
  }, []);

  const pulseWheelFeedback = useCallback(() => {
    setWheelActive(true);

    if (wheelFeedbackTimeoutRef.current != null) {
      window.clearTimeout(wheelFeedbackTimeoutRef.current);
    }

    wheelFeedbackTimeoutRef.current = window.setTimeout(() => {
      setWheelActive(false);
      wheelFeedbackTimeoutRef.current = null;
    }, WHEEL_FEEDBACK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (wheelFeedbackTimeoutRef.current != null) {
        window.clearTimeout(wheelFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== "frameEdit" || hintsDismissed) {
      return;
    }

    const timer = window.setTimeout(dismissHints, HINT_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [dismissHints, hintsDismissed, mode]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || mode !== "frameEdit") {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const image = getSceneImage(scene);
      if (!image) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const direction = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0;
      if (direction === 0) {
        return;
      }

      const currentScale = clampSceneImageScale(image.scale);
      const nextScale = clampSceneImageScale(currentScale + direction * WHEEL_ZOOM_STEP);

      if (nextScale === currentScale) {
        return;
      }

      pulseWheelFeedback();
      onTransformChange({ scale: nextScale });
    };

    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, [mode, onTransformChange, pulseWheelFeedback, scene, frameRef]);

  if (!sceneHasImage(scene) || mode === "playback") {
    return null;
  }

  if (mode === "preview") {
    return (
      <button
        type="button"
        aria-label="Edit scene image framing"
        className={`${layerClassName} bg-transparent ${allowPointerEvents ? "cursor-pointer" : "pointer-events-none cursor-default"}`}
        onPointerEnter={() => setImageHover(scene.id)}
        onPointerLeave={() => setImageHover(null)}
        onPointerDown={(event) => {
          if (!allowPointerEvents) {
            return;
          }

          if (!event.isPrimary) {
            return;
          }

          if (event.pointerType === "mouse" && event.button !== 0) {
            return;
          }

          event.preventDefault();
          enterFrameEdit();
        }}
      />
    );
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    onResetFrame?.();
  };

  const handleInteractionStart = () => {
    dismissHints();
  };

  return (
    <div
      ref={frameRef}
      className={`${layerClassName} ${allowPointerEvents ? "" : "pointer-events-none"}`.trim()}
      onDoubleClick={handleDoubleClick}
    >
      <EditorCanvasSelectionLayer />
      {guideImage ? <CanvasGuideLayer visible image={guideImage} /> : null}
      <CanvasInteractionOverlay
        showHints={!hintsDismissed}
        scale={displayScale}
        panX={displayPanX}
        panY={displayPanY}
        interactionActive={isDragging || wheelActive}
      />
      <MediaPicker
        scene={scene}
        alt={`Scene ${sceneIndex + 1}`}
        onInteractionStart={handleInteractionStart}
        onTransformChange={onTransformChange}
        onDraggingChange={setIsDragging}
        onDragOffsetChange={setDragOffset}
      />
    </div>
  );
}
