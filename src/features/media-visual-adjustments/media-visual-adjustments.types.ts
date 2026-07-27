export interface SceneMediaVisualAdjustments {
  readonly version: 1;
  readonly brightness?: number;
  readonly contrast?: number;
  readonly saturation?: number;
  readonly shadowEnabled?: boolean;
  readonly shadowColor?: string;
  readonly shadowOpacity?: number;
  /** Blur in canonical 1080-wide reference-frame pixels. */
  readonly shadowBlur?: number;
  /** Horizontal offset in canonical 1080-wide reference-frame pixels. */
  readonly shadowOffsetX?: number;
  /** Vertical offset in canonical 1080-wide reference-frame pixels. */
  readonly shadowOffsetY?: number;
}

export interface ResolvedSceneMediaVisualAdjustments {
  readonly version: 1;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly shadowEnabled: boolean;
  readonly shadowColor: string;
  readonly shadowOpacity: number;
  readonly shadowBlur: number;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
}
