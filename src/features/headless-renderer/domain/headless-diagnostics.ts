/**
 * Safe diagnostics — bounded reason IDs only; never echo secrets or media URLs.
 */

import type {
  HeadlessIntegrityIssue,
  HeadlessReasonId,
} from "./headless-render.types";

const UNSAFE_DIAGNOSTIC_PATTERN =
  /(?:blob:|data:|https?:\/\/|file:\/\/|\/Users\/|\/home\/|\\\\|sig=|signature=|X-Amz-|token=|secret=|password=)/i;

export function headlessIssue(
  code: HeadlessReasonId,
  message: string,
): HeadlessIntegrityIssue {
  return {
    code,
    message: sanitizeDiagnosticMessage(message),
  };
}

export function sanitizeDiagnosticMessage(message: string): string {
  const trimmed = typeof message === "string" ? message.slice(0, 240) : "Invalid input.";
  if (UNSAFE_DIAGNOSTIC_PATTERN.test(trimmed)) {
    return "Details redacted for privacy.";
  }
  return trimmed;
}

/** Fail-closed result builder. */
export function headlessFail(
  ...issues: readonly HeadlessIntegrityIssue[]
): { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  return { ok: false as const, issues };
}

export function headlessOk(): { ok: true; issues: readonly [] } {
  return { ok: true, issues: [] };
}
