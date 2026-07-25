/**
 * Cross-authority claimed-render execution reason emission registry.
 * Every reason emitted by worker mapping, probe mapping, page attribution,
 * or evidence writer must be a member of CLAIMED_RENDER_EXECUTION_REASON_IDS.
 */

import {
  CLAIMED_RENDER_EXECUTION_REASON_IDS,
  CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS,
  mapWorkerFailureReasonToExecutionReason,
  type ClaimedRenderExecutionReasonId,
} from "./claimed-render-execution-attribution";
import {
  PAGE_FAILURE_REASON_IDS,
  mapPageFailureToExecutionReason,
} from "../chromium/page-execution-attribution";

/** Reasons emitted by mapWorkerFailureReasonToExecutionReason for all substages. */
export function listWorkerMappedExecutionReasonIds(): readonly ClaimedRenderExecutionReasonId[] {
  const out = new Set<ClaimedRenderExecutionReasonId>();
  for (const substage of CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS) {
    out.add(mapWorkerFailureReasonToExecutionReason("WORKER_FAILED", substage));
  }
  out.add(mapWorkerFailureReasonToExecutionReason("WORKER_TIMEOUT", "cleanup"));
  out.add(
    mapWorkerFailureReasonToExecutionReason("UNSUPPORTED_CAPABILITY", "cleanup"),
  );
  out.add(
    mapWorkerFailureReasonToExecutionReason("TERMINAL_STATE_IMMUTABLE", "cleanup"),
  );
  out.add(mapWorkerFailureReasonToExecutionReason("STALE_ATTEMPT", "cleanup"));
  out.add(
    mapWorkerFailureReasonToExecutionReason("CANCELLED_BY_USER", "cleanup"),
  );
  out.add(
    mapWorkerFailureReasonToExecutionReason(
      "ARTIFACT_CLEANUP_UNCONFIRMED",
      "cleanup",
    ),
  );
  return Object.freeze([...out]);
}

/** Reasons emitted by page execution attribution mapping. */
export function listPageMappedExecutionReasonIds(): readonly ClaimedRenderExecutionReasonId[] {
  return Object.freeze(
    PAGE_FAILURE_REASON_IDS.map((reason) =>
      mapPageFailureToExecutionReason(reason),
    ),
  );
}

/** Reasons emitted by execution-probe mapFailureAttribution substage branches. */
export const EXECUTION_PROBE_MAPPED_FAILURE_REASON_IDS = Object.freeze([
  "claim_coherence_rejected",
  "render_request_materialization_failed",
  "source_binding_resolution_failed",
  "storage_resolution_failed",
  "workspace_prepare_failed",
  "chromium_preflight_failed",
  "chromium_launch_failed",
  "browser_context_failed",
  "page_create_failed",
  "page_load_failed",
  "page_bundle_injection_failed",
  "page_workspace_attribution_missing",
  "page_contract_missing",
  "page_request_rejected",
  "page_response_missing",
  "page_response_invalid",
  "page_cleanup_failed",
  "ffmpeg_preflight_failed",
  "ffmpeg_execution_failed",
  "artifact_upload_failed",
  "artifact_finalize_failed",
  "artifact_binding_validation_failed",
  "succeeded_cas_lost",
  "terminal_failure_cas_failed",
  "render_terminalized_failure",
] as const satisfies readonly ClaimedRenderExecutionReasonId[]);

export function assertClaimedRenderExecutionReasonCrossAuthorityInvariant(): {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly missingFromRegistry: readonly string[];
} {
  const registry = new Set<string>(CLAIMED_RENDER_EXECUTION_REASON_IDS);
  const missing = new Set<string>();
  for (const reason of listWorkerMappedExecutionReasonIds()) {
    if (!registry.has(reason)) missing.add(reason);
  }
  for (const reason of listPageMappedExecutionReasonIds()) {
    if (!registry.has(reason)) missing.add(reason);
  }
  for (const reason of EXECUTION_PROBE_MAPPED_FAILURE_REASON_IDS) {
    if (!registry.has(reason)) missing.add(reason);
  }
  if (missing.size > 0) {
    return Object.freeze({
      ok: false as const,
      missingFromRegistry: Object.freeze([...missing].sort()),
    });
  }
  return Object.freeze({ ok: true as const });
}
