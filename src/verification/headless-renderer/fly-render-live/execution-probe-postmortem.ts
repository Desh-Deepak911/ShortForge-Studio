/**
 * Sprint 11E Phase 2E.2D.8I — extended post-frame postmortem from safe Fly logs.
 */

import {
  parseHostedRenderBoundaryEventsFromLines,
  type HostedRenderBoundaryEventObservation,
} from "./owning-boundary-probe-authority";

export type ExecutionProbePostmortemPrimaryFailureClass =
  | "frame_response_invalid"
  | "frame_timeout"
  | "page_runtime_exception"
  | "chromium_process_exit"
  | "browser_page_cleanup_failure"
  | "ffmpeg_preflight_failure"
  | "ffmpeg_process_spawn_failure"
  | "ffmpeg_frame_stream_failure"
  | "ffmpeg_exit_failure"
  | "artifact_upload_failure"
  | "owned_object_finalize_failure"
  | "succeeded_cas_conflict"
  | "stage_transition_cas_failure"
  | "forced_abort_after_probe_timeout"
  | "harness_observation_timeout_despite_worker_progress"
  | "other_exact_allowlisted_class";

export type ExecutionProbePostmortemSecondaryCasClass =
  | "terminal_failure_cas_confirmed"
  | "terminal_failure_cas_unconfirmed"
  | "terminal_failure_cas_preserved_terminal"
  | "not_observed";

export type ExecutionProbePostmortemReport = {
  readonly bootstrapResultClass: string;
  readonly frameRequestResultClass: string;
  readonly pngResponseClass: string;
  readonly pageFailureReasonClass: string;
  readonly chromiumExitClass: string;
  readonly abortTimeoutClass: string;
  readonly renderExecutionDurationClass: string;
  readonly cleanupSubstage: string;
  readonly cleanupFailureReasonClass: string;
  readonly primaryExecutionFailureClass: ExecutionProbePostmortemPrimaryFailureClass;
  readonly secondaryTerminalCasClass: ExecutionProbePostmortemSecondaryCasClass;
  readonly hostedLoopDeliveryPresent: boolean;
  readonly hostedRenderBoundaryPresent: boolean;
  readonly frameRequestStartedPresent: boolean;
  readonly frameRequestTerminalPresent: boolean;
  readonly chromiumSessionCleanupPresent: boolean;
  readonly ffmpegProcessTerminalPresent: boolean;
  readonly artifactUploadStartedPresent: boolean;
  readonly fatalProcessEventPresent: boolean;
};


function splitFlyLogLines(text: string): readonly string[] {
  return Object.freeze(text.split(/\r?\n/));
}

function hasAction(
  events: readonly HostedRenderBoundaryEventObservation[],
  action: string,
): boolean {
  return events.some((e) => e.action === action);
}

function lastActionFacts(
  events: readonly HostedRenderBoundaryEventObservation[],
  action: string,
): Readonly<Record<string, string>> | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.action === action) return event.facts;
  }
  return undefined;
}

function classifyResultFromPresence(present: boolean): string {
  return present ? "reached" : "not_reached";
}

function classifyBootstrap(facts: Readonly<Record<string, string>> | undefined): string {
  const response = facts?.bootstrap_response_class;
  if (response != null && response.length > 0) return response;
  return "not_applicable";
}

function classifyFrameOutcome(facts: Readonly<Record<string, string>> | undefined): string {
  const outcome = facts?.frameOutcomeClass ?? facts?.frame_outcome_class;
  if (outcome != null && outcome.length > 0) return outcome;
  return "not_applicable";
}

function classifyCleanup(facts: Readonly<Record<string, string>> | undefined): {
  readonly substage: string;
  readonly reasonClass: string;
} {
  const outcome = facts?.cleanupOutcomeClass ?? facts?.cleanup_outcome_class;
  return {
    substage: "chromium_session_cleanup",
    reasonClass: outcome === "failed" ? "cleanup_close_failed" : outcome ?? "not_applicable",
  };
}

function parseTerminalizedRenderFailureFacts(
  flyLogText: string,
): Readonly<Record<string, string>> | undefined {
  const lines = splitFlyLogLines(flyLogText);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (!line.includes("terminalized_render_failure")) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(jsonStart)) as {
        facts?: Record<string, string>;
      };
      return parsed.facts;
    } catch {
      continue;
    }
  }
  return undefined;
}

function classifySecondaryTerminalCas(
  terminalFacts: Readonly<Record<string, string>> | undefined,
): ExecutionProbePostmortemSecondaryCasClass {
  if (terminalFacts == null) return "not_observed";
  const substage = terminalFacts.execution_substage;
  if (substage !== "terminal_failure_cas") {
    const secondary = terminalFacts.secondary_terminal_cas_substage;
    if (secondary === "terminal_failure_cas") {
      const outcome = terminalFacts.secondary_terminal_cas_outcome;
      if (outcome === "confirmed") return "terminal_failure_cas_confirmed";
      if (outcome === "preserved_terminal") {
        return "terminal_failure_cas_preserved_terminal";
      }
      if (outcome === "unconfirmed") return "terminal_failure_cas_unconfirmed";
    }
    return "not_observed";
  }
  return "terminal_failure_cas_confirmed";
}

export function classifyExecutionProbePostmortemFromFlyLogs(input: {
  readonly flyLogText: string;
  readonly renderMachineId: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly harnessPollTimeoutMs: number;
  readonly harnessExecutionDurationMs: number;
  readonly harnessCleanupFailed: boolean;
  readonly contentDurationMs: number;
}): ExecutionProbePostmortemReport {
  const lines = splitFlyLogLines(input.flyLogText);
  const parsed = parseHostedRenderBoundaryEventsFromLines(lines).filter((event) => {
    const ts =
      event.logTimestampMs != null && Number.isFinite(event.logTimestampMs)
        ? event.logTimestampMs
        : event.atMs;
    if (ts < input.windowStartMs || ts > input.windowEndMs + 120_000) return false;
    if (
      event.machineId != null &&
      event.machineId !== input.renderMachineId
    ) {
      return false;
    }
    return true;
  });

  const bootstrapTerminal = hasAction(parsed, "page_bootstrap_terminal");
  const frameStarted = hasAction(parsed, "frame_request_started");
  const frameTerminal = hasAction(parsed, "frame_request_terminal");
  const chromiumCleanup = hasAction(parsed, "chromium_session_cleanup");
  const ffmpegTerminal = hasAction(parsed, "ffmpeg_process_terminal");
  const uploadStarted = hasAction(parsed, "artifact_upload_started");

  const bootstrapFacts = lastActionFacts(parsed, "page_bootstrap_terminal");
  const frameFacts = lastActionFacts(parsed, "frame_request_terminal");
  const cleanupFacts = lastActionFacts(parsed, "chromium_session_cleanup");
  const ffmpegFacts = lastActionFacts(parsed, "ffmpeg_process_terminal");
  const uploadFacts = lastActionFacts(parsed, "artifact_upload_completed");
  const terminalFacts = parseTerminalizedRenderFailureFacts(input.flyLogText);

  const hostedRenderBoundaryPresent = parsed.some(
    (e) => e.name === "hosted.render.boundary",
  );
  const hostedLoopDeliveryPresent = input.flyLogText.includes(
    "hosted.loop.delivery",
  );
  const fatalProcessEventPresent =
    input.flyLogText.includes('"level":"fatal"') ||
    input.flyLogText.includes("process exited");

  const cleanup = classifyCleanup(cleanupFacts);
  const frameOutcome = classifyFrameOutcome(frameFacts);
  const ffmpegOutcome =
    ffmpegFacts?.ffmpeg_outcome_class ??
    ffmpegFacts?.ffmpegOutcomeClass ??
    "not_applicable";
  const uploadOutcome =
    uploadFacts?.upload_outcome_class ??
    uploadFacts?.uploadOutcomeClass ??
    "not_applicable";
  const primarySubstage =
    terminalFacts?.primary_execution_substage ??
    terminalFacts?.execution_substage ??
    null;

  const harnessTimedOut =
    input.harnessExecutionDurationMs > input.harnessPollTimeoutMs;

  let primaryExecutionFailureClass: ExecutionProbePostmortemPrimaryFailureClass =
    "other_exact_allowlisted_class";

  if (primarySubstage === "ffmpeg_execution" || primarySubstage === "ffmpeg_preflight") {
    primaryExecutionFailureClass =
      primarySubstage === "ffmpeg_preflight"
        ? "ffmpeg_preflight_failure"
        : "ffmpeg_exit_failure";
  } else if (primarySubstage === "artifact_upload") {
    primaryExecutionFailureClass = "artifact_upload_failure";
  } else if (primarySubstage === "artifact_finalize") {
    primaryExecutionFailureClass = "owned_object_finalize_failure";
  } else if (primarySubstage === "succeeded_cas") {
    primaryExecutionFailureClass = "succeeded_cas_conflict";
  } else if (harnessTimedOut && frameTerminal && bootstrapTerminal && !ffmpegTerminal) {
    primaryExecutionFailureClass =
      "harness_observation_timeout_despite_worker_progress";
  } else if (frameOutcome === "invalid_response") {
    primaryExecutionFailureClass = "frame_response_invalid";
  } else if (frameOutcome === "timeout") {
    primaryExecutionFailureClass = "frame_timeout";
  } else if (fatalProcessEventPresent && !frameTerminal) {
    primaryExecutionFailureClass = "chromium_process_exit";
  } else if (cleanup.reasonClass === "cleanup_close_failed") {
    primaryExecutionFailureClass = "browser_page_cleanup_failure";
  } else if (
    frameTerminal &&
    chromiumCleanup &&
    cleanup.reasonClass !== "cleanup_close_failed" &&
    !ffmpegTerminal &&
    !hasAction(parsed, "ffmpeg_process_started")
  ) {
    primaryExecutionFailureClass = "ffmpeg_process_spawn_failure";
  } else if (
    frameTerminal &&
    ffmpegOutcome === "failed"
  ) {
    primaryExecutionFailureClass = "ffmpeg_exit_failure";
  } else if (
    frameTerminal &&
    ffmpegTerminal &&
    ffmpegOutcome === "succeeded" &&
    uploadOutcome === "failed"
  ) {
    primaryExecutionFailureClass = "artifact_upload_failure";
  } else if (
    frameTerminal &&
    chromiumCleanup &&
    primarySubstage === "terminal_failure_cas"
  ) {
    primaryExecutionFailureClass = "stage_transition_cas_failure";
  } else if (harnessTimedOut) {
    primaryExecutionFailureClass = "forced_abort_after_probe_timeout";
  }

  const durationClass =
    input.harnessExecutionDurationMs > input.harnessPollTimeoutMs
      ? "exceeded_harness_poll_timeout"
      : input.harnessExecutionDurationMs > input.contentDurationMs * 3
        ? "extended_beyond_smoke_content_duration"
        : "within_smoke_bounds";

  return Object.freeze({
    bootstrapResultClass: bootstrapTerminal
      ? classifyBootstrap(bootstrapFacts)
      : classifyResultFromPresence(false),
    frameRequestResultClass: frameTerminal
      ? frameOutcome
      : classifyResultFromPresence(false),
    pngResponseClass: frameTerminal ? "frames_emitted" : "not_reached",
    pageFailureReasonClass: "not_applicable",
    chromiumExitClass: fatalProcessEventPresent ? "process_fatal" : "not_observed",
    abortTimeoutClass: harnessTimedOut ? "harness_poll_timeout" : "none",
    renderExecutionDurationClass: durationClass,
    cleanupSubstage: cleanup.substage,
    cleanupFailureReasonClass: input.harnessCleanupFailed
      ? "harness_cleanup_failed"
      : cleanup.reasonClass,
    primaryExecutionFailureClass,
    secondaryTerminalCasClass: classifySecondaryTerminalCas(terminalFacts),
    hostedLoopDeliveryPresent,
    hostedRenderBoundaryPresent,
    frameRequestStartedPresent: frameStarted,
    frameRequestTerminalPresent: frameTerminal,
    chromiumSessionCleanupPresent: chromiumCleanup,
    ffmpegProcessTerminalPresent: ffmpegTerminal,
    artifactUploadStartedPresent: uploadStarted,
    fatalProcessEventPresent,
  });
}

export function assertExecutionProbePostmortemReportSafe(
  report: ExecutionProbePostmortemReport,
): void {
  for (const value of Object.values(report)) {
    if (typeof value === "boolean") continue;
    if (typeof value !== "string") continue;
    if (/https?:\/\//i.test(value)) {
      throw new Error("postmortem_report_contains_url");
    }
    if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) {
      throw new Error("postmortem_report_contains_uuid");
    }
  }
}

export function sanitizePostmortemFlyLogLine(line: string): string | null {
  const stripped = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (stripped.length === 0) return null;
  if (
    !stripped.includes("hosted.render.boundary") &&
    !stripped.includes("hosted.loop.delivery") &&
    !stripped.includes("frame_request") &&
    !stripped.includes("chromium_session_cleanup") &&
    !stripped.includes("ffmpeg_") &&
    !stripped.includes("artifact_upload") &&
    !stripped.includes("terminal_failure_cas") &&
    stripped.includes("fatal") === false &&
    stripped.includes("process exited") === false
  ) {
    return null;
  }
  return stripped
    .replace(/https?:\/\/[^\s"']+/g, "[redacted-url]")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[redacted-id]",
    )
    .replace(/app\[[a-z0-9]+\]/gi, "app[[redacted-machine]]")
    .replace(/\batMs":\d+/g, 'atMs":[redacted-ms]');
}
