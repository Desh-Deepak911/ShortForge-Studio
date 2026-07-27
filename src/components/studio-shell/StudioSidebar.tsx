import { X } from "lucide-react";

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
  /** Editor-only thumbnail rail mode. Children retain selection behavior. */
  collapsed?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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
  collapsed = false,
  mobileOpen,
  onMobileClose,
  "aria-label": ariaLabel = "Scene list",
}: StudioSidebarProps) {
  const effectiveCollapsed = collapsed && !mobileOpen;
  const widthClass =
    mobileOpen === true
      ? `${collapsed ? "lg:w-[4.75rem]" : compactMode ? "lg:w-[12.5rem]" : "lg:w-[15rem]"} fixed bottom-[4.75rem] left-0 top-[4.5rem] z-50 flex w-[min(20rem,88vw)] min-h-0 shrink-0 flex-col shadow-2xl lg:static lg:z-auto lg:shadow-none`
      : mobileOpen === false
        ? effectiveCollapsed
          ? "hidden min-h-0 w-[4.75rem] shrink-0 flex-col lg:flex"
          : compactMode
            ? studioShellSidebarWidthCompact
            : studioShellSidebarWidth
        : effectiveCollapsed
          ? "hidden min-h-0 w-[4.75rem] shrink-0 flex-col lg:flex"
          : compactMode
            ? studioShellSidebarWidthCompact
            : studioShellSidebarWidth;
  const visibilityClass = visibleBelowLg
    ? `flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden ${studioShellSidebarSurface} lg:max-h-none lg:w-[15rem] lg:overflow-hidden lg:border-b-0 lg:border-r xl:w-[15rem]`
    : widthClass;
  const isFixedViewport = viewportMode === "fixed";

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close scenes panel"
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      ) : null}
      <aside
        id={id}
        aria-label={ariaLabel}
        className={`${visibilityClass} ${visibleBelowLg ? "" : `flex flex-col ${studioShellSidebarSurface}`} ${className}`.trim()}
        data-sidebar-collapsed={effectiveCollapsed ? "true" : "false"}
      >
        {mobileOpen ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 text-muted ring-1 ring-border/30 lg:hidden"
            aria-label="Close scenes panel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {isFixedViewport ? (
          <div
            className={`flex min-h-0 flex-1 flex-col ${studioShellRegionPadding}`}
          >
            <div
              className={`${studioShellRailScrollHost} ${studioShellPanelSurface}`}
            >
              {children}
            </div>
          </div>
        ) : (
          <div className={`flex flex-col ${studioShellRegionPadding}`}>
            <div className={studioShellPanelSurface}>{children}</div>
          </div>
        )}
      </aside>
    </>
  );
}
