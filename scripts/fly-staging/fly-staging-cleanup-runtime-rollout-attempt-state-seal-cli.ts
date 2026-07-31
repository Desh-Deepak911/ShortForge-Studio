#!/usr/bin/env -S npx tsx
/**
 * Seal recovered Part B incident attempt state for persistent forward budget enforcement.
 */

import {
  persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-attempt-budget-authority";

const appName = process.argv[2] ?? "shortforge-hw-staging-4def8fa0";
const footiebitzRoot = process.env.FOOTIEBITZ_ROOT ?? process.cwd();

const state = sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({ appName });
persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
  footiebitzRoot,
  state,
});
console.log("attempt_state_sealed=PASS");
console.log(`forward_attempts_rejected_digest=${state.entries.filter((e) => e.kind === "forward" && e.targetDigestSha256.startsWith("9570e9d9")).length}`);
