/**
 * Sprint 11E Phase 2E.2D.8K — hosted 4K process-tree memory authority.
 * Run: npm run test:headless-fly-render-4k-process-tree-memory-authority
 */

import assert from "node:assert/strict";

import {
  CAPACITY_4K_OOM_SAFETY_RATIO,
  CAPACITY_4K_RENDER_VM_MEMORY_MB,
  CAPACITY_4K_VM_PEAK_RSS_CEILING_BYTES,
  evaluateCapacity4kProcessTreeHeadroom,
} from "../fly-render-4k-capacity/capacity-4k-headroom-authority";
import {
  assertIncomplete4kProcessTreeSamplingFailsClosed,
  detectNodeOnlyRssSubstitution,
  hosted4kProcessTreeMemoryScope,
  refuseNonProcMemoryAuthority,
  sampleHosted4kProcessTreeMemory,
  validateHosted4kProcessTreeMemoryObservation,
} from "../fly-render-4k-capacity/hosted-4k-process-tree-memory-observer";
import { buildFixturePassProcessTreeObservation } from "../fly-render-4k-capacity/capacity-4k-fixtures";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8K — Fly render 4K process-tree memory authority\n",
  );

  await test("4K scope is capacity authority and excludes node-only RSS", () => {
    const scope = hosted4kProcessTreeMemoryScope();
    assert.equal(scope.is4kCapacityAuthority, true);
    assert.equal(scope.notNodeRssAlone, true);
    assert.equal(scope.notFlyBillingMemory, true);
    assert.equal(scope.notLocalMacosRss, true);
    assert.ok(scope.includes.includes("chromium"));
    assert.ok(scope.includes.includes("ffmpeg"));
    assert.ok(scope.excludes.includes("observer_process"));
    assert.ok(scope.excludes.includes("ssh_session"));
  });

  await test("local macOS sampling is incomplete with explicit reason", () => {
    if (process.platform === "linux") {
      console.log("    (skipped on Linux CI — local authority path)");
      return;
    }
    const obs = sampleHosted4kProcessTreeMemory();
    assert.equal(obs.samplingComplete, false);
    assert.equal(obs.unavailableReason, "non_linux_local_authority");
    const incomplete = assertIncomplete4kProcessTreeSamplingFailsClosed(obs);
    assert.equal(incomplete.ok, false);
  });

  await test("refuse non-/proc memory authority off Linux", () => {
    if (process.platform === "linux") return;
    assert.equal(refuseNonProcMemoryAuthority(), true);
  });

  await test("node-only RSS substitution detected", () => {
    assert.equal(
      detectNodeOnlyRssSubstitution({
        nodeRssBytes: 100,
        reportedPeakBytes: 100,
      }),
      true,
    );
    assert.equal(
      detectNodeOnlyRssSubstitution({
        nodeRssBytes: 100,
        reportedPeakBytes: 500,
      }),
      false,
    );
  });

  await test("fixture pass observation validates", () => {
    const obs = buildFixturePassProcessTreeObservation();
    assert.equal(validateHosted4kProcessTreeMemoryObservation(obs).ok, true);
    const headroom = evaluateCapacity4kProcessTreeHeadroom({
      profileId: "4k-webm-30",
      peakProcessTreeRssBytes: obs.peakProcessTreeRssBytes,
      oomOrRestartObserved: false,
      samplingComplete: obs.samplingComplete,
    });
    assert.equal(headroom.verdict, "capacity_claim_justified");
    assert.equal(headroom.fullCapacityClaimJustified, true);
  });

  await test("frozen headroom rule from 8192 MB VM at 85% OOM safety", () => {
    assert.equal(CAPACITY_4K_RENDER_VM_MEMORY_MB, 8192);
    assert.equal(CAPACITY_4K_OOM_SAFETY_RATIO, 0.85);
    assert.equal(
      CAPACITY_4K_VM_PEAK_RSS_CEILING_BYTES,
      Math.floor(8192 * 1024 * 1024 * 0.85),
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
