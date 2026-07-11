/**
 * Dev-only export failure injection (Sprint 6F).
 * Production builds ignore injection; never auto-enabled.
 */

export type ExportFailureInjectionPoint =
  | "frame-serialization"
  | "chunk-encode"
  | "concat"
  | "audio-mux"
  | "artifact-validation"
  | "ffmpeg-worker-abort"
  | "cancellation";

let activeInjection: ExportFailureInjectionPoint | null = null;

export function setExportFailureInjection(
  point: ExportFailureInjectionPoint | null,
): void {
  if (process.env.NODE_ENV === "production") {
    activeInjection = null;
    return;
  }
  activeInjection = point;
}

export function getExportFailureInjection(): ExportFailureInjectionPoint | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return activeInjection;
}

export function consumeExportFailureInjection(
  point: ExportFailureInjectionPoint,
): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (activeInjection !== point) {
    return false;
  }
  activeInjection = null;
  return true;
}

export class ExportInjectedFailureError extends Error {
  readonly code = "EXPORT_INJECTED_FAILURE" as const;
  constructor(readonly injectionPoint: ExportFailureInjectionPoint) {
    super(`Injected export failure at ${injectionPoint}`);
    this.name = "ExportInjectedFailureError";
  }
}

export function throwIfExportFailureInjected(
  point: ExportFailureInjectionPoint,
): void {
  if (consumeExportFailureInjection(point)) {
    throw new ExportInjectedFailureError(point);
  }
}
