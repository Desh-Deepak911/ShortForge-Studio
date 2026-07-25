/**
 * Sprint 11E Phase 2B.2A — PostgreSQL BIGINT / int8 wire decoding.
 * Run: npm run test:headless-neon-pg-values
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { mapHeadlessJobSqlRow } from "@/features/headless-renderer/control-plane/services/map-headless-job-sql-row";
import { mapHeadlessOwnershipSqlRow } from "@/features/headless-renderer/control-plane/services/map-headless-ownership-sql-row";
import { parseHeadlessPgSafeInteger } from "@/features/headless-renderer/control-plane/services/parse-headless-pg-safe-integer";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2B.2A — PostgreSQL BIGINT values\n");

  test("accepts safe integer numbers", () => {
    const n = parseHeadlessPgSafeInteger(42, { min: 0 });
    assert.equal(n.ok && n.value === 42, true);
  });

  test("accepts canonical PostgreSQL decimal strings", () => {
    const n = parseHeadlessPgSafeInteger("1700000000000", { min: 0 });
    assert.equal(n.ok && n.value === 1_700_000_000_000, true);
    const v = parseHeadlessPgSafeInteger("1", { min: 1 });
    assert.equal(v.ok && v.value === 1, true);
  });

  test("rejects fractional / exponent / whitespace / junk", () => {
    assert.equal(parseHeadlessPgSafeInteger("1.5", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("1e3", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger(" 1", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("1 ", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("01", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("+1", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("abc", { min: 0 }).ok, false);
  });

  test("rejects negative when min is non-negative", () => {
    assert.equal(parseHeadlessPgSafeInteger("-1", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger(-1, { min: 0 }).ok, false);
  });

  test("rejects unsafe range / objects / booleans / null / Proxy", () => {
    assert.equal(
      parseHeadlessPgSafeInteger("9007199254740992", { min: 0 }).ok,
      false,
    );
    assert.equal(parseHeadlessPgSafeInteger(true, { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger(null, { min: 0 }).ok, false);
    assert.equal(
      parseHeadlessPgSafeInteger({ valueOf: () => 1 }, { min: 0 }).ok,
      false,
    );
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
      },
    );
    assert.equal(parseHeadlessPgSafeInteger(hostile, { min: 0 }).ok, false);
  });

  test("ownership mapper accepts BIGINT string created_at_ms", () => {
    const mapped = mapHeadlessOwnershipSqlRow({
      project_id: randomUUID(),
      owner_id: "owner_a",
      created_at_ms: "1700000000000",
    });
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.ownership.createdAtMs, 1_700_000_000_000);
    assert.equal(typeof mapped.ownership.createdAtMs, "number");
  });

  test("job mapper rejects fractional BIGINT store_version string", () => {
    const mapped = mapHeadlessJobSqlRow({
      job_id: "job_bad",
      stage: "canonical",
      state: "queued",
      owner_id: "o",
      project_id: randomUUID(),
      store_version: "1.5",
      operation_id: "op",
      idempotency_authority_key: "hid:sha256:" + "ab".repeat(32),
      creator_idempotency_key: null,
      requested_renderer_profile: null,
      requested_renderer_build_id: null,
      provisional: null,
      canonical_job: { state: "queued" },
      canonical_request: {},
      claim_token: null,
      claimed_at_ms: null,
      artifact_object_binding: null,
      created_at_ms: "1",
      updated_at_ms: "1",
      expires_at_ms: null,
      terminal_reason: null,
      verification_claim_token: null,
      verification_claimed_at_ms: null,
    });
    assert.equal(mapped.ok, false);
    if (!mapped.ok) {
      assert.match(mapped.message, /store_version/i);
    }
  });

  test("job mapper rejects claimed_at_ms exponent string", () => {
    const mapped = mapHeadlessJobSqlRow({
      job_id: "job_bad2",
      stage: "canonical",
      state: "queued",
      owner_id: "o",
      project_id: randomUUID(),
      store_version: "1",
      operation_id: "op",
      idempotency_authority_key: "hid:sha256:" + "ab".repeat(32),
      creator_idempotency_key: null,
      requested_renderer_profile: null,
      requested_renderer_build_id: null,
      provisional: null,
      canonical_job: { state: "queued" },
      canonical_request: {},
      claim_token: "c",
      claimed_at_ms: "1e3",
      artifact_object_binding: null,
      created_at_ms: "1",
      updated_at_ms: "1",
      expires_at_ms: null,
      terminal_reason: null,
      verification_claim_token: null,
      verification_claimed_at_ms: null,
    });
    assert.equal(mapped.ok, false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
