/**
 * Short-lived artifact GET capability issuance for succeeded jobs.
 * getUrl is issuance-boundary only — never persist.
 */

import { cpFail } from "../types/control-plane.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessIssuedDownloadCapabilityV1 = {
  readonly jobId: string;
  readonly expiresAtMs: number;
  /** Returned ONLY at issuance boundary — never persist. */
  readonly getUrl: string;
};

export interface HeadlessDownloadCapabilityPort {
  issueArtifactGetCapability(input: {
    ownerId: string;
    jobId: string;
    nowMs: number;
    ttlMs?: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessIssuedDownloadCapabilityV1>>;
}

/**
 * Production gate when R2 download issuance is not configured / not composed.
 */
export class UnavailableHeadlessDownloadCapabilityAdapter
  implements HeadlessDownloadCapabilityPort
{
  async issueArtifactGetCapability() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Headless download capability issuance is not configured.",
    );
  }
}
