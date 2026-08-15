"use client";

import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import {
  MEDIA_FRAMING_POSITION_UI_MAX,
  MEDIA_FRAMING_POSITION_UI_MIN,
  framingPositionReferenceToUi,
  framingPositionUiToReference,
  isFitWithBlurredBackgroundActive,
  type SceneMediaBackgroundTreatment,
  type SceneMediaFraming,
  type SceneMediaFramingFitMode,
} from "@/features/media-framing";
import {
  MAX_SCENE_IMAGE_SCALE,
  MIN_SCENE_IMAGE_SCALE,
  clampSceneImageScale,
  normalizeSceneImageFitMode,
} from "@/features/story/utils";
import {
  studioCompactButton,
  studioFieldLabel,
  studioImageFitSegment,
  studioImageFitSegmentActive,
  studioImageFitSegmentedControlStacked,
  studioPrimaryButton,
  studioRange,
  studioRangeTouchHost,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const ZOOM_STEP = 0.05;

type FramingPresentationMode = "fit" | "fill" | "fit_with_background";

const FRAME_OPTIONS: {
  value: FramingPresentationMode;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
}[] = [
  {
    value: "fit",
    label: "Fit",
    shortLabel: "Fit",
    title: "Show the entire media inside the frame",
    description: "Show the entire media inside the frame",
  },
  {
    value: "fit_with_background",
    label: "Fit with background",
    shortLabel: "Fit+BG",
    title:
      "Keeps the full video visible and fills the canvas with a blurred background.",
    description:
      "Keeps the full video visible and fills the canvas with a blurred background.",
  },
  {
    value: "fill",
    label: "Fill",
    shortLabel: "Fill",
    title: "Crop to fill the vertical frame",
    description: "Crop to fill the vertical frame",
  },
];

function resolvePresentationMode(
  framing: SceneMediaFraming,
): FramingPresentationMode {
  const fitMode = normalizeSceneImageFitMode(framing.fitMode);
  if (fitMode === "fill") {
    return "fill";
  }
  if (isFitWithBlurredBackgroundActive(framing)) {
    return "fit_with_background";
  }
  return "fit";
}

function presentationToFramingPatch(mode: FramingPresentationMode): {
  fitMode: SceneMediaFramingFitMode;
  backgroundTreatment: SceneMediaBackgroundTreatment;
} {
  if (mode === "fill") {
    return { fitMode: "fill", backgroundTreatment: "none" };
  }
  if (mode === "fit_with_background") {
    return { fitMode: "fit", backgroundTreatment: "blurred_fill" };
  }
  return { fitMode: "fit", backgroundTreatment: "none" };
}

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
        {description ? (
          <p className={`${studioSubtleText} mt-1`}>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export interface MediaFramingInspectorControlsProps {
  framing: SceneMediaFraming;
  onFramingChange: (patch: Partial<SceneMediaFraming>) => void;
  onReset: () => void;
  onReposition?: () => void;
  repositionActive?: boolean;
  controlId: string;
  /** Optional media kind label for accessibility. */
  mediaLabel?: "image" | "video" | "media";
}

/**
 * Shared Framing inspector for images and videos.
 * Direct canvas drag and these controls stay synchronized via StoryDocument framing.
 */
export default function MediaFramingInspectorControls({
  framing,
  onFramingChange,
  onReset,
  onReposition,
  repositionActive = false,
  controlId,
  mediaLabel = "media",
}: MediaFramingInspectorControlsProps) {
  const activeMode = resolvePresentationMode(framing);
  const clampedZoom = clampSceneImageScale(framing.zoom);
  const uiX = framingPositionReferenceToUi(framing.positionX, "x");
  const uiY = framingPositionReferenceToUi(framing.positionY, "y");

  const stepZoom = (delta: number) => {
    onFramingChange({ zoom: clampSceneImageScale(clampedZoom + delta) });
  };

  const fitHelper =
    activeMode === "fill"
      ? "Drag the media to choose which area stays in frame."
      : activeMode === "fit_with_background"
        ? "Keeps the full video visible and fills the canvas with a blurred background."
        : "The full media remains visible; empty space may appear.";

  return (
    <div className="space-y-4" data-media-framing-inspector={mediaLabel}>
      <InspectorSubsection title="Framing" description={fitHelper}>
        <div
          className={studioImageFitSegmentedControlStacked}
          role="radiogroup"
          aria-label={`${mediaLabel} frame mode`}
        >
          {FRAME_OPTIONS.map((option) => {
            const isActive = activeMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                title={option.title}
                onClick={() =>
                  onFramingChange(presentationToFramingPatch(option.value))
                }
                className={
                  isActive ? studioImageFitSegmentActive : studioImageFitSegment
                }
                data-framing-mode={option.value}
              >
                <span className="sm:hidden">{option.shortLabel}</span>
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {onReposition ? (
            <button
              type="button"
              onClick={onReposition}
              title="Drag media on the preview to reposition"
              aria-pressed={repositionActive}
              className={`${repositionActive ? studioPrimaryButton : studioCompactButton} min-h-[2.25rem] w-full justify-center px-3`}
            >
              {repositionActive ? "Dragging…" : "Reposition"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReset}
            title="Reset zoom, position, and rotation to defaults"
            className={`${studioCompactButton} min-h-[2.25rem] w-full justify-center px-3 ${onReposition ? "" : "sm:col-span-2"}`}
          >
            Reset framing
          </button>
        </div>

        {repositionActive ? (
          <p className={`${studioSubtleText} mt-2`}>
            Drag to reposition ·{" "}
            {activeMode === "fill"
              ? "Fill"
              : activeMode === "fit_with_background"
                ? "Fit with background"
                : "Fit"}{" "}
            mode
          </p>
        ) : null}
      </InspectorSubsection>

      <InspectorSubsection title="Horizontal">
        <div className={`${studioRangeTouchHost}`}>
          <input
            id={`${controlId}-x`}
            type="range"
            min={MEDIA_FRAMING_POSITION_UI_MIN}
            max={MEDIA_FRAMING_POSITION_UI_MAX}
            step={1}
            value={Math.round(uiX)}
            onChange={(event) =>
              onFramingChange({
                positionX: framingPositionUiToReference(
                  Number(event.target.value),
                  "x",
                ),
              })
            }
            aria-label={`${mediaLabel} horizontal position`}
            className={studioRange}
          />
        </div>
      </InspectorSubsection>

      <InspectorSubsection title="Vertical">
        <div className={`${studioRangeTouchHost}`}>
          <input
            id={`${controlId}-y`}
            type="range"
            min={MEDIA_FRAMING_POSITION_UI_MIN}
            max={MEDIA_FRAMING_POSITION_UI_MAX}
            step={1}
            value={Math.round(uiY)}
            onChange={(event) =>
              onFramingChange({
                positionY: framingPositionUiToReference(
                  Number(event.target.value),
                  "y",
                ),
              })
            }
            aria-label={`${mediaLabel} vertical position`}
            className={studioRange}
          />
        </div>
      </InspectorSubsection>

      <InspectorSubsection title="Zoom">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={`${controlId}-zoom`} className="sr-only">
            {mediaLabel} zoom
          </label>
          <span className="text-[11px] font-medium tabular-nums text-muted sm:text-xs">
            {clampedZoom.toFixed(2)}×
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepZoom(-ZOOM_STEP)}
            disabled={clampedZoom <= MIN_SCENE_IMAGE_SCALE}
            title="Zoom out"
            aria-label="Zoom out"
            className={`${studioCompactButton} min-h-[2.25rem] shrink-0 px-2.5`}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <div className={`${studioRangeTouchHost} flex-1`}>
            <input
              id={`${controlId}-zoom`}
              type="range"
              min={MIN_SCENE_IMAGE_SCALE}
              max={MAX_SCENE_IMAGE_SCALE}
              step={0.01}
              value={clampedZoom}
              onChange={(event) =>
                onFramingChange({
                  zoom: clampSceneImageScale(Number(event.target.value)),
                })
              }
              aria-valuemin={MIN_SCENE_IMAGE_SCALE}
              aria-valuemax={MAX_SCENE_IMAGE_SCALE}
              aria-valuenow={clampedZoom}
              aria-label={`${mediaLabel} zoom`}
              className={studioRange}
            />
          </div>
          <button
            type="button"
            onClick={() => stepZoom(ZOOM_STEP)}
            disabled={clampedZoom >= MAX_SCENE_IMAGE_SCALE}
            title="Zoom in"
            aria-label="Zoom in"
            className={`${studioCompactButton} min-h-[2.25rem] shrink-0 px-2.5`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </InspectorSubsection>
    </div>
  );
}
