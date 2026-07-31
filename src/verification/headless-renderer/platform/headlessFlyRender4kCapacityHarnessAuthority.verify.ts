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
  classifyCurrentFlyStagingImageEligibility,
  classifyFlyStagingImagePageArtifactEligibility,
  classifyFlyStagingImageWorkerArtifactEligibility,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
  resolveCurrentFlyStagingAcceptedImageRecord,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
  buildFlyRender4kCapacitySchemaFingerprint,
} from "../fly-render-4k-capacity/capacity-4k-evidence-authority";
import {
  buildCapacity4kShortFunctionalMatrixBoundaries,
  assertCapacity4kShortSmokeDoesNotInferOperationalCapacity,
} from "../fly-render-4k-capacity/capacity-4k-workload";
import { FLY_RENDER_4K_SHORT_FUNCTIONAL_PASS_EVIDENCE_SHA } from "../fly-render-4k-capacity/capacity-4k-operational-evidence-authority";
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

const SEVEN_MIGRATION_IDS =
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_CURRENT_IMAGE_RECORD
    .schemaFingerprint.migrationIds;

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

  await test("4K harness resolves schema-008 bridge staging image through canonical authority", () => {
    const current = resolveCurrentFlyStagingAcceptedImageRecord();
    assert.equal(current.recordId, "post_007_2g24e_bridge008_rollback_bridge");
    assert.equal(current.lifecycle, "current");
    assert.equal(
      FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
      resolveCurrentFlyStagingAcceptedImageDigestSha256(),
    );
    assert.equal(
      FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    );
    assert.notEqual(
      FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.notEqual(
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_BUILD_INFO_SHA256,
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    );
  });

  await test("8I.5 historical image digest is ineligible for current staging readiness", () => {
    const result = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(result.eligible, false);
    if (!result.eligible) {
      assert.equal(result.reasonId, "historical_lifecycle_not_current_ready");
    }
  });

  await test("2G.24 current image bindings accept canonical worker and page artifacts", () => {
    const worker = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      hostedWorkerArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256,
    });
    assert.equal(worker.ok, true);
    const page = classifyFlyStagingImagePageArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      hostedPageArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
    });
    assert.equal(page.ok, true);
  });

  await test("wrong worker and page artifact bindings fail closed for current image", () => {
    const wrongWorker = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      hostedWorkerArtifactSha256: "0".repeat(64),
    });
    assert.equal(wrongWorker.ok, false);
    if (!wrongWorker.ok) {
      assert.equal(wrongWorker.reasonId, "wrong_hosted_worker_artifact");
    }
    const wrongPage = classifyFlyStagingImagePageArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      hostedPageArtifactSha256: "0".repeat(64),
    });
    assert.equal(wrongPage.ok, false);
    if (!wrongPage.ok) {
      assert.equal(wrongPage.reasonId, "wrong_hosted_page_artifact");
    }
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

  await test("official 8K.4 4K capacity FAIL archive byte-identical", () => {
    const sha = sha256FileSync(
      "docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.pre-8k4-cf84dd669c28a469b38107393fead005029d5d6660267c4a4dda813e1e79d63e.md",
    );
    assert.equal(sha, OFFICIAL_4K_CAPACITY_FAIL_SHA_8K4);
  });

  await test("official 4K short functional PASS evidence byte-identical", () => {
    const sha = sha256FileSync(
      "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md",
    );
    assert.equal(sha, FLY_RENDER_4K_SHORT_FUNCTIONAL_PASS_EVIDENCE_SHA);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
