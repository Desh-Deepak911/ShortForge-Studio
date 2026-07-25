/**
 * Sprint 11E Phase 2E.2D.7A — Fly verify live matrix authority (deterministic).
 * Run: npm run test:headless-fly-verify-live-harness-authority (shared with harness authority)
 */

import assert from "node:assert/strict";

import {
  REQUIRED_FLY_VERIFY_LIVE_CASE_IDS,
  createExactPassFlyVerifyLiveCaseResults,
} from "./fly-verify-live/required-cases";
import {
  DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS,
  createPassingFlyVerifyLiveCaseRunners,
} from "./fly-verify-live/live-matrix";
import { assertDefaultFlyVerifyLiveRunnersAreNotStubs } from "./fly-verify-live/stub-boundary";
import { buildFlyVerifyLiveSchemaFingerprint } from "./fly-verify-live/evidence-authority";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.7A — Fly verify live matrix authority\n",
  );

  test("default runners are not stubs", () => {
    const check = assertDefaultFlyVerifyLiveRunnersAreNotStubs();
    assert.equal(check.ok, true);
  });

  test("frozen registry has 20 cases in canonical order", () => {
    assert.deepEqual(REQUIRED_FLY_VERIFY_LIVE_CASE_IDS[0], "env.config");
    assert.deepEqual(
      REQUIRED_FLY_VERIFY_LIVE_CASE_IDS[REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length - 1],
      "evidence.privacy",
    );
    assert.equal(createExactPassFlyVerifyLiveCaseResults().length, 20);
  });

  test("every required case has a default runner", () => {
    for (const id of REQUIRED_FLY_VERIFY_LIVE_CASE_IDS) {
      assert.equal(typeof DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS[id], "function");
      assert.equal(typeof createPassingFlyVerifyLiveCaseRunners()[id], "function");
    }
  });

  test("schema fingerprint uses seven migrations", () => {
    const fp = buildFlyVerifyLiveSchemaFingerprint();
    assert.equal(fp.migrationIds.length, 7);
    assert.equal(fp.checksumPrefixes.every((p) => p.length === 12), true);
    assert.equal(
      fp.migrationIds[fp.migrationIds.length - 1],
      "007_headless_owned_object_slot_key_capacity",
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
