/**
 * Short-lived direct PUT upload capability issuance (Design B staging).
 * putUrl is issuance-boundary only — never persist.
 */

import { cpFail } from "../types/control-plane.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessIssuedUploadCapabilityV1 = {
  readonly objectId: string;
  readonly expiresAtMs: number;
  /** Returned ONLY at issuance boundary — never persist. */
  readonly putUrl: string;
  readonly requiredHeaders: {
    readonly "Content-Type": string;
    /**
     * Server/non-browser callers may be required to send this. Browser fetch
     * cannot set Content-Length; browser-compatible capabilities omit it and
     * durable verification remains the byte-length authority.
     */
    readonly "Content-Length"?: string;
  };
};

export interface HeadlessUploadCapabilityPort {
  issueDirectPutCapability(input: {
    ownerId: string;
    projectId: string;
    jobId: string;
    operationId: string;
    objectId: string;
    expectedByteLength: number;
    expectedMimeType: string;
    /** Request Origin header value. */
    allowedOrigin: string;
    nowMs: number;
    /** Default short TTL e.g. 120_000. */
    ttlMs?: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessIssuedUploadCapabilityV1>>;
}

/**
 * Production gate when R2 upload issuance is not configured / not composed.
 */
export class UnavailableHeadlessUploadCapabilityAdapter
  implements HeadlessUploadCapabilityPort
{
  async issueDirectPutCapability() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Headless upload capability issuance is not configured.",
    );
  }
}
