/**
 * Cancellation token for export runtime (Sprint 6C).
 */

import type { ExportCancellationToken } from "./export-render-context.types";

export class ExportCancelledError extends Error {
  readonly code = "EXPORT_CANCELLED" as const;

  constructor(message = "Export was cancelled.") {
    super(message);
    this.name = "ExportCancelledError";
  }
}

export function createExportCancellationToken(
  signal?: AbortSignal,
): ExportCancellationToken {
  let cancelled = Boolean(signal?.aborted);
  let reason = "Export was cancelled.";

  const onAbort = () => {
    cancelled = true;
    reason = "Export was cancelled by abort signal.";
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  return {
    get isCancelled() {
      return cancelled || Boolean(signal?.aborted);
    },
    throwIfCancelled() {
      if (this.isCancelled) {
        throw new ExportCancelledError(reason);
      }
    },
    cancel(nextReason?: string) {
      cancelled = true;
      if (nextReason?.trim()) {
        reason = nextReason.trim();
      }
    },
  };
}
