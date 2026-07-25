import type { HeadlessAvailabilityV1 } from "../availability/availability.types";
import type {
  HeadlessClientResult,
  HeadlessDownloadCapabilityV1,
  HeadlessPublicJobView,
} from "./public-job.types";

/**
 * Compact create-job body — mirrors HeadlessCreateJobTransportV1 without
 * importing control-plane from client leaves.
 */
export interface HeadlessCreateJobClientBody {
  readonly version: 1;
  readonly ownership: {
    readonly ownerId: string;
    readonly projectId: string;
  };
  readonly manifestObjectKey: string;
  readonly assetBundleObjectKey: string;
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  readonly rendererProfile: {
    readonly resolution: "720p" | "1080p" | "4k";
    readonly format: "webm" | "mp4";
    readonly fps: 30;
    readonly quality: "standard" | "high";
  };
  readonly rendererBuildId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export interface HeadlessRenderClient {
  getAvailability(signal?: AbortSignal): Promise<HeadlessClientResult<HeadlessAvailabilityV1>>;
  createJob(
    body: HeadlessCreateJobClientBody,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<{ jobId: string; view: HeadlessPublicJobView }>>;
  getJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<HeadlessPublicJobView>>;
  cancelJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<HeadlessPublicJobView>>;
  retryJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<{ jobId: string; view: HeadlessPublicJobView }>>;
  createDownloadCapability(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<HeadlessClientResult<HeadlessDownloadCapabilityV1>>;
}
