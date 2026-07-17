/**
 * Request/plan preflight — Sprint 7D.
 * Stale or mismatched pairs must never enter candidate or fallback construction.
 */

import type { HookPlan, NormalizedHookRequest } from "./hook-contract.types";
import {
  assertHookPlanFingerprint,
  assertHookRequestFingerprint,
} from "./hook-fingerprint";

export class HookRequestPlanMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HookRequestPlanMismatchError";
  }
}

/**
 * Verify fingerprints and request↔plan identity before any candidate/fallback work.
 */
export function assertRequestPlanCoherence(
  request: NormalizedHookRequest,
  plan: HookPlan,
): void {
  assertHookRequestFingerprint(request);
  assertHookPlanFingerprint(plan);

  if (request.requestFingerprint !== plan.requestFingerprint) {
    throw new HookRequestPlanMismatchError(
      "Hook request/plan rejected: requestFingerprint mismatch. Stale plans must not enter fallback.",
    );
  }
}
