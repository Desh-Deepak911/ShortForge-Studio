/**
 * Sprint 11E Phase 2E.2D.8K — hosted 4K capacity harness authority.
 * Run: npm run test:headless-fly-render-4k-capacity-harness-authority
 */

import assert from "node:assert/strict";
import { sha256FileSync } from "../../support/evidence-hash";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runFlyRender4kCapacityHarness } from "../fly-render-4k-capacity/run-fly-render-4k-capacity-harness";
import {
  createExactPassFlyRender4kCapacityCaseResults,
  REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS,
  countRequiredFlyRender4kCapacityProfileCases,
} from "../fly-render-4k-capacity/capacity-4k-required-cases";
import {
  createNotTestedFlyRender4kCapacityEvidence,
  writeFlyRender4kCapacityEvidence,
} from "../fly-render-4k-capacity/capacity-4k-evidence";
import {
  FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
  buildFlyRender4kCapacitySchemaFingerprint,
} from "../fly-render-4k-capacity/capacity-4k-evidence-authority";
import {
  buildCapacity4kShortFunctionalMatrixBoundaries,
  assertCapacity4kShortSmokeDoesNotInferOperationalCapacity,
} from "../fly-render-4k-capacity/capacity-4k-workload";
import {
  HEADLESS_FLY_RENDER_4K_QA_GATE_ENV,
  isFlyRender4kCapacityGateOn,
} from "../fly-render-4k-capacity/capacity-4k-qa-gate";
import { runAllCapacity4kFailClosedFixtures } from "../fly-render-4k-capacity/capacity-4k-fixtures";
import { assertCapacity4kProfileAuditFrozen } from "../fly-render-4k-capacity/capacity-4k-profile-audit";
import {
  CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_FRAMES,
  CAPACITY_4K_SHORT_FUNCTIONAL_PADDING_TAIL_FRAMES,
  CAPACITY_4K_SHORT_FUNCTIONAL_RENDERED_FRAMES,
} from "../fly-render-4k-capacity/capacity-4k-frame-plan-authority";

const OFFICIAL_RENDER_LIVE_PASS_SHA =
  "f808db98a4925057e235dbda9f212232959b66089d4bce1e0476e52f9468f693";

const OFFICIAL_4K_CAPACITY_FAIL_SHA_8K1 =
  "a1475a6e3b329d9db8a7a51f8d0d0a31d6a56e7ebb4d631661d9dadee3280ee1";

const OFFICIAL_4K_CAPACITY_FAIL_SHA_8K3 =
  "c40ce8a6db89972c4f3e63cc735595f66fed33a0141899ccc81eb31614a40e03";

const OFFICIAL_4K_CAPACITY_FAIL_SHA_8K4 =
  "cf84dd669c28a469b38107393fead005029d5d6660267c4a4dda813e1e79d63e";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8K — Fly render 4K capacity harness authority\n",
  );

  await test("gate-off preserves evidence and makes zero provider connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fr4k-gate-off-"));
    const evidencePath = path.join(dir, "evidence.md");
    const prior = createNotTestedFlyRender4kCapacityEvidence();
    writeFlyRender4kCapacityEvidence({ evidencePath, document: prior });
    const before = readFileSync(evidencePath, "utf8");
    const result = await runFlyRender4kCapacityHarness({
      env: {},
      evidencePath,
      forceGateOn: false,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(readFileSync(evidencePath, "utf8"), before);
    rmSync(dir, { recursive: true, force: true });
  });

  await test("4K gate is separate from render-live QA gate", () => {
    assert.equal(HEADLESS_FLY_RENDER_4K_QA_GATE_ENV, "HEADLESS_FLY_RENDER_4K_QA");
    assert.equal(isFlyRender4kCapacityGateOn({ HEADLESS_FLY_RENDER_QA: "1" }), false);
    assert.equal(isFlyRender4kCapacityGateOn({ HEADLESS_FLY_RENDER_4K_QA: "1" }), true);
  });

  await test("accepted image digest matches staging authority 7a97f472", () => {
    assert.equal(
      FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
      "7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794",
    );
  });

  await test("frozen short matrix has 35 cases covering both 4K profiles", () => {
    assert.equal(REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.length, 35);
    assert.equal(countRequiredFlyRender4kCapacityProfileCases("4k.webm"), 13);
    assert.equal(countRequiredFlyRender4kCapacityProfileCases("4k.mp4"), 13);
    assert.ok(
      REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.includes("4k.webm.job.create_queued"),
    );
    assert.ok(
      REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.includes("4k.mp4.replay.idempotent"),
    );
    assert.equal(createExactPassFlyRender4kCapacityCaseResults().length, 35);
  });

  await test("short functional frame plan is 60/72/12 and does not infer operational capacity", () => {
    const boundaries = buildCapacity4kShortFunctionalMatrixBoundaries();
    assert.equal(boundaries.length, 2);
    for (const b of boundaries) {
      assert.equal(b.framePlan.contentFrames, CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_FRAMES);
      assert.equal(b.framePlan.renderedFrames, CAPACITY_4K_SHORT_FUNCTIONAL_RENDERED_FRAMES);
      assert.equal(b.framePlan.paddingTailFrames, CAPACITY_4K_SHORT_FUNCTIONAL_PADDING_TAIL_FRAMES);
      const smokeCheck = assertCapacity4kShortSmokeDoesNotInferOperationalCapacity(b);
      assert.equal(smokeCheck.ok, true);
    }
  });

  await test("4K profile audit frozen", () => {
    assert.equal(assertCapacity4kProfileAuditFrozen().ok, true);
  });

  await test("schema fingerprint builds from required migrations", () => {
    const fp = buildFlyRender4kCapacitySchemaFingerprint();
    assert.ok(fp.migrationIds.length >= 7);
    assert.equal(fp.migrationIds.length, fp.checksumPrefixes.length);
  });

  await test("all fail-closed fixtures pass", () => {
    for (const verdict of runAllCapacity4kFailClosedFixtures()) {
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  });

  await test("official 720p render-live PASS evidence byte-identical", () => {
    const sha = sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md");
    assert.equal(sha, OFFICIAL_RENDER_LIVE_PASS_SHA);
  });

  await test("official 8K.1 4K capacity FAIL archive byte-identical", () => {
    const sha = sha256FileSync("docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.pre-8k1-a1475a6e3b329d9db8a7a51f8d0d0a31d6a56e7ebb4d631661d9dadee3280ee1.md");
    assert.equal(sha, OFFICIAL_4K_CAPACITY_FAIL_SHA_8K1);
  });

  await test("official 8K.3 4K capacity FAIL archive byte-identical", () => {
    const sha = sha256FileSync("docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.pre-8k3-c40ce8a6db89972c4f3e63cc735595f66fed33a0141899ccc81eb31614a40e03.md");
    assert.equal(sha, OFFICIAL_4K_CAPACITY_FAIL_SHA_8K3);
  });

  await test("official 8K.4 4K capacity FAIL evidence byte-identical", () => {
    const sha = sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md");
    assert.equal(sha, OFFICIAL_4K_CAPACITY_FAIL_SHA_8K4);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
