/**
 * Intrinsic total validation for HeadlessRenderJob v1.
 * Job/request coherence lives in validate-headless-coherence.ts (11B.1A).
 */

import {
  HEADLESS_ALL_STATES,
  HEADLESS_MAX_ATTEMPT,
  HEADLESS_MIN_ATTEMPT,
  isHeadlessTerminalState,
} from "./headless-render-constants";
import {
  HEADLESS_RENDER_CONTRACT_VERSION,
  HEADLESS_RENDER_JOB_VERSION,
  type HeadlessRenderJobV1,
} from "./headless-render.types";
import { deepFreezeHeadlessValue } from "./headless-deep-freeze";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import {
  parseHeadlessOwnership,
  parseHeadlessProgress,
  parseHeadlessRendererProfile,
  parseHeadlessTerminalReason,
  isNonEmptyId,
} from "./headless-field-validators";
import { buildHeadlessRenderJobFingerprint } from "./headless-fingerprints";
import {
  guardHeadlessStructure,
  hasUnknownFields,
  isPlainObject,
} from "./headless-hostile-guard";
import { isHeadlessAuthorityFingerprint } from "./headless-stable-hash";
import { validateHeadlessRenderArtifact } from "./validate-headless-artifact";

const JOB_FIELDS = [
  "version",
  "jobId",
  "contractVersion",
  "ownership",
  "state",
  "attempt",
  "progress",
  "manifestFingerprint",
  "assetBundleFingerprint",
  "requestFingerprint",
  "renderJobFingerprint",
  "rendererBuildId",
  "rendererProfile",
  "idempotencyKey",
  "createdAtMs",
  "updatedAtMs",
  "terminalReason",
  "artifact",
] as const;

export type ValidateHeadlessRenderJobResult =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly job: HeadlessRenderJobV1;
    }
  | { readonly ok: false; readonly issues: ReturnType<typeof headlessFail>["issues"] };

export function validateHeadlessRenderJob(
  value: unknown,
): ValidateHeadlessRenderJobResult {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return hostile;

    if (!isPlainObject(value)) {
      return headlessFail(headlessIssue("INVALID_JOB", "Job must be a plain object."));
    }
    if (hasUnknownFields(value, JOB_FIELDS)) {
      return headlessFail(
        headlessIssue("UNKNOWN_FIELD", "Job has an unknown field."),
      );
    }
    if (value.version !== HEADLESS_RENDER_JOB_VERSION) {
      return headlessFail(
        headlessIssue("INVALID_JOB", "Unsupported job version."),
      );
    }
    if (value.contractVersion !== HEADLESS_RENDER_CONTRACT_VERSION) {
      return headlessFail(
        headlessIssue("INVALID_JOB", "Unsupported contract version."),
      );
    }
    if (!isNonEmptyId(value.jobId)) {
      return headlessFail(headlessIssue("INVALID_JOB", "Invalid jobId."));
    }

    const ownershipParsed = parseHeadlessOwnership(value.ownership);
    if (!ownershipParsed.ok) return { ok: false, issues: ownershipParsed.issues };

    if (!(HEADLESS_ALL_STATES as readonly string[]).includes(value.state as string)) {
      return headlessFail(headlessIssue("INVALID_JOB", "Unknown job state."));
    }
    if (
      typeof value.attempt !== "number" ||
      !Number.isInteger(value.attempt) ||
      value.attempt < HEADLESS_MIN_ATTEMPT ||
      value.attempt > HEADLESS_MAX_ATTEMPT
    ) {
      return headlessFail(headlessIssue("INVALID_JOB", "Invalid attempt."));
    }

    const state = value.state as HeadlessRenderJobV1["state"];
    const profileParsed = parseHeadlessRendererProfile(value.rendererProfile);
    if (!profileParsed.ok) return { ok: false, issues: profileParsed.issues };

    if (!isNonEmptyId(value.rendererBuildId) || !isNonEmptyId(value.idempotencyKey)) {
      return headlessFail(headlessIssue("INVALID_JOB", "Invalid build/idempotency ids."));
    }
    if (
      typeof value.manifestFingerprint !== "string" ||
      !isHeadlessAuthorityFingerprint(value.assetBundleFingerprint, "hab") ||
      !isHeadlessAuthorityFingerprint(value.requestFingerprint, "hrr")
    ) {
      return headlessFail(
        headlessIssue("INVALID_JOB", "Malformed fingerprint prefixes."),
      );
    }

    const expectedJobFp = buildHeadlessRenderJobFingerprint({
      requestFingerprint: value.requestFingerprint,
      attempt: value.attempt,
      rendererBuildId: value.rendererBuildId,
      contractVersion: HEADLESS_RENDER_CONTRACT_VERSION,
    });
    if (!expectedJobFp.ok) return expectedJobFp;
    if (
      !isHeadlessAuthorityFingerprint(value.renderJobFingerprint, "hrj") ||
      value.renderJobFingerprint !== expectedJobFp.fingerprint
    ) {
      return headlessFail(
        headlessIssue("INVALID_JOB", "renderJobFingerprint mismatch."),
      );
    }

    let progress = null as HeadlessRenderJobV1["progress"];
    if (isHeadlessTerminalState(state)) {
      if (value.progress !== null) {
        return headlessFail(
          headlessIssue("INVALID_JOB", "Terminal jobs clear advisory progress."),
        );
      }
    } else {
      const progressParsed = parseHeadlessProgress(value.progress);
      if (!progressParsed.ok) return { ok: false, issues: progressParsed.issues };
      progress = progressParsed.progress;
    }

    let terminalReason = null as HeadlessRenderJobV1["terminalReason"];
    let artifact = null as HeadlessRenderJobV1["artifact"];

    if (state === "succeeded") {
      if (value.artifact == null) {
        return headlessFail(
          headlessIssue("ARTIFACT_REQUIRED", "succeeded requires an artifact."),
        );
      }
      if (value.terminalReason !== null) {
        return headlessFail(
          headlessIssue("INVALID_JOB", "succeeded must not carry a failure reason."),
        );
      }
      const artifactResult = validateHeadlessRenderArtifact(value.artifact);
      if (!artifactResult.ok) return artifactResult;
      if (
        artifactResult.artifact.manifestFingerprint !== value.manifestFingerprint ||
        artifactResult.artifact.assetBundleFingerprint !==
          value.assetBundleFingerprint ||
        artifactResult.artifact.renderJobFingerprint !== value.renderJobFingerprint ||
        artifactResult.artifact.rendererBuildId !== value.rendererBuildId
      ) {
        return headlessFail(
          headlessIssue(
            "ARTIFACT_FINGERPRINT_MISMATCH",
            "Artifact fingerprints do not match the job.",
          ),
        );
      }
      artifact = artifactResult.artifact;
    } else {
      if (value.artifact !== null) {
        return headlessFail(
          headlessIssue(
            "ARTIFACT_FORBIDDEN",
            "Only succeeded jobs may carry an artifact.",
          ),
        );
      }
      if (isHeadlessTerminalState(state)) {
        const reasonParsed = parseHeadlessTerminalReason(value.terminalReason);
        if (!reasonParsed.ok) return { ok: false, issues: reasonParsed.issues };
        terminalReason = reasonParsed.reason;
      } else if (value.terminalReason !== null) {
        return headlessFail(
          headlessIssue("INVALID_JOB", "Active jobs must not carry a terminal reason."),
        );
      }
    }

    if (
      typeof value.createdAtMs !== "number" ||
      typeof value.updatedAtMs !== "number" ||
      !Number.isSafeInteger(value.createdAtMs) ||
      !Number.isSafeInteger(value.updatedAtMs) ||
      value.createdAtMs < 0 ||
      value.updatedAtMs < value.createdAtMs
    ) {
      return headlessFail(headlessIssue("INVALID_JOB", "Invalid timestamps."));
    }

    const job = deepFreezeHeadlessValue({
      version: HEADLESS_RENDER_JOB_VERSION,
      jobId: value.jobId,
      contractVersion: HEADLESS_RENDER_CONTRACT_VERSION,
      ownership: ownershipParsed.ownership,
      state,
      attempt: value.attempt,
      progress,
      manifestFingerprint: value.manifestFingerprint,
      assetBundleFingerprint: value.assetBundleFingerprint,
      requestFingerprint: value.requestFingerprint,
      renderJobFingerprint: expectedJobFp.fingerprint,
      rendererBuildId: value.rendererBuildId,
      rendererProfile: profileParsed.profile,
      idempotencyKey: value.idempotencyKey,
      createdAtMs: value.createdAtMs,
      updatedAtMs: value.updatedAtMs,
      terminalReason,
      artifact,
    } satisfies HeadlessRenderJobV1);

    return { ok: true, issues: [], job };
  } catch {
    return headlessFail(
      headlessIssue("HOSTILE_INPUT", "Hostile job input rejected."),
    );
  }
}
