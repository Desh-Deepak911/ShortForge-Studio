/**
 * Sprint 11E Phase 2C.1 — owned-object record validator + public view.
 * Run: npm run test:headless-owned-object-record
 */

import assert from "node:assert/strict";

import {
  HEADLESS_OWNED_OBJECT_RECORD_VERSION,
  toHeadlessPublicOwnedObjectView,
  validateHeadlessOwnedObjectRecord,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessOwnedObjectRecordV1 } from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DIGEST = `sha256:${"ab".repeat(32)}`;

function stagingBase(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
    objectId: "obj_1",
    ownerId: "owner_1",
    projectId: "project_1",
    jobId: "job_1",
    operationId: "op_1",
    purpose: "manifest",
    slotKey: null,
    provider: "r2",
    storeId: "assets",
    objectKey: "test/staging/assets/manifest/aaaa/bbbb/cccc/dddd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    createdAtMs: 1000,
    updatedAtMs: 1000,
    stage: "staging",
    expectedContentDigestClaim: DIGEST,
    expectedByteLength: 12,
    expectedMimeType: "application/json",
    uploadCapabilityIssuedAtMs: 1000,
    uploadCapabilityExpiresAtMs: 2000,
    uploadedObservedAtMs: null,
    verificationState: "unclaimed",
    verificationClaimToken: null,
    verificationClaimedAtMs: null,
    verifiedAtMs: null,
    expiresAtMs: 5000,
    contentDigest: null,
    byteLength: null,
    mimeType: null,
    finalizedMetadata: null,
    terminalReason: null,
    cleanupScheduledAtMs: null,
    ...overrides,
  };
}

function main() {
  console.log("\nSprint 11E Phase 2C.1 — owned-object record validation\n");

  test("accepts staging record and freezes", () => {
    const result = validateHeadlessOwnedObjectRecord(stagingBase());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.record.stage, "staging");
    assert.equal(Object.isFrozen(result.record), true);
  });

  test("accepts finalized with trusted facts matching claims", () => {
    const result = validateHeadlessOwnedObjectRecord(
      stagingBase({
        stage: "finalized",
        verificationState: "verified",
        verificationClaimToken: null,
        verificationClaimedAtMs: null,
        verifiedAtMs: 1500,
        expiresAtMs: 9000,
        contentDigest: DIGEST,
        byteLength: 12,
        mimeType: "application/json",
        finalizedMetadata: {
          verifiedBy: "full_object_stream",
          sourceStage: "staging",
        },
        terminalReason: null,
        cleanupScheduledAtMs: null,
      }),
    );
    assert.equal(result.ok, true);
  });

  test("rejects staging with trusted digest set", () => {
    const result = validateHeadlessOwnedObjectRecord(
      stagingBase({ contentDigest: DIGEST }),
    );
    assert.equal(result.ok, false);
  });

  test("rejects unknown fields / hostile proxy", () => {
    assert.equal(
      validateHeadlessOwnedObjectRecord(stagingBase({ extra: 1 })).ok,
      false,
    );
    const hostile = new Proxy(stagingBase(), {
      get() {
        throw new Error("boom https://evil");
      },
    });
    const result = validateHeadlessOwnedObjectRecord(hostile);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.message.includes("https://"), false);
  });

  test("rejects artifact purpose with assets storeId", () => {
    assert.equal(
      validateHeadlessOwnedObjectRecord(
        stagingBase({ purpose: "artifact", storeId: "assets" }),
      ).ok,
      false,
    );
  });

  test("public view never includes key/digest/provider", () => {
    const validated = validateHeadlessOwnedObjectRecord(stagingBase());
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const view = toHeadlessPublicOwnedObjectView(validated.record);
    assert.deepEqual(view, {
      objectId: "obj_1",
      purpose: "manifest",
      slotKey: null,
      stage: "pending",
      expiresAtMs: 5000,
    });
    const json = JSON.stringify(view);
    assert.equal(json.includes("objectKey"), false);
    assert.equal(json.includes("sha256"), false);
    assert.equal(json.includes("r2"), false);
  });

  test("public view maps finalized/rejected", () => {
    const fin = validateHeadlessOwnedObjectRecord(
      stagingBase({
        stage: "finalized",
        verificationState: "verified",
        verifiedAtMs: 1500,
        expiresAtMs: 9000,
        contentDigest: DIGEST,
        byteLength: 12,
        mimeType: "application/json",
        finalizedMetadata: {
          verifiedBy: "full_object_stream",
          sourceStage: "staging",
        },
      }),
    );
    assert.equal(fin.ok, true);
    if (!fin.ok) return;
    assert.equal(toHeadlessPublicOwnedObjectView(fin.record).stage, "ready");

    const rej = validateHeadlessOwnedObjectRecord(
      stagingBase({
        stage: "rejected",
        verificationState: "failed",
        terminalReason: "digest_mismatch",
        expiresAtMs: null,
      }),
    );
    assert.equal(rej.ok, true);
    if (!rej.ok) return;
    assert.equal(
      toHeadlessPublicOwnedObjectView(rej.record as HeadlessOwnedObjectRecordV1)
        .stage,
      "failed",
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
