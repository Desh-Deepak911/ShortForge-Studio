/** Testing/dev-only owned-upload adapter. Never production authority. */

import {
  PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
  rejectPlaceholderOwnedUploadRequest,
} from "../authority/placeholder-production-guard";
import type {
  OwnedUploadPort,
  OwnedUploadRequest,
  OwnedUploadResult,
} from "../upload/owned-upload.port";

export interface FakeOwnedUploadAdapterOptions {
  readonly fail?: boolean;
}

export class FakeOwnedUploadAdapter implements OwnedUploadPort {
  readonly requests: OwnedUploadRequest[] = [];
  private readonly fail: boolean;

  constructor(options: FakeOwnedUploadAdapterOptions = {}) {
    this.fail = options.fail === true;
  }

  async uploadOwnedBundle(
    request: OwnedUploadRequest,
  ): Promise<OwnedUploadResult> {
    const detachedRequest = Object.freeze({
      operationId: request.operationId,
      draftId: request.draftId,
      manifestBytes: new Uint8Array(request.manifestBytes),
      assetBundleBytes: new Uint8Array(request.assetBundleBytes),
      manifestFingerprint: request.manifestFingerprint,
      assetBundleFingerprint: request.assetBundleFingerprint,
      signal: request.signal,
    });
    this.requests.push(detachedRequest);

    const rejected = rejectPlaceholderOwnedUploadRequest(request, {
      requireExplicitTestAuthority: true,
    });
    if (rejected != null) {
      return Object.freeze({
        ok: false,
        code: "INVALID_SOURCE",
        message: PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
      });
    }

    if (request.signal?.aborted) {
      return Object.freeze({
        ok: false,
        code: "ABORTED",
        message: "The test upload was cancelled.",
      });
    }
    if (this.fail) {
      return Object.freeze({
        ok: false,
        code: "PARTIAL_FAILURE",
        message: "The test upload did not complete.",
      });
    }

    const safeOperationId = request.operationId.replace(/[^a-zA-Z0-9_-]/g, "-");
    return Object.freeze({
      ok: true,
      manifestObjectKey: `test-owned/${safeOperationId}/manifest.json`,
      assetBundleObjectKey: `test-owned/${safeOperationId}/assets.json`,
      manifestFingerprint: request.manifestFingerprint,
      assetBundleFingerprint: request.assetBundleFingerprint,
    });
  }
}
