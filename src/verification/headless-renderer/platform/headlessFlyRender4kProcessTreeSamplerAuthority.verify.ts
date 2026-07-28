/**
 * Sprint 11E Phase 2E.2D.8K.2.1 — Machine-local process-tree sampler authority.
 * Run: npm run test:headless-fly-render-4k-process-tree-sampler-authority
 */

import assert from "node:assert/strict";
import { sha256FileSync } from "../../support/evidence-hash";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  diagnoseHosted4kSamplerFailureCause,
  runAllCapacity4kSamplerAsyncFixtures,
  runAllCapacity4kSamplerSyncFixtures,
} from "../fly-render-4k-capacity/capacity-4k-sampler-fixtures";
import {
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K1,
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K3,
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4,
} from "../fly-render-4k-capacity/capacity-4k-cleanup-recovery";
import {
  HOSTED_4K_NODE_SAMPLER_MECHANISM,
  HOSTED_4K_SHELL_SAMPLER_MECHANISM,
} from "../fly-render-4k-capacity/hosted-render-machine-node-sampler-core";
import { buildHosted4kNodeSamplerEmbeddedScript } from "../fly-render-4k-capacity/hosted-render-machine-node-sampler-script";
import {
  HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
} from "../fly-render-4k-capacity/hosted-render-machine-process-tree-cadence";
import {
  buildHosted4kMachineLocalProcessTreeSamplerCommand,
  buildHosted4kMachineLocalProcessTreeSamplerScript,
  LEGACY_PER_SAMPLE_FLY_ROUND_TRIP_MECHANISM,
  MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
  MACHINE_LOCAL_PERSISTENT_SAMPLER_MECHANISM,
  parseHosted4kMachineLocalProcessTreeSummaryStdout,
} from "../fly-render-4k-capacity/hosted-render-machine-process-tree-remote";
import {
  ABORT_BASED_LOCAL_FLY_CHILD_SHUTDOWN_MECHANISM,
  HOSTED_4K_RENDER_MACHINE_ID,
  HOSTED_4K_RENDER_MACHINE_SAMPLE_INTERVAL_MS,
} from "../fly-render-4k-capacity/hosted-render-machine-process-tree-sampler";
import { runFlyRender4kProcessTreeSamplerPreflight } from "../fly-render-4k-capacity/run-fly-render-4k-process-tree-sampler-preflight";

const OFFICIAL_8K1_FAIL_EVIDENCE_SHA = FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K1;
const OFFICIAL_8K4_FAIL_EVIDENCE_SHA = FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4;

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8K.3.1 — Fly render 4K process-tree sampler authority\n",
  );

  await test("8K.4 FAIL evidence SHA frozen at cf84dd66", () => {
    const sha = sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md");
    assert.equal(sha, OFFICIAL_8K4_FAIL_EVIDENCE_SHA);
  });

  await test("8K.3 FAIL archive preserved at c40ce8a6", () => {
    const sha = sha256FileSync("docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.pre-8k3-c40ce8a6db89972c4f3e63cc735595f66fed33a0141899ccc81eb31614a40e03.md");
    assert.equal(sha, FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K3);
  });

  await test("8K.1 FAIL archive preserved at a1475a6e", () => {
    const sha = sha256FileSync("docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.pre-8k1-a1475a6e3b329d9db8a7a51f8d0d0a31d6a56e7ebb4d631661d9dadee3280ee1.md");
    assert.equal(sha, OFFICIAL_8K1_FAIL_EVIDENCE_SHA);
  });

  await test("8K.4 cadence failure diagnosed as shell subprocess overhead", () => {
    const diagnosis = diagnoseHosted4kSamplerFailureCause();
    assert.equal(diagnosis.mechanism, HOSTED_4K_SHELL_SAMPLER_MECHANISM);
    assert.equal(diagnosis.correctedMechanism, HOSTED_4K_NODE_SAMPLER_MECHANISM);
    assert.equal(diagnosis.priorMaximumGapMs, 2910);
  });

  await test("corrected mechanism is node persistent in-process proc walk", () => {
    assert.equal(
      HOSTED_4K_NODE_SAMPLER_MECHANISM,
      "node_persistent_in_process_proc_walk",
    );
    assert.equal(
      MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
      "detached_machine_local_state_directory_lifecycle",
    );
  });

  await test("node sampler script avoids per-sample awk/sleep subprocesses", () => {
    const script = buildHosted4kNodeSamplerEmbeddedScript();
    assert.ok(!script.includes("awk "));
    assert.ok(!script.includes("sleep $(awk"));
    assert.ok(script.includes("setTimeout"));
  });

  await test("render machine id frozen at d895d16f264918", () => {
    assert.equal(HOSTED_4K_RENDER_MACHINE_ID, "d895d16f264918");
  });

  await test("Machine-local sampler script uses monotonic uptime and 250 ms loop", () => {
    const script = buildHosted4kMachineLocalProcessTreeSamplerScript({
      intervalMs: 250,
      durationMs: 10_000,
    });
    assert.ok(script.includes("mono_ms"));
    assert.ok(script.includes("INTERVAL_MS=250"));
    assert.ok(script.includes("emit_summary"));
    assert.ok(!script.includes("echo \"$cmd"));
  });

  await test("Machine-local command is one base64-wrapped sh -c exec", () => {
    const command = buildHosted4kMachineLocalProcessTreeSamplerCommand({
      intervalMs: 250,
      durationMs: 10_000,
    });
    assert.ok(command.startsWith("sh -c 'echo "));
    assert.ok(command.includes("| base64 -d | sh'"));
    assert.ok(!command.includes("--command"));
  });

  await test("summary parser accepts privacy-safe cadence fields", () => {
    const parsed = parseHosted4kMachineLocalProcessTreeSummaryStdout(
      '{"summary":true,"requested_interval_ms":250,"sample_count":40,"observation_duration_ms":10000,"average_interval_ms":256,"maximum_observed_gap_ms":312,"peak_summed_kb":163416,"last_summed_kb":163400,"malformed_sample_count":0,"worker_root_found":true,"observer_excluded":true,"worker_root_miss_count":0}\n',
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.summary.sampleCount, 40);
      assert.equal(parsed.summary.averageIntervalMs, 256);
      assert.equal(parsed.summary.maximumObservedGapMs, 312);
    }
  });

  await test("all sync sampler fixtures pass", () => {
    for (const verdict of runAllCapacity4kSamplerSyncFixtures()) {
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  });

  await test("all async sampler fixtures pass", async () => {
    for (const verdict of await runAllCapacity4kSamplerAsyncFixtures()) {
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  });

  await test("sampler preflight gate-off is NOT_TESTED", async () => {
    const result = await runFlyRender4kProcessTreeSamplerPreflight({ env: {} });
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.exitCode, 0);
  });

  await test("preflight acceptance requires at least 30 samples", () => {
    assert.equal(HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES, 30);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
