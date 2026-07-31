#!/usr/bin/env -S npx tsx
/**
 * Seal immutable same-digest forward authorization amendment without resetting ledger.
 */

import {
  appendHeadlessFlyStagingCleanupRuntimeRolloutForwardAuthorizationAmendment,
  buildHeadlessFlyStagingCleanupRuntimeProbeCredentialAuthorizationAmendment,
  countForwardAttemptsForDigest,
  loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  summarizeHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-attempt-budget-authority";
import { HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";

const footiebitzRoot = process.env.FOOTIEBITZ_ROOT ?? process.cwd();
const appName = process.argv[2] ?? "shortforge-hw-staging-4def8fa0";

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

const loaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
  footiebitzRoot,
  appName,
});
if (!loaded.ok) die(loaded.reasonId);

const used = countForwardAttemptsForDigest(
  loaded.state,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
);
if (used !== 1) die("incoherent_attempt_state");

try {
  const next = appendHeadlessFlyStagingCleanupRuntimeRolloutForwardAuthorizationAmendment({
    state: loaded.state,
    amendment: buildHeadlessFlyStagingCleanupRuntimeProbeCredentialAuthorizationAmendment({
      recordedAtIso: new Date().toISOString(),
    }),
  });
  persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
    footiebitzRoot,
    state: next,
  });
} catch (error) {
  die(error instanceof Error ? error.message : "authorization_amendment_failed");
}

const reloaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
  footiebitzRoot,
  appName,
});
if (!reloaded.ok) die(reloaded.reasonId);

const budget = summarizeHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
  state: reloaded.state,
  targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
});

console.log("authorization_amendment=PASS");
console.log(`forward_budget_used=${budget.used}`);
console.log(`forward_budget_limit=${budget.limit}`);
console.log(`forward_budget_remaining=${budget.remaining}`);
