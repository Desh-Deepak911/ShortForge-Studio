"use client";

import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import SceneImageMotionControl from "@/features/editor/components/SceneImageMotionControl";
import SmartEditImageAction from "@/features/tool/components/SmartEditImageAction";
import { useEditorSelectionOptional } from "@/features/editor/selection";
import {
  MAX_SCENE_IMAGE_SCALE,
  MIN_SCENE_IMAGE_SCALE,
  clampSceneImageScale,
  normalizeSceneImageFitMode,
} from "@/features/story/utils";
import {
  studioCompactButton,
  studioFieldLabel,
  studioImageControlDock,
  studioImageFitSegment,
  studioImageFitSegmentActive,
  studioImageFitSegmentedControlStacked,
  studioRange,
  studioRangeTouchHost,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { SceneImageFitMode, SceneImageMotion } from "@/features/story/types";

const ZOOM_STEP = 0.05;

const FRAME_OPTIONS: { value: SceneImageFitMode; label: string; shortLabel: string; title: string }[] = [
  {
    value: "fit",
    label: "Fit full image",
    shortLabel: "Fit image",
    title: "Show the entire image inside the frame",
  },
  {
    value: "fill",
    label: "Fill screen",
    shortLabel: "Fill screen",
    title: "Crop to fill the vertical frame",
  },
];

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
  fitMode?: SceneImageFitMode;
  imageMotion?: SceneImageMotion;
  onScaleChange: (scale: number) => void;
  onFitModeChange: (fitMode: SceneImageFitMode) => void;
  onMotionChange?: (patch: Partial<SceneImageMotion>) => void;
  onReset: () => void;
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
  fitMode,
  imageMotion,
  onScaleChange,
  onFitModeChange,
  onMotionChange,
  onReset,
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
  const canvasEditAvailable = Boolean(selection?.inspectorImageEditAvailable && isScopedScene);

  const clampedScale = clampSceneImageScale(scale);
  const activeFitMode = normalizeSceneImageFitMode(fitMode);
  const containerClassName =
    variant === "attached"
      ? `${studioImageControlDock} space-y-4`
      : "mt-2.5 space-y-4 rounded-xl bg-surface-elevated/30 p-2.5 ring-1 ring-border/20 sm:mt-3 sm:p-3";

  const stepZoom = (delta: number) => {
    onScaleChange(clampSceneImageScale(clampedScale + delta));
  };

  return (
    <div className={`${containerClassName} min-w-0`}>
      {showHeader ? (
        <div>
          <p className={`${studioFieldLabel} mb-0`}>Image Inspector</p>
          <p className={`${studioSubtleText} mt-1`}>
            Frame, zoom, and motion for this scene&apos;s image.
          </p>
        </div>
      ) : null}

      <InspectorSubsection
        title="Frame"
        description="Choose how the image fills the vertical preview frame."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className={studioImageFitSegmentedControlStacked}
            role="radiogroup"
            aria-label="Image frame mode"
          >
            {FRAME_OPTIONS.map((option) => {
              const isActive = activeFitMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  title={option.title}
                  onClick={() => onFitModeChange(option.value)}
                  className={isActive ? studioImageFitSegmentActive : studioImageFitSegment}
                >
                  <span className="sm:hidden">{option.shortLabel}</span>
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onReset}
            title="Reset zoom, position, and frame to defaults"
            className={`${studioCompactButton} min-h-[2rem] w-full shrink-0 sm:min-h-0 sm:w-auto`}
          >
            Reset frame
          </button>
        </div>
      </InspectorSubsection>

      <InspectorSubsection
        title="Zoom"
        description="Zoom in to crop tighter or out to reveal more of the image."
      >
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={controlId} className="sr-only">
            Image zoom
          </label>
          <span className="text-[11px] font-medium tabular-nums text-muted sm:text-xs">
            {clampedScale.toFixed(2)}×
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepZoom(-ZOOM_STEP)}
            disabled={clampedScale <= MIN_SCENE_IMAGE_SCALE}
            title="Zoom out"
            aria-label="Zoom out"
            className={`${studioCompactButton} min-h-[2.25rem] shrink-0 px-2.5 sm:min-h-0`}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <div className={`${studioRangeTouchHost} flex-1`}>
            <input
              id={controlId}
              type="range"
              min={MIN_SCENE_IMAGE_SCALE}
              max={MAX_SCENE_IMAGE_SCALE}
              step={0.01}
              value={clampedScale}
              onChange={(event) => onScaleChange(Number(event.target.value))}
              aria-valuemin={MIN_SCENE_IMAGE_SCALE}
              aria-valuemax={MAX_SCENE_IMAGE_SCALE}
              aria-valuenow={clampedScale}
              aria-label="Image zoom"
              className={studioRange}
            />
          </div>
          <button
            type="button"
            onClick={() => stepZoom(ZOOM_STEP)}
            disabled={clampedScale >= MAX_SCENE_IMAGE_SCALE}
            title="Zoom in"
            aria-label="Zoom in"
            className={`${studioCompactButton} min-h-[2.25rem] shrink-0 px-2.5 sm:min-h-0`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </InspectorSubsection>

      <InspectorSubsection title="Position">
        <p className={studioSubtleText}>
          {canvasFrameEditActive
            ? "Drag the image on the preview to adjust focus."
            : canvasEditAvailable
              ? "Click the image on the preview to adjust focus."
              : "Select a scene with an image to adjust focus."}
        </p>
      </InspectorSubsection>

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
