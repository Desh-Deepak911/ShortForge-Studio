/**
 * Sprint 11E Phase 2E.2D.8K.3.1 — detached sampler lifecycle authority.
 * Run: npm run test:headless-fly-render-4k-process-tree-sampler-lifecycle-authority
 */

import assert from "node:assert/strict";
import { sha256FileSync } from "../../support/evidence-hash";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  diagnoseHosted4kSamplerLifecycleFailureCause,
  runAllCapacity4kSamplerLifecycleAsyncFixtures,
  runAllCapacity4kSamplerLifecycleSyncFixtures,
} from "../fly-render-4k-capacity/capacity-4k-sampler-lifecycle-fixtures";
import {
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K1,
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K3,
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4,
} from "../fly-render-4k-capacity/capacity-4k-cleanup-recovery";
import {
  ABORT_BASED_LOCAL_FLY_CHILD_SHUTDOWN_MECHANISM,
  buildHosted4kDetachedSamplerStartCommand,
  buildHosted4kDetachedSamplerStartScriptBody,
  HOSTED_4K_SAMPLER_STATE_ROOT,
  MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
  MACHINE_LOCAL_NODE_SAMPLER_MECHANISM,
  parseHosted4kDetachedSamplerSummaryJson,
  runHosted4kDetachedSamplerLifecyclePreflight,
  validateHosted4kSamplerRunToken,
} from "../fly-render-4k-capacity/hosted-render-machine-process-tree-lifecycle";
import { buildHosted4kNodeSamplerEmbeddedScript } from "../fly-render-4k-capacity/hosted-render-machine-node-sampler-script";
import { HOSTED_4K_RENDER_MACHINE_ID } from "../fly-render-4k-capacity/hosted-render-machine-process-tree-sampler";

const OFFICIAL_8K4_FAIL_EVIDENCE_SHA =
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4;

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8K.3.1 — Fly render 4K process-tree sampler lifecycle authority\n",
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
    assert.equal(sha, FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K1);
  });

  await test("8K.3 shutdown failure diagnosed as abort-based local Fly child", () => {
    const diagnosis = diagnoseHosted4kSamplerLifecycleFailureCause();
    assert.equal(diagnosis.priorMechanism, ABORT_BASED_LOCAL_FLY_CHILD_SHUTDOWN_MECHANISM);
    assert.equal(
      diagnosis.correctedMechanism,
      MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
    );
  });

  await test("corrected mechanism uses node persistent in-process proc walk", () => {
    assert.equal(
      MACHINE_LOCAL_NODE_SAMPLER_MECHANISM,
      "node_persistent_in_process_proc_walk",
    );
  });

  await test("render machine id frozen at d895d16f264918", () => {
    assert.equal(HOSTED_4K_RENDER_MACHINE_ID, "d895d16f264918");
  });

  await test("run token allowlist rejects injection", () => {
    assert.equal(validateHosted4kSamplerRunToken("0123456789abcdef"), true);
    assert.equal(validateHosted4kSamplerRunToken("0123456789abcdef;rm"), false);
    assert.equal(validateHosted4kSamplerRunToken("../etc/passwd"), false);
  });

  await test("start command uses private state root and atomic summary rename", () => {
    const body = buildHosted4kDetachedSamplerStartScriptBody({
      runToken: "0123456789abcdef",
      intervalMs: 250,
    });
    const nodeScript = buildHosted4kNodeSamplerEmbeddedScript();
    assert.ok(body.includes(HOSTED_4K_SAMPLER_STATE_ROOT));
    assert.ok(body.includes("chmod 700"));
    assert.ok(body.includes("sampler.cjs"));
    assert.ok(nodeScript.includes("summary.json.partial"));
    assert.ok(nodeScript.includes('renameSync(tmp,fin)'));
    assert.ok(nodeScript.includes("stop.requested"));
    assert.ok(!body.includes("kill -TERM"));
    assert.ok(!nodeScript.includes("awk "));
  });

  await test("summary parser requires finalized true", () => {
    const parsed = parseHosted4kDetachedSamplerSummaryJson(
      '{"finalized":true,"summary_version":2,"measurement_class":"process_tree_memory","completeness_class":"complete","requested_interval_ms":250,"sample_count":40,"observation_duration_ms":10000,"average_interval_ms":250,"maximum_observed_gap_ms":300,"peak_summed_rss_bytes":170000000,"last_summed_rss_bytes":160000000,"malformed_sample_count":0,"worker_tree_correlation_class":"worker_tree_correlated","observer_excluded":true,"oom_or_restart_observed":false,"worker_root_miss_count":0}\n',
    );
    assert.equal(parsed.ok, true);
  });

  await test("all sync lifecycle fixtures pass", () => {
    for (const verdict of runAllCapacity4kSamplerLifecycleSyncFixtures()) {
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  });

  await test("all async lifecycle fixtures pass", async () => {
    for (const verdict of await runAllCapacity4kSamplerLifecycleAsyncFixtures()) {
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  });

  await test("lifecycle preflight gate-off is NOT_TESTED", async () => {
    const result = await runHosted4kDetachedSamplerLifecyclePreflight({ env: {} });
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.exitCode, 0);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
