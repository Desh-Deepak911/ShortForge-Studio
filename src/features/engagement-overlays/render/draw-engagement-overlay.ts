/**
 * Pure canvas draw for engagement overlays (preview/export parity helper).
 * Consumes the shared chrome and segment plan — never recalculates columns,
 * pulse, or active beats. Deterministic local fill/stroke only.
 */

import { SHORTFORGE_MOTION_FONT_STACK } from "@/features/shortforge-motion-design";

import {
  ENGAGEMENT_OVERLAY_STYLE,
  type EngagementOverlayIconToken,
} from "../domain/engagement-overlay.presets";
import {
  resolveEngagementOverlayCenteredIconLabel,
  type EngagementOverlayLayoutBox,
  type ResolvedEngagementOverlayFrame,
  type ResolvedEngagementOverlaySegment,
} from "../domain/resolve-engagement-overlay-frame";

function toLocalBox(
  box: EngagementOverlayLayoutBox,
  layout: EngagementOverlayLayoutBox,
): EngagementOverlayLayoutBox {
  return {
    x: box.x - layout.x,
    y: box.y - layout.y,
    width: box.width,
    height: box.height,
  };
}

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
  ctx.stroke();
}

function drawShareIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(cx + 2 * s, cy - 7 * s);
  ctx.lineTo(cx + 7 * s, cy - 7 * s);
  ctx.lineTo(cx + 7 * s, cy - 2 * s);
  ctx.moveTo(cx + 7 * s, cy - 7 * s);
  ctx.lineTo(cx - 1 * s, cy + 1 * s);
  ctx.moveTo(cx, cy - 5 * s);
  ctx.lineTo(cx - 5 * s, cy - 5 * s);
  ctx.quadraticCurveTo(cx - 7 * s, cy - 5 * s, cx - 7 * s, cy - 3 * s);
  ctx.lineTo(cx - 7 * s, cy + 5 * s);
  ctx.quadraticCurveTo(cx - 7 * s, cy + 7 * s, cx - 5 * s, cy + 7 * s);
  ctx.lineTo(cx + 3 * s, cy + 7 * s);
  ctx.quadraticCurveTo(cx + 5 * s, cy + 7 * s, cx + 5 * s, cy + 5 * s);
  ctx.lineTo(cx + 5 * s, cy);
  ctx.stroke();
}

function drawCirclePlusIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const s = size / 24;
  ctx.beginPath();
  ctx.arc(cx, cy, 8 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4 * s);
  ctx.lineTo(cx, cy + 4 * s);
  ctx.moveTo(cx - 4 * s, cy);
  ctx.lineTo(cx + 4 * s, cy);
  ctx.stroke();
}

function drawCheckIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(cx - 7 * s, cy + 0.5 * s);
  ctx.lineTo(cx - 2 * s, cy + 5.5 * s);
  ctx.lineTo(cx + 7 * s, cy - 5 * s);
  ctx.stroke();
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  token: EngagementOverlayIconToken,
  cx: number,
  cy: number,
  size: number,
  strokeWidth: number,
  fill: string,
  confirmation: boolean,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(1, strokeWidth);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (confirmation) {
    drawCheckIcon(ctx, cx, cy, size);
    return;
  }
  if (token === "heart") {
    drawHeartIcon(ctx, cx, cy, size);
    return;
  }
  if (token === "share") {
    drawShareIcon(ctx, cx, cy, size);
    return;
  }
  drawCirclePlusIcon(ctx, cx, cy, size);
}

function segmentFill(segment: ResolvedEngagementOverlaySegment): string {
  if (segment.confirmation) return ENGAGEMENT_OVERLAY_STYLE.confirmationFill;
  if (segment.active) return ENGAGEMENT_OVERLAY_STYLE.accentFill;
  if (segment.settled) return ENGAGEMENT_OVERLAY_STYLE.settledFill;
  return ENGAGEMENT_OVERLAY_STYLE.inactiveFill;
}

/**
 * Draw one resolved engagement-overlay frame into a canvas context.
 * Always pairs save/restore so globalAlpha and transforms do not leak.
 * Active-segment scale is isolated inside a nested save/restore.
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

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if ("filter" in ctx) ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = `${frame.chrome.fontWeight} ${frame.chrome.fontSize}px ${SHORTFORGE_MOTION_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const { layout, chrome } = frame;
    const opacity = Math.min(1, Math.max(0, frame.opacity));
    ctx.globalAlpha = opacity;

    const centerX = layout.x + layout.width / 2 + frame.translateX;
    const centerY = layout.y + layout.height / 2 + frame.translateY;
    ctx.translate(centerX, centerY);
    ctx.scale(frame.scale, frame.scale);
    ctx.translate(-layout.width / 2, -layout.height / 2);

    const gradient = ctx.createLinearGradient(0, 0, 0, layout.height);
    gradient.addColorStop(0, ENGAGEMENT_OVERLAY_STYLE.cardFillTop);
    gradient.addColorStop(1, ENGAGEMENT_OVERLAY_STYLE.cardFillBottom);
    roundRectPath(ctx, 0, 0, layout.width, layout.height, chrome.cornerRadius);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = ENGAGEMENT_OVERLAY_STYLE.cardStroke;
    ctx.lineWidth = Math.max(1, layout.height * 0.02);
    ctx.stroke();

    ctx.strokeStyle = ENGAGEMENT_OVERLAY_STYLE.separatorFill;
    ctx.globalAlpha = opacity * chrome.separatorOpacity;
    ctx.lineWidth = 1;
    for (const separatorX of chrome.separatorXs) {
      const x = separatorX - layout.x;
      const y = (layout.height - chrome.separatorHeight) / 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + chrome.separatorHeight);
      ctx.stroke();
    }
    ctx.globalAlpha = opacity;

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

    ctx.font = `${chrome.fontWeight} ${chrome.fontSize}px ${SHORTFORGE_MOTION_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let index = 0; index < chrome.columnBoxes.length; index += 1) {
      const segment = segments[index];
      const columnBox = chrome.columnBoxes[index];
      if (!segment || !columnBox) continue;

      const fill = segmentFill(segment);
      const localColumn = toLocalBox(columnBox, layout);
      const labelWidth = ctx.measureText(segment.label).width;
      const origin = resolveEngagementOverlayCenteredIconLabel({
        columnBox: localColumn,
        iconSize: chrome.iconSize,
        iconLabelGap: chrome.iconLabelGap,
        labelWidth,
        labelCenterY: chrome.labelCenterY - layout.y,
      });

      ctx.save();
      try {
        if (segment.pulseScale !== 1) {
          const groupCenterX = origin.iconCx + (origin.groupWidth - chrome.iconSize) / 2;
          ctx.translate(groupCenterX, origin.iconCy);
          ctx.scale(segment.pulseScale, segment.pulseScale);
          ctx.translate(-groupCenterX, -origin.iconCy);
        }
        ctx.shadowBlur = chrome.glowBlurScale * segment.glowOpacity;
        ctx.shadowColor =
          segment.glowOpacity > 0
            ? ENGAGEMENT_OVERLAY_STYLE.accentGlow
            : "rgba(0,0,0,0)";
        drawIcon(
          ctx,
          segment.iconToken,
          origin.iconCx,
          origin.iconCy,
          chrome.iconSize,
          chrome.iconStrokeWidth,
          fill,
          segment.confirmation,
        );
        ctx.shadowBlur = 0;
        ctx.shadowColor = "rgba(0,0,0,0)";
        ctx.fillStyle = fill;
        ctx.fillText(segment.label, origin.labelX, origin.labelY);
      } finally {
        ctx.restore();
      }
    }
  } finally {
    ctx.restore();
  }
}
