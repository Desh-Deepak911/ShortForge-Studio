/**
 * Sprint 11E Phase 2C.1 — owned-object SQL migration discovery + assertions.
 * Run: npm run test:headless-owned-object-sql-schema
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  "src/features/headless-renderer/control-plane/migrations",
);

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2C.1 — owned-object SQL schema\n");

  const sql = readFileSync(
    path.join(MIGRATIONS_DIR, "004_headless_owned_objects.sql"),
    "utf8",
  );
  const readme = readFileSync(path.join(MIGRATIONS_DIR, "README.md"), "utf8");

  test("004 discovered with checksum; 003.md excluded", () => {
    const sources = discoverHeadlessMigrationSources(MIGRATIONS_DIR);
    const ids = sources.map((s) => s.migrationId);
    assert.ok(ids.includes("004_headless_owned_objects"));
    assert.equal(ids.includes("003_headless_cas_transaction_spec"), false);
    const owned = sources.find((s) => s.migrationId === "004_headless_owned_objects");
    assert.ok(owned);
    assert.equal(owned!.checksumSha256.length, 64);
    assert.match(owned!.checksumSha256, /^[0-9a-f]{64}$/);
  });

  test("004: table + core columns", () => {
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS public\.headless_owned_objects/,
    );
    for (const col of [
      "object_id",
      "owner_id",
      "project_id",
      "job_id",
      "operation_id",
      "purpose",
      "slot_key",
      "stage",
      "store_id",
      "object_key",
      "store_version",
      "expected_content_digest_claim",
      "expected_byte_length",
      "expected_mime_type",
      "content_digest",
      "byte_length",
      "mime_type",
      "upload_capability_issued_at_ms",
      "upload_capability_expires_at_ms",
      "uploaded_observed_at_ms",
      "verification_state",
      "verification_claim_token",
      "verification_claimed_at_ms",
      "verified_at_ms",
      "expires_at_ms",
      "finalized_metadata",
      "terminal_reason",
      "cleanup_scheduled_at_ms",
      "created_at_ms",
      "updated_at_ms",
    ]) {
      assert.match(sql, new RegExp(`\\b${col}\\b`));
    }
  });

  test("004: FK, unique identity, stage checks, indexes", () => {
    assert.match(sql, /headless_owned_objects_fk_project_owner/);
    assert.match(sql, /FOREIGN KEY \(project_id, owner_id\)/);
    assert.match(sql, /UNIQUE \(store_id, object_key\)/);
    assert.match(sql, /headless_owned_objects_stage_valid/);
    assert.match(sql, /headless_owned_objects_staging_payload/);
    assert.match(sql, /headless_owned_objects_finalized_payload/);
    assert.match(sql, /idx_headless_owned_objects_owner_job/);
    assert.match(sql, /idx_headless_owned_objects_verification_claims/);
    assert.match(sql, /idx_headless_owned_objects_expiry_cleanup/);
  });

  test("004: no presigned URL / secret columns; no BEGIN/COMMIT", () => {
    const columnLines = sql
      .split("\n")
      .filter((line) => /^\s+[a-z_]+ /i.test(line) && !line.trim().startsWith("--"));
    for (const line of columnLines) {
      const col = line.trim().split(/\s+/)[0] ?? "";
      assert.equal(/presigned|put_url|get_url|signed_url|secret/i.test(col), false);
    }
    assert.equal(/put_url|get_url|signed_url/i.test(sql), false);
    assert.equal(/^\s*BEGIN\s*;\s*$/im.test(sql), false);
    assert.equal(/^\s*COMMIT\s*;\s*$/im.test(sql), false);
  });

  test("007 discovered with checksum; widens slot_key to VARCHAR(1024)", () => {
    const sources = discoverHeadlessMigrationSources(MIGRATIONS_DIR);
    const m007 = sources.find(
      (s) => s.migrationId === "007_headless_owned_object_slot_key_capacity",
    );
    assert.ok(m007);
    assert.equal(
      m007!.checksumSha256,
      "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244",
    );
    assert.match(m007!.sqlText, /ALTER COLUMN slot_key TYPE VARCHAR\(1024\)/);
    assert.equal(/^\s*BEGIN\s*;\s*$/m.test(m007!.sqlText), false);
  });

  test("004 checksum unchanged (007 does not rewrite 004)", () => {
    const sources = discoverHeadlessMigrationSources(MIGRATIONS_DIR);
    const m004 = sources.find((s) => s.migrationId === "004_headless_owned_objects");
    assert.ok(m004);
    assert.equal(
      m004!.checksumSha256,
      "a2f05a8316c1e257317975e2c47036034ceecebe423a62dfedc6f71149f60db3",
    );
  });

  test("README lists 004 and 007", () => {
    assert.match(readme, /004_headless_owned_objects/);
    assert.match(readme, /007_headless_owned_object_slot_key_capacity/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
