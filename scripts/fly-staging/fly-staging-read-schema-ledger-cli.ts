#!/usr/bin/env -S npx tsx
/**
 * Read-only schema migration ledger classification for staging baseline proofs.
 * Never prints DATABASE_URL or secret values.
 */

import { createNeonSqlExecutor } from "../../src/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "../../src/features/headless-renderer/control-plane/runtime/neon-environment";

function stripOptionalEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readSchemaLedgerConnectionString(): string | null {
  const configured = readConfiguredHeadlessDatabaseUrl(process.env);
  if (configured != null) {
    return configured;
  }
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = stripOptionalEnvQuotes(raw);
  if (trimmed.length === 0) {
    return null;
  }
  if (classifyHeadlessNeonEnvironment({ DATABASE_URL: trimmed }) !== "configured") {
    return null;
  }
  return trimmed;
}

async function main(): Promise<void> {
  const connectionString = readSchemaLedgerConnectionString();
  if (connectionString == null) {
    console.log("fail_class=database_url_unreadable");
    process.exit(1);
  }
  const sql = createNeonSqlExecutor({ connectionString });
  const rows = await sql.withClient(async (client) => {
    const result = await client.query<{ migration_id: string }>(
      `SELECT migration_id FROM public.headless_schema_migrations ORDER BY migration_id ASC`,
    );
    return result.rows.map((row) => row.migration_id);
  });
  console.log(`schema_migration_count=${rows.length}`);
  console.log(`schema_latest_migration=${rows[rows.length - 1] ?? "none"}`);
  if (rows.includes("008_headless_export_maintenance_lease")) {
    console.log("schema_has_008=true");
  } else {
    console.log("schema_has_008=false");
  }
}

main().catch(() => {
  console.log("fail_class=schema_ledger_read_failed");
  process.exit(1);
});
