import type { HeadlessClientErrorCode } from "./public-job.types";

const REASON_COPY: Record<string, string> = {
  INVALID_REQUEST: "This export request could not be accepted. Try again.",
  INVALID_MANIFEST: "The story snapshot is not exportable. Check your scenes and try again.",
  UNSUPPORTED_MANIFEST_VERSION: "This story format is not supported for server export yet.",
  UNSUPPORTED_CAPABILITY: "This resolution or format is not available for server export.",
  CONFIGURATION_UNAVAILABLE:
    "Server rendering is not configured yet. You can continue with Browser Export.",
  AUTHENTICATION_REQUIRED: "Sign in to use server export.",
  CANCELLED_BY_USER: "Export cancelled.",
  QUEUE_ENQUEUE_FAILED: "Server export could not be queued. Retry when available.",
  RENDER_FAILED: "Server rendering failed. You can retry this export.",
  ENCODE_FAILED: "Encoding failed. You can retry this export.",
  VALIDATION_FAILED: "The exported file did not pass validation. You can retry.",
  ARTIFACT_UPLOAD_FAILED: "The export finished but could not be prepared for download. Retry.",
  EXPIRED: "This export job expired. Start a new export.",
  JOB_NOT_FOUND: "This export job could not be found. Start a new export.",
  TEMPORARILY_UNAVAILABLE: "Server export is temporarily unavailable. Try again shortly.",
};

export function creatorMessageForReasonId(reasonId: string | null | undefined): string {
  if (!reasonId) {
    return "Server export failed. You can retry or use Browser Export.";
  }
  return (
    REASON_COPY[reasonId] ??
    "Server export failed. You can retry or use Browser Export."
  );
}

export function creatorMessageForClientError(code: HeadlessClientErrorCode): string {
  switch (code) {
    case "CONFIGURATION_UNAVAILABLE":
      return REASON_COPY.CONFIGURATION_UNAVAILABLE;
    case "AUTHENTICATION_REQUIRED":
      return REASON_COPY.AUTHENTICATION_REQUIRED;
    case "TEMPORARILY_UNAVAILABLE":
      return REASON_COPY.TEMPORARILY_UNAVAILABLE;
    case "INVALID_RESPONSE":
      return "Server export returned an unexpected response. Try again or use Browser Export.";
    case "NETWORK_ERROR":
      return "Could not reach server export. Check your connection and try again.";
    case "JOB_NOT_FOUND":
      return REASON_COPY.JOB_NOT_FOUND;
    case "NOT_RETRYABLE":
      return "This export cannot be retried. Start a new export.";
    case "NOT_DOWNLOADABLE":
      return "Download is not ready yet.";
    case "CANCEL_REJECTED":
      return "Could not cancel this export.";
    case "CREATE_REJECTED":
      return "Could not start server export. Try again or use Browser Export.";
    default:
      return "Server export is unavailable. You can continue with Browser Export.";
  }
}

export const HEADLESS_EXPORT_INTRO =
  "Renders on a dedicated worker, so you can close this tab after the job is accepted.";

export const HEADLESS_4K_DURATION_COPY =
  "4K server export currently supports videos up to 60 seconds.";
