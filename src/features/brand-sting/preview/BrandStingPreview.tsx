"use client";

import { useId } from "react";

import {
  BRAND_STING_COLORS,
  BRAND_STING_FONT_FAMILY,
} from "../domain/brand-sting.presets";
import {
  resolveBrandStingMarkRevealClip,
  scaleBrandStingMarkGeometry,
} from "../domain/brand-sting-mark-geometry";
import {
  resolveBrandStingFrame,
  type ResolvedBrandStingFrame,
} from "../domain/resolve-brand-sting-frame";

export interface BrandStingPreviewProps {
  readonly sting: unknown;
  /** Sting-local elapsed ms. */
  readonly elapsedMs: number;
  readonly className?: string;
}

function cssSafePreviewId(reactId: string, suffix: string): string {
  const token = reactId.replace(/[^a-zA-Z0-9_-]/g, "") || "preview";
  return `${token}-${suffix}`;
}

function diamondPoints(plan: ResolvedBrandStingFrame): string {
  return scaleBrandStingMarkGeometry(plan.mark.size)
    .diamond.map((point) => `${point.x},${point.y}`)
    .join(" ");
}

/**
 * Full-bleed ShortForge Studio outro.
 * Output-space SVG only — same elapsed millisecond always yields the same markup.
 */
export default function BrandStingPreview({
  sting,
  elapsedMs,
  className,
}: BrandStingPreviewProps) {
  const reactId = useId();
  const backgroundId = cssSafePreviewId(reactId, "background");
  const glowId = cssSafePreviewId(reactId, "glow");
  const markClipId = cssSafePreviewId(reactId, "mark-clip");
  const plan = resolveBrandStingFrame({
    sting,
    elapsedMs,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  if (!plan.visible) return null;

  const markGeometry = scaleBrandStingMarkGeometry(plan.mark.size);
  const markClip = resolveBrandStingMarkRevealClip(
    plan.mark.size,
    plan.mark.reveal,
  );

  return (
    <div
      className={className}
      aria-hidden="true"
      data-brand-sting-preview="true"
      data-brand-sting-surface="output-space"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      <svg
        viewBox={`0 0 ${plan.frameWidth} ${plan.frameHeight}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
        data-brand-sting-viewbox={`${plan.frameWidth} ${plan.frameHeight}`}
        data-brand-sting-background-id={backgroundId}
        data-brand-sting-glow-id={glowId}
        data-brand-sting-mark-clip-id={markClipId}
        style={{ display: "block", pointerEvents: "none" }}
      >
        <defs>
          <linearGradient
            id={backgroundId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0" stopColor={plan.backgroundTop} />
            <stop offset="1" stopColor={plan.backgroundBottom} />
          </linearGradient>
          <radialGradient
            id={glowId}
            gradientUnits="userSpaceOnUse"
            cx={plan.glow.cx}
            cy={plan.glow.cy}
            r={plan.glow.radius}
          >
            <stop offset="0" stopColor={plan.glow.color} />
            <stop offset="1" stopColor={plan.glow.color} stopOpacity={0} />
          </radialGradient>
          <clipPath id={markClipId}>
            <rect
              x={markClip.x}
              y={markClip.y}
              width={markClip.width}
              height={markClip.height}
            />
          </clipPath>
        </defs>

        <rect
          x={0}
          y={0}
          width={plan.frameWidth}
          height={plan.frameHeight}
          fill={`url(#${backgroundId})`}
        />

        {plan.beams.map((beam, index) => (
          <line
            key={`beam-${index}`}
            data-brand-sting-beam={index}
            x1={beam.x0}
            y1={beam.y0}
            x2={beam.x1}
            y2={beam.y1}
            stroke={BRAND_STING_COLORS.accentLine}
            strokeWidth={1.25}
            opacity={beam.opacity}
          />
        ))}

        {plan.rings.map((ring, index) => (
          <g key={`ring-${index}`} data-brand-sting-ring={index}>
            <circle
              cx={ring.cx}
              cy={ring.cy}
              r={ring.radius}
              fill="none"
              stroke={BRAND_STING_COLORS.markStroke}
              strokeWidth={ring.strokeWidth}
              opacity={ring.opacity}
            />
            {ring.markers.map((marker, markerIndex) => (
              <circle
                key={`ring-${index}-marker-${markerIndex}`}
                data-brand-sting-ring-marker={`${index}-${markerIndex}`}
                cx={marker.x}
                cy={marker.y}
                r={marker.radius}
                fill={BRAND_STING_COLORS.markStroke}
                opacity={marker.opacity}
              />
            ))}
          </g>
        ))}

        <rect
          x={0}
          y={0}
          width={plan.frameWidth}
          height={plan.frameHeight}
          fill={`url(#${glowId})`}
          opacity={plan.glow.opacity}
          data-brand-sting-glow="true"
        />

        <g
          data-brand-sting-mark="true"
          transform={`translate(${plan.mark.cx} ${plan.mark.cy})`}
          opacity={plan.mark.opacity}
          clipPath={`url(#${markClipId})`}
        >
          <polygon
            points={diamondPoints(plan)}
            fill={`rgba(248,250,252,${markGeometry.fillOpacity})`}
            stroke={BRAND_STING_COLORS.markStroke}
            strokeWidth={markGeometry.strokeWidth}
            strokeLinecap={markGeometry.lineCap}
            strokeLinejoin={markGeometry.lineJoin}
          />
          {markGeometry.forgeLines.map((line, index) => (
            <line
              key={`forge-${index}`}
              x1={line.x0}
              y1={line.y0}
              x2={line.x1}
              y2={line.y1}
              stroke={BRAND_STING_COLORS.accentLine}
              strokeWidth={markGeometry.strokeWidth}
              strokeLinecap={markGeometry.lineCap}
            />
          ))}
        </g>

        <text
          data-brand-sting-lead-in="true"
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={BRAND_STING_COLORS.leadIn}
          fontFamily={BRAND_STING_FONT_FAMILY}
          fontSize={plan.leadInFontSize}
          fontWeight={500}
          opacity={plan.leadInOpacity}
          transform={`translate(${plan.mark.cx} ${plan.leadInY + plan.leadInTranslateY})`}
        >
          {plan.leadInDisplay}
        </text>
        <text
          data-brand-sting-title="true"
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={BRAND_STING_COLORS.title}
          fontFamily={BRAND_STING_FONT_FAMILY}
          fontSize={plan.titleFontSize}
          fontWeight={700}
          opacity={plan.titleOpacity}
          transform={`translate(${plan.mark.cx} ${plan.titleY + plan.titleTranslateY}) scale(${plan.titleScale})`}
        >
          {plan.titlePrimary}
        </text>
        <text
          data-brand-sting-subtitle="true"
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={BRAND_STING_COLORS.subtitle}
          fontFamily={BRAND_STING_FONT_FAMILY}
          fontSize={plan.subtitleFontSize}
          fontWeight={500}
          opacity={plan.subtitleOpacity}
          transform={`translate(${plan.mark.cx} ${plan.subtitleY + plan.subtitleTranslateY}) scale(${plan.subtitleScale})`}
        >
          {plan.titleSecondary}
        </text>

        <rect
          data-brand-sting-accent-line="true"
          x={plan.accentLine.x}
          y={plan.accentLine.y}
          width={plan.accentLine.width}
          height={plan.accentLine.height}
          fill={BRAND_STING_COLORS.accentLine}
          opacity={plan.accentLine.opacity}
        />
      </svg>
    </div>
  );
}
