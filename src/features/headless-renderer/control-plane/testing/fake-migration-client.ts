/**
 * Deterministic fake migration SQL client for authority fixtures.
 */

import type {
  HeadlessMigrationClient,
  HeadlessMigrationClientFactory,
} from "../migrations/run-headless-migrations";
import { HEADLESS_MIGRATION_ADVISORY_LOCK_KEY } from "../migrations/migration-catalog";

type LedgerRow = {
  migration_id: string;
  checksum_sha256: string;
  applied_at_ms: number;
};

export class FakeHeadlessMigrationClient implements HeadlessMigrationClient {
  readonly queries: { text: string; params?: readonly unknown[] }[] = [];
  ledger = new Map<string, LedgerRow>();
  ledgerTableExists = false;
  lockHeld = false;
  ended = false;
  failNextQuery: string | null = null;
  failOnSqlIncludes: string | null = null;
  concurrentLockBlocked = false;
  private txOpen = false;
  private rolledBack = false;

  async query(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }> {
    this.queries.push({ text, params });
    if (this.ended) {
      throw Object.assign(new Error("client_ended"), { code: "08003" });
    }
    if (this.failNextQuery != null) {
      const code = this.failNextQuery;
      this.failNextQuery = null;
      throw Object.assign(new Error("query_failed"), { code });
    }
    if (
      this.failOnSqlIncludes != null &&
      text.includes(this.failOnSqlIncludes)
    ) {
      throw Object.assign(new Error("query_failed"), { code: "XX000" });
    }

    const norm = text.replace(/\s+/g, " ").trim().toUpperCase();

    if (norm.startsWith("SELECT PG_ADVISORY_LOCK")) {
      if (this.concurrentLockBlocked && this.lockHeld) {
        throw Object.assign(new Error("lock_blocked"), { code: "55P03" });
      }
      this.lockHeld = true;
      return { rows: [{ pg_advisory_lock: params?.[0] }], rowCount: 1 };
    }
    if (norm.startsWith("SELECT PG_ADVISORY_UNLOCK")) {
      this.lockHeld = false;
      return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
    }
    if (norm === "BEGIN") {
      this.txOpen = true;
      this.rolledBack = false;
      return { rows: [], rowCount: 0 };
    }
    if (norm === "COMMIT") {
      this.txOpen = false;
      return { rows: [], rowCount: 0 };
    }
    if (norm === "ROLLBACK") {
      this.txOpen = false;
      this.rolledBack = true;
      return { rows: [], rowCount: 0 };
    }

    if (
      /FROM\s+(PUBLIC\.)?HEADLESS_SCHEMA_MIGRATIONS/.test(norm) &&
      norm.includes("WHERE MIGRATION_ID")
    ) {
      if (!this.ledgerTableExists) {
        throw Object.assign(new Error("undefined_table"), { code: "42P01" });
      }
      const id = String(params?.[0] ?? "");
      const row = this.ledger.get(id);
      return {
        rows: row
          ? [
              {
                migration_id: row.migration_id,
                checksum_sha256: row.checksum_sha256,
              },
            ]
          : [],
        rowCount: row ? 1 : 0,
      };
    }

    if (/INSERT INTO\s+(PUBLIC\.)?HEADLESS_SCHEMA_MIGRATIONS/.test(norm)) {
      if (!this.ledgerTableExists) {
        throw Object.assign(new Error("undefined_table"), { code: "42P01" });
      }
      const migrationId = String(params?.[0] ?? "");
      const checksum = String(params?.[1] ?? "");
      const appliedAt = Number(params?.[2] ?? 0);
      this.ledger.set(migrationId, {
        migration_id: migrationId,
        checksum_sha256: checksum,
        applied_at_ms: appliedAt,
      });
      return { rows: [], rowCount: 1 };
    }

    if (/SET_CONFIG\(\s*'SEARCH_PATH'/.test(norm)) {
      return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
    }

    // DDL / migration body
    if (
      text.includes("CREATE TABLE") &&
      text.includes("headless_schema_migrations")
    ) {
      this.ledgerTableExists = true;
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX") || text.includes("CREATE OR REPLACE FUNCTION") || text.includes("CREATE TRIGGER") || text.includes("COMMENT ON") || text.includes("DROP TRIGGER")) {
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  }

  async end(): Promise<void> {
    this.ended = true;
    this.lockHeld = false;
  }

  get wasRolledBack(): boolean {
    return this.rolledBack;
  }

  get advisoryLockKeySeen(): boolean {
    return this.queries.some(
      (q) =>
        /pg_advisory_lock/i.test(q.text) &&
        Array.isArray(q.params) &&
        q.params[0] === HEADLESS_MIGRATION_ADVISORY_LOCK_KEY,
    );
  }
}

export function createFakeMigrationClientFactory(
  client: FakeHeadlessMigrationClient,
): HeadlessMigrationClientFactory {
  return async () => client;
}
