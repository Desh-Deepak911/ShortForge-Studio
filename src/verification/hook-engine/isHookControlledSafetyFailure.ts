/**
 * Sprint 7E.1A — Narrow classifier for Hook-controlled safety-terminal failures.
 * A Pass-eligible safety failure must prove validation entered the safe-fallback
 * route and then failed a hard gate or validation — not a model/API outage.
 */

/** Only these fallbackReason values may count as a Hook safety-terminal Pass. */
export const HOOK_CONTROLLED_SAFETY_FAILURE_REASONS = [
  "safe_fallback_failed_hard_gate",
  "safe_fallback_failed_validation",
] as const;

export type HookControlledSafetyFailureReason =
  (typeof HOOK_CONTROLLED_SAFETY_FAILURE_REASONS)[number];

const ACCEPTED = new Set<string>(HOOK_CONTROLLED_SAFETY_FAILURE_REASONS);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * True only when diagnostics prove an allowed Hook safety-terminal failure.
 * Model/API/callback/empty-fallback failures must return false.
 */
export function isHookControlledSafetyFailure(
  json: Record<string, unknown>,
): boolean {
  if (json.success !== false) return false;

  const diagnostics = json.hookDiagnostics;
  if (typeof diagnostics !== "object" || diagnostics === null) return false;

  const d = diagnostics as Record<string, unknown>;

  if (d.adapterRan !== true) return false;
  if (d.generationPath !== "script_only") return false;
  if (d.validationOutcome !== "generation_failed") return false;

  if (!isNonEmptyString(d.requestFingerprint)) return false;
  if (!isNonEmptyString(d.planFingerprint)) return false;
  if (!isNonEmptyString(d.strategyId)) return false;
  if (!isNonEmptyString(d.strategyVersion)) return false;

  const reason = d.fallbackReason;
  if (!isNonEmptyString(reason)) return false;
  if (!ACCEPTED.has(reason)) return false;

  return true;
}
