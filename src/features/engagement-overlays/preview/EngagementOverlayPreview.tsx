"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

import { SHORTFORGE_MOTION_FONT_STACK } from "@/features/shortforge-motion-design";
import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  ENGAGEMENT_OVERLAY_STYLE,
  ENGAGEMENT_OVERLAY_TYPE,
  type EngagementOverlayIconToken,
} from "../domain/engagement-overlay.presets";
import type { EngagementOverlayCaptionCollisionInput } from "../domain/resolve-engagement-overlay-caption-safe-placement";
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
  /** Scene-stable caption collision context shared with Browser/Headless. */
  captionCollision?: EngagementOverlayCaptionCollisionInput;
}

function IconGlyph({
  token,
  confirmation,
}: {
  token: EngagementOverlayIconToken;
  confirmation?: boolean;
}): ReactNode {
  const common = {
    width: "100%",
    height: "100%",
    viewBox: `0 0 ${ENGAGEMENT_OVERLAY_TYPE.iconViewBox} ${ENGAGEMENT_OVERLAY_TYPE.iconViewBox}`,
    fill: "none",
    "aria-hidden": true as const,
    focusable: false as const,
  };
  const stroke = {
    stroke: "currentColor",
    strokeWidth: ENGAGEMENT_OVERLAY_TYPE.iconStrokeViewBox,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (confirmation) {
    return (
      <svg {...common}>
        <path d="M5 12.5 10 17.5 19 7" {...stroke} />
      </svg>
    );
  }

  if (token === "heart") {
    return (
      <svg {...common}>
        <path
          d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z"
          {...stroke}
        />
      </svg>
    );
  }
  if (token === "share") {
    return (
      <svg {...common}>
        <path d="M14 5h5v5M19 5l-8 8" {...stroke} />
        <path
          d="M12 7H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5"
          {...stroke}
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 8v8M8 12h8" {...stroke} />
    </svg>
  );
}

function segmentColor(segment: ResolvedEngagementOverlaySegment): string {
  if (segment.confirmation) return ENGAGEMENT_OVERLAY_STYLE.confirmationFill;
  if (segment.active) return ENGAGEMENT_OVERLAY_STYLE.accentFill;
  if (segment.settled) return ENGAGEMENT_OVERLAY_STYLE.settledFill;
  return ENGAGEMENT_OVERLAY_STYLE.inactiveFill;
}

function cssSafePreviewId(reactId: string, suffix: string): string {
  const token = reactId.replace(/[^a-zA-Z0-9_-]/g, "") || "preview";
  return `${token}-${suffix}`;
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
    captionCollision: props.captionCollision,
  });
}

/**
 * Deterministic DOM preview for engagement overlays.
 * Outer box is percentage-positioned. Internals live in an SVG viewBox whose
 * user units are the output-space layout, so Studio phone CSS pixels cannot
 * treat 1080-space font/icon/gap values as literal px.
 */
export default function EngagementOverlayPreview(
  props: EngagementOverlayPreviewProps,
) {
  const fillId = cssSafePreviewId(useId(), "cta-fill");
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

  const { layout, chrome } = frame;
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
          pulseScale: 1,
          glowOpacity: 0,
        }));

  return (
    <div
      className="pointer-events-none z-[2]"
      style={style}
      data-engagement-overlay-preview="true"
      data-engagement-overlay-kind={frame.kind}
      data-engagement-overlay-phase={frame.phase}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        overflow="hidden"
        aria-hidden="true"
        focusable={false}
        data-engagement-overlay-surface="output-space"
        data-engagement-overlay-viewbox={`${layout.width} ${layout.height}`}
        data-engagement-overlay-fill-id={fillId}
      >
        <defs>
          <linearGradient
            id={fillId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0"
              stopColor={ENGAGEMENT_OVERLAY_STYLE.cardFillTop}
            />
            <stop
              offset="1"
              stopColor={ENGAGEMENT_OVERLAY_STYLE.cardFillBottom}
            />
          </linearGradient>
        </defs>
        <rect
          x={0.5}
          y={0.5}
          width={Math.max(0, layout.width - 1)}
          height={Math.max(0, layout.height - 1)}
          rx={chrome.cornerRadius}
          ry={chrome.cornerRadius}
          fill={`url(#${fillId})`}
          stroke={ENGAGEMENT_OVERLAY_STYLE.cardStroke}
          strokeWidth={1}
        />
        <line
          x1={chrome.cornerRadius}
          y1={1}
          x2={Math.max(chrome.cornerRadius, layout.width - chrome.cornerRadius)}
          y2={1}
          stroke={ENGAGEMENT_OVERLAY_STYLE.cardInsetHighlight}
          strokeWidth={1}
          strokeLinecap="round"
        />
        {chrome.separatorXs.map((separatorX, index) => {
          const x = separatorX - layout.x;
          const y = (layout.height - chrome.separatorHeight) / 2;
          return (
            <line
              key={`separator-${index}`}
              data-engagement-overlay-separator={index}
              x1={x}
              y1={y}
              x2={x}
              y2={y + chrome.separatorHeight}
              stroke={ENGAGEMENT_OVERLAY_STYLE.separatorFill}
              strokeWidth={1}
              opacity={chrome.separatorOpacity}
            />
          );
        })}
        {chrome.columnBoxes.map((box, index) => {
          const segment = segments[index];
          if (!segment) return null;
          const color = segmentColor(segment);
          const glowBlur = chrome.glowBlurScale * segment.glowOpacity;
          return (
            <foreignObject
              key={`${segment.index}-${segment.iconToken}`}
              x={box.x - layout.x}
              y={box.y - layout.y}
              width={box.width}
              height={box.height}
              data-engagement-overlay-segment={segment.index}
              data-engagement-overlay-column={index}
              data-engagement-overlay-column-width={box.width}
              data-engagement-overlay-segment-active={
                segment.active ? "true" : "false"
              }
              data-engagement-overlay-segment-confirmation={
                segment.confirmation ? "true" : "false"
              }
            >
              <div
                {...{ xmlns: "http://www.w3.org/1999/xhtml" }}
                data-engagement-overlay-column-group="true"
                style={{
                  width: box.width,
                  height: box.height,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: chrome.iconLabelGap,
                  color,
                  fontSize: chrome.fontSize,
                  fontFamily: SHORTFORGE_MOTION_FONT_STACK,
                  fontWeight: chrome.fontWeight,
                  letterSpacing: `${chrome.letterSpacingEm}em`,
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  transform: `scale(${segment.pulseScale})`,
                  transformOrigin: "center center",
                  filter:
                    glowBlur > 0
                      ? `drop-shadow(0 0 ${glowBlur}px ${ENGAGEMENT_OVERLAY_STYLE.accentGlow})`
                      : undefined,
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    flexShrink: 0,
                    width: chrome.iconSize,
                    height: chrome.iconSize,
                    lineHeight: 0,
                  }}
                >
                  <IconGlyph
                    token={segment.iconToken}
                    confirmation={segment.confirmation}
                  />
                </span>
                <span>{segment.label}</span>
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
