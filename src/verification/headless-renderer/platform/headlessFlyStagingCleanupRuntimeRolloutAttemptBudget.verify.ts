/**
 * Persistent cleanup-runtime rollout attempt budget authority fixtures.
 * Run: npm run test:headless-fly-staging-cleanup-runtime-rollout-attempt-budget
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD,
  buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentLedger,
  summarizeHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentTotals,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-incident-authority";
import {
  appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry,
  appendHeadlessFlyStagingCleanupRuntimeRolloutForwardAuthorizationAmendment,
  buildHeadlessFlyStagingCleanupRuntimeProbeCredentialAuthorizationAmendment,
  classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget,
  countForwardAttemptsForDigest,
  loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState,
  summarizeHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-attempt-budget-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
  isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import { classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";

const APP = "shortforge-hw-staging-4def8fa0";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nCleanup-runtime rollout attempt budget authority\n");

  await test("incident ledger reconciles forward/rollback/manual counts", () => {
    const totals = summarizeHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentTotals();
    assert.equal(
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD.actualForwardCleanupDeploymentCount,
      3,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD.actualBridgeRollbackDeploymentCount,
      4,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD.actualManualBridgeRecoveryDeploymentCount,
      1,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD.preflightOnlyContactCount,
      1,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD.authorizedForwardLimit,
      1,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD.protocolCompliance,
      "deviated",
    );
    assert.equal(totals.forwardAttempts, 3);
    assert.equal(totals.rollbackAttempts, 4);
    assert.equal(totals.protocolDeviations, 3);
    assert.equal(buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentLedger().length, 8);
  });

  await test("rejected digest is permanently undeployable", () => {
    const gate = classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    });
    assert.equal(gate.deployable, false);
    if (!gate.deployable) {
      assert.equal(gate.reasonId, "rejected_cleanup_runtime_digest");
    }
    const budget = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state: sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({ appName: APP }),
      appName: APP,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    });
    assert.equal(budget.ok, false);
    if (!budget.ok) assert.equal(budget.reasonId, "rejected_target_digest");
  });

  await test("persistent state survives reload and blocks second forward for same digest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fly-rollout-budget-"));
    try {
      const sealed = sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({
        appName: APP,
      });
      persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
        footiebitzRoot: root,
        state: sealed,
      });
      const loaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
        footiebitzRoot: root,
        appName: APP,
      });
      assert.equal(loaded.ok, true);
      if (!loaded.ok) return;
      assert.equal(
        countForwardAttemptsForDigest(
          loaded.state,
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
        ),
        3,
      );
      const blocked = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
        state: loaded.state,
        appName: APP,
        targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
      });
      assert.equal(blocked.ok, false);
      if (!blocked.ok) {
        assert.ok(
          blocked.reasonId === "forward_budget_exhausted" ||
            blocked.reasonId === "rejected_target_digest",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test("script rerun after laptop restart reloads same budget", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fly-rollout-budget-"));
    try {
      persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
        footiebitzRoot: root,
        state: sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({ appName: APP }),
      });
      const first = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
        footiebitzRoot: root,
        appName: APP,
      });
      const second = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
        footiebitzRoot: root,
        appName: APP,
      });
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      if (!first.ok || !second.ok) return;
      assert.deepEqual(first.state.entries, second.state.entries);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test("replacement digest requires explicit authorization before first forward", () => {
    const state = sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({ appName: APP });
    const blocked = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state,
      appName: APP,
      targetDigestSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      newTargetAuthorizationPresent: false,
    });
    assert.equal(blocked.ok, true);
  });

  await test("replacement digest with real authority requires rollout authorization flag", () => {
    const state = sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({ appName: APP });
    const blocked = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state,
      appName: APP,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      newTargetAuthorizationPresent: false,
    });
    if (
      isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest(
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      )
    ) {
      assert.equal(blocked.ok, true);
      return;
    }
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.reasonId, "new_target_digest_requires_new_authorization");
    }
  });

  await test("missing attempt state fails closed after known deployment", () => {
    const gate = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state: null,
      appName: APP,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      forwardDeployKnownCompleted: true,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.reasonId, "forward_after_known_deployment_without_state");
    }
  });

  await test("authorization amendment allows one additional forward and refuses third", () => {
    const loaded = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot: process.cwd(),
      appName: APP,
    });
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    let state = appendHeadlessFlyStagingCleanupRuntimeRolloutForwardAuthorizationAmendment({
      state: loaded.state,
      amendment: buildHeadlessFlyStagingCleanupRuntimeProbeCredentialAuthorizationAmendment({
        recordedAtIso: "2026-07-31T13:50:00.000Z",
      }),
    });
    const blocked = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state,
      appName: APP,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      amendedForwardAuthorizationPresent: false,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.reasonId, "amended_forward_authorization_required");
    }
    const allowed = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state,
      appName: APP,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      amendedForwardAuthorizationPresent: true,
    });
    assert.equal(allowed.ok, true);
    const summary = summarizeHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
    });
    assert.equal(summary.used, 1);
    assert.equal(summary.limit, 2);
    assert.equal(summary.remaining, 1);
    state = appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry({
      state,
      entry: {
        kind: "forward",
        targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
        sequence: 5,
        recordedAtIso: new Date().toISOString(),
        deployPerformed: true,
        acceptancePassed: true,
        protocolDeviation: false,
        sanitizedNote: "fixture_second_forward",
      },
    });
    const exhausted = classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget({
      state,
      appName: APP,
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      amendedForwardAuthorizationPresent: true,
    });
    assert.equal(exhausted.ok, false);
    if (!exhausted.ok) assert.equal(exhausted.reasonId, "forward_budget_exhausted");
  });

  await test("rollback entries do not consume forward budget", () => {
    let state = sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState({ appName: APP });
    state = appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry({
      state,
      entry: {
        kind: "rollback",
        targetDigestSha256: "7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206",
        sequence: 99,
        recordedAtIso: new Date().toISOString(),
        deployPerformed: true,
        acceptancePassed: true,
        protocolDeviation: false,
        sanitizedNote: "fixture",
      },
    });
    assert.equal(
      countForwardAttemptsForDigest(
        state,
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
      ),
      3,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
