/**
 * Pure canvas draw for engagement overlays (preview/export parity helper).
 * Deterministic local fill/stroke only — no user filter strings or remote assets.
 */

import type { EngagementOverlayIconToken } from "../domain/engagement-overlay.presets";
import type { ResolvedEngagementOverlayFrame } from "../domain/resolve-engagement-overlay-frame";

const PILL_FILL = "rgba(12, 14, 20, 0.78)";
const PILL_STROKE = "rgba(255, 255, 255, 0.12)";
const LABEL_FILL = "rgba(255, 255, 255, 0.95)";
const ICON_FILL = "rgba(255, 255, 255, 0.95)";
/** Fixed stack shared with preview — no remote/system-dependent UI fonts. */
const LABEL_FONT_FAMILY = "Arial, Helvetica, sans-serif";

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHeartIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 8 * s);
  ctx.bezierCurveTo(
    cx - 10 * s,
    cy + 1 * s,
    cx - 10 * s,
    cy - 8 * s,
    cx,
    cy - 4 * s,
  );
  ctx.bezierCurveTo(
    cx + 10 * s,
    cy - 8 * s,
    cx + 10 * s,
    cy + 1 * s,
    cx,
    cy + 8 * s,
  );
  ctx.closePath();
  ctx.fill();
}

function drawShareIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(cx - 2 * s, cy - 4 * s);
  ctx.lineTo(cx + 6 * s, cy - 8 * s);
  ctx.lineTo(cx + 6 * s, cy);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 7 * s, cy - 1 * s);
  ctx.lineTo(cx + 2 * s, cy - 6 * s);
  ctx.moveTo(cx - 7 * s, cy - 1 * s);
  ctx.lineTo(cx - 7 * s, cy + 7 * s);
  ctx.lineTo(cx + 5 * s, cy + 7 * s);
  ctx.lineTo(cx + 5 * s, cy + 2 * s);
  ctx.stroke();
}

function drawBellIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(cx - 6 * s, cy + 3 * s);
  ctx.quadraticCurveTo(cx - 6 * s, cy - 6 * s, cx, cy - 7 * s);
  ctx.quadraticCurveTo(cx + 6 * s, cy - 6 * s, cx + 6 * s, cy + 3 * s);
  ctx.lineTo(cx + 8 * s, cy + 5 * s);
  ctx.lineTo(cx - 8 * s, cy + 5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + 7 * s, 2.2 * s, Math.PI, 0);
  ctx.stroke();
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  token: EngagementOverlayIconToken,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.fillStyle = ICON_FILL;
  ctx.strokeStyle = ICON_FILL;
  ctx.lineWidth = Math.max(1.25, size * 0.08);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (token === "heart") {
    drawHeartIcon(ctx, cx, cy, size);
    return;
  }
  if (token === "share") {
    drawShareIcon(ctx, cx, cy, size);
    return;
  }
  drawBellIcon(ctx, cx, cy, size);
}

/**
 * Draw one resolved engagement-overlay frame into a canvas context.
 * Always pairs save/restore so globalAlpha and transforms do not leak.
 */
export function drawEngagementOverlay(
  ctx: CanvasRenderingContext2D,
  frame: ResolvedEngagementOverlayFrame,
): void {
  ctx.save();
  try {
    if (!frame.visible || frame.opacity <= 0) {
      return;
    }

    // Reset mutable fields inside save/restore so overlay state cannot leak.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if ("filter" in ctx) ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = `600 12px ${LABEL_FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const { layout } = frame;
    const opacity = Math.min(1, Math.max(0, frame.opacity));
    ctx.globalAlpha = opacity;

    const centerX = layout.x + layout.width / 2 + frame.translateX;
    const centerY = layout.y + layout.height / 2 + frame.translateY;
    ctx.translate(centerX, centerY);
    ctx.scale(frame.scale, frame.scale);
    ctx.translate(-layout.width / 2, -layout.height / 2);

    const radius = layout.height / 2;
    roundRectPath(ctx, 0, 0, layout.width, layout.height, radius);
    ctx.fillStyle = PILL_FILL;
    ctx.fill();
    ctx.strokeStyle = PILL_STROKE;
    ctx.lineWidth = Math.max(1, layout.height * 0.03);
    ctx.stroke();

    const labels = frame.labels;
    const icons = frame.iconTokens;
    const count = Math.max(labels.length, 1);
    const padX = layout.width * 0.08;
    const gap = layout.width * 0.04;
    const usable = Math.max(0, layout.width - padX * 2 - gap * (count - 1));
    const segmentWidth = usable / count;
    const fontSize = Math.max(11, Math.round(layout.height * 0.34));
    const iconSize = fontSize * 1.05;

    ctx.font = `600 ${fontSize}px ${LABEL_FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = LABEL_FILL;

    for (let index = 0; index < count; index += 1) {
      const label = labels[index] ?? labels[0] ?? "Like";
      const icon = icons[index] ?? icons[0] ?? "heart";
      const segmentLeft = padX + index * (segmentWidth + gap);
      const textWidth = ctx.measureText(label).width;
      const contentWidth = iconSize + fontSize * 0.35 + textWidth;
      const contentLeft =
        segmentLeft + Math.max(0, (segmentWidth - contentWidth) / 2);
      const cy = layout.height / 2;

      drawIcon(ctx, icon, contentLeft + iconSize / 2, cy, iconSize);
      ctx.fillStyle = LABEL_FILL;
      ctx.fillText(label, contentLeft + iconSize + fontSize * 0.35, cy);
    }
  } finally {
    ctx.restore();
  }
}
