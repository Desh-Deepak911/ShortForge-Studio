import {
  studioShellPanelSurface,
  studioShellRegionPadding,
  studioShellSidebarWidth,
  studioShellSidebarWidthCompact,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioSidebarProps extends StudioShellRegionProps {
  compactMode?: boolean;
  /** When true, sidebar is visible below `lg` (stacked above canvas). */
  visibleBelowLg?: boolean;
  /** Accessible label for the sidebar landmark. */
  "aria-label"?: string;
}

/**
 * Left scene-list rail. Hidden below `lg` — tablet/mobile use timeline + sheets later.
 */
export default function StudioSidebar({
  children,
  className = "",
  id,
  compactMode = false,
  visibleBelowLg = false,
  "aria-label": ariaLabel = "Scene list",
}: StudioSidebarProps) {
  const widthClass = compactMode ? studioShellSidebarWidthCompact : studioShellSidebarWidth;
  const visibilityClass = visibleBelowLg
    ? "flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden border-b border-border/40 bg-surface/15 lg:max-h-none lg:w-[15rem] lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r xl:w-[15rem]"
    : widthClass;

  return (
    <aside
      id={id}
      aria-label={ariaLabel}
      className={`${visibilityClass} ${visibleBelowLg ? "" : "flex flex-col border-r border-border/40 bg-surface/15"} ${className}`.trim()}
    >
      <div className={`flex min-h-0 flex-1 flex-col ${studioShellRegionPadding}`}>
        <div className={`min-h-0 flex-1 ${studioShellPanelSurface}`}>{children}</div>
      </div>
    </aside>
  );
}
