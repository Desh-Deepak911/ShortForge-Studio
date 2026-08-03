/**
 * Pure canvas draw for ShortForge Studio brand sting.
 * Isolates canvas state; consumes shared resolveBrandStingFrame plan only.
 */

import {
  BRAND_STING_COLORS,
  BRAND_STING_FONT_FAMILY,
} from "../domain/brand-sting.presets";
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

function drawForgedMark(
  ctx: CanvasRenderingContext2D,
  plan: ResolvedBrandStingFrame,
): void {
  const { cx, cy, size, reveal } = plan.mark;
  if (size <= 0 || reveal <= 0) return;

  const s = size / 48;
  ctx.save();
  try {
    ctx.translate(cx, cy);
    ctx.strokeStyle = BRAND_STING_COLORS.markStroke;
    ctx.fillStyle = "rgba(248, 250, 252, 0.08)";
    ctx.lineWidth = Math.max(1.5, 2.4 * s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.rect(-size, -size, size * 2 * reveal, size * 2);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(0, -18 * s);
    ctx.lineTo(16 * s, 0);
    ctx.lineTo(0, 18 * s);
    ctx.lineTo(-16 * s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14 * s, 10 * s);
    ctx.lineTo(14 * s, 10 * s);
    ctx.moveTo(-8 * s, 14 * s);
    ctx.lineTo(8 * s, 14 * s);
    ctx.strokeStyle = BRAND_STING_COLORS.accentLine;
    ctx.stroke();
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

    const gradient = ctx.createLinearGradient(0, 0, 0, frameHeight);
    gradient.addColorStop(0, plan.backgroundTop);
    gradient.addColorStop(1, plan.backgroundBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    const glow = ctx.createRadialGradient(
      plan.mark.cx,
      plan.mark.cy,
      0,
      plan.mark.cx,
      plan.mark.cy,
      Math.max(plan.mark.size * 2.4, 1),
    );
    glow.addColorStop(0, plan.accentGlow);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = plan.accentGlowOpacity;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, frameWidth, frameHeight);
    ctx.globalAlpha = 1;

    drawForgedMark(ctx, plan);

    const scale = Math.min(frameWidth / 1080, frameHeight / 1920);
    const leadInSize = 22 * scale;
    const titleSize = 64 * scale;
    const subtitleSize = 34 * scale;
    const titleY = plan.mark.cy + plan.mark.size * 1.15 + plan.titleTranslateY;
    const leadInY = titleY - 46 * scale;
    const subtitleY = titleY + 52 * scale + plan.subtitleTranslateY;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.globalAlpha = plan.leadInOpacity;
    ctx.fillStyle = BRAND_STING_COLORS.leadIn;
    ctx.font = `500 ${leadInSize}px ${BRAND_STING_FONT_FAMILY}`;
    ctx.fillText(plan.leadIn, frameWidth / 2, leadInY);

    ctx.globalAlpha = plan.titleOpacity;
    ctx.fillStyle = BRAND_STING_COLORS.title;
    ctx.save();
    ctx.translate(frameWidth / 2, titleY);
    ctx.scale(plan.titleScale, plan.titleScale);
    ctx.font = `700 ${titleSize}px ${BRAND_STING_FONT_FAMILY}`;
    ctx.fillText(plan.titlePrimary, 0, 0);
    ctx.restore();

    ctx.globalAlpha = plan.subtitleOpacity;
    ctx.fillStyle = BRAND_STING_COLORS.subtitle;
    ctx.save();
    ctx.translate(frameWidth / 2, subtitleY);
    ctx.scale(plan.subtitleScale, plan.subtitleScale);
    ctx.font = `500 ${subtitleSize}px ${BRAND_STING_FONT_FAMILY}`;
    ctx.fillText(plan.titleSecondary, 0, 0);
    ctx.restore();
  } finally {
    ctx.restore();
    resetIsolatedDrawState(ctx);
  }
}
