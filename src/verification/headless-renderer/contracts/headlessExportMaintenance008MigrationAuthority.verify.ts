/**
 * Migration 008 maintenance lease authority regression coverage.
 * Run: npm run test:headless-export-maintenance-008-migration-authority
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";

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

function readMigration(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
}

async function main() {
  console.log("\nHeadless export maintenance migration 008 authority\n");
  const sql = readMigration("008_headless_export_maintenance_lease.sql");
  const checksum = createHash("sha256").update(sql).digest("hex");

  test("008 migration checksum matches embedded fingerprint", () => {
    const embedded = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.find(
      (m) => m.migrationId === "008_headless_export_maintenance_lease",
    );
    assert.equal(embedded?.checksumSha256, checksum);
    assert.equal(checksum, "5ed409d7e0bc42b44c38d74ee99f6f94de541c6cce5b31e39c39bd6d2b99f3de");
  });

  test("008 is additive and does not rewrite job/object tables", () => {
    assert.equal(/ALTER TABLE public\.headless_jobs/i.test(sql), false);
    assert.equal(/ALTER TABLE public\.headless_owned_objects/i.test(sql), false);
    assert.equal(/DROP TABLE/i.test(sql), false);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.headless_export_maintenance_leases/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.headless_export_maintenance_state/);
  });

  test("lease and maintenance-state fields are bounded", () => {
    assert.match(sql, /length\(holder_class\) <= 64/);
    assert.match(sql, /cursor_owner_id IS NULL OR length\(cursor_owner_id\) <= 128/);
    assert.match(sql, /cursor_fence_token IS NULL OR length\(cursor_fence_token\) <= 128/);
    assert.match(sql, /length\(trim\(lease_token\)\) > 0/);
  });

  test("007 slot_key capacity remains 1024", () => {
    const m007 = readMigration("007_headless_owned_object_slot_key_capacity.sql");
    assert.match(m007, /VARCHAR\(1024\)/);
  });

  test("008 upgrade path is safe to disable without destructive downgrade", () => {
    assert.match(sql, /release_state IN \('active', 'released'\)/);
    assert.equal(/DELETE FROM public\.headless_jobs/i.test(sql), false);
    assert.equal(/TRUNCATE/i.test(sql), false);
  });

  test("embedded fingerprint includes migrations 001 through 008", () => {
    const ids = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.map((m) => m.migrationId);
    assert.equal(ids.includes("001_headless_project_ownership"), true);
    assert.equal(ids.includes("008_headless_export_maintenance_lease"), true);
    assert.equal(ids.length, 8);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
