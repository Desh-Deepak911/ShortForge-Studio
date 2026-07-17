/**
 * Choose pre-rewrite vs post-rewrite Hook-bridge assertion — Sprint 10F.2.
 */

import { assertRetentionHookBridgeReadyCoherence } from "../integration/assert-retention-hook-bridge-ready-coherence";
import type { RetentionHookBridgeReadyResult } from "../integration/assert-retention-hook-bridge-ready-coherence";
import type { AssertRetentionHookBridgeReadyContext } from "../integration/assert-retention-hook-bridge-ready-coherence";
import { RetentionValidationError } from "../validation/retention-validation-errors";
import { assertRetentionHookBridgePostRewriteCoherence } from "./assert-retention-hook-bridge-post-rewrite-coherence";

function rewriteCountFromBridge(bridge: unknown): number | null {
  if (bridge == null || typeof bridge !== "object" || Array.isArray(bridge)) {
    return null;
  }
  const diagnostics = (bridge as { diagnostics?: unknown }).diagnostics;
  if (
    diagnostics == null ||
    typeof diagnostics !== "object" ||
    Array.isArray(diagnostics)
  ) {
    return null;
  }
  const budget = (diagnostics as { budget?: unknown }).budget;
  if (budget == null || typeof budget !== "object" || Array.isArray(budget)) {
    return null;
  }
  const counts = (budget as { counts?: unknown }).counts;
  if (counts == null || typeof counts !== "object" || Array.isArray(counts)) {
    return null;
  }
  const rewrite = (counts as { retention_body_rewrite?: unknown })
    .retention_body_rewrite;
  return typeof rewrite === "number" && Number.isInteger(rewrite) ? rewrite : null;
}

/**
 * Assert ready (rewrite === 0) or post-rewrite (rewrite === 1) Hook bridge.
 */
export function assertRetentionHookBridgeForValidation(
  bridge: unknown,
  context: AssertRetentionHookBridgeReadyContext,
): RetentionHookBridgeReadyResult {
  const rewriteCount = rewriteCountFromBridge(bridge);
  if (rewriteCount === 0) {
    return assertRetentionHookBridgeReadyCoherence(bridge, context);
  }
  if (rewriteCount === 1) {
    return assertRetentionHookBridgePostRewriteCoherence(bridge, context);
  }
  throw new RetentionValidationError(
    "hook_bridge_coherence_mismatch",
    "Retention Hook bridge rewrite count is not a valid validation boundary.",
  );
}
