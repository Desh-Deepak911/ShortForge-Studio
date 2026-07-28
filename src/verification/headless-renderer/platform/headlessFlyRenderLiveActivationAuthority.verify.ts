/**
 * Sprint 11E Phase 2E.2D.8A — Fly render activation + orchestrator authority.
 * Run: npm run test:headless-fly-render-live-activation-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  HEADLESS_FLY_RENDER_ACTIVATION_CONTRACT,
  HEADLESS_FLY_RENDER_ACTIVATION_PREREQUISITE_TOPOLOGY,
  HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY,
  HEADLESS_FLY_RENDER_QA_GATE_ENV,
  HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH,
  HEADLESS_FLY_STAGING_RENDER_FIRST_ORCHESTRATOR_CONTRACT,
  classifyHeadlessFlyRenderActivationGate,
  classifyHeadlessFlyRenderPostActivationTopology,
  classifyHeadlessFlyRenderPrerequisiteTopology,
  classifyHeadlessFlyRenderQaGateOnly,
  classifyHeadlessFlyRenderRollbackPreservesVerify,
  classifyHeadlessFlyStagingRenderFirstDryRun,
  classifyHeadlessFlyStagingRenderFirstInvokedPath,
  parseHeadlessFlyStagingDualMachineInventoryFromListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging";

const ROOT = path.resolve(__dirname, "../../../..");
const SCRIPTS = path.join(ROOT, "scripts/fly-staging");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function runRenderFirst(
  args: string[],
  env: Record<string, string>,
): { status: number | null; stdout: string } {
  const result = spawnSync(
    "sh",
    [path.join(SCRIPTS, "fly-staging-render-first.sh"), ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        FLY_STAGING_COMMON_DIR: SCRIPTS,
        HEADLESS_FLY_STAGING_ORG: "personal",
        HEADLESS_FLY_STAGING_PRIMARY_REGION: "iad",
        HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-fixture",
        HEADLESS_FLY_STAGING_IMAGE_REF:
          "registry.fly.io/app@sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
        ...env,
      },
    },
  );
  return {
    status: result.status,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8A — Fly render activation authority\n",
  );

  test("activation contract pins prerequisite verify=1 render=0", () => {
    assert.deepEqual(
      HEADLESS_FLY_RENDER_ACTIVATION_CONTRACT.prerequisiteTopology,
      HEADLESS_FLY_RENDER_ACTIVATION_PREREQUISITE_TOPOLOGY,
    );
    assert.deepEqual(
      HEADLESS_FLY_RENDER_ACTIVATION_CONTRACT.targetTopology,
      HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY,
    );
  });

  test("QA gate alone never authorizes activation", () => {
    const cls = classifyHeadlessFlyRenderQaGateOnly({
      [HEADLESS_FLY_RENDER_QA_GATE_ENV]: "1",
    });
    assert.equal(cls.reasonId, "qa_only");
    assert.equal(cls.activationAuthorized, false);
  });

  test("activation gate requires master + render_scale_up", () => {
    assert.equal(
      classifyHeadlessFlyRenderActivationGate({}).authorized,
      false,
    );
    assert.equal(
      classifyHeadlessFlyRenderActivationGate({
        HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED: "1",
        HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP: "1",
      }).authorized,
      true,
    );
  });

  test("render-before-verify rejected", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      {
        id: "abcd1234abcd1234",
        region: "iad",
        config: {
          metadata: { fly_process_group: "render" },
          guest: { cpu_kind: "performance", cpus: 4, memory_mb: 8192 },
        },
      },
    ]);
    const cls = classifyHeadlessFlyRenderPrerequisiteTopology(inv);
    assert.equal(cls.status, "invalid");
    assert.equal(cls.reasonId, "render_before_verify");
  });

  test("wrong region/spec rejected at post-activation", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      {
        id: "abcd1234abcd1234",
        region: "lhr",
        config: {
          metadata: { fly_process_group: "verify" },
          guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
          image:
            "registry@sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
        },
      },
      {
        id: "efgh5678efgh5678",
        region: "lhr",
        config: {
          metadata: { fly_process_group: "render" },
          guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
          image:
            "registry@sha256:ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
        },
      },
    ]);
    const cls = classifyHeadlessFlyRenderPostActivationTopology(inv);
    assert.equal(cls.status, "invalid");
  });

  test("render rollback preserves verify=1 render=0", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      {
        id: "abcd1234abcd1234",
        region: "iad",
        config: { metadata: { fly_process_group: "verify" } },
      },
    ]);
    const cls = classifyHeadlessFlyRenderRollbackPreservesVerify({
      destroyRenderOnly: true,
      destroyCommandsSucceeded: [true],
      renderDestroyCount: 1,
      finalInventory: inv,
    });
    assert.equal(cls.status, "ok");
    assert.equal(cls.reasonId, "ok_verify_preserved");
  });

  test("forbidden tmp wrapper rejected", () => {
    const cls = classifyHeadlessFlyStagingRenderFirstInvokedPath(
      ".tmp/run-2e2d8a-render-first.sh",
    );
    assert.equal(cls.status, "invalid");
    assert.equal(cls.reasonId, "forbidden_tmp_wrapper");
  });

  test("canonical entrypoint accepted", () => {
    const cls = classifyHeadlessFlyStagingRenderFirstInvokedPath(
      HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH,
    );
    assert.equal(cls.status, "ok");
  });

  test("dry-run orchestrator completes without provider fly", () => {
    const out = runRenderFirst(["--dry-run"], {
      HEADLESS_FLY_STAGING_DRY_RUN: "1",
    });
    assert.equal(out.status, 0);
    assert.match(out.stdout, /result=PASS/);
    const cls = classifyHeadlessFlyStagingRenderFirstDryRun({
      dryRun: true,
      invokedPath: HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH,
      logLines: out.stdout.split("\n"),
      providerFlyInvoked: false,
      rollbackRenderOnly: true,
      phasesReached: [
        "bootstrap",
        "read_only_readiness_pass",
        "local_preflight_pass",
        "render_scale_up_complete",
        "post_activation_inventory_proven",
        "render_runtime_observation_pass",
      ],
    });
    assert.equal(cls.status, "ok");
    assert.equal(cls.reasonId, "ok_dry_run_complete");
  });

  test("render-first shell exists and is canonical entrypoint", () => {
    const script = path.join(SCRIPTS, "fly-staging-render-first.sh");
    assert.match(
      readFileSync(script, "utf8"),
      /fly-staging-render-first/,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_RENDER_FIRST_ORCHESTRATOR_CONTRACT.entrypoint,
      HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
