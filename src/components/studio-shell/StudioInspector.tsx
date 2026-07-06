import {
  studioShellInspectorSurface,
  studioShellInspectorSurfaceFixed,
  studioShellInspectorWidth,
  studioShellInspectorWidthCompact,
  studioShellRegionPadding,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioInspectorProps extends StudioShellRegionProps {
  compactMode?: boolean;
  /** Matches StudioShell viewport — editor fixed vs document scroll routes. */
  viewportMode?: "fixed" | "document";
  /** Accessible label for the inspector landmark. */
  "aria-label"?: string;
}

/**
 * Right contextual properties panel — selection-driven content from parent.
 */
export default function StudioInspector({
  children,
  className = "",
  id,
  compactMode = false,
  viewportMode = "document",
  "aria-label": ariaLabel = "Inspector",
}: StudioInspectorProps) {
  const widthClass = compactMode ? studioShellInspectorWidthCompact : studioShellInspectorWidth;
  const surfaceClass =
    viewportMode === "fixed" ? studioShellInspectorSurfaceFixed : studioShellInspectorSurface;
  const innerClass =
    viewportMode === "fixed"
      ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${studioShellRegionPadding}`
      : `flex min-w-0 flex-col ${studioShellRegionPadding}`;

  return (
    <aside
      id={id}
      aria-label={ariaLabel}
      className={`${widthClass} ${surfaceClass} ${className}`.trim()}
    >
      <div className={innerClass}>{children}</div>
    </aside>
  );
}
