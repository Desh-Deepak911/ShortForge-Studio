/**
 * Sprint 11E Phase 2E.2D.8C.2 — owned-object slot_key VARCHAR(1024) alignment authority.
 * Run: npm run test:headless-owned-object-slot-key-capacity-007-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT,
  embeddedSchemaFingerprintAsPreflightSources,
} from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import {
  discoverHeadlessMigrationSources,
  sha256Hex,
} from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
} from "@/features/headless-renderer/domain/headless-source-slot-key";
import {
  classifyPost007WorkerImageEligibility,
  HEADLESS_FLY_STAGING_PRE_007_SLOT_KEY_IMAGE_DIGEST,
  isPre007SlotKeyImageDigest,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-slot-key-007-authority";

import { deriveFlyRenderJobCreateStagingPayloads } from "../fly-render-live/job-create-fixture-identity";
import {
  classifyStagingSlotKeyLengthClass,
  NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT,
  NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
} from "../fly-render-live/owned-object-staging-attribution";
import { buildLiveDraft } from "../neon-live/live-fixtures";

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS_DIR = path.join(
  ROOT,
  "src/features/headless-renderer/control-plane/migrations",
);

const MIGRATION_007_ID = "007_headless_owned_object_slot_key_capacity";
const MIGRATION_007_CHECKSUM =
  "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244";
const MIGRATION_004_CHECKSUM =
  "a2f05a8316c1e257317975e2c47036034ceecebe423a62dfedc6f71149f60db3";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function scriptedExecutor(
  handler: (text: string, params?: readonly unknown[]) => {
    rows: unknown[];
    rowCount: number;
  },
): HeadlessSqlExecutor {
  const client: HeadlessSqlClient = {
    query: async <Row extends Record<string, unknown>>(
      text: string,
      params?: readonly unknown[],
    ) => handler(text, params) as { rows: Row[]; rowCount: number },
  };
  return {
    withClient: async <T>(fn: (client: HeadlessSqlClient) => Promise<T>) =>
      fn(client),
    withTransaction: async <T>(
      fn: (client: HeadlessSqlClient) => Promise<T>,
    ) => fn(client),
  };
}


async function liveShapedAssetSlotKeys(): Promise<string[]> {
  const draft = await buildLiveDraft({
    runId: randomUUID(),
    ownerId: "owner",
    projectId: randomUUID(),
    emptyStaging: true,
    creatorKey: "fixture",
    randomUUID: () => randomUUID(),
  });
  return deriveFlyRenderJobCreateStagingPayloads(draft)
    .filter((p) => p.purpose === "asset_bytes" && p.slotKey != null)
    .map((p) => p.slotKey!);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8C.2 — owned-object slot_key capacity 007 authority\n",
  );

  const sources = discoverHeadlessMigrationSources(MIGRATIONS_DIR);
  const m004 = sources.find((s) => s.migrationId === "004_headless_owned_objects");
  const m007 = sources.find((s) => s.migrationId === MIGRATION_007_ID);
  const sql007 = readFileSync(
    path.join(MIGRATIONS_DIR, "007_headless_owned_object_slot_key_capacity.sql"),
    "utf8",
  );

  await test("007 SQL contract: additive VARCHAR(1024) widen; no BEGIN/COMMIT", () => {
    assert.match(sql007, /ALTER TABLE public\.headless_owned_objects/);
    assert.match(sql007, /ALTER COLUMN slot_key TYPE VARCHAR\(1024\)/);
    assert.equal(/^\s*BEGIN\s*;\s*$/m.test(sql007), false);
    assert.equal(/^\s*COMMIT\s*;\s*$/m.test(sql007), false);
    assert.equal(sha256Hex(sql007), MIGRATION_007_CHECKSUM);
  });

  await test("004–006 checksums unchanged in embedded fingerprint", () => {
    const embedded = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations;
    const m004Emb = embedded.find((m) => m.migrationId.includes("004_"));
    const m005Emb = embedded.find((m) => m.migrationId.includes("005_"));
    const m006Emb = embedded.find((m) => m.migrationId.includes("006_"));
    assert.equal(m004!.checksumSha256, MIGRATION_004_CHECKSUM);
    assert.equal(m004Emb!.checksumSha256, m004!.checksumSha256);
    assert.equal(
      m005Emb!.checksumSha256,
      "59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d",
    );
    assert.equal(
      m006Emb!.checksumSha256,
      "960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1",
    );
  });

  await test("catalog order: 000,001,002,004,005,006,007,008,009 — no phantom 003", () => {
    assert.deepEqual(
      sources.map((s) => s.migrationId),
      [
        "000_headless_schema_migrations",
        "001_headless_project_ownership",
        "002_headless_jobs",
        "004_headless_owned_objects",
        "005_headless_cleanup_intents",
        "006_headless_render_dispatch_outbox",
        MIGRATION_007_ID,
        "008_headless_export_maintenance_lease",
        "009_headless_verify_queued_unclaimed",
      ],
    );
    assert.equal(sources.some((s) => s.migrationId.startsWith("003_")), false);
  });

  await test("embedded fingerprint includes 007 checksum", () => {
    assert.equal(HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.length, 9);
    const m007Emb = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.find(
      (m) => m.migrationId === MIGRATION_007_ID,
    );
    assert.ok(m007Emb);
    assert.equal(m007Emb!.checksumSha256, MIGRATION_007_CHECKSUM);
  });

  await test("slot_key length fixtures: <=128 preserved; live-shaped 145/179; 1024 ok; 1025 rejected", async () => {
    const within128 = "hslot:v2:" + "x".repeat(119);
    assert.equal(within128.length, 128);
    assert.equal(
      classifyStagingSlotKeyLengthClass({
        slotKey: within128,
        neonSqlVarcharLimit: NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
      }),
      "within_neon_varchar_128",
    );

    const liveKeys = await liveShapedAssetSlotKeys();
    assert.ok(liveKeys.length >= 1);
    for (const liveKey of liveKeys) {
      assert.ok(liveKey.length > NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT);
      assert.ok(liveKey.length <= HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH);
      assert.equal(
        classifyStagingSlotKeyLengthClass({
          slotKey: liveKey,
          neonSqlVarcharLimit: NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
        }),
        "within_canonical_sql_max",
      );
    }
    const lengths = liveKeys.map((k) => k.length);
    assert.ok(lengths.some((n) => n >= 145 && n <= 179));

    const exact1024 = "hslot:v2:" + "z".repeat(1015);
    assert.equal(exact1024.length, 1024);
    assert.equal(
      classifyStagingSlotKeyLengthClass({
        slotKey: exact1024,
        neonSqlVarcharLimit: NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
      }),
      "within_canonical_sql_max",
    );

    const over1024 = "hslot:v2:" + "q".repeat(1025);
    assert.equal(
      classifyStagingSlotKeyLengthClass({
        slotKey: over1024,
        neonSqlVarcharLimit: NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
      }),
      "exceeds_ts_max",
    );

    assert.equal(
      classifyStagingSlotKeyLengthClass({
        slotKey: null,
        neonSqlVarcharLimit: NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
      }),
      "none",
    );

    assert.equal(
      classifyStagingSlotKeyLengthClass({
        slotKey: liveKeys[0]!,
        neonSqlVarcharLimit: NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT,
      }),
      "exceeds_neon_varchar_128_within_ts_max",
    );
  });

  await test("malformed hslot:v2 still classified malformed", () => {
    assert.equal(
      classifyStagingSlotKeyLengthClass({
        slotKey: "hslot:v2:not-canonical",
        malformed: true,
      }),
      "malformed",
    );
  });

  await test("neon-schema-preflight binds slot_key capacity to HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH (1024)", () => {
    const preflightSrc = readFileSync(
      path.join(
        ROOT,
        "src/features/headless-renderer/control-plane/runtime/neon-schema-preflight.ts",
      ),
      "utf8",
    );
    assert.match(preflightSrc, /assertOwnedObjectSlotKeyColumnCapacity/);
    assert.match(
      preflightSrc,
      /OWNED_OBJECT_SLOT_KEY_SQL_CAPACITY[\s\S]*HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH/,
    );
    assert.match(preflightSrc, /character_maximum_length !== OWNED_OBJECT_SLOT_KEY_SQL_CAPACITY/);
    assert.match(preflightSrc, /slot_key capacity satisfied by wrong relation/);
  });

  await test("preflight fails when slot_key capacity is 128 (pre-007 drift)", async () => {
    const expected = embeddedSchemaFingerprintAsPreflightSources();
    const sql = scriptedExecutor((text) => {
      if (text.includes("information_schema.columns") && text.includes("slot_key")) {
        if (text.includes("COUNT(*)")) {
          return { rows: [{ n: "0" }], rowCount: 1 };
        }
        return {
          rows: [
            {
              character_maximum_length: 128,
              is_nullable: "YES",
              table_schema: "public",
              table_name: "headless_owned_objects",
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: expected.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256: s.checksumSha256,
          })),
          rowCount: expected.length,
        };
      }
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class")) {
        return { rows: [{ relkind: "r", relpersistence: "p" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({ sql, expectedSources: expected });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_INCOHERENT");
  });

  await test("preflight fails when wrong-relation column satisfies 1024 capacity", async () => {
    const expected = embeddedSchemaFingerprintAsPreflightSources();
    const sql = scriptedExecutor((text) => {
      if (text.includes("information_schema.columns") && text.includes("slot_key")) {
        if (text.includes("COUNT(*)")) {
          return { rows: [{ n: "1" }], rowCount: 1 };
        }
        return {
          rows: [
            {
              character_maximum_length: 1024,
              is_nullable: "YES",
              table_schema: "public",
              table_name: "headless_owned_objects",
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: expected.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256: s.checksumSha256,
          })),
          rowCount: expected.length,
        };
      }
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class")) {
        return { rows: [{ relkind: "r", relpersistence: "p" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({ sql, expectedSources: expected });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_INCOHERENT");
  });

  await test("missing migration 007 in ledger fails SCHEMA_DRIFT", async () => {
    const expected = embeddedSchemaFingerprintAsPreflightSources();
    const without007 = expected.filter((s) => s.migrationId !== MIGRATION_007_ID);
    const sql = scriptedExecutor((text) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class")) {
        return { rows: [{ relkind: "r", relpersistence: "p" }], rowCount: 1 };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: without007.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256: s.checksumSha256,
          })),
          rowCount: without007.length,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({ sql, expectedSources: expected });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.code === "SCHEMA_DRIFT" || result.code === "SCHEMA_MISSING");
    }
  });

  await test("007 checksum drift in ledger fails closed", async () => {
    const expected = embeddedSchemaFingerprintAsPreflightSources();
    const sql = scriptedExecutor((text) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class")) {
        return { rows: [{ relkind: "r", relpersistence: "p" }], rowCount: 1 };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: expected.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256:
              s.migrationId === MIGRATION_007_ID ? "f".repeat(64) : s.checksumSha256,
          })),
          rowCount: expected.length,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({ sql, expectedSources: expected });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("007 migration replay is idempotent (ALTER TYPE only)", () => {
    assert.equal(
      (m007!.sqlText.match(/ALTER COLUMN slot_key TYPE VARCHAR\(1024\)/g) ?? [])
        .length,
      1,
    );
    assert.equal(m007!.sqlText.includes("DROP TABLE"), false);
    assert.equal(m007!.sqlText.includes("TRUNCATE"), false);
  });

  await test("ae06963a pre-007 image marked ineligible post-007", () => {
    assert.equal(
      isPre007SlotKeyImageDigest(HEADLESS_FLY_STAGING_PRE_007_SLOT_KEY_IMAGE_DIGEST),
      true,
    );
    const verdict = classifyPost007WorkerImageEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_PRE_007_SLOT_KEY_IMAGE_DIGEST,
      schemaMigrationIds: HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.map(
        (m) => m.migrationId,
      ),
    });
    assert.equal(verdict.eligible, false);
    if (!verdict.eligible) {
      assert.equal(verdict.reasonId, "pre_007_image_digest");
    }
  });

  await test("embedded fingerprint drift fails build-headless-worker", () => {
    const fpPath = path.join(MIGRATIONS_DIR, "embedded-schema-fingerprint.ts");
    const original = readFileSync(fpPath, "utf8");
    const tampered = original.replace(
      MIGRATION_007_CHECKSUM,
      "0".repeat(64),
    );
    writeFileSync(fpPath, tampered);
    try {
      const build = spawnSync("node", ["scripts/build-headless-worker.mjs"], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 180_000,
      });
      assert.notEqual(build.status, 0);
      assert.match(build.stderr + build.stdout, /EMBEDDED_FINGERPRINT|DRIFT/i);
    } finally {
      writeFileSync(fpPath, original);
    }
  });

  await test("TypeScript canonical max remains 1024", () => {
    assert.equal(HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH, 1024);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
