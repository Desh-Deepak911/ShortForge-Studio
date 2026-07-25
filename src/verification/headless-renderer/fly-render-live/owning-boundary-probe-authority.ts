/**
 * Sprint 11E Phase 2E.2D.8F.7 / 8F.7.3 — owning-boundary probe observation authority.
 */

import {
  OWNING_BOUNDARY_EVENT_IDS,
  buildOwningBoundaryTerminalEvidence,
  isOwningBoundaryEventId,
  sanitizeOwningBoundaryObservation,
  type OwningBoundaryEventId,
  type OwningBoundaryTelemetryObservation,
  type OwningBoundaryTerminalEvidence,
} from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import {
  validateOwningBoundarySequenceCoherence,
  type OwningBoundarySequenceCoherenceResult,
} from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import type { PageWorkspaceAttribution } from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";

export type HostedRenderBoundaryEventObservation = Readonly<{
  readonly name: "hosted.render.boundary";
  readonly atMs: number;
  readonly logTimestampMs: number | null;
  readonly machineId: string | null;
  readonly action?: string;
  readonly facts?: Readonly<Record<string, string>>;
}>;

export type BoundaryEmissionClassification =
  | "boundary_events_emitted_and_correlated"
  | "boundary_events_emitted_but_observer_rejected"
  | "boundary_events_emitted_but_incomplete"
  | "boundary_events_not_emitted"
  | "log_window_expired"
  | "provider_log_read_failed";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function observationTimestampMs(
  event: HostedRenderBoundaryEventObservation,
): number {
  if (
    event.logTimestampMs != null &&
    Number.isFinite(event.logTimestampMs)
  ) {
    return event.logTimestampMs;
  }
  return event.atMs;
}

function parseFactsRecord(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, factValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof factValue === "string") out[key] = factValue;
  }
  return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}

export function parseHostedRenderBoundaryEventFromLogLine(
  line: string,
): HostedRenderBoundaryEventObservation | null {
  const trimmed = stripAnsi(line.trim());
  if (trimmed.length === 0) return null;
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) return null;
  const machineMatch = /app\[([a-f0-9]+)\]/i.exec(trimmed);
  const tsMatch = /^(\d{4}-\d{2}-\d{2}T[\d:+.Z-]+)/.exec(trimmed);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed.slice(jsonStart)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (parsed.name !== "hosted.render.boundary") return null;
  const logTimestampMs =
    tsMatch != null ? Date.parse(tsMatch[1]!) : null;
  const payloadAtMs =
    typeof parsed.atMs === "number" && Number.isFinite(parsed.atMs)
      ? parsed.atMs
      : null;
  const atMs =
    logTimestampMs != null && Number.isFinite(logTimestampMs)
      ? logTimestampMs
      : payloadAtMs ?? 0;
  const action =
    typeof parsed.action === "string" ? parsed.action : undefined;
  const facts =
    parseFactsRecord(parsed.facts) ??
    parseFactsRecord(
      Object.fromEntries(
        Object.entries(parsed).filter(
          ([key]) =>
            key !== "name" &&
            key !== "atMs" &&
            key !== "action" &&
            key !== "facts" &&
            key !== "mode",
        ),
      ),
    );
  return Object.freeze({
    name: "hosted.render.boundary",
    atMs,
    logTimestampMs:
      logTimestampMs != null && Number.isFinite(logTimestampMs)
        ? logTimestampMs
        : null,
    machineId: machineMatch?.[1] ?? null,
    action,
    facts,
  });
}

export function parseHostedRenderBoundaryEventsFromLines(
  lines: readonly string[],
): readonly HostedRenderBoundaryEventObservation[] {
  const out: HostedRenderBoundaryEventObservation[] = [];
  for (const line of lines) {
    const parsed = parseHostedRenderBoundaryEventFromLogLine(line);
    if (parsed != null) out.push(parsed);
  }
  return Object.freeze(out);
}

export function countRawHostedRenderBoundaryMentionsInWindow(input: {
  readonly flyLogText: string;
  readonly observationBoundaryMs: number;
  readonly observationEndedMs?: number;
  readonly renderMachineId?: string;
}): number {
  let count = 0;
  for (const line of splitFlyLogLines(input.flyLogText)) {
    const trimmed = stripAnsi(line.trim());
    if (!trimmed.includes('"name":"hosted.render.boundary"')) continue;
    if (
      input.renderMachineId != null &&
      !trimmed.includes(`app[${input.renderMachineId}]`)
    ) {
      continue;
    }
    const tsMatch = /^(\d{4}-\d{2}-\d{2}T[\d:+.Z-]+)/.exec(trimmed);
    const ts =
      tsMatch != null ? Date.parse(tsMatch[1]!) : Number.NaN;
    if (!Number.isFinite(ts)) continue;
    if (ts < input.observationBoundaryMs) continue;
    if (
      input.observationEndedMs != null &&
      ts > input.observationEndedMs
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

const DEFAULT_BOUNDED_BOUNDARY_CAPTURE_MAX_LINES = 50;

export function captureBoundedHostedRenderBoundaryLogLines(input: {
  readonly flyLogText: string;
  readonly observationBoundaryMs: number;
  readonly observationEndedMs?: number;
  readonly renderMachineId?: string;
  readonly maxLines?: number;
}): readonly string[] {
  const maxLines = input.maxLines ?? DEFAULT_BOUNDED_BOUNDARY_CAPTURE_MAX_LINES;
  const out: string[] = [];
  for (const line of splitFlyLogLines(input.flyLogText)) {
    if (out.length >= maxLines) break;
    const trimmed = stripAnsi(line.trim());
    if (!trimmed.includes('"name":"hosted.render.boundary"')) continue;
    if (
      input.renderMachineId != null &&
      !trimmed.includes(`app[${input.renderMachineId}]`)
    ) {
      continue;
    }
    const tsMatch = /^(\d{4}-\d{2}-\d{2}T[\d:+.Z-]+)/.exec(trimmed);
    const ts =
      tsMatch != null ? Date.parse(tsMatch[1]!) : Number.NaN;
    if (!Number.isFinite(ts)) continue;
    if (ts < input.observationBoundaryMs) continue;
    if (
      input.observationEndedMs != null &&
      ts > input.observationEndedMs
    ) {
      continue;
    }
    out.push(trimmed);
  }
  return Object.freeze(out);
}

export function filterBoundaryEventsForRunCorrelation(input: {
  readonly observationBoundaryMs: number;
  readonly observationEndedMs?: number;
  readonly renderMachineId?: string;
  readonly events: readonly HostedRenderBoundaryEventObservation[];
}): readonly HostedRenderBoundaryEventObservation[] {
  return Object.freeze(
    input.events.filter((event) => {
      const ts = observationTimestampMs(event);
      if (ts < input.observationBoundaryMs) return false;
      if (
        input.observationEndedMs != null &&
        ts > input.observationEndedMs
      ) {
        return false;
      }
      if (
        input.renderMachineId != null &&
        event.machineId != null &&
        event.machineId !== input.renderMachineId
      ) {
        return false;
      }
      return true;
    }),
  );
}

export function classifyBoundaryEmissionFromFlyLogs(input: {
  readonly flyLogText: string;
  readonly observationBoundaryMs: number;
  readonly observationEndedMs?: number;
  readonly renderMachineId?: string;
  readonly ingestedEvidencePresent: boolean;
  readonly ingestedSequenceComplete?: boolean;
}): BoundaryEmissionClassification {
  if (input.flyLogText.trim().length === 0) {
    return "provider_log_read_failed";
  }
  const parsed = parseHostedRenderBoundaryEventsFromLines(
    splitFlyLogLines(input.flyLogText),
  );
  const correlated = filterBoundaryEventsForRunCorrelation({
    observationBoundaryMs: input.observationBoundaryMs,
    observationEndedMs: input.observationEndedMs,
    renderMachineId: input.renderMachineId,
    events: parsed,
  });
  const rawInWindow = countRawHostedRenderBoundaryMentionsInWindow({
    flyLogText: input.flyLogText,
    observationBoundaryMs: input.observationBoundaryMs,
    observationEndedMs: input.observationEndedMs,
    renderMachineId: input.renderMachineId,
  });
  const anyParsed = parsed.length > 0;
  const anyBeforeBoundary = parsed.some(
    (event) =>
      observationTimestampMs(event) < input.observationBoundaryMs,
  );

  if (rawInWindow === 0 && correlated.length === 0) {
    if (anyParsed && anyBeforeBoundary) {
      return "log_window_expired";
    }
    return "boundary_events_not_emitted";
  }
  if (rawInWindow > 0 && correlated.length === 0) {
    return "boundary_events_emitted_but_observer_rejected";
  }
  if (input.ingestedEvidencePresent) {
    if (input.ingestedSequenceComplete === true) {
      return "boundary_events_emitted_and_correlated";
    }
    return "boundary_events_emitted_but_incomplete";
  }
  if (correlated.length > 0) {
    return "boundary_events_emitted_but_observer_rejected";
  }
  return "boundary_events_not_emitted";
}

export function observationsFromBoundaryEvents(
  events: readonly HostedRenderBoundaryEventObservation[],
): readonly OwningBoundaryTelemetryObservation[] {
  const out: OwningBoundaryTelemetryObservation[] = [];
  for (const event of events) {
    const sanitized = sanitizeOwningBoundaryObservation({
      atMs: observationTimestampMs(event),
      action: event.action,
      ...(event.facts ?? {}),
      facts: event.facts,
    });
    if (sanitized != null) out.push(sanitized);
  }
  return Object.freeze(out);
}

export function buildProbeOwningBoundaryEvidence(input: {
  readonly observations: readonly OwningBoundaryTelemetryObservation[];
  readonly workspaceMaterializationCompleted: boolean;
  readonly terminalReasonId: string | null;
  readonly terminalSubstage?: string | null;
  readonly cleanupOutcomeClass?: "ok" | "failed" | "not_run";
}): OwningBoundaryTerminalEvidence & {
  readonly observedSequence: readonly OwningBoundaryEventId[];
  readonly cleanupOutcomeClass: "ok" | "failed" | "not_run";
  readonly sequenceCoherence: OwningBoundarySequenceCoherenceResult;
} {
  const sortedObservations = Object.freeze(
    [...input.observations].sort((a, b) => a.sequence - b.sequence),
  );
  const terminal = buildOwningBoundaryTerminalEvidence({
    ...input,
    observations: sortedObservations,
  });
  const observedSequence = Object.freeze(
    sortedObservations.map((o) => o.boundaryId),
  );
  const sequenceCoherence = validateOwningBoundarySequenceCoherence({
    observedSequence,
    providerContext: terminal.providerContext,
    workspaceAttribution: terminal.workspaceAttribution,
    terminalSubstage: input.terminalSubstage ?? null,
    terminalReasonId: input.terminalReasonId,
  });
  return Object.freeze({
    ...terminal,
    observedSequence,
    cleanupOutcomeClass: input.cleanupOutcomeClass ?? "not_run",
    sequenceCoherence,
  });
}

export function assertMonotonicBoundarySequence(
  observations: readonly OwningBoundaryTelemetryObservation[],
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  let prior = 0;
  for (const obs of observations) {
    if (obs.sequence <= prior) {
      return { ok: false, message: "non_monotonic_boundary_sequence" };
    }
    prior = obs.sequence;
  }
  return { ok: true };
}

export function expectedBoundaryAfter(
  boundaryId: OwningBoundaryEventId,
): OwningBoundaryEventId | null {
  const idx = OWNING_BOUNDARY_EVENT_IDS.indexOf(boundaryId);
  if (idx < 0 || idx >= OWNING_BOUNDARY_EVENT_IDS.length - 1) return null;
  return OWNING_BOUNDARY_EVENT_IDS[idx + 1] ?? null;
}

export function isCompleteSuccessfulBoundarySequence(
  observed: readonly OwningBoundaryEventId[],
): boolean {
  return OWNING_BOUNDARY_EVENT_IDS.every((id) => observed.includes(id));
}

export function boundaryEventIdFromAction(
  action: unknown,
): OwningBoundaryEventId | null {
  return isOwningBoundaryEventId(action) ? action : null;
}

export const BOUNDARY_EVIDENCE_INGESTION_FAILED =
  "boundary_evidence_ingestion_failed" as const;

export type IngestOwningBoundaryEvidenceResult =
  | {
      readonly ok: true;
      readonly evidence: ReturnType<typeof buildProbeOwningBoundaryEvidence>;
      readonly emissionClassification: BoundaryEmissionClassification;
    }
  | {
      readonly ok: false;
      readonly reasonId: typeof BOUNDARY_EVIDENCE_INGESTION_FAILED;
      readonly correlatedRawEventCount: number;
      readonly emissionClassification: BoundaryEmissionClassification;
    }
  | {
      readonly ok: true;
      readonly evidence: null;
      readonly reasonId: "no_correlated_boundary_events";
      readonly emissionClassification: BoundaryEmissionClassification;
    };

function splitFlyLogLines(text: string): readonly string[] {
  return Object.freeze(text.split(/\r?\n/).filter((line) => line.length > 0));
}

export function ingestOwningBoundaryEvidenceFromFlyLogs(input: {
  readonly flyLogText: string;
  readonly observationBoundaryMs: number;
  readonly observationEndedMs?: number;
  readonly renderMachineId?: string;
  readonly workspaceMaterializationCompleted: boolean;
  readonly terminalReasonId: string | null;
  readonly terminalSubstage: string | null;
  readonly cleanupOutcomeClass?: "ok" | "failed" | "not_run";
}): IngestOwningBoundaryEvidenceResult {
  const lines = splitFlyLogLines(input.flyLogText);
  const parsed = parseHostedRenderBoundaryEventsFromLines(lines);
  const correlated = filterBoundaryEventsForRunCorrelation({
    observationBoundaryMs: input.observationBoundaryMs,
    observationEndedMs: input.observationEndedMs,
    renderMachineId: input.renderMachineId,
    events: parsed,
  });
  const rawInWindow = countRawHostedRenderBoundaryMentionsInWindow({
    flyLogText: input.flyLogText,
    observationBoundaryMs: input.observationBoundaryMs,
    observationEndedMs: input.observationEndedMs,
    renderMachineId: input.renderMachineId,
  });

  if (correlated.length === 0) {
    const emissionClassification = classifyBoundaryEmissionFromFlyLogs({
      flyLogText: input.flyLogText,
      observationBoundaryMs: input.observationBoundaryMs,
      observationEndedMs: input.observationEndedMs,
      renderMachineId: input.renderMachineId,
      ingestedEvidencePresent: false,
    });
    if (
      rawInWindow > 0 ||
      emissionClassification ===
        "boundary_events_emitted_but_observer_rejected"
    ) {
      return Object.freeze({
        ok: false,
        reasonId: BOUNDARY_EVIDENCE_INGESTION_FAILED,
        correlatedRawEventCount: rawInWindow,
        emissionClassification,
      });
    }
    return Object.freeze({
      ok: true,
      evidence: null,
      reasonId: "no_correlated_boundary_events",
      emissionClassification,
    });
  }

  const observations = observationsFromBoundaryEvents(correlated);
  if (observations.length === 0 && correlated.length > 0) {
    const emissionClassification =
      "boundary_events_emitted_but_observer_rejected" as const;
    return Object.freeze({
      ok: false,
      reasonId: BOUNDARY_EVIDENCE_INGESTION_FAILED,
      correlatedRawEventCount: correlated.length,
      emissionClassification,
    });
  }
  const monotonic = assertMonotonicBoundarySequence(observations);
  if (!monotonic.ok) {
    return Object.freeze({
      ok: false,
      reasonId: BOUNDARY_EVIDENCE_INGESTION_FAILED,
      correlatedRawEventCount: correlated.length,
      emissionClassification: "boundary_events_emitted_but_observer_rejected",
    });
  }
  const evidence = buildProbeOwningBoundaryEvidence({
    observations,
    workspaceMaterializationCompleted: input.workspaceMaterializationCompleted,
    terminalReasonId: input.terminalReasonId,
    terminalSubstage: input.terminalSubstage,
    cleanupOutcomeClass: input.cleanupOutcomeClass,
  });
  const sequenceComplete = isCompleteSuccessfulBoundarySequence(
    evidence.observedSequence,
  );
  const emissionClassification = classifyBoundaryEmissionFromFlyLogs({
    flyLogText: input.flyLogText,
    observationBoundaryMs: input.observationBoundaryMs,
    observationEndedMs: input.observationEndedMs,
    renderMachineId: input.renderMachineId,
    ingestedEvidencePresent: true,
    ingestedSequenceComplete: sequenceComplete,
  });
  return Object.freeze({ ok: true, evidence, emissionClassification });
}

export function workspaceMaterializationCompletedFromAttribution(
  attribution: PageWorkspaceAttribution | null | undefined,
): boolean {
  return attribution != null;
}

export function isPageTerminalProbeFailure(input: {
  readonly failureSubstage: string | null;
  readonly failureReasonId: string | null;
  readonly executionSubstage?: string | null;
  readonly pageFailureReason?: string | null;
}): boolean {
  if (input.failureSubstage === "page_contract_ready") return true;
  if (input.failureReasonId === "page_workspace_attribution_missing") {
    return true;
  }
  if (input.executionSubstage === "page_contract_ready") return true;
  if (input.pageFailureReason === "page_workspace_attribution_missing") {
    return true;
  }
  return false;
}

export function assertProbeBoundaryEvidenceContract(input: {
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly failureSubstage: string | null;
  readonly failureReasonId: string | null;
  readonly executionAttribution: {
    readonly executionSubstage?: string | null;
    readonly pageFailureReason?: string | null;
  } | null;
  readonly owningBoundaryEvidence: unknown;
  readonly boundaryEmissionClassification: BoundaryEmissionClassification | null;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string } {
  if (input.overall !== "FAIL") return { ok: true };
  const pageTerminal = isPageTerminalProbeFailure({
    failureSubstage: input.failureSubstage,
    failureReasonId: input.failureReasonId,
    executionSubstage: input.executionAttribution?.executionSubstage ?? null,
    pageFailureReason: input.executionAttribution?.pageFailureReason ?? null,
  });
  if (!pageTerminal) return { ok: true };
  if (input.owningBoundaryEvidence != null) return { ok: true };
  if (input.boundaryEmissionClassification != null) return { ok: true };
  return {
    ok: false,
    message: "page_terminal_without_boundary_evidence_or_classification",
  };
}
