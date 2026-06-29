import {
  studioShellInspectorWidth,
  studioShellInspectorWidthCompact,
  studioShellRegionPadding,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioInspectorProps extends StudioShellRegionProps {
  compactMode?: boolean;
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
  "aria-label": ariaLabel = "Inspector",
}: StudioInspectorProps) {
  const widthClass = compactMode ? studioShellInspectorWidthCompact : studioShellInspectorWidth;

  return (
    <aside
      id={id}
      aria-label={ariaLabel}
      className={`${widthClass} border-t border-border/40 bg-surface/15 lg:border-l lg:border-t-0 ${className}`.trim()}
    >
      <div className={`flex min-w-0 flex-col ${studioShellRegionPadding}`}>{children}</div>
    </aside>
  );
}
