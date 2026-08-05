"use client";

import type { CSSProperties, ReactNode } from "react";

import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  ENGAGEMENT_OVERLAY_STYLE,
  type EngagementOverlayIconToken,
} from "../domain/engagement-overlay.presets";
import {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  resolveEngagementOverlayFrame,
  type ResolvedEngagementOverlayFrame,
  type ResolvedEngagementOverlaySegment,
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

function IconGlyph({
  token,
  confirmation,
}: {
  token: EngagementOverlayIconToken;
  confirmation?: boolean;
}): ReactNode {
  const common = {
    width: "1em",
    height: "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    focusable: false as const,
  };

  if (confirmation) {
    return (
      <svg {...common}>
        <path
          d="M5 12.5 10 17.5 19 7"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

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

function segmentColor(segment: ResolvedEngagementOverlaySegment): string {
  if (segment.confirmation) return ENGAGEMENT_OVERLAY_STYLE.confirmationFill;
  if (segment.active) return ENGAGEMENT_OVERLAY_STYLE.accentFill;
  if (segment.settled) return ENGAGEMENT_OVERLAY_STYLE.settledFill;
  return ENGAGEMENT_OVERLAY_STYLE.inactiveFill;
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
 * Segment emphasis/confirmation come only from the shared frame plan.
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

  const segments =
    frame.segments.length > 0
      ? frame.segments
      : frame.labels.map((label, index) => ({
          index,
          label,
          iconToken: frame.iconTokens[index] ?? frame.iconTokens[0] ?? "heart",
          active: false,
          settled: false,
          emphasis: 0,
          confirmation: false,
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
        className="flex h-full max-w-full items-center justify-evenly rounded-full px-[0.75em] text-white"
        style={{
          background: ENGAGEMENT_OVERLAY_STYLE.cardFill,
          boxShadow: `inset 0 1px 0 ${ENGAGEMENT_OVERLAY_STYLE.cardInsetHighlight}, 0 0 0 1px ${ENGAGEMENT_OVERLAY_STYLE.cardStroke}`,
          fontSize: Math.max(11, Math.round(layout.height * 0.32)),
          fontFamily: "Arial, Helvetica, sans-serif",
          fontWeight: 600,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {segments.map((segment) => {
          const color = segmentColor(segment);
          const pulseScale = segment.active
            ? 1 + 0.07 * segment.emphasis + (segment.confirmation ? 0.03 : 0)
            : 1;
          return (
            <span
              key={`${segment.index}-${segment.iconToken}`}
              className="inline-flex items-center gap-[0.32em]"
              data-engagement-overlay-segment={segment.index}
              data-engagement-overlay-segment-active={segment.active ? "true" : "false"}
              data-engagement-overlay-segment-confirmation={
                segment.confirmation ? "true" : "false"
              }
              style={{
                color,
                transform: `scale(${pulseScale})`,
                transformOrigin: "center center",
              }}
            >
              <span className="inline-flex shrink-0 text-[1.05em] leading-none">
                <IconGlyph
                  token={segment.iconToken}
                  confirmation={segment.confirmation}
                />
              </span>
              <span className="leading-none">{segment.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
