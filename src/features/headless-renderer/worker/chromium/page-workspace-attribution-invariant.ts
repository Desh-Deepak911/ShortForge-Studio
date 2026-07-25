/**
 * Fail-closed page workspace attribution completeness for terminal page/Chromium results.
 */

import {
  isPageWorkspaceAttributionTelemetryComplete,
  pageWorkspaceAttributionToTelemetryFacts,
  sanitizePageWorkspaceAttributionSnapshot,
  type PageWorkspaceAttribution,
} from "./page-workspace-attribution";
import type { ClaimedRenderExecutionReasonId } from "../runtime/claimed-render-execution-attribution";
import type { ClaimedRenderExecutionSubstageId } from "../runtime/claimed-render-execution-attribution";

export const PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID =
  "page_workspace_attribution_missing" as const satisfies ClaimedRenderExecutionReasonId;

const PAGE_CHROMIUM_TERMINAL_SUBSTAGES = new Set<ClaimedRenderExecutionSubstageId>([
  "page_bundle_injection",
  "page_navigation_or_content_load",
  "page_contract_ready",
  "page_request_submit",
  "page_response_wait",
  "page_response_validate",
  "page_cleanup",
  "browser_context_create",
  "page_create",
  "chromium_launch",
  "chromium_preflight",
]);

export function isPageChromiumTerminalSubstage(
  substage: ClaimedRenderExecutionSubstageId | undefined,
): boolean {
  return substage != null && PAGE_CHROMIUM_TERMINAL_SUBSTAGES.has(substage);
}

export type PageWorkspaceAttributionValidationResult =
  | { readonly ok: true; readonly attribution: PageWorkspaceAttribution }
  | {
      readonly ok: false;
      readonly failClass:
        | "missing"
        | "sanitize_rejected"
        | "telemetry_incomplete"
        | "invalid_enum";
    };

export function validatePageWorkspaceAttributionComplete(
  value: unknown,
): PageWorkspaceAttributionValidationResult {
  if (value == null) {
    return { ok: false, failClass: "missing" };
  }
  const sanitized = sanitizePageWorkspaceAttributionSnapshot(value);
  if (sanitized == null) {
    return { ok: false, failClass: "sanitize_rejected" };
  }
  const facts = pageWorkspaceAttributionToTelemetryFacts(sanitized);
  if (!isPageWorkspaceAttributionTelemetryComplete(facts)) {
    return { ok: false, failClass: "telemetry_incomplete" };
  }
  return { ok: true, attribution: sanitized };
}

export function resolveTerminalPageFailureAttribution(input: {
  readonly workspacePrepared: boolean;
  readonly executionSubstage: ClaimedRenderExecutionSubstageId;
  readonly pageFailureReason: ClaimedRenderExecutionReasonId;
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
}): {
  readonly pageFailureReason: ClaimedRenderExecutionReasonId;
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
} {
  if (!input.workspacePrepared || !isPageChromiumTerminalSubstage(input.executionSubstage)) {
    return {
      pageFailureReason: input.pageFailureReason,
      ...(input.pageWorkspaceAttribution != null
        ? { pageWorkspaceAttribution: input.pageWorkspaceAttribution }
        : {}),
    };
  }

  const validated = validatePageWorkspaceAttributionComplete(
    input.pageWorkspaceAttribution,
  );
  if (!validated.ok) {
    return {
      pageFailureReason: PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID,
    };
  }

  return {
    pageFailureReason: input.pageFailureReason,
    pageWorkspaceAttribution: validated.attribution,
  };
}

export function resolvePageFailureReasonForAttributionFacts(input: {
  readonly executionSubstage: ClaimedRenderExecutionSubstageId;
  readonly pageFailureReason?: ClaimedRenderExecutionReasonId;
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
}): ClaimedRenderExecutionReasonId | undefined {
  if (
    input.pageFailureReason === "page_contract_missing" &&
    validatePageWorkspaceAttributionComplete(input.pageWorkspaceAttribution).ok !==
      true
  ) {
    return PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID;
  }
  if (input.pageFailureReason != null) {
    return input.pageFailureReason;
  }
  if (
    input.executionSubstage === "page_contract_ready" &&
    validatePageWorkspaceAttributionComplete(input.pageWorkspaceAttribution).ok !==
      true
  ) {
    return PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID;
  }
  return input.pageFailureReason;
}
