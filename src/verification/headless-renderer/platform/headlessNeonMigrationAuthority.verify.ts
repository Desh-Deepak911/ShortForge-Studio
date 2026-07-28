/**
 * Sprint 11E Phase 2B.2B — Neon migration authority (deterministic, no remote DB).
 * Run: npm run test:headless-neon-migration-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  classifyHeadlessNeonMigrationEnvironment,
  isHeadlessNeonMigrateGateEnabled,
  isPostgresPoolerHostname,
  readConfiguredHeadlessMigrationDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-migration-environment";
import {
  discoverHeadlessMigrationSources,
  sha256Hex,
} from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { runHeadlessMigrations } from "@/features/headless-renderer/control-plane/migrations/run-headless-migrations";
import {
  createFakeMigrationClientFactory,
  FakeHeadlessMigrationClient,
} from "@/features/headless-renderer/control-plane/testing/fake-migration-client";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

const DIRECT =
  "postgresql://neondb_owner:secret@ep-example.us-east-1.aws.neon.tech/neondb";
const POOLER =
  "postgresql://neondb_owner:secret@ep-example-pooler.us-east-1.aws.neon.tech/neondb";

async function main() {
  console.log("\nSprint 11E Phase 2B.2B — Neon migration authority\n");

  await test("gate absent → disabled", () => {
    assert.equal(isHeadlessNeonMigrateGateEnabled({}), false);
    assert.equal(
      isHeadlessNeonMigrateGateEnabled({ HEADLESS_NEON_MIGRATE: "0" }),
      false,
    );
  });

  await test("direct URL absent → unconfigured", () => {
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({ HEADLESS_NEON_MIGRATE: "1" }),
      "unconfigured",
    );
  });

  await test("malformed / hostile / oversized URL → invalid", () => {
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL_UNPOOLED: "not-a-url",
      }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL_UNPOOLED: "mysql://u:p@h/db",
      }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL_UNPOOLED: "postgresql://u:p@h/",
      }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL_UNPOOLED: { toString: () => DIRECT } as unknown as string,
      }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL_UNPOOLED: "postgresql://u:p@h/" + "x".repeat(3000),
      }),
      "invalid",
    );
  });

  await test("pooler URL rejection", () => {
    assert.equal(isPostgresPoolerHostname("ep-x-pooler.us-east-1.aws.neon.tech"), true);
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL_UNPOOLED: POOLER,
      }),
      "pooler_rejected",
    );
  });

  await test("valid direct URL classification + no secret echo", () => {
    const status = classifyHeadlessNeonMigrationEnvironment({
      DATABASE_URL_UNPOOLED: DIRECT,
    });
    assert.equal(status, "configured");
    const url = readConfiguredHeadlessMigrationDatabaseUrl({
      DATABASE_URL_UNPOOLED: DIRECT,
    });
    assert.equal(url, DIRECT);
    assert.equal(
      JSON.stringify(status).includes("postgresql"),
      false,
    );
    assert.equal(JSON.stringify(status).includes("secret"), false);
  });

  await test("never falls back to DATABASE_URL", () => {
    assert.equal(
      classifyHeadlessNeonMigrationEnvironment({
        DATABASE_URL: DIRECT,
      }),
      "unconfigured",
    );
    assert.equal(
      readConfiguredHeadlessMigrationDatabaseUrl({
        DATABASE_URL: DIRECT,
      }),
      null,
    );
  });

  await test("gate-off performs zero connections", async () => {
    let connects = 0;
    const client = new FakeHeadlessMigrationClient();
    const result = await runHeadlessMigrations({
      env: {
        DATABASE_URL_UNPOOLED: DIRECT,
      },
      clientFactory: async () => {
        connects += 1;
        return client;
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "GATE_DISABLED");
    assert.equal(connects, 0);
  });

  await test("ordered migration discovery", () => {
    const sources = discoverHeadlessMigrationSources();
    assert.ok(sources.length >= 4);
    assert.equal(sources[0]?.migrationId, "000_headless_schema_migrations");
    assert.equal(sources[1]?.migrationId, "001_headless_project_ownership");
    assert.equal(sources[2]?.migrationId, "002_headless_jobs");
    assert.equal(sources[3]?.migrationId, "004_headless_owned_objects");
    assert.equal(sources[4]?.migrationId, "005_headless_cleanup_intents");
    for (let i = 1; i < sources.length; i++) {
      assert.ok(sources[i]!.migrationId > sources[i - 1]!.migrationId);
    }
  });

  await test("first apply records checksums", async () => {
    const client = new FakeHeadlessMigrationClient();
    const result = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
      nowMs: () => 1_700_000_000_000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.applied.length >= 3);
    assert.equal(result.skipped.length, 0);
    assert.equal(client.ledgerTableExists, true);
    assert.equal(client.ended, true);
    assert.equal(client.advisoryLockKeySeen, true);
    assert.ok(
      client.queries.some((q) =>
        /set_config\(\s*'search_path'\s*,\s*'public, pg_temp'/i.test(q.text),
      ),
    );
    assert.ok(
      client.queries.some((q) =>
        /public\.headless_schema_migrations/i.test(q.text),
      ),
    );
    const sources = discoverHeadlessMigrationSources();
    for (const source of sources) {
      assert.equal(
        client.ledger.get(source.migrationId)?.checksum_sha256,
        source.checksumSha256,
      );
      assert.match(source.sqlText, /public\.headless_/);
    }
  });

  await test("hostile search_path does not redirect ledger writes", async () => {
    const client = new FakeHeadlessMigrationClient();
    // Pretend session default is hostile — runner must still qualify public.
    const result = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
    });
    assert.equal(result.ok, true);
    const ledgerWrites = client.queries.filter((q) =>
      /INSERT INTO\s+public\.headless_schema_migrations/i.test(q.text),
    );
    assert.ok(ledgerWrites.length >= 1);
    assert.equal(
      client.queries.some((q) =>
        /INSERT INTO\s+headless_schema_migrations\b/i.test(q.text),
      ),
      false,
    );
  });

  await test("same-checksum replay is safe no-op", async () => {
    const client = new FakeHeadlessMigrationClient();
    await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
    });
    // Operator reconnects a fresh session against the same durable ledger.
    client.ended = false;
    client.lockHeld = false;
    const second = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.applied.length, 0);
    assert.ok(second.skipped.length >= 3);
  });

  await test("checksum drift rejection", async () => {
    const client = new FakeHeadlessMigrationClient();
    await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
    });
    const first = discoverHeadlessMigrationSources()[0]!;
    client.ledger.set(first.migrationId, {
      migration_id: first.migrationId,
      checksum_sha256: sha256Hex("tampered"),
      applied_at_ms: 1,
    });
    client.ended = false;
    client.lockHeld = false;
    const drifted = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
    });
    assert.equal(drifted.ok, false);
    if (!drifted.ok) assert.equal(drifted.code, "MIGRATION_DRIFT");
  });

  await test("transaction rollback on apply failure", async () => {
    const client = new FakeHeadlessMigrationClient();
    // Allow ledger bootstrap, fail on ownership migration body.
    client.failOnSqlIncludes = "headless_project_ownership";
    const result = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: createFakeMigrationClientFactory(client),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MIGRATION_FAILED");
    assert.equal(
      client.ledger.has("001_headless_project_ownership"),
      false,
    );
    assert.equal(client.ended, true);
  });

  await test("concurrent runner serialization via advisory lock", async () => {
    const shared = { held: false };
    const clientA = new FakeHeadlessMigrationClient();
    const clientB = new FakeHeadlessMigrationClient();
    const originalA = clientA.query.bind(clientA);
    clientA.query = async (text, params) => {
      const result = await originalA(text, params);
      if (/pg_advisory_lock/i.test(text)) shared.held = true;
      if (/pg_advisory_unlock/i.test(text)) shared.held = false;
      return result;
    };
    clientB.query = async (text, params) => {
      if (/pg_advisory_lock/i.test(text) && shared.held) {
        throw Object.assign(new Error("lock_blocked"), { code: "55P03" });
      }
      return clientA.query(text, params);
    };

    const first = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: async () => clientA,
    });
    assert.equal(first.ok, true);
    // Simulate overlap: durable lock still held by another session.
    clientA.ended = false;
    clientB.ended = false;
    shared.held = true;
    const second = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: async () => clientB,
    });
    assert.equal(second.ok, false);
    assert.equal(clientA.advisoryLockKeySeen, true);
  });

  await test("cleanup/release on connect failure", async () => {
    let connects = 0;
    const result = await runHeadlessMigrations({
      bypassOperatorGate: true,
      connectionStringForTest: DIRECT,
      clientFactory: async () => {
        connects += 1;
        throw new Error("connect_failed");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MIGRATION_FAILED");
    assert.equal(connects, 1);
  });

  await test("pooler gate refuses without connecting", async () => {
    let connects = 0;
    const result = await runHeadlessMigrations({
      env: {
        HEADLESS_NEON_MIGRATE: "1",
        DATABASE_URL_UNPOOLED: POOLER,
      },
      clientFactory: async () => {
        connects += 1;
        return new FakeHeadlessMigrationClient();
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "POOLER_REJECTED");
    assert.equal(connects, 0);
  });

  await test("no app-startup/import migration side effects", () => {
    const runnerSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/migrations/run-headless-migrations.ts",
      ),
      "utf8",
    );
    const composeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/runtime/compose-production-control-plane.ts",
      ),
      "utf8",
    );
    assert.equal(composeSrc.includes("runHeadlessMigrations"), false);
    assert.equal(composeSrc.includes("HEADLESS_NEON_MIGRATE"), false);
    assert.ok(runnerSrc.includes("HEADLESS_NEON_MIGRATE"));
    // Ban call sites; comments may mention forbidden APIs.
    assert.equal(/\npool\.transaction\s*\(/.test(runnerSrc), false);
    assert.equal(/import\s*\{\s*neon\s*\}/.test(runnerSrc), false);
    assert.ok(runnerSrc.includes("new Client"));
  });

  await test("temp dir discovery rejects BEGIN/COMMIT wrappers", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "headless-mig-"));
    writeFileSync(
      path.join(dir, "001_bad.sql"),
      "BEGIN;\nCREATE TABLE t(id int);\nCOMMIT;\n",
      "utf8",
    );
    assert.throws(() => discoverHeadlessMigrationSources(dir));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
