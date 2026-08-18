/**
 * Browser-side CTA measurement against the inner 9:16 Preview screen.
 * Used by the QA harness. Certification re-reads the same published JSON.
 */

export interface PreviewCtaDomBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PreviewCtaDomMeasurements {
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly usedInnerScreen: boolean;
  readonly visible: boolean;
  readonly viewBox: string | null;
  readonly computedFontSizePx: number | null;
  readonly appliedScale: number | null;
  readonly outer: PreviewCtaDomBox | null;
  readonly columns: readonly PreviewCtaDomBox[];
  readonly icons: readonly PreviewCtaDomBox[];
  readonly labels: readonly PreviewCtaDomBox[];
  readonly separators: readonly PreviewCtaDomBox[];
  readonly labelTexts: readonly string[];
  readonly outputOuter: PreviewCtaDomBox | null;
}

function boxFromRects(
  target: DOMRect,
  inner: DOMRect,
): PreviewCtaDomBox {
  return {
    x: target.left - inner.left,
    y: target.top - inner.top,
    width: target.width,
    height: target.height,
  };
}

function toOutput(box: PreviewCtaDomBox, innerWidth: number, innerHeight: number): PreviewCtaDomBox {
  return {
    x: (box.x / innerWidth) * 1080,
    y: (box.y / innerHeight) * 1920,
    width: (box.width / innerWidth) * 1080,
    height: (box.height / innerHeight) * 1920,
  };
}

export function collectPreviewCtaDomMeasurements(
  host: Element | null,
): PreviewCtaDomMeasurements | null {
  if (!host || typeof host.getBoundingClientRect !== "function") return null;
  const inner =
    host.querySelector("[data-preview-inner-screen]") ?? host;
  const hostRect = host.getBoundingClientRect();
  const innerRect = inner.getBoundingClientRect();
  if (innerRect.width <= 0 || innerRect.height <= 0) return null;
  const preview = host.querySelector("[data-engagement-overlay-preview='true']");
  const svg = preview?.querySelector("[data-engagement-overlay-surface='output-space']");
  const labelEl = preview?.querySelector("[data-engagement-overlay-label]");
  const computedFontSizePx = labelEl
    ? Number.parseFloat(getComputedStyle(labelEl).fontSize)
    : null;
  const transform = preview
    ? getComputedStyle(preview).transform
    : "";
  const scaleMatch = /matrix\(([^,]+),/.exec(transform);
  const appliedScale = scaleMatch ? Number.parseFloat(scaleMatch[1] ?? "") : preview ? 1 : null;
  const outer = preview ? boxFromRects(preview.getBoundingClientRect(), innerRect) : null;
  const columns = Array.from(
    preview?.querySelectorAll("[data-engagement-overlay-column-group]") ?? [],
  ).map((node) => boxFromRects(node.getBoundingClientRect(), innerRect));
  const icons = Array.from(
    preview?.querySelectorAll("[data-engagement-overlay-icon]") ?? [],
  ).map((node) => boxFromRects(node.getBoundingClientRect(), innerRect));
  const labels = Array.from(
    preview?.querySelectorAll("[data-engagement-overlay-label]") ?? [],
  ).map((node) => boxFromRects(node.getBoundingClientRect(), innerRect));
  const separators = Array.from(
    preview?.querySelectorAll("[data-engagement-overlay-separator]") ?? [],
  ).map((node) => boxFromRects(node.getBoundingClientRect(), innerRect));
  return {
    hostWidth: hostRect.width,
    hostHeight: hostRect.height,
    innerWidth: innerRect.width,
    innerHeight: innerRect.height,
    usedInnerScreen: inner !== host,
    visible: Boolean(preview),
    viewBox: svg?.getAttribute("data-engagement-overlay-viewbox") ?? null,
    computedFontSizePx:
      computedFontSizePx != null && Number.isFinite(computedFontSizePx)
        ? computedFontSizePx
        : null,
    appliedScale:
      appliedScale != null && Number.isFinite(appliedScale) ? appliedScale : null,
    outer,
    columns,
    icons,
    labels,
    separators,
    labelTexts: Array.from(
      preview?.querySelectorAll("[data-engagement-overlay-label]") ?? [],
    ).map((node) => (node.textContent ?? "").trim()),
    outputOuter:
      outer && innerRect.width > 0 && innerRect.height > 0
        ? toOutput(outer, innerRect.width, innerRect.height)
        : null,
  };
}
