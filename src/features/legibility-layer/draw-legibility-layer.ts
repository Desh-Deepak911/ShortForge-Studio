/**
 * Canvas draw helpers for local legibility treatments (export / Headless).
 */

import type { LegibilityLayerPlan } from "./legibility-layer.types";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawLegibilityLocalScrim(
  ctx: CanvasRenderingContext2D,
  region: { x: number; y: number; width: number; height: number },
  opacity: number,
): void {
  if (opacity <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  roundRect(ctx, region.x, region.y, region.width, region.height, Math.min(24, region.height / 4));
  ctx.fill();
  ctx.restore();
}

export function applyLegibilityTextShadow(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = Math.max(2, 8 * scale);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(1, 2 * scale);
}

export function clearLegibilityTextShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draw optional caption local scrim when creator style lacks background.
 * Title/branding text are drawn by the caller after this helper's caption scrim.
 */
export function drawLegibilityCaptionScrimIfNeeded(
  ctx: CanvasRenderingContext2D,
  plan: LegibilityLayerPlan,
): void {
  if (!plan.caption.needsLocalScrim || !plan.caption.region) {
    return;
  }
  drawLegibilityLocalScrim(ctx, plan.caption.region, 1);
}
