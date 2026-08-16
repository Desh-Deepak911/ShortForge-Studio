/**
 * Pure canvas draw for ShortForge Studio brand sting.
 * Isolates canvas state; consumes shared resolveBrandStingFrame plan only.
 */

import {
  BRAND_STING_COLORS,
  BRAND_STING_FONT_FAMILY,
} from "../domain/brand-sting.presets";
import {
  resolveBrandStingMarkRevealClip,
  scaleBrandStingMarkGeometry,
} from "../domain/brand-sting-mark-geometry";
import type { ResolvedBrandStingFrame } from "../domain/resolve-brand-sting-frame";

function resetIsolatedDrawState(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.font = `12px ${BRAND_STING_FONT_FAMILY}`;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
  frameWidth: number,
  frameHeight: number,
): void {
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    const gradient = ctx.createLinearGradient(0, 0, 0, frameHeight);
    gradient.addColorStop(0, plan.backgroundTop);
    gradient.addColorStop(1, plan.backgroundBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, frameWidth, frameHeight);
  } finally {
    ctx.restore();
  }
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
): void {
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    ctx.strokeStyle = BRAND_STING_COLORS.accentLine;
    ctx.lineWidth = 1.25;
    ctx.lineCap = "round";
    for (const beam of plan.beams) {
      if (beam.opacity <= 0) continue;
      ctx.globalAlpha = beam.opacity;
      ctx.beginPath();
      ctx.moveTo(beam.x0, beam.y0);
      ctx.lineTo(beam.x1, beam.y1);
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

function drawRings(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
): void {
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    ctx.strokeStyle = BRAND_STING_COLORS.markStroke;
    ctx.fillStyle = BRAND_STING_COLORS.markStroke;
    for (const ring of plan.rings) {
      if (ring.opacity > 0 && ring.radius > 0) {
        ctx.globalAlpha = ring.opacity;
        ctx.lineWidth = ring.strokeWidth;
        ctx.beginPath();
        ctx.arc(ring.cx, ring.cy, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const marker of ring.markers) {
        if (marker.opacity <= 0 || marker.radius <= 0) continue;
        ctx.globalAlpha = marker.opacity;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } finally {
    ctx.restore();
  }
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
  frameWidth: number,
  frameHeight: number,
): void {
  if (plan.glow.opacity <= 0 || plan.glow.radius <= 0) return;
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    const glow = ctx.createRadialGradient(
      plan.glow.cx,
      plan.glow.cy,
      0,
      plan.glow.cx,
      plan.glow.cy,
      plan.glow.radius,
    );
    glow.addColorStop(0, plan.glow.color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = plan.glow.opacity;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, frameWidth, frameHeight);
  } finally {
    ctx.restore();
  }
}

function drawForgedMark(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
): void {
  const { cx, cy, size, reveal } = plan.mark;
  if (size <= 0 || reveal <= 0 || plan.mark.opacity <= 0) return;

  const geometry = scaleBrandStingMarkGeometry(size);
  const clip = resolveBrandStingMarkRevealClip(size, reveal);

  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    ctx.translate(cx, cy);
    ctx.globalAlpha = plan.mark.opacity;
    ctx.strokeStyle = BRAND_STING_COLORS.markStroke;
    ctx.fillStyle = `rgba(248, 250, 252, ${geometry.fillOpacity})`;
    ctx.lineWidth = geometry.strokeWidth;
    ctx.lineCap = geometry.lineCap;
    ctx.lineJoin = geometry.lineJoin;

    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();

    const [first, ...rest] = geometry.diamond;
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const point of rest) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = BRAND_STING_COLORS.accentLine;
    ctx.beginPath();
    for (const line of geometry.forgeLines) {
      ctx.moveTo(line.x0, line.y0);
      ctx.lineTo(line.x1, line.y1);
    }
    ctx.stroke();
  } finally {
    ctx.restore();
  }
}

function drawAnchoredText(
  ctx: CanvasRenderingContext2D,
  input: {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly translateY: number;
    readonly scale: number;
    readonly opacity: number;
    readonly font: string;
    readonly fillStyle: string;
  },
): void {
  if (input.opacity <= 0 || !input.text) return;
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    ctx.translate(input.x, input.y + input.translateY);
    ctx.scale(input.scale, input.scale);
    ctx.globalAlpha = input.opacity;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = input.fillStyle;
    ctx.font = input.font;
    ctx.fillText(input.text, 0, 0);
  } finally {
    ctx.restore();
  }
}

function drawAccentLine(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
): void {
  const { x, y, width, height, opacity } = plan.accentLine;
  if (opacity <= 0 || width <= 0 || height <= 0) return;
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = BRAND_STING_COLORS.accentLine;
    ctx.fillRect(x, y, width, height);
  } finally {
    ctx.restore();
  }
}

/** Non-branded end-buffer fill — no title, lead-in, mark, or forge glow. */
function drawTerminalNeutralFill(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
): void {
  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, frameWidth, frameHeight);
  } finally {
    ctx.restore();
    resetIsolatedDrawState(ctx);
  }
}

export function drawBrandSting(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
  frameWidth: number,
  frameHeight: number,
): void {
  // Terminal / end-buffer: explicit neutral plane; branded tokens stay off.
  if (!plan.visible) {
    if (plan.elapsedMs >= plan.durationMs) {
      drawTerminalNeutralFill(ctx, frameWidth, frameHeight);
    }
    return;
  }

  ctx.save();
  try {
    resetIsolatedDrawState(ctx);
    drawBackground(ctx, plan, frameWidth, frameHeight);
    drawBeams(ctx, plan);
    drawRings(ctx, plan);
    drawGlow(ctx, plan, frameWidth, frameHeight);
    drawForgedMark(ctx, plan);
    drawAnchoredText(ctx, {
      text: plan.leadInDisplay,
      x: plan.mark.cx,
      y: plan.leadInY,
      translateY: plan.leadInTranslateY,
      scale: 1,
      opacity: plan.leadInOpacity,
      font: `500 ${plan.leadInFontSize}px ${BRAND_STING_FONT_FAMILY}`,
      fillStyle: BRAND_STING_COLORS.leadIn,
    });
    drawAnchoredText(ctx, {
      text: plan.titlePrimary,
      x: plan.mark.cx,
      y: plan.titleY,
      translateY: plan.titleTranslateY,
      scale: plan.titleScale,
      opacity: plan.titleOpacity,
      font: `700 ${plan.titleFontSize}px ${BRAND_STING_FONT_FAMILY}`,
      fillStyle: BRAND_STING_COLORS.title,
    });
    drawAnchoredText(ctx, {
      text: plan.titleSecondary,
      x: plan.mark.cx,
      y: plan.subtitleY,
      translateY: plan.subtitleTranslateY,
      scale: plan.subtitleScale,
      opacity: plan.subtitleOpacity,
      font: `500 ${plan.subtitleFontSize}px ${BRAND_STING_FONT_FAMILY}`,
      fillStyle: BRAND_STING_COLORS.subtitle,
    });
    drawAccentLine(ctx, plan);
  } finally {
    ctx.restore();
    resetIsolatedDrawState(ctx);
  }
}
