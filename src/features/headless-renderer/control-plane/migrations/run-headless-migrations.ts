/**
 * Explicit operator-triggered Headless Neon migration runner.
 *
 * Requires HEADLESS_NEON_MIGRATE=1 and valid DATABASE_URL_UNPOOLED.
 * Never falls back to DATABASE_URL. Never uses pool.transaction( or HTTP neon().
 * Never runs on app startup / import / route handling.
 */

import { Client } from "@neondatabase/serverless";

import {
  classifyHeadlessNeonMigrationEnvironment,
  isHeadlessNeonMigrateGateEnabled,
  readConfiguredHeadlessMigrationDatabaseUrl,
} from "../runtime/neon-migration-environment";
import {
  discoverHeadlessMigrationSources,
  HEADLESS_MIGRATION_ADVISORY_LOCK_KEY,
  type HeadlessMigrationSource,
} from "./migration-catalog";

export type HeadlessMigrationClient = {
  query(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
  end(): Promise<void>;
};

export type HeadlessMigrationClientFactory = (
  connectionString: string,
) => Promise<HeadlessMigrationClient>;

export type HeadlessMigrationApplyResult =
  | {
      readonly ok: true;
      readonly applied: readonly string[];
      readonly skipped: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code:
        | "GATE_DISABLED"
        | "CONFIGURATION_UNAVAILABLE"
        | "POOLER_REJECTED"
        | "MIGRATION_DRIFT"
        | "MIGRATION_FAILED"
        | "LOCK_FAILED";
      readonly message: string;
    };

export type RunHeadlessMigrationsOptions = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly migrationsDirectory?: string;
  readonly clientFactory?: HeadlessMigrationClientFactory;
  readonly nowMs?: () => number;
  /** When true, skip gate/env checks (deterministic unit tests only). */
  readonly bypassOperatorGate?: boolean;
  readonly connectionStringForTest?: string;
};

const defaultClientFactory: HeadlessMigrationClientFactory = async (
  connectionString,
) => {
  const client = new Client({ connectionString });
  await client.connect();
  return {
    query: async (text, params) => {
      const result = await client.query(
        text,
        params ? [...params] : undefined,
      );
      return {
        rows: result.rows as unknown[],
        rowCount: result.rowCount,
      };
    },
    end: async () => {
      await client.end();
    },
  };
};

function refuse(
  code: Extract<HeadlessMigrationApplyResult, { ok: false }>["code"],
  message: string,
): HeadlessMigrationApplyResult {
  return { ok: false, code, message };
}

/**
 * Apply repository SQL migrations transactionally with ledger + advisory lock.
 */
export async function runHeadlessMigrations(
  options: RunHeadlessMigrationsOptions = {},
): Promise<HeadlessMigrationApplyResult> {
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? (() => Date.now());
  const clientFactory = options.clientFactory ?? defaultClientFactory;

  if (!options.bypassOperatorGate) {
    if (!isHeadlessNeonMigrateGateEnabled(env)) {
      return refuse(
        "GATE_DISABLED",
        "Migration refused: set HEADLESS_NEON_MIGRATE=1 for the explicit operator command.",
      );
    }
    const status = classifyHeadlessNeonMigrationEnvironment(env);
    if (status === "pooler_rejected") {
      return refuse(
        "POOLER_REJECTED",
        "Migration refused: DATABASE_URL_UNPOOLED must be a direct (non-pooler) endpoint.",
      );
    }
    if (status !== "configured") {
      return refuse(
        "CONFIGURATION_UNAVAILABLE",
        "Migration refused: DATABASE_URL_UNPOOLED is missing or invalid.",
      );
    }
  }

  const connectionString =
    options.connectionStringForTest ??
    readConfiguredHeadlessMigrationDatabaseUrl(env);
  if (
    typeof connectionString !== "string" ||
    connectionString.trim().length === 0
  ) {
    return refuse(
      "CONFIGURATION_UNAVAILABLE",
      "Migration refused: direct migration URL is unavailable.",
    );
  }

  let sources: readonly HeadlessMigrationSource[];
  try {
    sources = discoverHeadlessMigrationSources(options.migrationsDirectory);
  } catch {
    return refuse(
      "MIGRATION_FAILED",
      "Migration refused: migration catalog is invalid.",
    );
  }

  let client: HeadlessMigrationClient | null = null;
  let lockHeld = false;
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    client = await clientFactory(connectionString);
    await client.query("SELECT pg_advisory_lock($1)", [
      HEADLESS_MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    lockHeld = true;

    for (const source of sources) {
      const outcome = await applyOneMigration(client, source, nowMs());
      if (!outcome.ok) {
        return refuse(outcome.code, outcome.message);
      }
      if (outcome.kind === "applied") {
        applied.push(source.migrationId);
      } else {
        skipped.push(source.migrationId);
      }
    }

    return { ok: true, applied, skipped };
  } catch {
    return refuse(
      "MIGRATION_FAILED",
      "Migration failed: durable schema apply did not complete.",
    );
  } finally {
    if (client && lockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          HEADLESS_MIGRATION_ADVISORY_LOCK_KEY,
        ]);
      } catch {
        // release/end still attempted below
      }
    }
    if (client) {
      try {
        await client.end();
      } catch {
        // swallow — never surface provider text
      }
    }
  }
}

type OneResult =
  | { readonly ok: true; readonly kind: "applied" | "skipped" }
  | {
      readonly ok: false;
      readonly code: "MIGRATION_DRIFT" | "MIGRATION_FAILED";
      readonly message: string;
    };

async function safeRollback(client: HeadlessMigrationClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
}

async function applyOneMigration(
  client: HeadlessMigrationClient,
  source: HeadlessMigrationSource,
  appliedAtMs: number,
): Promise<OneResult> {
  let ledgerLookup:
    | { readonly kind: "missing_table" }
    | { readonly kind: "rows"; readonly rows: readonly unknown[] }
    | { readonly kind: "error" };

  try {
    await client.query("BEGIN");
    // Fixed safe path for this transaction — never trust caller search_path.
    await client.query("SELECT set_config('search_path', 'public, pg_temp', true)");
    const existing = await client.query(
      `
SELECT migration_id, checksum_sha256
FROM public.headless_schema_migrations
WHERE migration_id = $1
`,
      [source.migrationId],
    );
    ledgerLookup = { kind: "rows", rows: existing.rows };
  } catch (error) {
    await safeRollback(client);
    if (isUndefinedTableError(error)) {
      ledgerLookup = { kind: "missing_table" };
    } else {
      ledgerLookup = { kind: "error" };
    }
  }

  if (ledgerLookup.kind === "error") {
    return {
      ok: false,
      code: "MIGRATION_FAILED",
      message: "Migration failed: ledger lookup did not complete.",
    };
  }

  if (ledgerLookup.kind === "missing_table") {
    if (source.migrationId !== "000_headless_schema_migrations") {
      return {
        ok: false,
        code: "MIGRATION_FAILED",
        message: "Migration failed: ledger table is missing.",
      };
    }
    return applySqlAndRecord(client, source, appliedAtMs);
  }

  if (ledgerLookup.rows.length === 1) {
    const row = ledgerLookup.rows[0] as {
      checksum_sha256?: unknown;
    };
    const checksum =
      typeof row.checksum_sha256 === "string" ? row.checksum_sha256 : "";
    if (checksum !== source.checksumSha256) {
      await safeRollback(client);
      return {
        ok: false,
        code: "MIGRATION_DRIFT",
        message:
          "Migration drift: applied checksum does not match repository migration.",
      };
    }
    try {
      await client.query("COMMIT");
    } catch {
      await safeRollback(client);
      return {
        ok: false,
        code: "MIGRATION_FAILED",
        message: "Migration failed: could not commit no-op transaction.",
      };
    }
    return { ok: true, kind: "skipped" };
  }

  // No ledger row — apply inside the open transaction.
  return finishApplyInOpenTransaction(client, source, appliedAtMs);
}

async function applySqlAndRecord(
  client: HeadlessMigrationClient,
  source: HeadlessMigrationSource,
  appliedAtMs: number,
): Promise<OneResult> {
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('search_path', 'public, pg_temp', true)");
    return await finishApplyInOpenTransaction(client, source, appliedAtMs);
  } catch {
    await safeRollback(client);
    return {
      ok: false,
      code: "MIGRATION_FAILED",
      message: "Migration failed: statement apply rolled back.",
    };
  }
}

async function finishApplyInOpenTransaction(
  client: HeadlessMigrationClient,
  source: HeadlessMigrationSource,
  appliedAtMs: number,
): Promise<OneResult> {
  try {
    await client.query("SELECT set_config('search_path', 'public, pg_temp', true)");
    await client.query(source.sqlText);
    await client.query(
      `
INSERT INTO public.headless_schema_migrations (migration_id, checksum_sha256, applied_at_ms)
VALUES ($1, $2, $3)
`,
      [source.migrationId, source.checksumSha256, appliedAtMs],
    );
    await client.query("COMMIT");
    return { ok: true, kind: "applied" };
  } catch {
    await safeRollback(client);
    return {
      ok: false,
      code: "MIGRATION_FAILED",
      message: "Migration failed: statement apply rolled back.",
    };
  }
}

function isUndefinedTableError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  try {
    const code = (error as { code?: unknown }).code;
    return code === "42P01";
  } catch {
    return false;
  }
}
