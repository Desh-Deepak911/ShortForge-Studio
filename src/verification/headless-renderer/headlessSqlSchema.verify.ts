/**
 * Sprint 11E Phase 2B.1A / 2B.1B — SQL schema + CAS spec verification (static parse).
 * Run: npm run test:headless-sql-schema
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const SECRET_COLUMN_PATTERNS = [
  /clerk/i,
  /secret/i,
  /password/i,
  /presigned/i,
  /capability_token/i,
  /session_token/i,
  /signed_url/i,
];

function assertNoSecretColumns(sql: string, label: string) {
  const columnLines = sql
    .split("\n")
    .filter((line) => /^\s+[a-z_]+ /i.test(line) && !line.trim().startsWith("--"));
  for (const line of columnLines) {
    const col = line.trim().split(/\s+/)[0] ?? "";
    for (const pattern of SECRET_COLUMN_PATTERNS) {
      assert.equal(
        pattern.test(col),
        false,
        `${label}: column "${col}" looks like a secret carrier`,
      );
    }
    assert.equal(
      /url/i.test(col) && !col.includes("object_key"),
      false,
      `${label}: column "${col}" must not store URLs`,
    );
  }
}

async function main() {
  console.log("\nSprint 11E Phase 2B.1B — SQL schema verification\n");

  const ownershipSql = readMigration("001_headless_project_ownership.sql");
  const jobsSql = readMigration("002_headless_jobs.sql");
  const casSpec = readMigration("003_headless_cas_transaction_spec.md");
  const readme = readMigration("README.md");

  test("001: headless_project_ownership table exists", () => {
    assert.match(
      ownershipSql,
      /CREATE TABLE IF NOT EXISTS public\.headless_project_ownership/,
    );
    assert.match(ownershipSql, /PRIMARY KEY \(project_id\)/i);
    assert.match(ownershipSql, /owner_id/);
    assert.match(ownershipSql, /created_at_ms/);
  });

  test("001: composite UNIQUE (project_id, owner_id)", () => {
    assert.match(
      ownershipSql,
      /headless_project_ownership_project_owner_unique[\s\S]*UNIQUE \(project_id, owner_id\)/,
    );
  });

  test("001: immutable ownership trigger", () => {
    assert.match(ownershipSql, /headless_project_ownership_reject_owner_change/);
    assert.match(ownershipSql, /owner_id is immutable/i);
  });

  test("002: headless_jobs table + core columns", () => {
    assert.match(jobsSql, /CREATE TABLE IF NOT EXISTS public\.headless_jobs/);
    for (const col of [
      "job_id",
      "stage",
      "state",
      "owner_id",
      "project_id",
      "store_version",
      "operation_id",
      "idempotency_authority_key",
      "requested_renderer_profile",
      "requested_renderer_build_id",
      "provisional",
      "canonical_job",
      "canonical_request",
      "claim_token",
      "claimed_at_ms",
      "artifact_object_binding",
      "created_at_ms",
      "updated_at_ms",
      "expires_at_ms",
      "terminal_reason",
    ]) {
      assert.match(jobsSql, new RegExp(`\\b${col}\\b`));
    }
  });

  test("002: operation_id NOT NULL for both stages", () => {
    assert.match(jobsSql, /operation_id VARCHAR\(128\) NOT NULL/);
    assert.match(jobsSql, /operation_id: private operation lineage/i);
    assert.match(jobsSql, /Required for BOTH stages/);
    assert.match(casSpec, /`operation_id` \*\*preserved\*\*/);
  });

  test("002: stage/state constraints and nullability rules", () => {
    assert.match(jobsSql, /stage IN \('provisional', 'canonical'\)/);
    assert.match(jobsSql, /headless_jobs_provisional_payload_only/);
    assert.match(jobsSql, /headless_jobs_canonical_payload_required/);
    assert.match(jobsSql, /headless_jobs_binding_state_rules/);
    assert.match(jobsSql, /headless_jobs_provisional_no_render_claim/);
    assert.match(jobsSql, /store_version >= 1/);
    assert.match(jobsSql, /created_at_ms >= 0/);
  });

  test("002: required indexes", () => {
    assert.match(jobsSql, /idx_headless_jobs_owner_job/);
    assert.match(jobsSql, /uidx_headless_jobs_idempotency_authority/);
    assert.match(jobsSql, /idx_headless_jobs_project_id/);
    assert.match(jobsSql, /idx_headless_jobs_canonical_queued_unclaimed/);
    assert.match(jobsSql, /idx_headless_jobs_provisional_expiry/);
    assert.match(jobsSql, /idx_headless_jobs_render_claim_recovery/);
  });

  test("002: composite FK headless_jobs_fk_project_owner", () => {
    assert.match(jobsSql, /CONSTRAINT headless_jobs_fk_project_owner/);
    assert.match(jobsSql, /FOREIGN KEY \(project_id, owner_id\)/);
    assert.match(
      jobsSql,
      /REFERENCES public\.headless_project_ownership \(project_id, owner_id\)/,
    );
  });

  test("002: no FK on project_id alone — composite membership only", () => {
    const fkMatches = jobsSql.match(/FOREIGN KEY \([^)]+\)/g) ?? [];
    assert.equal(fkMatches.length, 1);
    assert.match(fkMatches[0]!, /project_id,\s*owner_id/);
    assert.equal(/FOREIGN KEY \(project_id\)/.test(jobsSql), false);
  });

  test("002: wrong-owner insert structurally rejected (composite FK comment)", () => {
    assert.match(
      jobsSql,
      /Rejects insert with correct project_id but wrong owner_id/,
    );
    assert.match(
      ownershipSql,
      /Composite uniqueness on \(project_id, owner_id\)/,
    );
  });

  test("003: valid ON CONFLICT (owner_id, project_id, idempotency_authority_key)", () => {
    assert.match(
      casSpec,
      /ON CONFLICT \(owner_id, project_id, idempotency_authority_key\)/,
    );
    assert.match(
      casSpec,
      /`\(owner_id, project_id, idempotency_authority_key\)`/,
    );
  });

  test("003: no ON CONFLICT ON CONSTRAINT uidx_headless_jobs_idempotency_authority", () => {
    assert.equal(
      casSpec.includes(
        "ON CONFLICT ON CONSTRAINT uidx_headless_jobs_idempotency_authority",
      ),
      false,
    );
    assert.match(
      casSpec,
      /uidx_headless_jobs_idempotency_authority is a UNIQUE INDEX, not a table CONSTRAINT/,
    );
  });

  test("003: PK job_id collision distinguishable from idempotency replay", () => {
    assert.match(casSpec, /`23505` on `job_id` PK/);
    assert.match(casSpec, /`INTERNAL_ERROR` \(id collision\)/);
    assert.match(
      casSpec,
      /distinguish PK `job_id` collisions from semantic idempotency replay/,
    );
  });

  test("003: Pool.connect / BEGIN / COMMIT / ROLLBACK — no pool.transaction(", () => {
    assert.match(casSpec, /await pool\.connect\(\)/);
    assert.match(casSpec, /await client\.query\("BEGIN"\)/);
    assert.match(casSpec, /await client\.query\("COMMIT"\)/);
    assert.match(casSpec, /await client\.query\("ROLLBACK"\)/);
    assert.match(casSpec, /Do \*\*not\*\* use a fictional `Pool\.transaction\(callback\)` API/);
    assert.equal(casSpec.includes("pool.transaction("), false);
  });

  test("003: CAS spec covers all port operations", () => {
    const requiredSections = [
      "Claim project if unowned",
      "Provisional create-if-absent",
      "Provisional compare-and-set",
      "Atomic provisional → canonical promotion",
      "Canonical transition CAS",
      "Claim queued canonical job",
      "Expired render-claim recovery",
    ];
    for (const section of requiredSections) {
      assert.match(casSpec, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  test("003: interactive transaction boundary + row lock patterns", () => {
    assert.match(casSpec, /interactive transaction/i);
    assert.match(casSpec, /FOR UPDATE/);
    assert.match(casSpec, /store_version = \$expected_store_version/);
    assert.match(casSpec, /store_version \+ 1/);
    assert.match(casSpec, /23505/);
    assert.match(casSpec, /\$job_id/);
    assert.match(casSpec, /\$owner_id/);
    assert.match(casSpec, /JSONB is untrusted/i);
    assert.match(casSpec, /validators/i);
  });

  test("README: documents gated migrate + Pool/Client BEGIN pattern", () => {
    assert.match(readme, /HEADLESS_NEON_MIGRATE/);
    assert.match(readme, /DATABASE_URL_UNPOOLED/);
    assert.match(readme, /Client or Pool\.connect → BEGIN → work → COMMIT/);
    assert.match(readme, /Do \*\*not\*\* use a fictional `Pool\.transaction\(callback\)` API/);
    assert.equal(readme.includes("transaction() callback"), false);
    assert.match(readme, /000_headless_schema_migrations/);
    assert.match(readme, /001_headless_project_ownership/);
    assert.match(readme, /002_headless_jobs/);
    assert.match(readme, /003_headless_cas_transaction_spec/);
    assert.match(readme, /004_headless_owned_objects/);
  });

  test("000: migration ledger table + checksum columns", () => {
    const ledger = readMigration("000_headless_schema_migrations.sql");
    assert.match(
      ledger,
      /CREATE TABLE IF NOT EXISTS public\.headless_schema_migrations/,
    );
    assert.match(ledger, /checksum_sha256/);
    assert.match(ledger, /applied_at_ms/);
    assert.match(ledger, /search_path must not be trusted/i);
    assert.equal(/^\s*BEGIN\s*;\s*$/m.test(ledger), false);
    assert.equal(/^\s*COMMIT\s*;\s*$/m.test(ledger), false);
  });

  test("001/002: runner-owned transactions (no file-level BEGIN/COMMIT)", () => {
    assert.equal(/^\s*BEGIN\s*;\s*$/m.test(ownershipSql), false);
    assert.equal(/^\s*COMMIT\s*;\s*$/m.test(ownershipSql), false);
    assert.equal(/^\s*BEGIN\s*;\s*$/m.test(jobsSql), false);
    assert.equal(/^\s*COMMIT\s*;\s*$/m.test(jobsSql), false);
  });

  test("002 + 001: no secret URL columns", () => {
    assertNoSecretColumns(ownershipSql, "001");
    assertNoSecretColumns(jobsSql, "002");
    assert.equal(jobsSql.includes("https://"), false);
    assert.equal(jobsSql.includes("sk_"), false);
    assert.equal(jobsSql.includes("pk_"), false);
  });

  test("001: project_id UUID v4 CHECK constraint (headless_project_ownership_project_id_uuid_v4)", () => {
    assert.match(ownershipSql, /headless_project_ownership_project_id_uuid_v4/);
    assert.match(
      ownershipSql,
      /4\[0-9a-f\]\{3\}[\s\S]*\[89ab\]\[0-9a-f\]\{3\}/,
    );
    assert.match(
      ownershipSql,
      /project_id ~ '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-4\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$'/,
    );
  });

  test("002: canonical state column matches canonical_job JSON (headless_jobs_canonical_state_matches_json)", () => {
    assert.match(jobsSql, /headless_jobs_canonical_state_matches_json/);
    assert.match(
      jobsSql,
      /\(canonical_job\s*->>\s*'state'\)\s*=\s*state/,
    );
    assert.match(jobsSql, /Rejects rows where SQL state disagrees with canonical_job->>'state'/);
  });

  test("002: provisional JSON does not duplicate state — column state is authoritative", () => {
    assert.match(
      jobsSql,
      /provisional JSONB payload does NOT duplicate state/i,
    );
    assert.match(jobsSql, /column state is source/i);
  });

  test("002: no invented canon_op_ fallback in SQL comments", () => {
    assert.equal(jobsSql.includes("canon_op_"), false);
    assert.match(jobsSql, /no invented fallback/i);
  });

  test("002: wrong-owner insert and canonical state mismatch structurally rejected", () => {
    assert.match(
      jobsSql,
      /Rejects insert with correct project_id but wrong owner_id/,
    );
    assert.match(jobsSql, /headless_jobs_fk_project_owner/);
    assert.match(jobsSql, /headless_jobs_canonical_state_matches_json/);
    assert.match(jobsSql, /Fail-closed: denormalized column state must equal canonical_job JSON state/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
