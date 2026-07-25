/**
 * Production Neon SQL executor — Pool.connect interactive transactions.
 *
 * Lifecycle is per operation/request:
 *   create Pool → connect → BEGIN → callback → COMMIT|ROLLBACK → release → pool.end
 *
 * Never uses pool.transaction( or HTTP neon() for interactive CAS.
 * Never retains a global Pool.
 *
 * Node 22+ provides global WebSocket; ws is not required on this runtime.
 */

import { Pool } from "@neondatabase/serverless";

import {
  extractHeadlessPgSqlState,
  HeadlessPostgresSqlError,
  HEADLESS_PG_SQLSTATE,
  toBoundedPostgresError,
} from "./map-database-failure";
import {
  HeadlessSqlExecutorError,
  type HeadlessSqlClient,
  type HeadlessSqlExecutor,
  type HeadlessSqlQueryResult,
} from "./sql-client";

export type NeonQueryable = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  release: () => void;
};

export type NeonPoolLike = {
  connect: () => Promise<NeonQueryable>;
  end: () => Promise<void>;
};

export type NeonPoolFactory = (connectionString: string) => NeonPoolLike;

const defaultPoolFactory: NeonPoolFactory = (connectionString) => {
  const pool = new Pool({ connectionString });
  return {
    connect: async () => (await pool.connect()) as unknown as NeonQueryable,
    end: async () => {
      await pool.end();
    },
  };
};

function wrapClient(raw: NeonQueryable): HeadlessSqlClient {
  return {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: readonly unknown[],
    ): Promise<HeadlessSqlQueryResult<Row>> {
      try {
        const result = await raw.query(
          text,
          params ? [...params] : undefined,
        );
        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      } catch (error) {
        throw toBoundedPostgresError(error);
      }
    },
  };
}

function rethrowBounded(error: unknown): never {
  if (isRetainedBounded(error)) throw error;
  throw toBoundedPostgresError(error);
}

function isRetainedBounded(error: unknown): boolean {
  return (
    error instanceof HeadlessSqlExecutorError ||
    error instanceof HeadlessPostgresSqlError
  );
}

export type NeonSqlExecutorOptions = {
  readonly connectionString: string;
  /** Testing-only Pool factory injection. */
  readonly poolFactory?: NeonPoolFactory;
};

/**
 * Create a per-operation Neon SQL executor bound to a connection string.
 * The string must already have been classified `configured` by the caller.
 */
export function createNeonSqlExecutor(
  options: NeonSqlExecutorOptions,
): HeadlessSqlExecutor {
  const connectionString = options.connectionString;
  const poolFactory = options.poolFactory ?? defaultPoolFactory;

  return {
    async withClient<T>(fn: (client: HeadlessSqlClient) => Promise<T>): Promise<T> {
      const pool = poolFactory(connectionString);
      let client: NeonQueryable | null = null;
      try {
        client = await pool.connect();
        return await fn(wrapClient(client));
      } catch (error) {
        rethrowBounded(error);
      } finally {
        try {
          client?.release();
        } catch {
          // ignore release failures
        }
        try {
          await pool.end();
        } catch {
          // ignore end failures
        }
      }
    },

    async withTransaction<T>(
      fn: (client: HeadlessSqlClient) => Promise<T>,
    ): Promise<T> {
      const pool = poolFactory(connectionString);
      let client: NeonQueryable | null = null;
      let began = false;
      try {
        client = await pool.connect();
        const sql = wrapClient(client);
        await sql.query("BEGIN");
        began = true;
        const value = await fn(sql);
        await sql.query("COMMIT");
        began = false;
        return value;
      } catch (error) {
        if (began && client) {
          try {
            await wrapClient(client).query("ROLLBACK");
          } catch {
            // ignore rollback failures — never surface secrets
          }
        }
        // 25P02 escaping the helper is an internal/database failure.
        if (
          extractHeadlessPgSqlState(error) ===
          HEADLESS_PG_SQLSTATE.IN_FAILED_SQL_TRANSACTION
        ) {
          throw new HeadlessSqlExecutorError(
            "INTERNAL_ERROR",
            "Database transaction was left in a failed state.",
          );
        }
        rethrowBounded(error);
      } finally {
        try {
          client?.release();
        } catch {
          // ignore
        }
        try {
          await pool.end();
        } catch {
          // ignore
        }
      }
    },
  };
}
