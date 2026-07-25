/**
 * Sprint 11E Phase 2E.2D.8F.2 — privacy-safe run-owned delivery correlation.
 * Internal run keys never appear in evidence — only matched/unmatched classification.
 */

import type { HostedRenderDeliveryEventObservation } from "./claim-correlation-authority";

export const RUN_OWNED_DELIVERY_CORRELATION_SLACK_MS = 5_000 as const;

export type RunOwnedDeliveryCorrelationClass =
  | "matched"
  | "unmatched"
  | "boundary_excluded";

export type RunOwnedClaimProofClass =
  | "active_claim"
  | "fast_terminal_with_correlated_ack"
  | "none";

export type RunOwnedDeliveryCorrelationEvidence = {
  readonly correlationClass: RunOwnedDeliveryCorrelationClass;
  readonly claimProof: RunOwnedClaimProofClass;
};

export type RunOwnedDeliveryCorrelationInput = {
  readonly observationBoundaryMs: number;
  readonly renderEnqueuedAtMs: number | null;
  readonly renderStartedAtMs: number;
  readonly observationEndedAtMs: number;
  readonly deliveryEvents: readonly HostedRenderDeliveryEventObservation[];
  readonly hasActiveClaim: boolean;
  readonly isTerminalJob: boolean;
  readonly claimTokenCleared: boolean;
  readonly initialStoreVersion: number | null;
  readonly terminalStoreVersion: number | null;
};

export type RunOwnedDeliveryCorrelationRejectReason =
  | "unrelated_delivery_event"
  | "terminal_without_correlated_claim"
  | "store_version_regression"
  | "inferred_without_correlation";

export type RunOwnedDeliveryCorrelationResult =
  | {
      readonly ok: true;
      readonly evidence: RunOwnedDeliveryCorrelationEvidence;
      readonly authority: "active_claim" | "fast_terminal_with_correlated_ack";
    }
  | {
      readonly ok: false;
      readonly evidence: RunOwnedDeliveryCorrelationEvidence;
      readonly rejectReason: RunOwnedDeliveryCorrelationRejectReason;
    };

function isRenderDeliveryEvent(
  event: HostedRenderDeliveryEventObservation,
): boolean {
  return event.name === "hosted.loop.delivery" && event.mode !== "verify";
}

function deliveryAction(event: HostedRenderDeliveryEventObservation): string {
  return event.action ?? event.reasonId ?? "";
}

function isClaimAck(event: HostedRenderDeliveryEventObservation): boolean {
  return deliveryAction(event) === "claimed_and_acked";
}

function isTerminalDeliveryAction(
  event: HostedRenderDeliveryEventObservation,
): boolean {
  const action = deliveryAction(event);
  return (
    action === "terminalized_render_failure" ||
    action === "succeeded" ||
    action === "upload_finalize_failed" ||
    action === "stale_claim" ||
    action === "claim_coherence_rejected"
  );
}

export function filterDeliveryEventsForRunCorrelation(input: {
  readonly events: readonly HostedRenderDeliveryEventObservation[];
  readonly observationBoundaryMs: number;
}): {
  readonly boundaryExcluded: number;
  readonly eligible: readonly HostedRenderDeliveryEventObservation[];
} {
  let boundaryExcluded = 0;
  const eligible: HostedRenderDeliveryEventObservation[] = [];
  for (const event of input.events) {
    if (!isRenderDeliveryEvent(event)) continue;
    if (event.atMs < input.observationBoundaryMs) {
      boundaryExcluded += 1;
      continue;
    }
    eligible.push(event);
  }
  return Object.freeze({
    boundaryExcluded,
    eligible: Object.freeze(eligible.slice()),
  });
}

export function classifyRunOwnedDeliveryCorrelation(
  input: RunOwnedDeliveryCorrelationInput,
): RunOwnedDeliveryCorrelationResult {
  const filtered = filterDeliveryEventsForRunCorrelation({
    events: input.deliveryEvents,
    observationBoundaryMs: input.observationBoundaryMs,
  });

  const runWindowStartMs = Math.min(
    input.renderEnqueuedAtMs ?? input.renderStartedAtMs,
    input.renderStartedAtMs,
  );
  const runWindowEndMs = input.observationEndedAtMs;

  const unmatchedEvidence = (
    claimProof: RunOwnedClaimProofClass,
  ): RunOwnedDeliveryCorrelationEvidence =>
    Object.freeze({
      correlationClass: "unmatched",
      claimProof,
    });

  if (input.hasActiveClaim) {
    return {
      ok: true,
      evidence: Object.freeze({
        correlationClass: "matched",
        claimProof: "active_claim",
      }),
      authority: "active_claim",
    };
  }

  const initialSv = input.initialStoreVersion;
  if (
    initialSv != null &&
    input.terminalStoreVersion != null &&
    input.terminalStoreVersion < initialSv
  ) {
    return {
      ok: false,
      evidence: unmatchedEvidence("none"),
      rejectReason: "store_version_regression",
    };
  }

  const ackCandidates = filtered.eligible
    .filter(
      (event) =>
        isClaimAck(event) &&
        event.atMs >= runWindowStartMs - RUN_OWNED_DELIVERY_CORRELATION_SLACK_MS &&
        event.atMs <= runWindowEndMs,
    )
    .sort((a, b) => a.atMs - b.atMs);

  const runOwnedAck = ackCandidates[0] ?? null;
  if (runOwnedAck == null) {
    if (input.isTerminalJob && input.claimTokenCleared) {
      return {
        ok: false,
        evidence: unmatchedEvidence("none"),
        rejectReason: "terminal_without_correlated_claim",
      };
    }
    return {
      ok: false,
      evidence: unmatchedEvidence("none"),
      rejectReason: "inferred_without_correlation",
    };
  }

  const terminalAfterAck = filtered.eligible
    .filter(
      (event) =>
        isTerminalDeliveryAction(event) &&
        event.atMs >= runOwnedAck.atMs &&
        event.atMs <= runWindowEndMs,
    )
    .sort((a, b) => a.atMs - b.atMs)[0];

  const competingAck = ackCandidates.find(
    (event) => event.atMs > runOwnedAck.atMs + RUN_OWNED_DELIVERY_CORRELATION_SLACK_MS,
  );
  if (
    competingAck != null &&
    terminalAfterAck != null &&
    competingAck.atMs < terminalAfterAck.atMs
  ) {
    return {
      ok: false,
      evidence: unmatchedEvidence("none"),
      rejectReason: "unrelated_delivery_event",
    };
  }

  if (
    input.isTerminalJob &&
    input.claimTokenCleared &&
    initialSv != null &&
    input.terminalStoreVersion != null &&
    input.terminalStoreVersion >= initialSv
  ) {
    if (terminalAfterAck == null) {
      return {
        ok: false,
        evidence: unmatchedEvidence("none"),
        rejectReason: "terminal_without_correlated_claim",
      };
    }
    return {
      ok: true,
      evidence: Object.freeze({
        correlationClass: "matched",
        claimProof: "fast_terminal_with_correlated_ack",
      }),
      authority: "fast_terminal_with_correlated_ack",
    };
  }

  if (runOwnedAck != null) {
    return {
      ok: true,
      evidence: Object.freeze({
        correlationClass: "matched",
        claimProof: "fast_terminal_with_correlated_ack",
      }),
      authority: "fast_terminal_with_correlated_ack",
    };
  }

  return {
    ok: false,
    evidence: unmatchedEvidence("none"),
    rejectReason: "inferred_without_correlation",
  };
}
