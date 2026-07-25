/**
 * Sprint 11E Phase 2E.2D.8F.3 — privacy-safe JSON-line diagnostic events.
 */

import type {
  PageDiagnosticChromiumExitClass,
  PageDiagnosticContractGlobalClass,
  PageDiagnosticContractVersionClass,
  PageDiagnosticFilePresentClass,
  PageDiagnosticReasonId,
  PageDiagnosticResponseClass,
  PageDiagnosticScriptLoadClass,
  PageDiagnosticSubstageId,
} from "./page-diagnostic-substages";

export type PageDiagnosticSafeEvent = {
  readonly name: "hosted.page_diagnostic";
  readonly status: "ok" | "failed" | "skipped";
  readonly diagnosticStage: PageDiagnosticSubstageId;
  readonly pageSubstage: PageDiagnosticSubstageId;
  readonly reasonId: PageDiagnosticReasonId | null;
  readonly filePresentClass: PageDiagnosticFilePresentClass;
  readonly scriptLoadedClass: PageDiagnosticScriptLoadClass;
  readonly contractGlobalClass: PageDiagnosticContractGlobalClass;
  readonly contractVersionClass: PageDiagnosticContractVersionClass;
  readonly responseClass: PageDiagnosticResponseClass;
  readonly chromiumExitClass: PageDiagnosticChromiumExitClass;
  readonly boundedDurationMs: number | null;
  readonly cleanupStatus: "ok" | "failed" | "not_run";
};

const FORBIDDEN_OUTPUT =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_|R2_|password=|token=|BEGIN PRIVATE KEY|\/Users\/|\/tmp\/|https?:\/\/|file:\/\/|@sha256:|process\.env)/i;

export function assertPageDiagnosticEventSafe(
  line: string,
): { readonly ok: true } | { readonly ok: false } {
  if (FORBIDDEN_OUTPUT.test(line)) return { ok: false };
  if (/\\u00[0-9a-f]{2}/i.test(line)) return { ok: false };
  return { ok: true };
}

export function formatPageDiagnosticEvent(
  event: PageDiagnosticSafeEvent,
): string {
  const payload = {
    name: event.name,
    status: event.status,
    diagnostic_stage: event.diagnosticStage,
    page_substage: event.pageSubstage,
    reason_id: event.reasonId,
    file_present_class: event.filePresentClass,
    script_loaded_class: event.scriptLoadedClass,
    contract_global_class: event.contractGlobalClass,
    contract_version_class: event.contractVersionClass,
    response_class: event.responseClass,
    chromium_exit_class: event.chromiumExitClass,
    bounded_duration_ms: event.boundedDurationMs,
    cleanup_status: event.cleanupStatus,
  };
  const line = JSON.stringify(payload);
  const safe = assertPageDiagnosticEventSafe(line);
  if (!safe.ok) {
    return JSON.stringify({
      name: event.name,
      status: "failed",
      diagnostic_stage: "diagnostic_environment",
      page_substage: "diagnostic_environment",
      reason_id: "diagnostic_exception",
      file_present_class: "not_applicable",
      script_loaded_class: "not_applicable",
      contract_global_class: "not_applicable",
      contract_version_class: "not_applicable",
      response_class: "runtime_exception",
      chromium_exit_class: "failed",
      bounded_duration_ms: event.boundedDurationMs,
      cleanup_status: event.cleanupStatus,
    });
  }
  return line;
}

export type PageDiagnosticEventSink = (
  event: PageDiagnosticSafeEvent,
) => void;

export function createStdoutPageDiagnosticEventSink(): PageDiagnosticEventSink {
  return (event) => {
    process.stdout.write(`${formatPageDiagnosticEvent(event)}\n`);
  };
}
