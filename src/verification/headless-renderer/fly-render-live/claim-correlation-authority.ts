/**
 * Sprint 11E Phase 2E.2D.8F / 8F.2 — hosted render claim observation authority.
 * Proves claim occurred without converting terminal render failure into overall success.
 */

import type { HeadlessCanonicalStoredJobRecord } from "@/features/headless-renderer/control-plane/types/stored-job-record";
import { isHeadlessTerminalState } from "@/features/headless-renderer/domain";

import type { FlyRenderLiveSessionState } from "./types";
import {
  buildClaimedRenderExecutionAttributionSnapshot,
  classifyDurableJobStateClass,
  mapExecutionPhaseToSubstage,
  sanitizeExecutionAttributionFromTelemetryFacts,
  type FlyRenderClaimedRenderExecutionAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  classifyRunOwnedDeliveryCorrelation,
  type RunOwnedDeliveryCorrelationEvidence,
} from "./run-correlation-authority";

export type HostedRenderDeliveryEventObservation = {
  readonly name: "hosted.loop.delivery";
  readonly atMs: number;
  readonly logTimestampMs?: number | null;
  readonly machineId?: string | null;
  readonly mode?: string;
  readonly action?: string;
  readonly reasonId?: string;
  readonly facts?: Readonly<Record<string, string>>;
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export type RenderClaimObservationAuthorityInput = {
  readonly job: HeadlessCanonicalStoredJobRecord | null;
  readonly session: Pick<
    FlyRenderLiveSessionState,
    | "renderStartedAtMs"
    | "renderEnqueuedAtMs"
    | "probeObservationBoundaryMs"
    | "initialStoreVersion"
    | "renderStreamId"
  >;
  readonly deliveryEvents: readonly HostedRenderDeliveryEventObservation[];
  readonly observationStartedAtMs: number;
  readonly observationEndedAtMs: number;
};

export type RenderClaimObservationAuthorityResult =
  | {
      readonly ok: true;
      readonly authority: "active_claim" | "fast_terminal_with_correlated_ack";
      readonly runDeliveryCorrelation: RunOwnedDeliveryCorrelationEvidence;
    }
  | {
      readonly ok: false;
      readonly rejectReason:
        | "job_unreadable"
        | "terminal_without_correlated_claim"
        | "unrelated_delivery_event"
        | "stale_delivery_attempt"
        | "claim_token_mismatch"
        | "store_version_regression"
        | "inferred_without_correlation";
      readonly runDeliveryCorrelation: RunOwnedDeliveryCorrelationEvidence;
    };

const IN_FLIGHT_STATES = new Set([
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading",
]);

function isTerminalJob(record: HeadlessCanonicalStoredJobRecord): boolean {
  return (
    record.stage === "canonical" &&
    isHeadlessTerminalState(record.canonicalJob.state)
  );
}

export function classifyRenderClaimObservationAuthority(
  input: RenderClaimObservationAuthorityInput,
): RenderClaimObservationAuthorityResult {
  const job = input.job;
  if (job == null || job.stage !== "canonical") {
    return {
      ok: false,
      rejectReason: "job_unreadable",
      runDeliveryCorrelation: Object.freeze({
        correlationClass: "unmatched",
        claimProof: "none",
      }),
    };
  }

  const observationBoundaryMs =
    input.session.probeObservationBoundaryMs ??
    input.session.renderEnqueuedAtMs ??
    input.session.renderStartedAtMs ??
    input.observationStartedAtMs;

  const hasActiveClaim =
    job.claimToken != null && IN_FLIGHT_STATES.has(job.canonicalJob.state);

  const correlation = classifyRunOwnedDeliveryCorrelation({
    observationBoundaryMs,
    renderEnqueuedAtMs: input.session.renderEnqueuedAtMs,
    renderStartedAtMs:
      input.session.renderStartedAtMs ?? input.observationStartedAtMs,
    observationEndedAtMs: input.observationEndedAtMs,
    deliveryEvents: input.deliveryEvents,
    hasActiveClaim,
    isTerminalJob: isTerminalJob(job),
    claimTokenCleared: job.claimToken == null,
    initialStoreVersion: input.session.initialStoreVersion,
    terminalStoreVersion: job.storeVersion,
  });

  if (correlation.ok) {
    return {
      ok: true,
      authority: correlation.authority,
      runDeliveryCorrelation: correlation.evidence,
    };
  }

  return {
    ok: false,
    rejectReason: correlation.rejectReason,
    runDeliveryCorrelation: correlation.evidence,
  };
}

export function parseHostedRenderDeliveryEventsFromFlyLogs(
  logsText: string,
): HostedRenderDeliveryEventObservation[] {
  const events: HostedRenderDeliveryEventObservation[] = [];
  for (const rawLine of logsText.split(/\r?\n/)) {
    const line = stripAnsi(rawLine.trim());
    if (line.length === 0) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    const machineMatch = /app\[([a-f0-9]+)\]/i.exec(line);
    const tsMatch = /^(\d{4}-\d{2}-\d{2}T[\d:+.Z-]+)/.exec(line);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (parsed.name !== "hosted.loop.delivery") continue;
    const logTimestampMs =
      tsMatch != null ? Date.parse(tsMatch[1]!) : null;
    const payloadAtMs =
      typeof parsed.atMs === "number" && Number.isFinite(parsed.atMs)
        ? parsed.atMs
        : null;
    const atMs =
      logTimestampMs != null && Number.isFinite(logTimestampMs)
        ? logTimestampMs
        : payloadAtMs;
    if (atMs == null || !Number.isFinite(atMs)) continue;
    let facts: Readonly<Record<string, string>> | undefined;
    if (
      parsed.facts != null &&
      typeof parsed.facts === "object" &&
      !Array.isArray(parsed.facts)
    ) {
      const safeFacts: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.facts)) {
        if (typeof v === "string") safeFacts[k] = v;
      }
      if (Object.keys(safeFacts).length > 0) {
        facts = Object.freeze(safeFacts);
      }
    }
    events.push(
      Object.freeze({
        name: "hosted.loop.delivery",
        atMs,
        logTimestampMs:
          logTimestampMs != null && Number.isFinite(logTimestampMs)
            ? logTimestampMs
            : null,
        machineId: machineMatch?.[1] ?? null,
        mode: typeof parsed.mode === "string" ? parsed.mode : undefined,
        action: typeof parsed.action === "string" ? parsed.action : undefined,
        reasonId:
          typeof parsed.reasonId === "string" ? parsed.reasonId : undefined,
        ...(facts != null ? { facts } : {}),
      }),
    );
  }
  return events;
}

export function buildAttributionFromTerminalJob(input: {
  readonly job: HeadlessCanonicalStoredJobRecord;
  readonly deliveryEvents: readonly HostedRenderDeliveryEventObservation[];
  readonly renderStartedAtMs: number;
  readonly initialStoreVersion: number | null;
}): FlyRenderClaimedRenderExecutionAttributionSnapshot | null {
  if (input.job.stage !== "canonical") return null;

  const telemetryEvent = [...input.deliveryEvents]
    .filter(
      (e) =>
        e.atMs >= input.renderStartedAtMs &&
        e.facts != null &&
        (e.action === "terminalized_render_failure" ||
          e.action === "succeeded" ||
          e.action === "upload_finalize_failed" ||
          e.action === "stale_claim" ||
          e.action === "claim_coherence_rejected"),
    )
    .sort((a, b) => b.atMs - a.atMs)[0];
  const fromTelemetry = sanitizeExecutionAttributionFromTelemetryFacts(
    telemetryEvent?.facts,
  );
  if (fromTelemetry != null) {
    return fromTelemetry;
  }

  const state = input.job.canonicalJob.state;
  const terminalReason = input.job.canonicalJob.terminalReason?.reasonId;

  const executionEvent = [...input.deliveryEvents]
    .filter(
      (e) =>
        e.atMs >= input.renderStartedAtMs &&
        (e.action === "terminalized_render_failure" ||
          e.action === "succeeded" ||
          e.action === "upload_finalize_failed" ||
          e.action === "stale_claim" ||
          e.action === "claim_coherence_rejected"),
    )
    .sort((a, b) => b.atMs - a.atMs)[0];

  let executionSubstage = mapExecutionPhaseToSubstage("render");
  if (
    executionEvent?.action === "upload_finalize_failed" ||
    executionEvent?.reasonId === "upload_finalize_failed"
  ) {
    executionSubstage = "artifact_finalize";
  }
  if (state === "rendering") executionSubstage = "page_contract_ready";
  if (state === "encoding" || state === "validating") {
    executionSubstage = "ffmpeg_execution";
  }
  if (state === "uploading") executionSubstage = "artifact_upload";
  if (state === "failed" || state === "cancelled") {
    executionSubstage = mapExecutionPhaseToSubstage("render");
  }

  const dispositionKind =
    state === "succeeded"
      ? "succeeded"
      : state === "cancelled"
        ? "aborted"
        : "terminal_failure";

  return buildClaimedRenderExecutionAttributionSnapshot({
    executionSubstage,
    dispositionKind,
    safeWorkerCode: terminalReason,
    durableJobStateClass: classifyDurableJobStateClass(state),
    storeVersionBefore: input.initialStoreVersion ?? undefined,
    storeVersionAfter: input.job.storeVersion,
    claimTokenCoherenceClass:
      input.job.claimToken == null ? "cleared_after_terminal" : "active_match",
    cleanupScheduledClass: "not_applicable",
    boundedDurationMs: Date.now() - input.renderStartedAtMs,
    ...(executionSubstage === "page_contract_ready"
      ? { pageFailureReason: "page_workspace_attribution_missing" as const }
      : {}),
  });
}
