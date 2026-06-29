import {
  studioShellCanvasMaxWidth,
  studioShellCanvasRegion,
  studioShellCanvasRegionForm,
  studioShellRegionPadding,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioCanvasProps extends StudioShellRegionProps {
  /** When false, children fill the canvas region without max-width centering. */
  centerContent?: boolean;
  /** Accessible label for the canvas landmark. */
  "aria-label"?: string;
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
  "aria-label": ariaLabel = "Preview canvas",
}: StudioCanvasProps) {
  const regionClass = centerContent ? studioShellCanvasRegion : studioShellCanvasRegionForm;

  return (
    <main
      id={id}
      aria-label={ariaLabel}
      className={`${regionClass} ${studioShellRegionPadding} ${className}`.trim()}
    >
      {centerContent ? (
        <div className={`${studioShellCanvasMaxWidth} min-h-0 min-w-0 flex-1`}>{children}</div>
      ) : (
        children
      )}
    </main>
  );
}
