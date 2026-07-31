#!/usr/bin/env -S npx tsx
/**
 * Persistent cleanup-runtime rollout forward-attempt budget gate for shell orchestrators.
 */

import {
  appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry,
  classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget,
  loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  summarizeHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-attempt-budget-authority";
import { classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";

const [command, ...rest] = process.argv.slice(2);
const footiebitzRoot = process.env.FOOTIEBITZ_ROOT ?? process.cwd();

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

function requireArg(index: number): string {
  const value = rest[index];
  if (typeof value !== "string" || value.length === 0) die("hostile_input");
  return value;
}

switch (command) {
  case "assert-forward-budget": {
    const appName = requireArg(0);
    const targetDigest = requireArg(1);
    const newAuth = process.env.HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_NEW_TARGET_AUTHORIZATION === "1";
    const amendedAuth =
      process.env.HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_AMENDED_FORWARD_AUTHORIZATION ===
      "1";
    const rejected = classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility({
      imageDigestSha256: targetDigest,
    });
    if (!rejected.deployable) {
      console.log(`forward_budget=BLOCKED reason=${rejected.reasonId}`);
      die(rejected.reasonId);
    }
    const loaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot,
      appName,
    });
    const budget = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state: loaded.ok ? loaded.state : null,
      appName,
      targetDigestSha256: targetDigest,
      newTargetAuthorizationPresent: newAuth,
      amendedForwardAuthorizationPresent: amendedAuth,
    });
    if (!budget.ok) {
      console.log(`forward_budget=BLOCKED reason=${budget.reasonId}`);
      die(budget.reasonId);
    }
    if (loaded.ok) {
      const summary = summarizeHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
        state: loaded.state,
        targetDigestSha256: targetDigest,
      });
      console.log(`forward_budget_remaining=${summary.remaining}`);
    }
    console.log("forward_budget=PASS");
    break;
  }
  case "record-forward": {
    const appName = requireArg(0);
    const targetDigest = requireArg(1);
    const acceptancePassed = requireArg(2) === "1";
    const loaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot,
      appName,
    });
    if (!loaded.ok) die(loaded.reasonId);
    const forwardCount =
      loaded.state.entries.filter((entry) => entry.kind === "forward").length + 1;
    const next = appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry({
      state: loaded.state,
      entry: {
        kind: "forward",
        targetDigestSha256: targetDigest,
        sequence: forwardCount,
        recordedAtIso: new Date().toISOString(),
        deployPerformed: true,
        acceptancePassed,
        protocolDeviation: forwardCount > 1,
        sanitizedNote: "orchestrator_record_forward",
      },
    });
    persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot,
      state: next,
    });
    console.log("forward_attempt_recorded=PASS");
    break;
  }
  case "record-rollback": {
    const appName = requireArg(0);
    const targetDigest = requireArg(1);
    const loaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot,
      appName,
    });
    if (!loaded.ok) die(loaded.reasonId);
    const rollbackCount =
      loaded.state.entries.filter((entry) => entry.kind === "rollback").length + 1;
    const next = appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry({
      state: loaded.state,
      entry: {
        kind: "rollback",
        targetDigestSha256: targetDigest,
        sequence: rollbackCount,
        recordedAtIso: new Date().toISOString(),
        deployPerformed: true,
        acceptancePassed: true,
        protocolDeviation: false,
        sanitizedNote: "orchestrator_record_rollback",
      },
    });
    persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot,
      state: next,
    });
    console.log("rollback_attempt_recorded=PASS");
    break;
  }
  default:
    die("hostile_input");
}
