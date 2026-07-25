/**
 * Causal owning-boundary sequence coherence — rejects impossible evidence combinations.
 * Never reconstructs missing boundaries from terminal reasons.
 */

import type { PageWorkspaceAttribution } from "../chromium/page-workspace-attribution";
import {
  OWNING_BOUNDARY_EVENT_IDS,
  classifyOwningBoundaryTerminalBranch,
  type OwningBoundaryEventId,
  type ProviderContextClassifications,
  type RenderProfileClass,
} from "./provider-backed-boundary-telemetry";

export {
  classifyOwningBoundaryTerminalBranch,
  resolveBranchAwareMissingNextBoundary,
} from "./provider-backed-boundary-telemetry";

export const BOUNDARY_SEQUENCE_INCOHERENT_REASON =
  "boundary_sequence_incoherent" as const;

export type OwningBoundarySequenceCoherenceResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: typeof BOUNDARY_SEQUENCE_INCOHERENT_REASON;
      readonly incoherenceClass:
        | "unsupported_profile_with_later_page_execution"
        | "page_terminal_without_source_materialization"
        | "workspace_terminal_without_workspace_start"
        | "contract_terminal_without_navigation_or_script"
        | "frame_terminal_without_bootstrap"
        | "bootstrap_rejected_with_frame_request"
        | "cleanup_before_bootstrap_terminal"
        | "non_monotonic_sequence"
        | "coherent_incomplete_terminal_sequence"
        | "execution_beyond_last_boundary"
        | "illegal_failure_cas_after_succeeded_cas"
        | "missing_succeeded_cas_on_success_branch";
    };

function indexOfBoundary(id: OwningBoundaryEventId): number {
  return OWNING_BOUNDARY_EVENT_IDS.indexOf(id);
}

function hasBoundary(
  observed: readonly OwningBoundaryEventId[],
  id: OwningBoundaryEventId,
): boolean {
  return observed.includes(id);
}

function hasAnyBoundary(
  observed: readonly OwningBoundaryEventId[],
  ids: readonly OwningBoundaryEventId[],
): boolean {
  return ids.some((id) => observed.includes(id));
}

function lastObservedFrom(
  observed: readonly OwningBoundaryEventId[],
): OwningBoundaryEventId | null {
  return observed.length > 0 ? observed[observed.length - 1]! : null;
}

function bootstrapTerminalRejected(input: {
  readonly observed: readonly OwningBoundaryEventId[];
  readonly workspaceAttribution: PageWorkspaceAttribution | null;
}): boolean {
  if (!hasBoundary(input.observed, "page_bootstrap_terminal")) return false;
  return input.workspaceAttribution?.bootstrapResponseClass === "rejected";
}

export function validateOwningBoundarySequenceCoherence(input: {
  readonly observedSequence: readonly OwningBoundaryEventId[];
  readonly providerContext: ProviderContextClassifications | null;
  readonly workspaceAttribution: PageWorkspaceAttribution | null;
  readonly terminalSubstage?: string | null;
  readonly terminalReasonId?: string | null;
}): OwningBoundarySequenceCoherenceResult {
  const observed = [...input.observedSequence];
  const profileClass = input.providerContext?.renderProfileClass ?? null;
  const terminalBranch = classifyOwningBoundaryTerminalBranch({
    observedSequence: observed,
  });

  const succeededCasIdx = observed.indexOf("job_succeeded_cas_completed");
  const failureCasIdx = observed.indexOf("terminal_failure_cas_started");
  if (
    succeededCasIdx >= 0 &&
    failureCasIdx >= 0 &&
    failureCasIdx > succeededCasIdx
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "illegal_failure_cas_after_succeeded_cas",
    };
  }

  if (
    terminalBranch === "success" &&
    observed.includes("job_succeeded_cas_completed") &&
    !observed.includes("job_succeeded_cas_started")
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "missing_succeeded_cas_on_success_branch",
    };
  }

  if (
    terminalBranch === "success" &&
    lastObservedFrom(observed) === "job_succeeded_cas_completed"
  ) {
    return { ok: true };
  }

  for (let i = 1; i < observed.length; i += 1) {
    const prev = indexOfBoundary(observed[i - 1]!);
    const cur = indexOfBoundary(observed[i]!);
    if (prev < 0 || cur < 0 || cur <= prev) {
      return {
        ok: false,
        reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
        incoherenceClass: "non_monotonic_sequence",
      };
    }
  }

  const bootstrapRejected = bootstrapTerminalRejected({
    observed,
    workspaceAttribution: input.workspaceAttribution,
  });
  const bootstrapTerminalIdx = observed.indexOf("page_bootstrap_terminal");
  const cleanupIdx = observed.indexOf("chromium_session_cleanup");
  if (
    bootstrapRejected &&
    cleanupIdx >= 0 &&
    bootstrapTerminalIdx >= 0 &&
    cleanupIdx < bootstrapTerminalIdx
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "cleanup_before_bootstrap_terminal",
    };
  }
  if (bootstrapRejected) {
    const bootstrapTerminalPos =
      bootstrapTerminalIdx >= 0 ? bootstrapTerminalIdx : observed.length;
    const frameAfterRejected = observed
      .slice(bootstrapTerminalPos + 1)
      .some(
        (id) =>
          id === "frame_request_started" || id === "frame_request_terminal",
      );
    if (frameAfterRejected) {
      return {
        ok: false,
        reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
        incoherenceClass: "bootstrap_rejected_with_frame_request",
      };
    }
  }

  const pageStageBoundaries: readonly OwningBoundaryEventId[] = [
    "browser_context_created",
    "page_created",
    "page_navigation_started",
    "page_script_execution_started",
    "page_contract_observation_started",
    "page_bootstrap_started",
    "frame_request_started",
  ];
  const reachedPageStage = hasAnyBoundary(observed, pageStageBoundaries);

  if (profileClass === "unsupported" && reachedPageStage) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "unsupported_profile_with_later_page_execution",
    };
  }

  const pageTerminal =
    input.terminalSubstage === "page_contract_ready" ||
    input.terminalSubstage === "page_response_validate" ||
    input.terminalSubstage === "page_response_wait" ||
    input.terminalSubstage === "page_bundle_injection" ||
    input.terminalSubstage === "page_navigation_or_content_load";

  if (
    pageTerminal &&
    !hasBoundary(observed, "source_assets_materialization_started")
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "page_terminal_without_source_materialization",
    };
  }

  if (
    input.workspaceAttribution != null &&
    !hasBoundary(observed, "page_workspace_materialization_started")
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "workspace_terminal_without_workspace_start",
    };
  }

  const contractTerminal =
    input.terminalSubstage === "page_contract_ready" ||
    input.terminalReasonId === "page_contract_missing" ||
    input.terminalReasonId === "page_workspace_attribution_missing";

  if (
    contractTerminal &&
    hasBoundary(observed, "page_contract_observation_started") &&
    !hasAnyBoundary(observed, [
      "page_navigation_started",
      "page_script_execution_started",
    ])
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "contract_terminal_without_navigation_or_script",
    };
  }

  if (
    hasBoundary(observed, "frame_request_terminal") &&
    !hasBoundary(observed, "page_bootstrap_started")
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "frame_terminal_without_bootstrap",
    };
  }

  const lastObserved = observed.length > 0 ? observed[observed.length - 1]! : null;

  const terminalSubstage = input.terminalSubstage ?? null;
  const terminalFailureSuffix: readonly OwningBoundaryEventId[] = Object.freeze([
    "artifact_upload_started",
    "artifact_upload_completed",
    "owned_object_finalize_started",
    "owned_object_finalize_completed",
    "artifact_binding_validation_started",
    "artifact_binding_validation_completed",
    "cleanup_scheduled",
    "cleanup_completed",
    "terminal_failure_cas_started",
    "terminal_failure_cas_completed",
  ]);
  const isBindingTerminal =
    terminalSubstage === "artifact_finalize" ||
    terminalSubstage === "artifact_binding_validation";
  if (isBindingTerminal && lastObserved != null) {
    const suffixStart = observed.findIndex((id) =>
      terminalFailureSuffix.includes(id),
    );
    if (suffixStart >= 0) {
      const suffix = observed.slice(suffixStart);
      let suffixMonotonic = true;
      for (let i = 1; i < suffix.length; i += 1) {
        const prev = indexOfBoundary(suffix[i - 1]!);
        const cur = indexOfBoundary(suffix[i]!);
        if (prev < 0 || cur < 0 || cur <= prev) {
          suffixMonotonic = false;
          break;
        }
      }
      const missingOnlySuccessSuffix =
        lastObserved === "cleanup_scheduled" ||
        lastObserved === "artifact_binding_validation_completed" ||
        lastObserved === "owned_object_finalize_completed" ||
        lastObserved === "terminal_failure_cas_completed";
      if (suffixMonotonic && missingOnlySuccessSuffix) {
        return { ok: true };
      }
    }
  }

  if (
    lastObserved != null &&
    reachedPageStage &&
    indexOfBoundary(lastObserved) < indexOfBoundary("source_assets_materialization_started")
  ) {
    return {
      ok: false,
      reasonId: BOUNDARY_SEQUENCE_INCOHERENT_REASON,
      incoherenceClass: "execution_beyond_last_boundary",
    };
  }

  return { ok: true };
}

export function classifyRenderProfileFromProviderContext(
  providerContext: ProviderContextClassifications | null,
): RenderProfileClass | null {
  return providerContext?.renderProfileClass ?? null;
}
