/**
 * Sprint 11E Phase 2E.2D.8A — Fly render live harness authority.
 * Run: npm run test:headless-fly-render-live-harness-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runFlyRenderLiveHarness } from "./fly-render-live/run-fly-render-live-harness";
import {
  createExactPassFlyRenderLiveCaseResults,
  REQUIRED_FLY_RENDER_LIVE_CASE_IDS,
  assertExactRequiredFlyRenderLiveCasePassAuthority,
} from "./fly-render-live/required-cases";
import { validatePassFlyRenderLiveEvidence } from "./fly-render-live/evidence-authority";
import {
  createNotTestedFlyRenderLiveEvidence,
  parseFlyRenderLiveEvidenceMarkdown,
  renderFlyRenderLiveEvidenceMarkdown,
  writeFlyRenderLiveEvidence,
} from "./fly-render-live/evidence";
import { createPassingFlyRenderLiveCaseRunners } from "./fly-render-live/live-matrix";
import { assertDefaultFlyRenderLiveRunnersAreNotStubs } from "./fly-render-live/stub-boundary";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./fly-render-live/smoke-workload";
import { hostedRenderProcessTreeMemoryScope } from "./fly-render-live/process-tree-peak-memory";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8A — Fly render live harness authority\n",
  );

  await test("gate-off preserves evidence and makes zero provider connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "frl-gate-off-"));
    const evidencePath = path.join(dir, "evidence.md");
    const prior = createNotTestedFlyRenderLiveEvidence();
    writeFlyRenderLiveEvidence({ evidencePath, document: prior });
    const before = readFileSync(evidencePath, "utf8");
    const result = await runFlyRenderLiveHarness({
      env: {},
      evidencePath,
      forceGateOn: false,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(readFileSync(evidencePath, "utf8"), before);
    rmSync(dir, { recursive: true, force: true });
  });

  await test("default runners are not stubs", () => {
    const check = assertDefaultFlyRenderLiveRunnersAreNotStubs();
    assert.equal(check.ok, true);
  });

  await test("frozen registry has 25 cases ending with evidence.privacy", () => {
    assert.equal(REQUIRED_FLY_RENDER_LIVE_CASE_IDS.length, 25);
    assert.equal(REQUIRED_FLY_RENDER_LIVE_CASE_IDS[0], "env.config");
    assert.equal(
      REQUIRED_FLY_RENDER_LIVE_CASE_IDS[24],
      "evidence.privacy",
    );
    assert.equal(createExactPassFlyRenderLiveCaseResults().length, 25);
  });

  await test("smoke boundary is 720p not 4K", () => {
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    assert.equal(smoke.claims4kCapacity, false);
    assert.equal(smoke.claimsHostedCapacity, false);
    assert.equal(smoke.profileId, "720p-webm-30");
    assert.equal(smoke.pollTimeoutMs, 180_000);
  });

  await test("process-tree scope excludes node-only RSS authority", () => {
    const scope = hostedRenderProcessTreeMemoryScope();
    assert.equal(scope.notNodeRssAlone, true);
    assert.equal(scope.not4kCapacityAuthority, true);
    assert.ok(scope.includes.includes("chromium"));
    assert.ok(scope.includes.includes("ffmpeg"));
  });

  await test("pass evidence authority rejects hostile overall", () => {
    const cases = createExactPassFlyRenderLiveCaseResults();
    const membership = assertExactRequiredFlyRenderLiveCasePassAuthority(cases);
    assert.equal(membership.ok, true);
    const rejected = validatePassFlyRenderLiveEvidence({
      document: {
        ...createNotTestedFlyRenderLiveEvidence(),
        overall: "FAIL",
        cases,
      },
    });
    assert.equal(rejected.ok, false);
  });

  await test("every required case has a passing stub runner", () => {
    const runners = createPassingFlyRenderLiveCaseRunners();
    for (const id of REQUIRED_FLY_RENDER_LIVE_CASE_IDS) {
      assert.equal(typeof runners[id], "function");
    }
  });

  await test("NOT_TESTED evidence parses", () => {
    const doc = createNotTestedFlyRenderLiveEvidence();
    const md = renderFlyRenderLiveEvidenceMarkdown(doc);
    const parsed = parseFlyRenderLiveEvidenceMarkdown(md);
    assert.equal(parsed?.overall, "NOT_TESTED");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
