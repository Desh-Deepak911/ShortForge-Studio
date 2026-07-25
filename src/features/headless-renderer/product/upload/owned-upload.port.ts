/**
 * Owned-asset upload boundary for headless product dispatch.
 * Implementations must not bypass server authentication or ownership.
 */

import type { HeadlessPublicJobView } from "../client/public-job.types";

export type OwnedUploadFailureCode =
  | "CONFIGURATION_UNAVAILABLE"
  | "ABORTED"
  | "PARTIAL_FAILURE"
  | "EXPIRED_AUTHORITY"
  | "INVALID_SOURCE";

export interface OwnedUploadFailure {
  readonly ok: false;
  readonly code: OwnedUploadFailureCode;
  readonly message: string;
}

export interface OwnedUploadSuccess {
  readonly ok: true;
  readonly manifestObjectKey: string;
  readonly assetBundleObjectKey: string;
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  /** Production direct-upload flow creates the provisional job before PUTs. */
  readonly createdJob?: {
    readonly jobId: string;
    readonly view: HeadlessPublicJobView;
  };
}

export type OwnedUploadResult = OwnedUploadSuccess | OwnedUploadFailure;

export interface OwnedUploadRequest {
  readonly operationId: string;
  readonly draftId: string;
  readonly manifestBytes: Uint8Array;
  readonly assetBundleBytes: Uint8Array;
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  readonly sourceObjects?: readonly {
    readonly slotKey: string;
    readonly bytes: Uint8Array;
    readonly contentDigest: string;
    readonly mimeType: string;
  }[];
  readonly rendererProfile?: {
    readonly resolution: "720p" | "1080p" | "4k";
    readonly format: "webm" | "mp4";
    readonly fps: 30;
    readonly quality: "standard" | "high";
  };
  readonly rendererBuildId?: string;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export interface OwnedUploadPort {
  uploadOwnedBundle(request: OwnedUploadRequest): Promise<OwnedUploadResult>;
}

/** Production default — truthful unavailable until durable storage is wired. */
export class UnavailableOwnedUploadAdapter implements OwnedUploadPort {
  async uploadOwnedBundle(
    _request: OwnedUploadRequest,
  ): Promise<OwnedUploadResult> {
    void _request;
    return {
      ok: false,
      code: "CONFIGURATION_UNAVAILABLE",
      message:
        "Server rendering is not configured yet. You can continue with Browser Export.",
    };
  }
}
