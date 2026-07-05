/** Schema version for persisted caption layout settings. v2 uses pixel offsets. */
export const CAPTION_LAYOUT_VERSION = 2;

export type CaptionAnchor =
  | "bottom_center"
  | "center"
  | "top_center"
  | "top_left"
  | "top_right"
  | "center_left"
  | "center_right"
  | "bottom_left"
  | "bottom_right";

export type CaptionTextAlign = "left" | "center" | "right";

/** Persisted caption layout — scene override or project default. */
export interface CaptionLayout {
  version?: number;
  anchor?: CaptionAnchor;
  /** Text alignment inside the caption pill — independent of anchor positioning. */
  textAlign?: CaptionTextAlign;
  /** Horizontal offset from anchor base in reference-frame pixels (-300..300). v1 stored percent. */
  offsetX?: number;
  /** Vertical offset from anchor base in reference-frame pixels (-500..500). v1 stored percent. */
  offsetY?: number;
  /** Maximum caption block width as percent of canvas width (1..100). */
  maxWidthPercent?: number;
  /** When true, anchor and box placement respect safe-area margins. */
  safeAreaEnabled?: boolean;
  /** Caption pill background opacity (0–100). Presentation-only. */
  backgroundOpacity?: number;

  /** @deprecated v0 position preset — normalized to `anchor` on read. */
  position?: "bottom" | "center" | "top" | "top_left" | "custom";
  /** @deprecated v0 custom X — migrated to `offsetX` on read. */
  xPercent?: number;
  /** @deprecated v0 custom Y — migrated to `offsetY` on read. */
  yPercent?: number;
}

export interface CaptionSafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CaptionLayoutCanvas {
  width: number;
  height: number;
  scale?: number;
  aspectRatio?: number;
}

export interface CaptionLayoutResolveInput {
  sceneLayout?: Partial<CaptionLayout> | null;
  projectLayout?: Partial<CaptionLayout> | null;
  canvas: CaptionLayoutCanvas;
  /** Measured caption pill size — omit in preview until content is known. */
  contentBoxWidth?: number;
  contentBoxHeight?: number;
  safeArea?: Partial<CaptionSafeAreaInsets>;
}

/** Deterministic pixel layout for preview and export renderers. */
export interface CaptionResolvedLayout {
  x: number;
  y: number;
  width: number;
  maxWidth: number;
  textAlign: CaptionTextAlign;
  anchor: CaptionAnchor;
  safeAreaInsets: CaptionSafeAreaInsets;
  safeAreaApplied: boolean;
  /** True when no layout is stored — matches legacy bottom-center CSS/export anchor. */
  usesLegacyBottomCenter: boolean;
  /** Export draw helpers — identical coordinate space for preview parity. */
  centerX: number;
  boxTopY: number;
  boxBottomY: number;
  backgroundOpacityPercent: number | null;
}

export interface CaptionLayoutDiagnostics {
  resolvedLayout: CaptionResolvedLayout;
  anchor: CaptionAnchor;
  safeAreaApplied: boolean;
}
