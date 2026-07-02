"use client";

import { Image as ImageIcon } from "lucide-react";

import RibbonAction, { RibbonMetric } from "@/components/studio-shell/RibbonAction";
import RibbonSection from "@/components/studio-shell/RibbonSection";
import {
  openSmartEditImageToolFromContext,
  SMART_EDIT_HAS_IMAGE_COPY,
} from "@/features/tool/components/SmartEditImageAction";
import { useSmartEditImageContext } from "@/features/tool/hooks/useSmartEditImageContext";
import {
  clampSceneImageScale,
  normalizeSceneImageFitMode,
} from "@/features/story/utils";
import type { SceneImageFitMode } from "@/features/story/types";

export interface ImageRibbonContextProps {
  fitMode?: SceneImageFitMode;
  scale: number;
  onReplaceImage: (file: File) => void;
  onFitModeChange: (fitMode: SceneImageFitMode) => void;
  onReset: () => void;
}

/**
 * Image editing context for StudioContextRibbon.
 * Wires presentation controls to existing scene image handlers.
 */
export default function ImageRibbonContext({
  fitMode,
  scale,
  onReplaceImage,
  onFitModeChange,
  onReset,
}: ImageRibbonContextProps) {
  const activeFitMode = normalizeSceneImageFitMode(fitMode);
  const zoomPercent = `${Math.round(clampSceneImageScale(scale) * 100)}%`;
  const smartEditContext = useSmartEditImageContext();

  return (
    <RibbonSection
      title="Image"
      icon={<ImageIcon className="h-3.5 w-3.5" strokeWidth={1.75} />}
    >
      <RibbonAction
        label="Smart Edit"
        onClick={() => openSmartEditImageToolFromContext(smartEditContext)}
        title={SMART_EDIT_HAS_IMAGE_COPY}
      />
      <RibbonAction
        label="Replace"
        accept="image/*"
        onFileChange={(file) => {
          if (file) {
            onReplaceImage(file);
          }
        }}
      />
      <RibbonAction
        label="Fit"
        active={activeFitMode === "fit"}
        onClick={() => onFitModeChange("fit")}
        title="Show the entire image inside the frame"
      />
      <RibbonAction
        label="Fill"
        active={activeFitMode === "fill"}
        onClick={() => onFitModeChange("fill")}
        title="Crop to fill the vertical frame"
      />
      <RibbonAction label="Reset" onClick={onReset} title="Reset zoom and position" />
      <RibbonMetric label="Zoom" value={zoomPercent} />
    </RibbonSection>
  );
}
