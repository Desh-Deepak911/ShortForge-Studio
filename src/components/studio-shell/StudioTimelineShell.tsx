import {
  studioShellMaxWidth,
  studioShellRegionPadding,
  studioShellTimelineHeight,
  studioShellTimelineHeightCompact,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioTimelineShellProps extends StudioShellRegionProps {
  compactMode?: boolean;
  /** Accessible label for the timeline landmark. */
  "aria-label"?: string;
}

/**
 * Bottom temporal navigation rail — scene chips and transport metadata.
 */
export default function StudioTimelineShell({
  children,
  className = "",
  id,
  compactMode = false,
  "aria-label": ariaLabel = "Timeline",
}: StudioTimelineShellProps) {
  const heightClass = compactMode ? studioShellTimelineHeightCompact : studioShellTimelineHeight;

  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={`${heightClass} ${className}`.trim()}
    >
      <div className={`${studioShellMaxWidth} flex min-h-0 flex-1 flex-col ${studioShellRegionPadding}`}>
        {children}
      </div>
    </section>
  );
}
