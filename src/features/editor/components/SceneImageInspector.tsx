"use client";

import type { ReactNode } from "react";

import MediaFramingInspectorControls from "@/features/editor/components/MediaFramingInspectorControls";
import SceneImageMotionControl from "@/features/editor/components/SceneImageMotionControl";
import SmartEditImageAction from "@/features/tool/components/SmartEditImageAction";
import { useEditorSelectionOptional } from "@/features/editor/selection";
import type { SceneMediaFraming } from "@/features/media-framing";
import {
  studioFieldLabel,
  studioImageControlDock,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { SceneImageFitMode, SceneImageMotion } from "@/features/story/types";

function InspectorSubsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <p className={`${studioFieldLabel} mb-0`}>{title}</p>
        {description ? <p className={`${studioSubtleText} mt-1`}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export interface SceneImageInspectorProps {
  scale: number;
  positionX?: number;
  positionY?: number;
  rotationDeg?: number;
  fitMode?: SceneImageFitMode;
  imageMotion?: SceneImageMotion;
  onScaleChange: (scale: number) => void;
  onFitModeChange: (fitMode: SceneImageFitMode) => void;
  onPositionChange?: (position: { x?: number; y?: number }) => void;
  onMotionChange?: (patch: Partial<SceneImageMotion>) => void;
  onReset: () => void;
  onReposition?: () => void;
  controlId: string;
  motionControlId?: string;
  variant?: "standalone" | "attached";
  /** When false, omits the top "Image Inspector" heading block. */
  showHeader?: boolean;
  /** When true, motion controls are omitted (compose separately in inspector). */
  hideMotion?: boolean;
  /** When false, omits Smart Edit (e.g. when parent renders it in the upload action row). */
  showSmartEdit?: boolean;
  /** When set, position hint copy is scoped to this scene vs the active selection. */
  sceneId?: string;
}

export default function SceneImageInspector({
  scale,
  positionX = 0,
  positionY = 0,
  rotationDeg = 0,
  fitMode,
  imageMotion,
  onScaleChange,
  onFitModeChange,
  onPositionChange,
  onMotionChange,
  onReset,
  onReposition,
  controlId,
  motionControlId,
  variant = "standalone",
  showHeader = true,
  hideMotion = false,
  showSmartEdit = true,
  sceneId,
}: SceneImageInspectorProps) {
  const selection = useEditorSelectionOptional();
  const isScopedScene = sceneId ? selection?.selectedSceneId === sceneId : true;
  const canvasFrameEditActive = Boolean(selection?.isImageEditing && isScopedScene);

  const framing: SceneMediaFraming = {
    fitMode: fitMode === "fit" ? "fit" : fitMode === "fill" ? "fill" : "fit",
    positionX,
    positionY,
    zoom: scale,
    rotationDeg,
  };

  const containerClassName =
    variant === "attached"
      ? `${studioImageControlDock} space-y-4`
      : "mt-2.5 space-y-4 rounded-xl bg-surface-elevated/30 p-2.5 ring-1 ring-border/20 sm:mt-3 sm:p-3";

  return (
    <div className={`${containerClassName} min-w-0`}>
      {showHeader ? (
        <div>
          <p className={`${studioFieldLabel} mb-0`}>Image Inspector</p>
          <p className={`${studioSubtleText} mt-1`}>
            Frame, zoom, and position for this scene&apos;s image.
          </p>
        </div>
      ) : null}

      <MediaFramingInspectorControls
        framing={framing}
        mediaLabel="image"
        controlId={controlId}
        repositionActive={canvasFrameEditActive}
        onReposition={onReposition}
        onReset={onReset}
        onFramingChange={(patch) => {
          if (patch.fitMode !== undefined) {
            onFitModeChange(patch.fitMode);
          }
          if (patch.zoom !== undefined) {
            onScaleChange(patch.zoom);
          }
          if (patch.positionX !== undefined || patch.positionY !== undefined) {
            onPositionChange?.({
              x: patch.positionX,
              y: patch.positionY,
            });
          }
        }}
      />

      {onMotionChange && !hideMotion ? (
        <SceneImageMotionControl
          variant="inspector"
          controlId={motionControlId ?? `${controlId}-motion`}
          imageMotion={imageMotion}
          onMotionChange={onMotionChange}
        />
      ) : null}

      {showSmartEdit ? (
        <InspectorSubsection title="Smart Edit">
          <SmartEditImageAction hasImage sceneId={sceneId} />
        </InspectorSubsection>
      ) : null}
    </div>
  );
}
