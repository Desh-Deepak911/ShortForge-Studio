/**
 * Sprint 11E Phase 2B.2B.1 — relation-bound schema preflight authority.
 * Run: npm run test:headless-neon-schema-preflight-authority
 */

import assert from "node:assert/strict";

import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/runtime/sql-client";

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
    query: async (text, params) => handler(text, params),
  };
  return {
    withClient: async (fn) => fn(client),
    withTransaction: async (fn) => fn(client),
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2B.2B.1 — Neon schema preflight authority\n",
  );

  const sources = discoverHeadlessMigrationSources();

  await test("unrelated same-named constraint in other schema fails", async () => {
    const sql = scriptedExecutor((text) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class") && text.includes("relkind")) {
        return {
          rows: [{ relkind: "r", relpersistence: "p" }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: sources.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256: s.checksumSha256,
          })),
          rowCount: sources.length,
        };
      }
      // Global-name-only style would pass; relation-bound query returns empty.
      if (text.includes("FROM pg_constraint")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({
      sql,
      expectedSources: sources,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_INCOHERENT");
  });

  await test("index in public but wrong table fails", async () => {
    let constraintOk = true;
    const sql = scriptedExecutor((text, params) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class") && text.includes("relkind")) {
        return {
          rows: [{ relkind: "r", relpersistence: "p" }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: sources.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256: s.checksumSha256,
          })),
          rowCount: sources.length,
        };
      }
      if (text.includes("FROM pg_constraint") && text.includes("convalidated")) {
        const name = String(params?.[0] ?? "");
        const table = String(params?.[1] ?? "");
        if (name.includes("fk_project_owner")) {
          // First query for contype — return f, then fk detail query.
          if (text.includes("confrelid")) {
            return {
              rows: [
                {
                  contype: "f",
                  convalidated: true,
                  table_name: table,
                  nspname: "public",
                  confrelid: "1",
                  conkey: [1, 2],
                  confkey: [1, 2],
                },
              ],
              rowCount: 1,
            };
          }
        }
        return {
          rows: [
            {
              contype:
                name.includes("uuid_v4") ||
                name.includes("stage_valid") ||
                name.includes("state_valid") ||
                name.includes("matches_json")
                  ? "c"
                  : name.includes("unique")
                    ? "u"
                    : "f",
              convalidated: true,
              table_name: table,
              nspname: "public",
              confrelid: null,
              conkey: null,
              confkey: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("ref_table")) {
        return {
          rows: [
            {
              ref_table: "headless_project_ownership",
              ref_nsp: "public",
              cols: ["project_id", "owner_id"],
              ref_cols: ["project_id", "owner_id"],
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("FROM pg_index")) {
        // Wrong owning relation — empty for expected table.
        constraintOk = false;
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({
      sql,
      expectedSources: sources,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_INCOHERENT");
    assert.equal(constraintOk, false);
  });

  await test("unexpected newer migration ID fails closed", async () => {
    const sql = scriptedExecutor((text) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class") && text.includes("relkind")) {
        return {
          rows: [{ relkind: "r", relpersistence: "p" }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: [
            ...sources.map((s) => ({
              migration_id: s.migrationId,
              checksum_sha256: s.checksumSha256,
            })),
            {
              migration_id: "999_unexpected_future",
              checksum_sha256: "a".repeat(64),
            },
          ],
          rowCount: sources.length + 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({
      sql,
      expectedSources: sources,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("checksum drift fails closed", async () => {
    const sql = scriptedExecutor((text) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class") && text.includes("relkind")) {
        return {
          rows: [{ relkind: "r", relpersistence: "p" }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: sources.map((s, i) => ({
            migration_id: s.migrationId,
            checksum_sha256: i === 0 ? "b".repeat(64) : s.checksumSha256,
          })),
          rowCount: sources.length,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({
      sql,
      expectedSources: sources,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("migrations are schema-qualified to public", () => {
    for (const source of sources) {
      assert.match(source.sqlText, /public\.headless_/);
      assert.equal(/^\s*BEGIN\s*;\s*$/m.test(source.sqlText), false);
      assert.equal(/^\s*COMMIT\s*;\s*$/m.test(source.sqlText), false);
    }
    assert.match(
      sources[0]!.sqlText,
      /CREATE TABLE IF NOT EXISTS public\.headless_schema_migrations/,
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
