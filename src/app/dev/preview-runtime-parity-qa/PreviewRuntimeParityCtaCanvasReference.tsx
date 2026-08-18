"use client";

/**
 * QA-only production-canvas reference for Prompt 5.
 * Draws the shared resolved frame through drawEngagementOverlay.
 * Not a second CTA renderer and not a production export path.
 */

import { useLayoutEffect, useRef } from "react";

import type { EngagementOverlayCaptionCollisionInput } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-caption-safe-placement";
import {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  resolveEngagementOverlayFrame,
} from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import { drawEngagementOverlay } from "@/features/engagement-overlays/render/draw-engagement-overlay";
import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

export interface CtaCanvasReferenceDiagnostics {
  readonly visible: boolean;
  readonly phase: string;
  readonly kind: string;
  readonly scale: number;
  readonly opacity: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly viewBox: string;
  readonly layout: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly fontSize: number;
  readonly iconSize: number;
  readonly iconLabelGap: number;
  readonly pillHeight: number;
  readonly columnCentersX: readonly number[];
  readonly separatorXs: readonly number[];
  readonly labels: readonly string[];
  readonly subscribeLabel: string | null;
  readonly pixelBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export interface PreviewRuntimeParityCtaCanvasReferenceProps {
  readonly overlay: SceneEngagementOverlayV1 | null | undefined;
  readonly sceneDurationMs: number;
  readonly sceneElapsedMs: number;
  readonly captionCollision?: EngagementOverlayCaptionCollisionInput;
  readonly onDiagnostics?: (diagnostics: CtaCanvasReferenceDiagnostics | null) => void;
}

function scanOpaqueBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): CtaCanvasReferenceDiagnostics["pixelBounds"] {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha < 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function PreviewRuntimeParityCtaCanvasReference({
  overlay,
  sceneDurationMs,
  sceneElapsedMs,
  captionCollision,
  onDiagnostics,
}: PreviewRuntimeParityCtaCanvasReferenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const plan = planRef.current;
    if (!canvas || !host || !plan) return;
    canvas.width = ENGAGEMENT_OVERLAY_REFERENCE_WIDTH;
    canvas.height = ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!overlay) {
      host.setAttribute("data-preview-runtime-parity-cta-canvas-visible", "false");
      plan.textContent = "none";
      onDiagnostics?.(null);
      return;
    }
    const frame = resolveEngagementOverlayFrame({
      overlay,
      sceneDurationMs,
      sceneElapsedMs,
      frameWidth: ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
      frameHeight: ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
      captionCollision,
    });
    drawEngagementOverlay(ctx, frame);
    const subscribe = frame.segments.find((segment) => segment.label === "Subscribe");
    const next: CtaCanvasReferenceDiagnostics = {
      visible: frame.visible && frame.opacity > 0,
      phase: frame.phase,
      kind: frame.kind,
      scale: frame.scale,
      opacity: frame.opacity,
      translateX: frame.translateX,
      translateY: frame.translateY,
      viewBox: `${frame.layout.width} ${frame.layout.height}`,
      layout: frame.layout,
      fontSize: frame.chrome.fontSize,
      iconSize: frame.chrome.iconSize,
      iconLabelGap: frame.chrome.iconLabelGap,
      pillHeight: frame.layout.height,
      columnCentersX: frame.chrome.columnCentersX,
      separatorXs: frame.chrome.separatorXs,
      labels: frame.segments.map((segment) => segment.label),
      subscribeLabel: subscribe?.label ?? null,
      pixelBounds:
        frame.visible && frame.opacity > 0
          ? scanOpaqueBounds(ctx, canvas.width, canvas.height)
          : null,
    };
    host.setAttribute(
      "data-preview-runtime-parity-cta-canvas-visible",
      next.visible ? "true" : "false",
    );
    plan.textContent = JSON.stringify(next);
    onDiagnostics?.(next);
  }, [captionCollision, onDiagnostics, overlay, sceneDurationMs, sceneElapsedMs]);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-md ring-1 ring-border"
      data-preview-runtime-parity-cta-canvas-reference=""
      data-preview-runtime-parity-cta-canvas-visible="false"
    >
      <canvas
        ref={canvasRef}
        data-preview-runtime-parity-cta-canvas=""
        className="block h-auto w-full bg-black"
        style={{ aspectRatio: "9 / 16" }}
      />
      <p
        ref={planRef}
        className="sr-only"
        data-preview-runtime-parity-cta-canvas-plan=""
      >
        none
      </p>
    </div>
  );
}
