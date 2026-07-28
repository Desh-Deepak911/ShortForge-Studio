/**
 * Sprint 11E Phase 2E.2D.8A — Fly render live matrix authority.
 * Run: npm run test:headless-fly-render-live-matrix-authority
 */

import assert from "node:assert/strict";

import {
  REQUIRED_FLY_RENDER_LIVE_CASE_IDS,
  assertExactRequiredFlyRenderLiveCasePrefixFailAuthority,
  createExactPassFlyRenderLiveCaseResults,
} from "../fly-render-live/required-cases";
import {
  DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
  createPassingFlyRenderLiveCaseRunners,
} from "../fly-render-live/live-matrix";
import { assertDefaultFlyRenderLiveRunnersAreNotStubs } from "../fly-render-live/stub-boundary";
import { buildFlyRenderLiveSchemaFingerprint } from "../fly-render-live/evidence-authority";
import { validatePassFlyRenderLiveEvidence } from "../fly-render-live/evidence-authority";
import {
  createNotTestedFlyRenderLiveEvidence,
} from "../fly-render-live/evidence";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "../fly-render-live/smoke-workload";
import { hostedRenderProcessTreeMemoryScope } from "../fly-render-live/process-tree-peak-memory";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8A — Fly render live matrix authority\n",
  );

  test("default runners are not stubs", () => {
    assert.equal(assertDefaultFlyRenderLiveRunnersAreNotStubs().ok, true);
  });

  test("canonical case order frozen at 25", () => {
    assert.deepEqual(REQUIRED_FLY_RENDER_LIVE_CASE_IDS.slice(0, 3), [
      "env.config",
      "fly.verify_machine_healthy",
      "fly.render_machine_healthy",
    ]);
    assert.deepEqual(
      REQUIRED_FLY_RENDER_LIVE_CASE_IDS.slice(-3),
      ["fly.verify_still_healthy", "cleanup.complete", "evidence.privacy"],
    );
  });

  test("prefix-FAIL authority pads NOT_TESTED after single FAIL", () => {
    const cases = createExactPassFlyRenderLiveCaseResults().map((c, i) =>
      i === 5
        ? {
            ...c,
            status: "FAIL" as const,
            failureCategory: "JOB_CREATE_QUEUED_FAILED",
            jobCreateFailureAttribution: {
              failureStage: "live_manifest_construction" as const,
              failureReasonId: "fixture_identity_incoherent" as const,
            },
          }
        : i > 5
          ? { caseId: c.caseId, status: "NOT_TESTED" as const }
          : c,
    );
    const auth = assertExactRequiredFlyRenderLiveCasePrefixFailAuthority(cases);
    assert.equal(auth.ok, true);
    if (auth.ok) assert.equal(auth.failedCaseId, "job.create_queued");
  });

  test("hostile PASS evidence fails closed", () => {
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    const fp = buildFlyRenderLiveSchemaFingerprint();
    const rejected = validatePassFlyRenderLiveEvidence({
      document: {
        ...createNotTestedFlyRenderLiveEvidence(),
        overall: "PASS",
        startedAtIso: "2026-07-22T19:19:50.847Z",
        endedAtIso: "2026-07-22T19:21:15.153Z",
        cases: createExactPassFlyRenderLiveCaseResults(),
        schemaFingerprint: fp,
        acceptedImageDigestSha256: "wrong",
        flyRenderTopology: { verifyCount: 1, renderCount: 1, observedRegion: "iad" },
        smokeWorkload: {
          profileId: smoke.profileId,
          contentDurationMs: smoke.contentDurationMs,
          pollTimeoutMs: smoke.pollTimeoutMs,
          claims4kCapacity: false,
        },
        resourceObservation: {
          scope: hostedRenderProcessTreeMemoryScope(),
          sampleIntervalMs: 250,
          peakProcessTreeRssBytes: null,
          observationDurationMs: 1000,
          unavailableReason: "non_linux_local_authority",
        },
        cleanupStatus: "ok",
        configAttribution: null,
        notes: ["postgresql://user:pass@host/db"],
      },
    });
    assert.equal(rejected.ok, false);
  });

  test("every required case has default and passing runners", () => {
    const passing = createPassingFlyRenderLiveCaseRunners();
    for (const id of REQUIRED_FLY_RENDER_LIVE_CASE_IDS) {
      assert.equal(typeof DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS[id], "function");
      assert.equal(typeof passing[id], "function");
    }
  });

  test("schema fingerprint uses seven migrations", () => {
    const fp = buildFlyRenderLiveSchemaFingerprint();
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
