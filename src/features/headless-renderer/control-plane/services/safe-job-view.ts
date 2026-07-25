/**
 * Safe public job view projection — strips all sensitive authority fields.
 * Accepts either provisional or canonical stored records.
 */

import type { HeadlessRenderJobV1 } from "../../domain/headless-render.types";
import type { HeadlessPublicJobViewV1 } from "../types/control-plane.types";
import type { HeadlessStoredJobRecord } from "../types/stored-job-record";

export function toHeadlessPublicJobView(
  job: HeadlessRenderJobV1,
): HeadlessPublicJobViewV1 {
  const retryable =
    job.state === "failed" && job.terminalReason?.retryable === true;
  return {
    jobId: job.jobId,
    state: job.state,
    progress: job.progress,
    createdAtMs: job.createdAtMs,
    updatedAtMs: job.updatedAtMs,
    retryable,
    reasonId: job.terminalReason?.reasonId ?? null,
    artifactAvailable: job.state === "succeeded" && job.artifact != null,
    output: {
      resolution: job.rendererProfile.resolution,
      format: job.rendererProfile.format,
      fps: job.rendererProfile.fps,
      quality: job.rendererProfile.quality,
    },
  };
}

/**
 * Store-level projector for discriminated provisional/canonical records.
 * Never exposes digests, locators, coverage, tokens, or staging refs.
 */
export function toHeadlessPublicJobViewFromStore(
  record: HeadlessStoredJobRecord,
): HeadlessPublicJobViewV1 {
  if (record.stage === "canonical") {
    return toHeadlessPublicJobView(record.canonicalJob);
  }

  const profile = record.requestedRendererProfile;
  const retryable =
    record.state === "failed" &&
    record.terminalReason?.retryable === true;

  return {
    jobId: record.jobId,
    state: record.state,
    progress: record.progress,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    retryable,
    reasonId: record.terminalReason?.reasonId ?? null,
    artifactAvailable: false,
    output: {
      resolution: profile.resolution,
      format: profile.format,
      fps: profile.fps,
      quality: profile.quality,
    },
  };
}

/**
 * Browser product DTO. This deliberately differs from the older control-plane
 * diagnostic view: it carries an explicit version, nested terminal reason, and
 * cancel authority expected by the website validator.
 */
export function toHeadlessProductJobViewFromStore(
  record: HeadlessStoredJobRecord,
) {
  const view = toHeadlessPublicJobViewFromStore(record);
  const terminal =
    view.state === "succeeded" ||
    view.state === "failed" ||
    view.state === "cancelled" ||
    view.state === "expired";
  return {
    version: 1 as const,
    jobId: view.jobId,
    state: view.state,
    createdAtMs: view.createdAtMs,
    updatedAtMs: view.updatedAtMs,
    progress: view.progress,
    terminalReason:
      view.reasonId == null
        ? null
        : {
            reasonId: view.reasonId,
            retryable: view.retryable,
          },
    artifactAvailable: view.artifactAvailable,
    cancelAccepted: !terminal,
  };
}
