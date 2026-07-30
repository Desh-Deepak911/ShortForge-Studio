import type { HeadlessAvailabilityV1 } from "../availability/availability.types";
import type {
  HeadlessClientErrorCode,
  HeadlessPublicJobView,
} from "../client/public-job.types";

export const HEADLESS_PRODUCT_STATES = [
  "idle",
  "checking_availability",
  "unavailable",
  "preparing",
  "materializing",
  "uploading",
  "creating_job",
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading_artifact",
  "succeeded",
  "failed",
  "cancelling",
  "cancelled",
  "retrying",
  "expired",
] as const;

export type HeadlessProductState = (typeof HEADLESS_PRODUCT_STATES)[number];

export type HeadlessProductRendererChoice = "browser" | "headless";

export interface HeadlessOutputSummary {
  readonly resolution: "720p" | "1080p" | "4k";
  readonly format: "webm" | "mp4";
}

export interface HeadlessProductSnapshotMeta {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly draftId: string;
  readonly output: HeadlessOutputSummary;
  readonly createdAtMs: number;
}

export interface HeadlessProductContext {
  readonly runId: number;
  readonly renderer: HeadlessProductRendererChoice;
  readonly availability: HeadlessAvailabilityV1 | null;
  readonly snapshot: HeadlessProductSnapshotMeta | null;
  readonly jobId: string | null;
  readonly jobView: HeadlessPublicJobView | null;
  readonly advisoryPercent: number | null;
  readonly advisoryCompletedFrames: number | null;
  readonly advisoryTotalFrames: number | null;
  readonly renderingPollsWithoutFrameTelemetry: number;
  readonly safeMessage: string | null;
  readonly clientErrorCode: HeadlessClientErrorCode | null;
  readonly busy: boolean;
}

export interface HeadlessProductModel {
  readonly state: HeadlessProductState;
  readonly ctx: HeadlessProductContext;
}

export type HeadlessProductEvent =
  | { readonly type: "SELECT_RENDERER"; readonly renderer: HeadlessProductRendererChoice }
  | { readonly type: "CHECK_AVAILABILITY"; readonly runId: number }
  | {
      readonly type: "AVAILABILITY_RESULT";
      readonly runId: number;
      readonly availability: HeadlessAvailabilityV1;
    }
  | {
      readonly type: "AVAILABILITY_FAILED";
      readonly runId: number;
      readonly code: HeadlessClientErrorCode;
      readonly message: string;
    }
  | {
      readonly type: "START_EXPORT";
      readonly runId: number;
      readonly snapshot: HeadlessProductSnapshotMeta;
    }
  | { readonly type: "PREPARE_OK"; readonly runId: number }
  | {
      readonly type: "MATERIALIZE_PROGRESS";
      readonly runId: number;
      readonly phase: "materializing" | "uploading";
      readonly percent?: number;
      readonly message?: string;
    }
  | { readonly type: "UPLOAD_OK"; readonly runId: number }
  | {
      readonly type: "UPLOAD_FAILED";
      readonly runId: number;
      readonly message: string;
    }
  | {
      readonly type: "CREATE_OK";
      readonly runId: number;
      readonly jobId: string;
      readonly view: HeadlessPublicJobView;
    }
  | {
      readonly type: "CREATE_FAILED";
      readonly runId: number;
      readonly code: HeadlessClientErrorCode;
      readonly message: string;
    }
  | {
      readonly type: "JOB_VIEW";
      readonly runId: number;
      readonly view: HeadlessPublicJobView;
    }
  | {
      readonly type: "POLL_TRANSIENT_FAILURE";
      readonly runId: number;
      readonly message: string;
    }
  | { readonly type: "REQUEST_CANCEL"; readonly runId: number }
  | {
      readonly type: "CANCEL_OK";
      readonly runId: number;
      readonly view: HeadlessPublicJobView;
    }
  | {
      readonly type: "CANCEL_FAILED";
      readonly runId: number;
      readonly message: string;
    }
  | { readonly type: "REQUEST_RETRY"; readonly runId: number }
  | {
      readonly type: "RETRY_OK";
      readonly runId: number;
      readonly jobId: string;
      readonly view: HeadlessPublicJobView;
    }
  | {
      readonly type: "RETRY_FAILED";
      readonly runId: number;
      readonly message: string;
    }
  | { readonly type: "RESET" }
  | {
      readonly type: "RESTORE_JOB";
      readonly runId: number;
      readonly jobId: string;
      readonly snapshot: HeadlessProductSnapshotMeta;
    };

export function createInitialProductModel(
  renderer: HeadlessProductRendererChoice = "browser",
): HeadlessProductModel {
  return {
    state: "idle",
    ctx: {
      runId: 0,
      renderer,
      availability: null,
      snapshot: null,
      jobId: null,
      jobView: null,
      advisoryPercent: null,
      advisoryCompletedFrames: null,
      advisoryTotalFrames: null,
      renderingPollsWithoutFrameTelemetry: 0,
      safeMessage: null,
      clientErrorCode: null,
      busy: false,
    },
  };
}
