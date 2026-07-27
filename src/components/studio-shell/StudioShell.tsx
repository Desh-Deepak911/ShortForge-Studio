"use client";

import {
  studioShellBodyRowDocument,
  studioShellBodyRowFixed,
  studioShellEditorMaxWidth,
  studioShellEditorPanelGap,
  studioShellMainColumnDocument,
  studioShellMainColumnFixed,
  studioShellMaxWidth,
  studioShellPanelGap,
  studioShellRoot,
  studioShellRootDocument,
  studioShellRootFixed,
} from "@/lib/utils/studioUi";

import StudioCanvas from "./StudioCanvas";
import StudioHeader from "./StudioHeader";
import StudioInspector from "./StudioInspector";
import StudioSidebar from "./StudioSidebar";
import StudioTimelineShell from "./StudioTimelineShell";
import type { StudioShellProps } from "./studio-shell.types";

/**
 * Studio UX 2.0 layout shell — slot-based regions for editor chrome.
 * Presentation only; does not own draft, preview, or export logic.
 */
export default function StudioShell({
  header,
  sidebar,
  canvas,
  inspector,
  inspectorBanner,
  timeline,
  footer,
  focusMode = false,
  compactMode = false,
  hideFooterInFocusMode = true,
  canvasCenterContent = true,
  canvasLayout,
  sidebarVisibleBelowLg = false,
  viewportMode = "document",
  editorLayout,
  className = "",
  "aria-label": ariaLabel = "Studio workspace",
}: StudioShellProps) {
  const isFixedViewport = viewportMode === "fixed";
  const showSidebar = Boolean(sidebar) && !focusMode;
  const showInspector = Boolean(inspector || inspectorBanner) && !focusMode;
  const showFooter = Boolean(footer) && !(focusMode && hideFooterInFocusMode);
  const panelGapClass = editorLayout
    ? studioShellEditorPanelGap
    : studioShellPanelGap;
  const bodyRowClass = sidebarVisibleBelowLg
    ? `flex flex-1 flex-col ${isFixedViewport ? "min-h-0 overflow-hidden" : ""} lg:flex-row ${panelGapClass}`
    : `flex flex-1 ${isFixedViewport ? "min-h-0 overflow-hidden" : ""} ${panelGapClass}`;
  const mainColumnClass = isFixedViewport
    ? studioShellMainColumnFixed
    : studioShellMainColumnDocument;
  const bodyRowInnerClass = isFixedViewport
    ? studioShellBodyRowFixed
    : studioShellBodyRowDocument;
  const rootViewportClass = isFixedViewport
    ? studioShellRootFixed
    : studioShellRootDocument;
  const maxWidthClass = editorLayout
    ? studioShellEditorMaxWidth
    : studioShellMaxWidth;

  return (
    <div
      className={`${studioShellRoot} ${rootViewportClass} ${className}`.trim()}
      data-compact-mode={compactMode ? "true" : "false"}
      data-focus-mode={focusMode ? "true" : "false"}
      data-viewport-mode={viewportMode}
      role="application"
      aria-label={ariaLabel}
    >
      {header}

      <div
        className={`${maxWidthClass} flex flex-1 flex-col ${isFixedViewport ? "min-h-0" : ""} ${panelGapClass}`}
      >
        <div className={bodyRowClass}>
          {showSidebar ? (
            <StudioSidebar
              compactMode={compactMode}
              visibleBelowLg={sidebarVisibleBelowLg}
              viewportMode={viewportMode}
              collapsed={editorLayout?.sidebarCollapsed}
              narrow={editorLayout?.sidebarNarrow}
              mobileOpen={editorLayout?.mobileSidebarOpen}
              onMobileClose={
                editorLayout
                  ? () => editorLayout.onMobileSidebarOpenChange(false)
                  : undefined
              }
            >
              {sidebar}
            </StudioSidebar>
          ) : null}

          <div className={mainColumnClass}>
            <div className={bodyRowInnerClass}>
              {canvas ? (
                <StudioCanvas
                  centerContent={canvasCenterContent}
                  layout={canvasLayout}
                  viewportMode={viewportMode}
                >
                  {canvas}
                </StudioCanvas>
              ) : null}
              {showInspector ? (
                <StudioInspector
                  compactMode={compactMode}
                  viewportMode={viewportMode}
                  collapsed={editorLayout?.inspectorCollapsed}
                  widthPx={editorLayout?.inspectorWidthPx}
                  onToggle={editorLayout?.onInspectorToggle}
                  onResizePointerDown={
                    editorLayout?.onInspectorResizePointerDown
                  }
                  mobileOpen={editorLayout?.mobileInspectorOpen}
                  onMobileClose={
                    editorLayout
                      ? () => editorLayout.onMobileInspectorOpenChange(false)
                      : undefined
                  }
                >
                  {inspectorBanner}
                  {inspector}
                </StudioInspector>
              ) : null}
            </div>

            {timeline ? (
              <StudioTimelineShell
                compactMode={compactMode}
                density={editorLayout?.timelineDensity}
                heightPx={editorLayout?.timelineHeightPx}
                onDensityChange={editorLayout?.onTimelineDensityChange}
                onResizePointerDown={editorLayout?.onTimelineResizePointerDown}
              >
                {timeline}
              </StudioTimelineShell>
            ) : null}
          </div>
        </div>
      </div>

      {showFooter ? footer : null}
    </div>
  );
}

/** Re-export region components for composition outside the default shell grid. */
export {
  StudioCanvas,
  StudioHeader,
  StudioInspector,
  StudioSidebar,
  StudioTimelineShell,
};
