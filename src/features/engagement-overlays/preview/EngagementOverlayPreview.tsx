"use client";

import type { CSSProperties, ReactNode } from "react";

import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import type { EngagementOverlayIconToken } from "../domain/engagement-overlay.presets";
import {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  resolveEngagementOverlayFrame,
  type ResolvedEngagementOverlayFrame,
} from "../domain/resolve-engagement-overlay-frame";

export interface EngagementOverlayPreviewProps {
  /** Pre-resolved frame plan. When omitted, resolve from overlay props. */
  frame?: ResolvedEngagementOverlayFrame;
  overlay?: SceneEngagementOverlayV1 | null;
  sceneDurationMs?: number;
  sceneElapsedMs?: number;
  /** Container / preview frame size used when resolving from overlay props. */
  width?: number;
  height?: number;
}

function IconGlyph({ token }: { token: EngagementOverlayIconToken }): ReactNode {
  const common = {
    width: "1em",
    height: "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    focusable: false as const,
  };

  if (token === "heart") {
    return (
      <svg {...common}>
        <path
          d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (token === "share") {
    return (
      <svg {...common}>
        <path
          d="M14 5h5v5M19 5l-8 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 7H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        d="M10 20a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function resolveFrame(
  props: EngagementOverlayPreviewProps,
): ResolvedEngagementOverlayFrame | null {
  if (props.frame) return props.frame;
  if (!props.overlay) return null;
  return resolveEngagementOverlayFrame({
    overlay: props.overlay,
    sceneDurationMs: props.sceneDurationMs ?? 0,
    sceneElapsedMs: props.sceneElapsedMs ?? 0,
    frameWidth: props.width,
    frameHeight: props.height,
  });
}

/**
 * Deterministic DOM preview for engagement overlays.
 * Stacks under captions (z-[2]); never captures pointer events.
 */
export default function EngagementOverlayPreview(
  props: EngagementOverlayPreviewProps,
) {
  const frame = resolveFrame(props);
  if (!frame || !frame.visible || frame.opacity <= 0) {
    return null;
  }

  const frameWidth =
    typeof props.width === "number" && props.width > 0
      ? props.width
      : ENGAGEMENT_OVERLAY_REFERENCE_WIDTH;
  const frameHeight =
    typeof props.height === "number" && props.height > 0
      ? props.height
      : ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT;

  const { layout } = frame;
  // Percent of the preview stage so layout scales with any phone frame size.
  const style: CSSProperties = {
    position: "absolute",
    left: `calc(${(layout.x / frameWidth) * 100}% + ${(frame.translateX / frameWidth) * 100}%)`,
    top: `calc(${(layout.y / frameHeight) * 100}% + ${(frame.translateY / frameHeight) * 100}%)`,
    width: `${(layout.width / frameWidth) * 100}%`,
    height: `${(layout.height / frameHeight) * 100}%`,
    opacity: frame.opacity,
    transform: `scale(${frame.scale})`,
    transformOrigin: "center center",
    zIndex: 2,
  };

  const segments = frame.labels.map((label, index) => ({
    label,
    icon: frame.iconTokens[index] ?? frame.iconTokens[0] ?? "heart",
  }));

  return (
    <div
      className="pointer-events-none z-[2] flex items-center justify-center"
      style={style}
      data-engagement-overlay-preview="true"
      data-engagement-overlay-kind={frame.kind}
      data-engagement-overlay-phase={frame.phase}
      aria-hidden="true"
    >
      <div
        className="flex h-full max-w-full items-center gap-[0.45em] rounded-full px-[0.9em] text-white"
        style={{
          background: "rgba(12, 14, 20, 0.78)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.08) inset",
          fontSize: Math.max(11, Math.round(layout.height * 0.34)),
          fontFamily: "Arial, Helvetica, sans-serif",
          fontWeight: 600,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {segments.map((segment) => (
          <span
            key={`${segment.icon}-${segment.label}`}
            className="inline-flex items-center gap-[0.35em]"
          >
            <span className="inline-flex shrink-0 text-[1.05em] leading-none">
              <IconGlyph token={segment.icon} />
            </span>
            <span className="leading-none">{segment.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
