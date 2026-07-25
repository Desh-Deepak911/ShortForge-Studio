/**
 * Sprint 11E Phase 2E.2D.8F.2 — privacy-safe Chromium page substage attribution.
 */

import type {
  ClaimedRenderExecutionReasonId,
  ClaimedRenderExecutionSubstageId,
} from "../runtime/claimed-render-execution-attribution";
import type { PageWorkspaceAttribution } from "./page-workspace-attribution";
import { pageWorkspaceAttributionToTelemetryFacts as workspaceFactsToTelemetry } from "./page-workspace-attribution";
import type { HeadlessPageBootstrapRejectionReasonId } from "./page-bootstrap-rejection";

export const PAGE_EXECUTION_SUBSTAGE_IDS = Object.freeze([
  "browser_context_create",
  "page_create",
  "page_navigation_or_content_load",
  "page_bundle_injection",
  "page_contract_ready",
  "page_request_submit",
  "page_response_wait",
  "page_response_validate",
  "page_cleanup",
] as const);

export type PageExecutionSubstageId =
  (typeof PAGE_EXECUTION_SUBSTAGE_IDS)[number];

export const PAGE_FAILURE_REASON_IDS = Object.freeze([
  "browser_context_failed",
  "page_create_failed",
  "page_load_failed",
  "page_bundle_injection_failed",
  "page_contract_missing",
  "page_contract_version_mismatch",
  "page_request_rejected",
  "page_runtime_exception",
  "page_bootstrap_manifest_invalid",
  "page_bootstrap_bundle_invalid",
  "page_bootstrap_fingerprint_mismatch",
  "page_bootstrap_slot_mismatch",
  "page_bootstrap_asset_missing",
  "page_bootstrap_asset_incoherent",
  "page_bootstrap_unsupported_schema",
  "page_bootstrap_unsupported_profile",
  "page_bootstrap_renderer_mismatch",
  "page_bootstrap_rejected_unknown",
  "page_timeout",
  "page_response_missing",
  "page_response_invalid",
  "page_cleanup_failed",
] as const);

export type PageFailureReasonId = (typeof PAGE_FAILURE_REASON_IDS)[number];

export const PAGE_RESPONSE_CLASSIFICATIONS = Object.freeze([
  "not_reached",
  "missing_api",
  "rejected",
  "runtime_exception",
  "timeout",
  "missing_payload",
  "invalid_payload",
  "valid",
] as const);

export type PageResponseClassification =
  (typeof PAGE_RESPONSE_CLASSIFICATIONS)[number];

const PAGE_SUBSTAGE_SET = new Set<string>(PAGE_EXECUTION_SUBSTAGE_IDS);
const PAGE_REASON_SET = new Set<string>(PAGE_FAILURE_REASON_IDS);
const PAGE_RESPONSE_SET = new Set<string>(PAGE_RESPONSE_CLASSIFICATIONS);

export type PageExecutionAttribution = {
  readonly executionSubstage: PageExecutionSubstageId;
  readonly pageFailureReason: PageFailureReasonId;
  readonly pageResponseClass: PageResponseClassification;
};

export function isPageExecutionSubstageId(
  value: unknown,
): value is PageExecutionSubstageId {
  return typeof value === "string" && PAGE_SUBSTAGE_SET.has(value);
}

export function isPageFailureReasonId(value: unknown): value is PageFailureReasonId {
  return typeof value === "string" && PAGE_REASON_SET.has(value);
}

export function isPageResponseClassification(
  value: unknown,
): value is PageResponseClassification {
  return typeof value === "string" && PAGE_RESPONSE_SET.has(value);
}

export function mapBootstrapRejectionToPageFailureReason(
  reasonId: HeadlessPageBootstrapRejectionReasonId,
): PageFailureReasonId {
  switch (reasonId) {
    case "manifest_invalid":
      return "page_bootstrap_manifest_invalid";
    case "bundle_invalid":
      return "page_bootstrap_bundle_invalid";
    case "bundle_fingerprint_mismatch":
      return "page_bootstrap_fingerprint_mismatch";
    case "slot_claim_mismatch":
      return "page_bootstrap_slot_mismatch";
    case "asset_reference_missing":
      return "page_bootstrap_asset_missing";
    case "asset_reference_incoherent":
      return "page_bootstrap_asset_incoherent";
    case "unsupported_schema":
      return "page_bootstrap_unsupported_schema";
    case "unsupported_profile":
      return "page_bootstrap_unsupported_profile";
    case "renderer_build_mismatch":
      return "page_bootstrap_renderer_mismatch";
    case "bootstrap_runtime_exception":
      return "page_runtime_exception";
    case "unknown_rejected":
    default:
      return "page_bootstrap_rejected_unknown";
  }
}

export function mapPageFailureToExecutionReason(
  reason: PageFailureReasonId,
): ClaimedRenderExecutionReasonId {
  if (PAGE_REASON_SET.has(reason)) {
    return reason as ClaimedRenderExecutionReasonId;
  }
  return "render_terminalized_failure";
}

export function pageSubstageToExecutionSubstage(
  substage: PageExecutionSubstageId,
): ClaimedRenderExecutionSubstageId {
  return substage as ClaimedRenderExecutionSubstageId;
}

export function classifyScrubbedPageFailureMessage(input: {
  readonly substage: PageExecutionSubstageId;
  readonly timedOut?: boolean;
  readonly cancelled?: boolean;
  readonly quota?: boolean;
  readonly contractMissing?: boolean;
  readonly contractVersionMismatch?: boolean;
  readonly bootstrapRejected?: boolean;
  readonly bootstrapReasonId?: HeadlessPageBootstrapRejectionReasonId;
  readonly responseMissing?: boolean;
  readonly responseInvalid?: boolean;
}): PageExecutionAttribution {
  if (input.timedOut) {
    return {
      executionSubstage: input.substage,
      pageFailureReason: "page_timeout",
      pageResponseClass: "timeout",
    };
  }
  if (input.cancelled) {
    return {
      executionSubstage: input.substage,
      pageFailureReason: "page_runtime_exception",
      pageResponseClass: "runtime_exception",
    };
  }
  if (input.contractVersionMismatch) {
    return {
      executionSubstage: "page_contract_ready",
      pageFailureReason: "page_contract_version_mismatch",
      pageResponseClass: "invalid_payload",
    };
  }
  if (input.contractMissing) {
    return {
      executionSubstage: "page_contract_ready",
      pageFailureReason: "page_contract_missing",
      pageResponseClass: "missing_api",
    };
  }
  if (input.bootstrapRejected) {
    const pageFailureReason = mapBootstrapRejectionToPageFailureReason(
      input.bootstrapReasonId ?? "unknown_rejected",
    );
    return {
      executionSubstage: "page_contract_ready",
      pageFailureReason,
      pageResponseClass: "rejected",
    };
  }
  if (input.responseMissing) {
    return {
      executionSubstage: "page_response_wait",
      pageFailureReason: "page_response_missing",
      pageResponseClass: "missing_payload",
    };
  }
  if (input.responseInvalid) {
    return {
      executionSubstage: "page_response_validate",
      pageFailureReason: "page_response_invalid",
      pageResponseClass: "invalid_payload",
    };
  }
  if (input.quota) {
    return {
      executionSubstage: input.substage,
      pageFailureReason: "page_runtime_exception",
      pageResponseClass: "runtime_exception",
    };
  }
  switch (input.substage) {
    case "browser_context_create":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "browser_context_failed",
        pageResponseClass: "runtime_exception",
      };
    case "page_create":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_create_failed",
        pageResponseClass: "runtime_exception",
      };
    case "page_navigation_or_content_load":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_load_failed",
        pageResponseClass: "runtime_exception",
      };
    case "page_bundle_injection":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_bundle_injection_failed",
        pageResponseClass: "runtime_exception",
      };
    case "page_contract_ready":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_contract_missing",
        pageResponseClass: "missing_api",
      };
    case "page_request_submit":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_request_rejected",
        pageResponseClass: "rejected",
      };
    case "page_response_wait":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_response_missing",
        pageResponseClass: "missing_payload",
      };
    case "page_response_validate":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_response_invalid",
        pageResponseClass: "invalid_payload",
      };
    case "page_cleanup":
      return {
        executionSubstage: input.substage,
        pageFailureReason: "page_cleanup_failed",
        pageResponseClass: "runtime_exception",
      };
    default:
      return {
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_runtime_exception",
        pageResponseClass: "runtime_exception",
      };
  }
}

export function sanitizePageExecutionTelemetryFacts(
  facts: Readonly<Record<string, string | number | boolean | null>> | undefined,
): PageExecutionAttribution | undefined {
  if (facts == null) return undefined;
  const substage = facts.page_substage ?? facts.execution_substage;
  const reason = facts.page_failure_reason;
  const response = facts.page_response_class;
  if (
    !isPageExecutionSubstageId(substage) ||
    !isPageFailureReasonId(reason) ||
    !isPageResponseClassification(response)
  ) {
    return undefined;
  }
  return Object.freeze({
    executionSubstage: substage,
    pageFailureReason: reason,
    pageResponseClass: response,
  });
}

export function pageExecutionAttributionToTelemetryFacts(
  attribution: PageExecutionAttribution,
  workspaceAttribution?: PageWorkspaceAttribution,
): Readonly<Record<string, string>> {
  return Object.freeze({
    execution_substage: attribution.executionSubstage,
    page_substage: attribution.executionSubstage,
    page_failure_reason: attribution.pageFailureReason,
    page_response_class: attribution.pageResponseClass,
    ...(workspaceAttribution != null
      ? workspaceFactsToTelemetry(workspaceAttribution)
      : {}),
  });
}
