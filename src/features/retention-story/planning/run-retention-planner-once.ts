/**
 * Invoke the injected Retention planner AT MOST ONCE — Sprint 10D.
 *
 * Missing callback  → unavailable (0 attempts).
 * Throw / rejection → call_failed (1 attempt).
 * Non-object result → proposal_invalid (1 attempt).
 * Never retries, never silently downgrades to the Fast deterministic path.
 */

import type {
  RetentionPlannerCallback,
  RetentionPlannerRequest,
  RetentionPlannerRunOutcome,
} from "./retention-planner.types";

export async function runRetentionPlannerOnce(
  request: RetentionPlannerRequest,
  callback: RetentionPlannerCallback | null | undefined,
): Promise<RetentionPlannerRunOutcome> {
  if (typeof callback !== "function") {
    return { status: "unavailable", attempts: 0 };
  }

  let raw: unknown;
  try {
    raw = await callback(request);
  } catch {
    return { status: "call_failed", attempts: 1 };
  }

  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "proposal_invalid", attempts: 1 };
  }

  return { status: "ok", attempts: 1, proposal: raw };
}
