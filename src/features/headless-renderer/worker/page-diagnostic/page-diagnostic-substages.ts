/**
 * Sprint 11E Phase 2E.2D.8F.3 — page diagnostic substage authority.
 */

export const PAGE_DIAGNOSTIC_SUBSTAGE_IDS = Object.freeze([
  "diagnostic_environment",
  "binary_preflight",
  "workspace_prepare",
  "page_artifact_materialize",
  "browser_context_create",
  "page_create",
  "page_load",
  "page_bundle_execute",
  "page_contract_ready",
  "page_bootstrap",
  "frame_request",
  "png_response_validate",
  "cleanup",
] as const);

export type PageDiagnosticSubstageId =
  (typeof PAGE_DIAGNOSTIC_SUBSTAGE_IDS)[number];

export const PAGE_DIAGNOSTIC_REASON_IDS = Object.freeze([
  "gate_off",
  "forbidden_secret_present",
  "forbidden_worker_mode",
  "provider_import_boundary",
  "chrome_missing",
  "chrome_launch_policy_invalid",
  "chromium_sandbox_failed",
  "workspace_unwritable",
  "page_artifact_absent",
  "page_artifact_unreadable",
  "index_materialization_failed",
  "script_source_missing",
  "script_load_failed",
  "script_runtime_exception",
  "contract_global_missing",
  "contract_version_mismatch",
  "bootstrap_rejected",
  "frame_request_failed",
  "png_response_missing",
  "png_response_invalid",
  "page_timeout",
  "cleanup_failed",
  "diagnostic_exception",
] as const);

export type PageDiagnosticReasonId =
  (typeof PAGE_DIAGNOSTIC_REASON_IDS)[number];

export const PAGE_DIAGNOSTIC_FILE_PRESENT_CLASS = Object.freeze([
  "not_applicable",
  "present_readable",
  "absent",
  "unreadable",
] as const);

export type PageDiagnosticFilePresentClass =
  (typeof PAGE_DIAGNOSTIC_FILE_PRESENT_CLASS)[number];

export const PAGE_DIAGNOSTIC_SCRIPT_LOAD_CLASS = Object.freeze([
  "not_applicable",
  "loaded",
  "missing",
  "failed",
] as const);

export type PageDiagnosticScriptLoadClass =
  (typeof PAGE_DIAGNOSTIC_SCRIPT_LOAD_CLASS)[number];

export const PAGE_DIAGNOSTIC_CONTRACT_GLOBAL_CLASS = Object.freeze([
  "not_applicable",
  "present",
  "missing",
] as const);

export type PageDiagnosticContractGlobalClass =
  (typeof PAGE_DIAGNOSTIC_CONTRACT_GLOBAL_CLASS)[number];

export const PAGE_DIAGNOSTIC_CONTRACT_VERSION_CLASS = Object.freeze([
  "not_applicable",
  "match_9c",
  "mismatch",
] as const);

export type PageDiagnosticContractVersionClass =
  (typeof PAGE_DIAGNOSTIC_CONTRACT_VERSION_CLASS)[number];

export const PAGE_DIAGNOSTIC_RESPONSE_CLASS = Object.freeze([
  "not_reached",
  "valid_png",
  "missing_payload",
  "invalid_payload",
  "rejected",
  "runtime_exception",
  "timeout",
] as const);

export type PageDiagnosticResponseClass =
  (typeof PAGE_DIAGNOSTIC_RESPONSE_CLASS)[number];

export const PAGE_DIAGNOSTIC_CHROMIUM_EXIT_CLASS = Object.freeze([
  "not_applicable",
  "clean",
  "failed",
  "timeout",
] as const);

export type PageDiagnosticChromiumExitClass =
  (typeof PAGE_DIAGNOSTIC_CHROMIUM_EXIT_CLASS)[number];

const SUBSTAGE_SET = new Set<string>(PAGE_DIAGNOSTIC_SUBSTAGE_IDS);
const REASON_SET = new Set<string>(PAGE_DIAGNOSTIC_REASON_IDS);

export function isPageDiagnosticSubstageId(
  value: unknown,
): value is PageDiagnosticSubstageId {
  return typeof value === "string" && SUBSTAGE_SET.has(value);
}

export function isPageDiagnosticReasonId(
  value: unknown,
): value is PageDiagnosticReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function mapProductionPageSubstageToDiagnostic(
  substage: string,
): PageDiagnosticSubstageId {
  switch (substage) {
    case "browser_context_create":
      return "browser_context_create";
    case "page_create":
      return "page_create";
    case "page_navigation_or_content_load":
      return "page_load";
    case "page_bundle_injection":
      return "page_bundle_execute";
    case "page_contract_ready":
      return "page_contract_ready";
    case "page_request_submit":
      return "frame_request";
    case "page_response_wait":
    case "page_response_validate":
      return "png_response_validate";
    case "page_cleanup":
      return "cleanup";
    default:
      return "page_bundle_execute";
  }
}

export function mapProductionFailureToDiagnosticReason(input: {
  readonly substage: string;
  readonly pageFailureReason: string;
  readonly pageResponseClass: string;
}): PageDiagnosticReasonId {
  if (input.pageFailureReason === "page_contract_missing") {
    return "contract_global_missing";
  }
  if (input.pageFailureReason === "page_contract_version_mismatch") {
    return "contract_version_mismatch";
  }
  if (input.pageFailureReason === "page_timeout") {
    return "page_timeout";
  }
  if (input.substage === "page_bundle_injection") {
    return input.pageResponseClass === "missing_api"
      ? "page_artifact_absent"
      : "script_load_failed";
  }
  if (input.pageFailureReason === "page_response_missing") {
    return "png_response_missing";
  }
  if (input.pageFailureReason === "page_response_invalid") {
    return "png_response_invalid";
  }
  if (input.pageFailureReason === "page_request_rejected") {
    return "frame_request_failed";
  }
  if (input.pageFailureReason === "page_bundle_injection_failed") {
    return "script_load_failed";
  }
  if (input.pageFailureReason === "page_load_failed") {
    return "script_runtime_exception";
  }
  return "script_runtime_exception";
}
