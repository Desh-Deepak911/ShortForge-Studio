/**
 * Development-harness clean Preview capture surface.
 * Same production Preview composition; device/authoring chrome suppressed.
 */

export const PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_LOCATOR =
  "[data-preview-runtime-parity-cert-capture-surface]";

export const PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ATTR =
  "data-preview-runtime-parity-cert-capture-surface";

/** Canonical 9:16 output plate used for still-frame certification. */
export const PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX = 1080;
export const PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX = 1920;
export const PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ASPECT = 9 / 16;

/** Device chrome that must stay outside the capture box. */
export const PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_EXCLUDED_CHROME = [
  "phone bezel",
  "outer device padding",
  "dynamic island",
  "transport controls",
  "inspection status",
  "QA controls",
  "diagnostic HUD",
  "selection chrome",
  "drag guides",
] as const;

export interface CertificationCaptureBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function resolveCertificationCaptureAspectRatio(
  box: Pick<CertificationCaptureBox, "width" | "height">,
): number {
  if (!(box.height > 0)) return 0;
  return box.width / box.height;
}

export function certificationCaptureBoxIsNineSixteen(
  box: Pick<CertificationCaptureBox, "width" | "height">,
  tolerance = 0.01,
): boolean {
  const ratio = resolveCertificationCaptureAspectRatio(box);
  return Math.abs(ratio - PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ASPECT) <= tolerance;
}

export function certificationCaptureBoxHasDevicePadding(
  box: Pick<CertificationCaptureBox, "width" | "height">,
  expectedWidth = PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
  expectedHeight = PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  tolerancePx = 1,
): boolean {
  return (
    Math.abs(box.width - expectedWidth) > tolerancePx ||
    Math.abs(box.height - expectedHeight) > tolerancePx
  );
}
