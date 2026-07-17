import {
  studioShellMaxWidth,
  studioShellRegionPadding,
  studioShellTimelineHeightCompact,
  studioShellTimelineHeightMultiImage,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioTimelineShellProps extends StudioShellRegionProps {
  compactMode?: boolean;
  /** Accessible label for the timeline landmark. */
  "aria-label"?: string;
}

/**
 * Bottom temporal navigation rail — scene chips and transport metadata.
 *
 * Sprint 8E.3: multi-image shell height is the production default so Scene Media
 * Timeline lanes (below each scene block) are not clipped by fixed h + overflow-hidden.
 */
export default function StudioTimelineShell({
  children,
  className = "",
  id,
  compactMode = false,
  "aria-label": ariaLabel = "Timeline",
}: StudioTimelineShellProps) {
  const heightClass = compactMode
    ? studioShellTimelineHeightCompact
    : studioShellTimelineHeightMultiImage;

  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={`${heightClass} ${className}`.trim()}
      data-timeline-shell-multi-image="true"
    >
      <div className={`${studioShellMaxWidth} flex min-h-0 flex-1 flex-col ${studioShellRegionPadding}`}>
        {children}
      </div>
    </section>
  );
}
