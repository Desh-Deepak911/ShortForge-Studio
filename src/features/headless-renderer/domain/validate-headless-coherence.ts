/**
 * Sprint 11B.1A — Canonical request-chain authority.
 * Every public job/artifact/lifecycle coherence path reasserts the request at runtime.
 */

import { deepFreezeHeadlessValue } from "./headless-deep-freeze";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import {
  matchArtifactToCanonicalJobRequest,
  matchJobToCanonicalRequest,
} from "./headless-coherence-matchers";
import { isNonEmptyId } from "./headless-field-validators";
import { buildHeadlessRenderJobFingerprint } from "./headless-fingerprints";
import {
  HEADLESS_RENDER_CONTRACT_VERSION,
  HEADLESS_RENDER_JOB_VERSION,
  type HeadlessRenderArtifactV1,
  type HeadlessRenderJobRequestV1,
  type HeadlessRenderJobV1,
} from "./headless-render.types";
import { validateHeadlessRenderArtifact } from "./validate-headless-artifact";
import { validateHeadlessRenderJob } from "./validate-headless-job";
import { validateHeadlessRenderJobRequest } from "./validate-headless-job-request";

export type ValidateHeadlessRenderJobCoherenceResult =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly job: HeadlessRenderJobV1;
      readonly request: HeadlessRenderJobRequestV1;
    }
  | {
      readonly ok: false;
      readonly issues: ReturnType<typeof headlessFail>["issues"];
    };

/**
 * Total job coherence: validate request first, then job, then field match.
 * Uses only the returned canonical detached request — never trusts caller fields.
 */
export function validateHeadlessRenderJobCoherence(
  jobValue: unknown,
  requestValue: unknown,
): ValidateHeadlessRenderJobCoherenceResult {
  const requestResult = validateHeadlessRenderJobRequest(requestValue);
  if (!requestResult.ok) return requestResult;
  const request = requestResult.request;

  const jobResult = validateHeadlessRenderJob(jobValue);
  if (!jobResult.ok) return jobResult;
  const job = jobResult.job;

  const jobMatch = matchJobToCanonicalRequest(job, request);
  if (!jobMatch.ok) return jobMatch;

  if (job.state === "succeeded" && job.artifact) {
    const artifactMatch = matchArtifactToCanonicalJobRequest(
      job.artifact,
      job,
      request,
    );
    if (!artifactMatch.ok) return artifactMatch;
  }

  return { ok: true, issues: [], job, request };
}

export type ValidateHeadlessArtifactChainResult =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly artifact: HeadlessRenderArtifactV1;
      readonly job: HeadlessRenderJobV1;
      readonly request: HeadlessRenderJobRequestV1;
    }
  | {
      readonly ok: false;
      readonly issues: ReturnType<typeof headlessFail>["issues"];
    };

/**
 * Public full-chain: request → job-against-request → artifact intrinsic →
 * artifact-against-canonical job/request. No recursive public-chain re-entry.
 */
export function validateHeadlessArtifactRequestCoherence(
  artifactValue: unknown,
  jobValue: unknown,
  requestValue: unknown,
): ValidateHeadlessArtifactChainResult {
  const requestResult = validateHeadlessRenderJobRequest(requestValue);
  if (!requestResult.ok) return requestResult;
  const request = requestResult.request;

  const jobResult = validateHeadlessRenderJob(jobValue);
  if (!jobResult.ok) return jobResult;
  const job = jobResult.job;

  const jobMatch = matchJobToCanonicalRequest(job, request);
  if (!jobMatch.ok) return jobMatch;

  const artifactResult = validateHeadlessRenderArtifact(artifactValue);
  if (!artifactResult.ok) return artifactResult;
  const artifact = artifactResult.artifact;

  const artifactMatch = matchArtifactToCanonicalJobRequest(
    artifact,
    job,
    request,
  );
  if (!artifactMatch.ok) return artifactMatch;

  return { ok: true, issues: [], artifact, job, request };
}

export type CreateAcceptedHeadlessRenderJobResult =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly job: HeadlessRenderJobV1;
      readonly request: HeadlessRenderJobRequestV1;
    }
  | {
      readonly ok: false;
      readonly issues: ReturnType<typeof headlessFail>["issues"];
    };

/**
 * Accept into `created` only after runtime request validation.
 * A TypeScript cast cannot bypass this boundary.
 */
export function createAcceptedHeadlessRenderJob(input: {
  jobId: string;
  /** Untyped — structural typing never establishes authority. */
  requestValue: unknown;
  createdAtMs: number;
}): CreateAcceptedHeadlessRenderJobResult {
  if (!isNonEmptyId(input.jobId)) {
    return headlessFail(headlessIssue("INVALID_JOB", "Invalid jobId."));
  }
  if (
    typeof input.createdAtMs !== "number" ||
    !Number.isSafeInteger(input.createdAtMs) ||
    input.createdAtMs < 0
  ) {
    return headlessFail(headlessIssue("INVALID_JOB", "Invalid createdAtMs."));
  }

  const requestResult = validateHeadlessRenderJobRequest(input.requestValue);
  if (!requestResult.ok) return requestResult;
  const request = requestResult.request;

  const jobFp = buildHeadlessRenderJobFingerprint({
    requestFingerprint: request.requestFingerprint,
    attempt: 1,
    rendererBuildId: request.rendererBuildId,
  });
  if (!jobFp.ok) return jobFp;

  const jobDraft: HeadlessRenderJobV1 = {
    version: HEADLESS_RENDER_JOB_VERSION,
    jobId: input.jobId,
    contractVersion: HEADLESS_RENDER_CONTRACT_VERSION,
    ownership: request.ownership,
    state: "created",
    attempt: 1,
    progress: null,
    manifestFingerprint: request.manifestFingerprint,
    assetBundleFingerprint: request.assetBundle.fingerprint,
    requestFingerprint: request.requestFingerprint,
    renderJobFingerprint: jobFp.fingerprint,
    rendererBuildId: request.rendererBuildId,
    rendererProfile: request.rendererProfile,
    idempotencyKey: request.idempotencyKey,
    createdAtMs: input.createdAtMs,
    updatedAtMs: input.createdAtMs,
    terminalReason: null,
    artifact: null,
  };

  const coherent = validateHeadlessRenderJobCoherence(jobDraft, request);
  if (!coherent.ok) return coherent;
  return {
    ok: true,
    issues: [],
    job: deepFreezeHeadlessValue(coherent.job),
    request: coherent.request,
  };
}
