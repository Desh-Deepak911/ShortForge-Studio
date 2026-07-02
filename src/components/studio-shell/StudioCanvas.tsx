import {
  studioShellCanvasMaxWidth,
  studioShellCanvasRegion,
  studioShellCanvasRegionEditor,
  studioShellCanvasRegionForm,
  studioShellEditorCanvasHost,
  studioShellRegionPadding,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioCanvasProps extends StudioShellRegionProps {
  /** When false, children fill the canvas region without max-width centering. */
  centerContent?: boolean;
  /** Overrides the canvas region layout when set. */
  layout?: "form" | "editor";
  /** Accessible label for the canvas landmark. */
  "aria-label"?: string;
}

function resolveCanvasRegionClass(
  centerContent: boolean,
  layout?: StudioCanvasProps["layout"],
): string {
  if (layout === "editor") {
    return studioShellCanvasRegionEditor;
  }

  if (layout === "form" || !centerContent) {
    return studioShellCanvasRegionForm;
  }

  return studioShellCanvasRegion;
}

/**
 * Primary visual workspace — preview frame and transport attach here.
 * Does not mount VideoPreview; consumers pass preview as children.
 */
export default function StudioCanvas({
  children,
  className = "",
  id,
  centerContent = true,
  layout,
  "aria-label": ariaLabel = "Preview canvas",
}: StudioCanvasProps) {
  const regionClass = resolveCanvasRegionClass(centerContent, layout);
  const useCenteredChildWrap = centerContent && layout !== "editor" && layout !== "form";
  const useEditorHost = layout === "editor";

  return (
    <main
      id={id}
      aria-label={ariaLabel}
      className={`${regionClass} ${studioShellRegionPadding} ${className}`.trim()}
    >
      {useEditorHost ? (
        <div className={studioShellEditorCanvasHost}>{children}</div>
      ) : useCenteredChildWrap ? (
        <div className={`${studioShellCanvasMaxWidth} min-h-0 min-w-0 flex-1`}>{children}</div>
      ) : (
        children
      )}
    </main>
  );
}
