/**
 * Sprint 11E Phase 2C.1A — owned-object SQL row mapper.
 * Run: npm run test:headless-owned-object-sql-mapper
 */

import assert from "node:assert/strict";

import {
  HEADLESS_OWNED_OBJECT_SELECT_COLUMNS,
  HEADLESS_OWNED_OBJECT_SELECT_SQL,
  mapHeadlessOwnedObjectSqlRow,
} from "@/features/headless-renderer/control-plane/services/map-headless-owned-object-sql-row";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DIGEST = `sha256:${"cd".repeat(32)}`;
const OBJECT_KEY =
  "test/staging/assets/manifest/aa/bb/cc/dd/none/ffffffffffffffffffffffffffffffff";

function stagingRow(overrides: Record<string, unknown> = {}) {
  return {
    object_id: "obj_m",
    owner_id: "owner_1",
    project_id: "project_1",
    job_id: "job_1",
    operation_id: "op_1",
    purpose: "manifest",
    slot_key: null,
    stage: "staging",
    store_id: "assets",
    object_key: OBJECT_KEY,
    store_version: "1",
    expected_content_digest_claim: DIGEST,
    expected_byte_length: "10",
    expected_mime_type: "application/json",
    content_digest: null,
    byte_length: null,
    mime_type: null,
    upload_capability_issued_at_ms: "1000",
    upload_capability_expires_at_ms: "100000",
    uploaded_observed_at_ms: null,
    verification_state: "unclaimed",
    verification_claim_token: null,
    verification_claimed_at_ms: null,
    verified_at_ms: null,
    expires_at_ms: "9000000",
    finalized_metadata: null,
    terminal_reason: null,
    cleanup_scheduled_at_ms: null,
    created_at_ms: "1000",
    updated_at_ms: "1000",
    ...overrides,
  };
}

function main() {
  console.log("\nSprint 11E Phase 2C.1A — owned-object SQL mapper\n");

  test("explicit select columns — never *", () => {
    assert.ok(!HEADLESS_OWNED_OBJECT_SELECT_SQL.includes("*"));
    assert.ok(HEADLESS_OWNED_OBJECT_SELECT_COLUMNS.includes("object_id"));
    assert.ok(HEADLESS_OWNED_OBJECT_SELECT_COLUMNS.includes("store_version"));
  });

  test("maps staging row with bigint strings", () => {
    const mapped = mapHeadlessOwnedObjectSqlRow(stagingRow());
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.stored.storeVersion, 1);
    assert.equal(mapped.stored.record.stage, "staging");
    assert.equal(mapped.stored.record.provider, "r2");
  });

  test("maps finalized + rejects staging with trusted facts", () => {
    const finalized = mapHeadlessOwnedObjectSqlRow(
      stagingRow({
        stage: "finalized",
        verification_state: "verified",
        content_digest: DIGEST,
        byte_length: "10",
        mime_type: "application/json",
        verified_at_ms: "2000",
        expires_at_ms: "9000000",
        finalized_metadata: {
          verifiedBy: "full_object_stream",
          sourceStage: "staging",
        },
        updated_at_ms: "2000",
      }),
    );
    assert.equal(finalized.ok, true);

    const mixed = mapHeadlessOwnedObjectSqlRow(
      stagingRow({ content_digest: DIGEST }),
    );
    assert.equal(mixed.ok, false);
  });

  test("rejects claim mismatch + hostile terminal_reason", () => {
    const claim = mapHeadlessOwnedObjectSqlRow(
      stagingRow({
        verification_state: "claimed",
        verification_claim_token: null,
        verification_claimed_at_ms: "2000",
      }),
    );
    assert.equal(claim.ok, false);

    const hostile = mapHeadlessOwnedObjectSqlRow(
      stagingRow({
        stage: "rejected",
        verification_state: "failed",
        terminal_reason: { evil: "https://evil.example/secret" },
      }),
    );
    assert.equal(hostile.ok, false);
  });

  test("parses terminal_reason JSON string", () => {
    const mapped = mapHeadlessOwnedObjectSqlRow(
      stagingRow({
        stage: "rejected",
        verification_state: "failed",
        terminal_reason: JSON.stringify("digest_mismatch"),
        updated_at_ms: "2000",
      }),
    );
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.stored.record.stage, "rejected");
    if (mapped.stored.record.stage === "rejected") {
      assert.equal(mapped.stored.record.terminalReason, "digest_mismatch");
    }
  });

  console.log(`\n${passed} passed\n`);
}

main();
