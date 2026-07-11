/**
 * Progress reporter for ExportRenderContext (Sprint 6C).
 * Progress must never mutate ExportManifest semantics.
 */

import type {
  ExportProgressReporter,
  ExportProgressUpdate,
} from "./export-render-context.types";

export function createExportProgressReporter(
  onProgress?: (update: ExportProgressUpdate) => void,
): ExportProgressReporter {
  return {
    report(update) {
      onProgress?.(update);
    },
  };
}
