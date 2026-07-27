import type { PointerEventHandler, ReactNode } from "react";

export type StudioTimelineDensity = "compact" | "comfortable" | "expanded";

export interface StudioShellEditorLayout {
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  inspectorWidthPx: number;
  timelineDensity: StudioTimelineDensity;
  timelineHeightPx: number;
  onSidebarToggle: () => void;
  onInspectorToggle: () => void;
  onInspectorResizePointerDown: PointerEventHandler<HTMLElement>;
  onTimelineDensityChange: (density: StudioTimelineDensity) => void;
  onTimelineResizePointerDown: PointerEventHandler<HTMLElement>;
  mobileSidebarOpen: boolean;
  mobileInspectorOpen: boolean;
  onMobileSidebarOpenChange: (open: boolean) => void;
  onMobileInspectorOpenChange: (open: boolean) => void;
}

export interface StudioShellProps {
  /** Top chrome — brand, project context, global actions. */
  header?: ReactNode;
  /** Left scene list / navigation rail. */
  sidebar?: ReactNode;
  /** Primary visual workspace (preview canvas). */
  canvas?: ReactNode;
  /** Right contextual properties panel. */
  inspector?: ReactNode;
  /** Optional banner rendered above inspector content (e.g. story sync health). */
  inspectorBanner?: ReactNode;
  /** Bottom temporal navigation rail. */
  timeline?: ReactNode;
  /** Optional footer — omitted in focus mode when `hideFooterInFocusMode` is true. */
  footer?: ReactNode;
  /** Reduces chrome: hides sidebar and optional footer. */
  focusMode?: boolean;
  /** Narrower sidebar and inspector widths. */
  compactMode?: boolean;
  /** When true, footer is not rendered in focus mode (default: true). */
  hideFooterInFocusMode?: boolean;
  /** When false, canvas children fill the region (brief forms). Default true for preview. */
  canvasCenterContent?: boolean;
  /** Editor preview layout — overflow hidden, vertically centered, no empty canvas scroll. */
  canvasLayout?: "form" | "editor";
  /** When true, sidebar stacks above the canvas on viewports below `lg`. */
  sidebarVisibleBelowLg?: boolean;
  /**
   * `fixed` — editor: locks shell to viewport height (h-dvh), internal rail scroll.
   * `document` — create/review: min-height page flow, browser scroll allowed.
   */
  viewportMode?: "fixed" | "document";
  /** Optional editor-only presentation state. Never owns document or editing data. */
  editorLayout?: StudioShellEditorLayout;
  className?: string;
  /** Accessible label for the shell landmark. */
  "aria-label"?: string;
}

export interface StudioShellRegionProps {
  children?: ReactNode;
  className?: string;
  id?: string;
}

export interface StudioPanelProps {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Removes inner padding for full-bleed canvas content. */
  bleed?: boolean;
}

export interface StudioSectionProps {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
  id?: string;
}
