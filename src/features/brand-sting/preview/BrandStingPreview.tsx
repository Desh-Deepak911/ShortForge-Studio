"use client";

import type { CSSProperties } from "react";

import {
  BRAND_STING_COLORS,
  BRAND_STING_FONT_FAMILY,
} from "../domain/brand-sting.presets";
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

function markStyle(plan: ResolvedBrandStingFrame): CSSProperties {
  const size = 56;
  return {
    width: size,
    height: size,
    opacity: plan.mark.reveal,
    transform: `scale(${0.92 + 0.08 * plan.mark.reveal})`,
  };
}

/**
 * Full-bleed preview for the trailing ShortForge Studio outro.
 * pointer-events: none — never intercepts editor input.
 */
export default function BrandStingPreview({
  sting,
  elapsedMs,
  className,
}: BrandStingPreviewProps) {
  const plan = resolveBrandStingFrame({
    sting,
    elapsedMs,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  if (!plan.visible) return null;

  return (
    <div
      className={className}
      aria-hidden="true"
      data-brand-sting-preview="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 40,
        overflow: "hidden",
        background: `linear-gradient(180deg, ${plan.backgroundTop} 0%, ${plan.backgroundBottom} 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "22%",
          width: 180,
          height: 180,
          transform: "translate(-50%, -50%)",
          borderRadius: "9999px",
          background: plan.accentGlow,
          opacity: plan.accentGlowOpacity * 0.55,
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "24%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          ...markStyle(plan),
        }}
      >
        <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
          <polygon
            points="24,6 40,24 24,42 8,24"
            fill="rgba(248,250,252,0.08)"
            stroke={BRAND_STING_COLORS.markStroke}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M10 34 H38 M16 38 H32"
            stroke={BRAND_STING_COLORS.accentLine}
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "36%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
          fontFamily: BRAND_STING_FONT_FAMILY,
        }}
      >
        <div
          style={{
            color: BRAND_STING_COLORS.leadIn,
            fontWeight: 500,
            fontSize: "0.72rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: plan.leadInOpacity,
          }}
        >
          {plan.leadIn}
        </div>
        <div
          style={{
            color: BRAND_STING_COLORS.title,
            fontWeight: 700,
            fontSize: "1.55rem",
            letterSpacing: "-0.02em",
            opacity: plan.titleOpacity,
            transform: `translateY(${plan.titleTranslateY * 0.35}px) scale(${plan.titleScale})`,
          }}
        >
          {plan.titlePrimary}
        </div>
        <div
          style={{
            color: BRAND_STING_COLORS.subtitle,
            fontWeight: 500,
            fontSize: "0.95rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: plan.subtitleOpacity,
            transform: `translateY(${plan.subtitleTranslateY * 0.35}px) scale(${plan.subtitleScale})`,
          }}
        >
          {plan.titleSecondary}
        </div>
      </div>
    </div>
  );
}
