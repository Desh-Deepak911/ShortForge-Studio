"use client";

import {
  studioShellBodyRow,
  studioShellMainColumn,
  studioShellMaxWidth,
  studioShellPanelGap,
  studioShellRoot,
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
  timeline,
  footer,
  focusMode = false,
  compactMode = false,
  hideFooterInFocusMode = true,
  canvasCenterContent = true,
  sidebarVisibleBelowLg = false,
  className = "",
  "aria-label": ariaLabel = "Studio workspace",
}: StudioShellProps) {
  const showSidebar = Boolean(sidebar) && !focusMode;
  const showFooter = Boolean(footer) && !(focusMode && hideFooterInFocusMode);
  const bodyRowClass = sidebarVisibleBelowLg
    ? `flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row ${studioShellPanelGap}`
    : `flex min-h-0 flex-1 overflow-hidden ${studioShellPanelGap}`;

  return (
    <div
      className={`${studioShellRoot} h-dvh ${className}`.trim()}
      data-compact-mode={compactMode ? "true" : "false"}
      data-focus-mode={focusMode ? "true" : "false"}
      role="application"
      aria-label={ariaLabel}
    >
      {header}

      <div className={`${studioShellMaxWidth} flex min-h-0 flex-1 flex-col ${studioShellPanelGap}`}>
        <div className={bodyRowClass}>
          {showSidebar ? (
            <StudioSidebar compactMode={compactMode} visibleBelowLg={sidebarVisibleBelowLg}>
              {sidebar}
            </StudioSidebar>
          ) : null}

          <div className={studioShellMainColumn}>
            <div className={studioShellBodyRow}>
              {canvas ? <StudioCanvas centerContent={canvasCenterContent}>{canvas}</StudioCanvas> : null}
              {inspector ? (
                <StudioInspector compactMode={compactMode}>{inspector}</StudioInspector>
              ) : null}
            </div>

            {timeline ? (
              <StudioTimelineShell compactMode={compactMode}>{timeline}</StudioTimelineShell>
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
