/**
 * Sprint 11E Phase 2E.2B.2 — render dispatch outbox SQL migration discovery.
 * Run: npm run test:headless-render-dispatch-outbox-sql-schema
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  console.log("\nSprint 11E Phase 2E.2B.2 — render dispatch outbox SQL schema\n");

  const sqlPath = path.join(
    MIGRATIONS_DIR,
    "006_headless_render_dispatch_outbox.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");
  const readme = readFileSync(path.join(MIGRATIONS_DIR, "README.md"), "utf8");
  const checksum = createHash("sha256").update(sql, "utf8").digest("hex");

  test("006 discovered; 003.md excluded; 005 retained", () => {
    const sources = discoverHeadlessMigrationSources(MIGRATIONS_DIR);
    const ids = sources.map((s) => s.migrationId);
    assert.ok(ids.includes("005_headless_cleanup_intents"));
    assert.ok(ids.includes("006_headless_render_dispatch_outbox"));
    assert.equal(ids.includes("003_headless_cas_transaction_spec"), false);
    const outbox = sources.find(
      (s) => s.migrationId === "006_headless_render_dispatch_outbox",
    );
    assert.ok(outbox);
    assert.equal(outbox!.checksumSha256, checksum);
    console.log(`    checksum=${checksum}`);
  });

  test("006: public table + core columns; no secrets", () => {
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS public\.headless_render_dispatch_outbox/,
    );
    for (const col of [
      "dispatch_id",
      "job_id",
      "attempt",
      "owner_id",
      "project_id",
      "delivery_id",
      "state",
      "claim_token",
      "claimed_at_ms",
      "retry_count",
      "next_attempt_at_ms",
      "store_version",
      "dispatched_at_ms",
    ]) {
      assert.match(sql, new RegExp(`\\b${col}\\b`));
    }
    assert.equal(/presigned|signed_url|capability_token\b/i.test(sql), false);
    assert.equal(/^\s*BEGIN\s*;/im.test(sql), false);
    assert.equal(/^\s*COMMIT\s*;/im.test(sql), false);
  });

  test("006: unique delivery/job-attempt + indexes + states", () => {
    assert.match(sql, /headless_render_dispatch_outbox_job_attempt_unique/);
    assert.match(sql, /headless_render_dispatch_outbox_delivery_id_unique/);
    assert.match(
      sql,
      /state IN \('pending', 'claimed', 'dispatched', 'rejected'\)/,
    );
    assert.match(sql, /idx_headless_render_dispatch_outbox_due/);
    assert.match(sql, /idx_headless_render_dispatch_outbox_claim_recovery/);
    assert.match(sql, /headless_render_dispatch_outbox_fk_project_owner/);
  });

  test("README documents 006", () => {
    assert.match(readme, /006_headless_render_dispatch_outbox/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
