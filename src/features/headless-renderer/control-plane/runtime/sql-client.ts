/**
 * Provider-neutral SQL execution seam for Neon adapters.
 * Fixture-tested without a real database via testing FakeHeadlessSqlExecutor.
 */

export interface HeadlessSqlQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

export interface HeadlessSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<HeadlessSqlQueryResult<Row>>;
}

export interface HeadlessSqlExecutor {
  withClient<T>(fn: (client: HeadlessSqlClient) => Promise<T>): Promise<T>;

  withTransaction<T>(
    fn: (client: HeadlessSqlClient) => Promise<T>,
  ): Promise<T>;
}

/** Safe marker for executor failures already mapped to control-plane codes. */
export class HeadlessSqlExecutorError extends Error {
  readonly code: "DATABASE_UNAVAILABLE" | "INTERNAL_ERROR";

  constructor(
    code: "DATABASE_UNAVAILABLE" | "INTERNAL_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "HeadlessSqlExecutorError";
    this.code = code;
  }
}

export function isHeadlessSqlExecutorError(
  value: unknown,
): value is HeadlessSqlExecutorError {
  return value instanceof HeadlessSqlExecutorError;
}
