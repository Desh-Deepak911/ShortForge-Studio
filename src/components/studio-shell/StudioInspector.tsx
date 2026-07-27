import { PanelRightClose, PanelRightOpen, X } from "lucide-react";
import type { CSSProperties, PointerEventHandler } from "react";

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
  collapsed?: boolean;
  widthPx?: number;
  onToggle?: () => void;
  onResizePointerDown?: PointerEventHandler<HTMLElement>;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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
  collapsed = false,
  widthPx,
  onToggle,
  onResizePointerDown,
  mobileOpen,
  onMobileClose,
  "aria-label": ariaLabel = "Inspector",
}: StudioInspectorProps) {
  const effectiveCollapsed = collapsed && !mobileOpen;
  const mobileClass =
    mobileOpen === true
      ? "fixed bottom-[4.75rem] right-0 top-[4.5rem] z-50 flex w-[min(24rem,92vw)] shadow-2xl lg:static lg:z-auto lg:shadow-none"
      : mobileOpen === false
        ? "hidden lg:flex"
        : "flex";
  const widthClass = effectiveCollapsed
    ? `${mobileClass} min-h-0 w-[3.5rem] shrink-0 flex-col`
    : widthPx != null
      ? `${mobileClass} min-h-0 w-full shrink-0 flex-col lg:w-[var(--editor-inspector-width)]`
      : compactMode
        ? studioShellInspectorWidthCompact
        : studioShellInspectorWidth;
  const surfaceClass =
    viewportMode === "fixed"
      ? studioShellInspectorSurfaceFixed
      : studioShellInspectorSurface;
  const innerClass =
    viewportMode === "fixed"
      ? `relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${studioShellRegionPadding}`
      : `flex min-w-0 flex-col ${studioShellRegionPadding}`;
  const style =
    widthPx != null
      ? ({ "--editor-inspector-width": `${widthPx}px` } as CSSProperties)
      : undefined;

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close inspector"
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      ) : null}
      <aside
        id={id}
        aria-label={ariaLabel}
        className={`${widthClass} ${surfaceClass} relative ${className}`.trim()}
        style={style}
        data-inspector-collapsed={effectiveCollapsed ? "true" : "false"}
      >
        {mobileOpen ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 text-muted ring-1 ring-border/30 lg:hidden"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {!effectiveCollapsed && onResizePointerDown ? (
          <button
            type="button"
            aria-label="Resize inspector"
            className="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none lg:block"
            onPointerDown={onResizePointerDown}
          >
            <span className="mx-auto block h-full w-px bg-border/25 transition-colors hover:bg-accent/60" />
          </button>
        ) : null}

        {effectiveCollapsed ? (
          <div className="flex min-h-0 flex-1 flex-col items-center px-2 py-3">
            <button
              type="button"
              onClick={onToggle}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated/45 text-muted ring-1 ring-border/35 transition hover:text-foreground"
              aria-label="Open inspector"
              title="Open inspector (Ctrl/⌘ Shift I)"
            >
              <PanelRightOpen className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className={innerClass}>
            {onToggle ? (
              <button
                type="button"
                onClick={onToggle}
                className="absolute right-5 top-4 z-20 hidden h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface-elevated/60 hover:text-foreground lg:flex"
                aria-label="Collapse inspector"
                title="Collapse inspector (Ctrl/⌘ Shift I)"
              >
                <PanelRightClose className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {children}
          </div>
        )}
      </aside>
    </>
  );
}
