/**
 * Pure legal-transition resolver for HeadlessRenderJob states.
 * Every mutation requires a runtime-validated canonical request (11B.1A).
 */

import {
  HEADLESS_LEGAL_TRANSITIONS,
  isHeadlessTerminalState,
} from "./headless-render-constants";
import { headlessIssue } from "./headless-diagnostics";
import {
  parseHeadlessProgress,
  parseHeadlessTerminalReason,
} from "./headless-field-validators";
import type {
  HeadlessIntegrityResult,
  HeadlessJobState,
  HeadlessRenderArtifactV1,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
  HeadlessTerminalReason,
} from "./headless-render.types";
import { deepFreezeHeadlessValue } from "./headless-deep-freeze";
import {
  validateHeadlessArtifactRequestCoherence,
  validateHeadlessRenderJobCoherence,
} from "./validate-headless-coherence";

export interface HeadlessTransitionRequest {
  readonly fromState: HeadlessJobState;
  readonly toState: HeadlessJobState;
  readonly fromAttempt: number;
  readonly toAttempt: number;
  readonly artifact?: HeadlessRenderArtifactV1 | null;
  readonly terminalReason?: HeadlessTerminalReason | null;
}

export interface HeadlessTransitionDecision {
  readonly ok: boolean;
  readonly issues: HeadlessIntegrityResult["issues"];
  readonly legal: boolean;
}

export function isLegalHeadlessJobTransition(
  from: HeadlessJobState,
  to: HeadlessJobState,
): boolean {
  return HEADLESS_LEGAL_TRANSITIONS[from].includes(to);
}

export function resolveHeadlessJobTransition(
  request: HeadlessTransitionRequest,
): HeadlessTransitionDecision {
  try {
    if (
      !Number.isInteger(request.fromAttempt) ||
      !Number.isInteger(request.toAttempt) ||
      request.fromAttempt < 1 ||
      request.toAttempt < 1
    ) {
      return {
        ok: false,
        legal: false,
        issues: [headlessIssue("INVALID_JOB", "Invalid attempt number.")],
      };
    }

    if (request.toAttempt < request.fromAttempt) {
      return {
        ok: false,
        legal: false,
        issues: [headlessIssue("STALE_ATTEMPT", "Stale attempt update rejected.")],
      };
    }

    if (request.toAttempt > request.fromAttempt) {
      return {
        ok: false,
        legal: false,
        issues: [
          headlessIssue(
            "STALE_ATTEMPT",
            "Attempt bump is not a legal in-place state transition.",
          ),
        ],
      };
    }

    if (isHeadlessTerminalState(request.fromState)) {
      return {
        ok: false,
        legal: false,
        issues: [
          headlessIssue(
            "TERMINAL_STATE_IMMUTABLE",
            "Terminal job state cannot transition.",
          ),
        ],
      };
    }

    if (!isLegalHeadlessJobTransition(request.fromState, request.toState)) {
      return {
        ok: false,
        legal: false,
        issues: [
          headlessIssue(
            "ILLEGAL_STATE_TRANSITION",
            "Illegal headless job state transition.",
          ),
        ],
      };
    }

    if (request.toState === "succeeded") {
      if (!request.artifact) {
        return {
          ok: false,
          legal: false,
          issues: [
            headlessIssue(
              "ARTIFACT_REQUIRED",
              "succeeded requires a validated artifact.",
            ),
          ],
        };
      }
    } else if (isHeadlessTerminalState(request.toState)) {
      if (request.artifact) {
        return {
          ok: false,
          legal: false,
          issues: [
            headlessIssue(
              "ARTIFACT_FORBIDDEN",
              "Non-success terminal states cannot carry an artifact.",
            ),
          ],
        };
      }
      if (!request.terminalReason) {
        return {
          ok: false,
          legal: false,
          issues: [
            headlessIssue(
              "INVALID_TERMINAL_REASON",
              "Terminal non-success states require a terminal reason.",
            ),
          ],
        };
      }
    } else if (request.artifact) {
      return {
        ok: false,
        legal: false,
        issues: [
          headlessIssue(
            "ARTIFACT_FORBIDDEN",
            "Active states cannot carry an artifact.",
          ),
        ],
      };
    }

    return { ok: true, legal: true, issues: [] };
  } catch {
    return {
      ok: false,
      legal: false,
      issues: [headlessIssue("HOSTILE_INPUT", "Hostile transition input rejected.")],
    };
  }
}

export interface ApplyHeadlessJobTransitionInput {
  /** Untyped job value — structural typing never establishes authority. */
  readonly jobValue: unknown;
  /** Required for every mutation — runtime-validated canonical request. */
  readonly requestValue: unknown;
  readonly toState: HeadlessJobState;
  readonly attempt: number;
  readonly updatedAtMs: number;
  readonly progress?: HeadlessRenderJobV1["progress"];
  readonly artifact?: unknown;
  readonly terminalReason?: HeadlessTerminalReason | null;
}

export type ApplyHeadlessJobTransitionResult =
  | {
      readonly ok: true;
      readonly job: HeadlessRenderJobV1;
      readonly request: HeadlessRenderJobRequestV1;
      readonly issues: readonly [];
    }
  | { readonly ok: false; readonly issues: HeadlessIntegrityResult["issues"] };

/**
 * Pure apply:
 * canonical request → coherent current job → transition payload → coherent next job.
 */
export function applyHeadlessJobTransition(
  input: ApplyHeadlessJobTransitionInput,
): ApplyHeadlessJobTransitionResult {
  if (input.requestValue === undefined || input.requestValue === null) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_REQUEST",
          "Every job transition requires an asserted requestValue.",
        ),
      ],
    };
  }

  const current = validateHeadlessRenderJobCoherence(
    input.jobValue,
    input.requestValue,
  );
  if (!current.ok) return current;
  const request = current.request;

  if (
    typeof input.updatedAtMs !== "number" ||
    !Number.isSafeInteger(input.updatedAtMs) ||
    input.updatedAtMs < current.job.updatedAtMs
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "TIMESTAMP_REGRESSION",
          "updatedAtMs must be >= current updatedAtMs.",
        ),
      ],
    };
  }

  let terminalReason: HeadlessTerminalReason | null = null;
  if (
    input.toState !== "succeeded" &&
    isHeadlessTerminalState(input.toState)
  ) {
    const parsed = parseHeadlessTerminalReason(input.terminalReason ?? null);
    if (!parsed.ok) return { ok: false, issues: parsed.issues };
    terminalReason = parsed.reason;
  }

  let progress: HeadlessRenderJobV1["progress"] = null;
  if (!isHeadlessTerminalState(input.toState)) {
    const progressParsed = parseHeadlessProgress(
      input.progress === undefined ? current.job.progress : input.progress,
    );
    if (!progressParsed.ok) return { ok: false, issues: progressParsed.issues };
    progress = progressParsed.progress;
  }

  let artifact: HeadlessRenderArtifactV1 | null = null;
  if (input.toState === "succeeded") {
    const cohere = validateHeadlessArtifactRequestCoherence(
      input.artifact,
      current.job,
      request,
    );
    if (!cohere.ok) return cohere;
    artifact = cohere.artifact;
  } else if (input.artifact != null && input.artifact !== undefined) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "ARTIFACT_FORBIDDEN",
          "Active/non-success states cannot carry an artifact.",
        ),
      ],
    };
  }

  const decision = resolveHeadlessJobTransition({
    fromState: current.job.state,
    toState: input.toState,
    fromAttempt: current.job.attempt,
    toAttempt: input.attempt,
    artifact,
    terminalReason,
  });
  if (!decision.ok) {
    return { ok: false, issues: decision.issues };
  }

  const next: HeadlessRenderJobV1 = {
    ...current.job,
    state: input.toState,
    attempt: input.attempt,
    updatedAtMs: input.updatedAtMs,
    progress,
    artifact,
    terminalReason: isHeadlessTerminalState(input.toState)
      ? input.toState === "succeeded"
        ? null
        : terminalReason
      : null,
  };

  const validated = validateHeadlessRenderJobCoherence(next, request);
  if (!validated.ok) return validated;
  return {
    ok: true,
    issues: [],
    job: deepFreezeHeadlessValue(validated.job),
    request: validated.request,
  };
}
