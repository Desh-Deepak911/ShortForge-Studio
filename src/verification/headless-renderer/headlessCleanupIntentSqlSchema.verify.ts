/**
 * Sprint 11E Phase 2E.2A — cleanup intent SQL migration discovery + assertions.
 * Run: npm run test:headless-cleanup-intent-sql-schema
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
  console.log("\nSprint 11E Phase 2E.2A — cleanup intent SQL schema\n");

  const sql = readFileSync(
    path.join(MIGRATIONS_DIR, "005_headless_cleanup_intents.sql"),
    "utf8",
  );
  const readme = readFileSync(path.join(MIGRATIONS_DIR, "README.md"), "utf8");

  test("005 discovered with checksum; 003.md excluded; 004 retained", () => {
    const sources = discoverHeadlessMigrationSources(MIGRATIONS_DIR);
    const ids = sources.map((s) => s.migrationId);
    assert.ok(ids.includes("004_headless_owned_objects"));
    assert.ok(ids.includes("005_headless_cleanup_intents"));
    assert.equal(ids.includes("003_headless_cas_transaction_spec"), false);
    const cleanup = sources.find(
      (s) => s.migrationId === "005_headless_cleanup_intents",
    );
    assert.ok(cleanup);
    assert.equal(cleanup!.checksumSha256.length, 64);
    assert.match(cleanup!.checksumSha256, /^[0-9a-f]{64}$/);
    console.log(`    checksum=${cleanup!.checksumSha256}`);
  });

  test("005: table + core columns", () => {
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS public\.headless_cleanup_intents/,
    );
    for (const col of [
      "cleanup_id",
      "owner_id",
      "project_id",
      "job_id",
      "attempt",
      "object_id",
      "store_id",
      "object_key",
      "content_digest",
      "reason_id",
      "state",
      "claim_token",
      "claimed_at_ms",
      "expires_at_ms",
      "store_version",
      "idempotency_key",
      "created_at_ms",
      "completed_at_ms",
    ]) {
      assert.match(sql, new RegExp(`\\b${col}\\b`));
    }
  });

  test("005: constraints + indexes; no BEGIN/COMMIT; no secret columns", () => {
    assert.match(sql, /headless_cleanup_intents_fk_project_owner/);
    assert.match(sql, /headless_cleanup_intents_idempotency_unique/);
    assert.match(sql, /headless_cleanup_intents_state_valid/);
    assert.match(
      sql,
      /state IN \('pending', 'claimed', 'completed', 'protected', 'rejected'\)/,
    );
    assert.match(sql, /headless_cleanup_intents_protected_payload/);
    assert.match(sql, /headless_cleanup_intents_rejected_payload/);
    assert.match(sql, /idx_headless_cleanup_intents_owner_retryable/);
    assert.match(sql, /idx_headless_cleanup_intents_claim_recovery/);
    assert.match(sql, /idx_headless_cleanup_intents_owner_terminal/);
    assert.equal(/^\s*BEGIN\s*;/im.test(sql), false);
    assert.equal(/^\s*COMMIT\s*;/im.test(sql), false);
    assert.equal(/presigned|signed_url|capability_token\b/i.test(sql), false);
  });

  test("README documents 005", () => {
    assert.match(readme, /005_headless_cleanup_intents/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
