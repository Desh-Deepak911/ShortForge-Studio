/**
 * Sprint 11E Phase 2E.2D.8K.4.1 — cadence authority.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { runAllCapacity4kSamplerCadenceSyncFixtures } from "./fly-render-4k-capacity/capacity-4k-sampler-cadence-fixtures";
import {
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K3,
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4,
} from "./fly-render-4k-capacity/capacity-4k-cleanup-recovery";
import { diagnoseHosted4kAccepted8k4GapFailure, HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4 } from "./fly-render-4k-capacity/hosted-4k-sampler-8k4-gap-diagnosis";
import {
  HOSTED_4K_NODE_SAMPLER_MECHANISM,
  HOSTED_4K_SHELL_SAMPLER_MECHANISM,
} from "./fly-render-4k-capacity/hosted-render-machine-node-sampler-core";
import {
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
} from "./fly-render-4k-capacity/hosted-render-machine-process-tree-cadence";
import { runHosted4kNodeSamplerLoadPreflight } from "./fly-render-4k-capacity/hosted-render-machine-node-sampler-load-preflight";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8K.4.1 — Fly render 4K process-tree sampler cadence authority\n",
  );

  await test("8K.4 FAIL evidence SHA frozen at cf84dd66", () => {
    const evidencePath = path.join(
      process.cwd(),
      "docs/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md",
    );
    const raw = readFileSync(evidencePath, "utf8");
    const sha = createHash("sha256").update(raw, "utf8").digest("hex");
    assert.equal(sha, HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4);
  });

  await test("8K.3 FAIL archive preserved at c40ce8a6", () => {
    const archivePath = path.join(
      process.cwd(),
      "docs/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.pre-8k3-c40ce8a6db89972c4f3e63cc735595f66fed33a0141899ccc81eb31614a40e03.md",
    );
    const raw = readFileSync(archivePath, "utf8");
    const sha = createHash("sha256").update(raw, "utf8").digest("hex");
    assert.equal(sha, FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K3);
  });

  await test("8K.4 gap diagnosed as shell subprocess overhead under peak load", () => {
    const d = diagnoseHosted4kAccepted8k4GapFailure();
    assert.equal(d.observedDistribution.maximumGapMs, 2910);
    assert.equal(d.priorMechanism, HOSTED_4K_SHELL_SAMPLER_MECHANISM);
    assert.equal(d.correctedMechanism, HOSTED_4K_NODE_SAMPLER_MECHANISM);
    assert.equal(d.executionCasesPassed, 33);
  });

  await test("frozen max gap remains 1000 ms", () => {
    assert.equal(HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS, 1_000);
    assert.equal(HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS, 400);
  });

  await test("all cadence sync fixtures pass", () => {
    for (const verdict of runAllCapacity4kSamplerCadenceSyncFixtures()) {
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  });

  await test("load preflight gate-off is NOT_TESTED", async () => {
    const result = await runHosted4kNodeSamplerLoadPreflight({ env: {} });
    assert.equal(result.overall, "NOT_TESTED");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
