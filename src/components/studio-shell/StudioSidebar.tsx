import {
  studioShellPanelSurface,
  studioShellRailScrollHost,
  studioShellRegionPadding,
  studioShellSidebarSurface,
  studioShellSidebarWidth,
  studioShellSidebarWidthCompact,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioSidebarProps extends StudioShellRegionProps {
  compactMode?: boolean;
  /** When true, sidebar is visible below `lg` (stacked above canvas). */
  visibleBelowLg?: boolean;
  /** Matches StudioShell viewport — editor fixed vs document scroll routes. */
  viewportMode?: "fixed" | "document";
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
  viewportMode = "document",
  "aria-label": ariaLabel = "Scene list",
}: StudioSidebarProps) {
  const widthClass = compactMode ? studioShellSidebarWidthCompact : studioShellSidebarWidth;
  const visibilityClass = visibleBelowLg
    ? `flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden ${studioShellSidebarSurface} lg:max-h-none lg:w-[15rem] lg:overflow-hidden lg:border-b-0 lg:border-r xl:w-[15rem]`
    : widthClass;
  const isFixedViewport = viewportMode === "fixed";

  return (
    <aside
      id={id}
      aria-label={ariaLabel}
      className={`${visibilityClass} ${visibleBelowLg ? "" : `flex flex-col ${studioShellSidebarSurface}`} ${className}`.trim()}
    >
      {isFixedViewport ? (
        <div className={`flex min-h-0 flex-1 flex-col ${studioShellRegionPadding}`}>
          <div className={`${studioShellRailScrollHost} ${studioShellPanelSurface}`}>{children}</div>
        </div>
      ) : (
        <div className={`flex flex-col ${studioShellRegionPadding}`}>
          <div className={studioShellPanelSurface}>{children}</div>
        </div>
      )}
    </aside>
  );
}
