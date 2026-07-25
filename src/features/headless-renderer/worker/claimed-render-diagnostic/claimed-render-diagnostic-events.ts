/**
 * Sprint 11E Phase 2E.2D.8F.6 — privacy-safe claimed-render diagnostic events.
 */

import type { PageWorkspaceAttribution } from "../chromium/page-workspace-attribution";
import {
  isPageWorkspaceAttributionTelemetryComplete,
  pageWorkspaceAttributionToTelemetryFacts,
} from "../chromium/page-workspace-attribution";
import { validatePageWorkspaceAttributionComplete } from "../chromium/page-workspace-attribution-invariant";

import {
  assertCapabilityReachabilityInvariant,
  capabilityAttributionToSafeFacts,
  type ClaimedRenderDiagnosticCapabilityAttribution,
} from "./claimed-render-diagnostic-capability-boundary";

export const CLAIMED_RENDER_DIAGNOSTIC_BOUNDARY_IDS = Object.freeze([
  "materializer_entered",
  "shipped_artifact_resolved",
  "workspace_attribution_created",
  "workspace_attribution_complete",
  "render_session_received_attribution",
  "page_navigation_started",
  "page_script_loaded",
  "contract_globals_observed",
  "bootstrap_invoked",
  "frame_requested",
  "page_failure_attached_attribution",
  "execute_render_job_returned_attribution",
  "diagnostic_result_received_attribution",
  "cleanup_complete",
] as const);

export type ClaimedRenderDiagnosticBoundaryId =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_BOUNDARY_IDS)[number];

export type ClaimedRenderDiagnosticVariantId = "minimal" | "live_smoke";

export type ClaimedRenderDiagnosticBoundaryPresence = Readonly<
  Record<ClaimedRenderDiagnosticBoundaryId, "observed" | "not_observed" | "not_applicable">
>;

export type ClaimedRenderDiagnosticSafeEvent = {
  readonly name: "hosted.claimed_render_diagnostic";
  readonly status: "ok" | "failed" | "skipped";
  readonly variant: ClaimedRenderDiagnosticVariantId;
  readonly diagnosticStage:
    | "diagnostic_environment"
    | "binary_preflight"
    | "fixture_prepare"
    | "claimed_job_prepare"
    | "capability_preflight"
    | "execute_render_job"
    | "comparison"
    | "cleanup";
  readonly reasonId: string | null;
  readonly boundaryPresence: ClaimedRenderDiagnosticBoundaryPresence;
  readonly workspaceClassificationCount: number;
  readonly boundedDurationMs: number | null;
  readonly cleanupStatus: "ok" | "failed" | "not_run";
  readonly capabilityAttribution?: ClaimedRenderDiagnosticCapabilityAttribution;
};

const FORBIDDEN_OUTPUT =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_|R2_|password=|token=|BEGIN PRIVATE KEY|\/Users\/|https?:\/\/|file:\/\/|@sha256:|process\.env|0x[a-f0-9]{8,})/i;

export function assertClaimedRenderDiagnosticEventSafe(
  line: string,
): { readonly ok: true } | { readonly ok: false } {
  if (FORBIDDEN_OUTPUT.test(line)) return { ok: false };
  if (/\\u00[0-9a-f]{2}/i.test(line)) return { ok: false };
  return { ok: true };
}

export function createInitialBoundaryPresence(): ClaimedRenderDiagnosticBoundaryPresence {
  return Object.freeze(
    Object.fromEntries(
      CLAIMED_RENDER_DIAGNOSTIC_BOUNDARY_IDS.map((id) => [id, "not_observed"]),
    ) as Record<
      ClaimedRenderDiagnosticBoundaryId,
      "observed" | "not_observed" | "not_applicable"
    >,
  );
}

export function countWorkspaceClassifications(
  attribution: PageWorkspaceAttribution | undefined,
): number {
  if (attribution == null) return 0;
  const facts = pageWorkspaceAttributionToTelemetryFacts(attribution);
  return Object.values(facts).filter(
    (v) => typeof v === "string" && v.length > 0,
  ).length;
}

export function deriveBoundaryPresenceFromAttribution(input: {
  readonly attribution: PageWorkspaceAttribution | undefined;
  readonly chromiumSucceeded: boolean;
  readonly frameCount: number;
  readonly executeReturnedAttribution: boolean;
  readonly diagnosticReceivedAttribution: boolean;
  readonly cleanupComplete: boolean;
  readonly materializerEntered: boolean;
}): ClaimedRenderDiagnosticBoundaryPresence {
  const base = createInitialBoundaryPresence();
  const attr = input.attribution;
  if (attr == null) {
    const presence = Object.freeze({
      ...base,
      materializer_entered: input.materializerEntered ? "observed" : "not_observed",
      frame_requested:
        input.materializerEntered &&
        input.chromiumSucceeded &&
        input.frameCount > 0
          ? "observed"
          : "not_observed",
      execute_render_job_returned_attribution: input.executeReturnedAttribution
        ? "observed"
        : "not_observed",
      diagnostic_result_received_attribution: input.diagnosticReceivedAttribution
        ? "observed"
        : "not_observed",
      cleanup_complete: input.cleanupComplete ? "observed" : "not_observed",
    });
    assertCapabilityReachabilityInvariant({ boundaryPresence: presence });
    return presence;
  }

  const shippedResolved =
    attr.shippedArtifactResolutionClass === "resolved_readable";
  const attributionCreated = shippedResolved || attr.sourcePageArtifactPresent !== "not_applicable";
  const attributionComplete =
    validatePageWorkspaceAttributionComplete(attr).ok &&
    isPageWorkspaceAttributionTelemetryComplete(
      pageWorkspaceAttributionToTelemetryFacts(attr),
    );

  const navigationStarted =
    attr.fileNavigationLoadClass === "loaded" ||
    attr.fileNavigationLoadClass === "failed";
  const scriptLoaded =
    attr.scriptLoadClass === "loaded" ||
    attr.scriptLoadClass === "load_failed";
  const contractObserved =
    attr.contractGlobalPresence === "present" ||
    attr.contractGlobalPresence === "missing";
  const bootstrapInvoked =
    attr.bootstrapResponseClass !== "not_reached" &&
    attr.bootstrapResponseClass !== "not_applicable";
  const frameRequested = input.chromiumSucceeded && input.frameCount > 0;

  const presence = Object.freeze({
    ...base,
    materializer_entered: input.materializerEntered ? "observed" : "not_observed",
    shipped_artifact_resolved: shippedResolved ? "observed" : "not_observed",
    workspace_attribution_created: attributionCreated ? "observed" : "not_observed",
    workspace_attribution_complete: attributionComplete
      ? "observed"
      : "not_observed",
    render_session_received_attribution: attributionCreated
      ? "observed"
      : "not_observed",
    page_navigation_started: navigationStarted ? "observed" : "not_observed",
    page_script_loaded: scriptLoaded ? "observed" : "not_observed",
    contract_globals_observed: contractObserved ? "observed" : "not_observed",
    bootstrap_invoked: bootstrapInvoked ? "observed" : "not_observed",
    frame_requested: frameRequested ? "observed" : "not_observed",
    page_failure_attached_attribution: input.executeReturnedAttribution
      ? "observed"
      : "not_observed",
    execute_render_job_returned_attribution: input.executeReturnedAttribution
      ? "observed"
      : "not_observed",
    diagnostic_result_received_attribution: input.diagnosticReceivedAttribution
      ? "observed"
      : "not_observed",
    cleanup_complete: input.cleanupComplete ? "observed" : "not_observed",
  });
  assertCapabilityReachabilityInvariant({ boundaryPresence: presence });
  return presence;
}

export function formatClaimedRenderDiagnosticEvent(
  event: ClaimedRenderDiagnosticSafeEvent,
): string {
  const payload: Record<string, unknown> = {
    name: event.name,
    status: event.status,
    variant: event.variant,
    diagnostic_stage: event.diagnosticStage,
    reason_id: event.reasonId,
    boundary_presence: event.boundaryPresence,
    workspace_classification_count: event.workspaceClassificationCount,
    bounded_duration_ms: event.boundedDurationMs,
    cleanup_status: event.cleanupStatus,
  };
  if (event.capabilityAttribution != null) {
    Object.assign(payload, capabilityAttributionToSafeFacts(event.capabilityAttribution));
  }
  const line = JSON.stringify(payload);
  if (!assertClaimedRenderDiagnosticEventSafe(line).ok) {
    return JSON.stringify({
      name: event.name,
      status: "failed",
      variant: event.variant,
      diagnostic_stage: "diagnostic_environment",
      reason_id: "diagnostic_exception",
      boundary_presence: createInitialBoundaryPresence(),
      workspace_classification_count: 0,
      bounded_duration_ms: event.boundedDurationMs,
      cleanup_status: event.cleanupStatus,
    });
  }
  return line;
}

export type ClaimedRenderDiagnosticEventSink = (
  event: ClaimedRenderDiagnosticSafeEvent,
) => void;

export function createStdoutClaimedRenderDiagnosticEventSink(): ClaimedRenderDiagnosticEventSink {
  return (event) => {
    process.stdout.write(`${formatClaimedRenderDiagnosticEvent(event)}\n`);
  };
}
