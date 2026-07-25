/**
 * Testing-only SQL executor — scripted + in-memory fixtures for Neon adapters.
 * Never exported through the production barrel.
 */

import {
  HeadlessPostgresSqlError,
  HEADLESS_PG_SQLSTATE,
} from "../runtime/map-database-failure";
import { HeadlessSqlExecutorError } from "../runtime/sql-client";
import type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
  HeadlessSqlQueryResult,
} from "../runtime/sql-client";
import { HEADLESS_JOB_SELECT_COLUMNS } from "../services/map-headless-job-sql-row";
import { HEADLESS_OWNED_OBJECT_SELECT_COLUMNS } from "../services/map-headless-owned-object-sql-row";

export type FakeSqlCapturedQuery = {
  readonly text: string;
  readonly paramCount: number;
  /** Parameter kinds only — never log secret string values. */
  readonly paramKinds: readonly string[];
};

export type FakeSqlScriptedResult =
  | {
      readonly kind: "rows";
      readonly rows: readonly Record<string, unknown>[];
      readonly rowCount?: number;
    }
  | { readonly kind: "unique_violation" }
  | { readonly kind: "query_failure" }
  | { readonly kind: "connection_failure" };

export type FakeTxState = "idle" | "open" | "aborted";

function paramKind(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "unknown";
}

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, " ").trim().toUpperCase();
}

function throwInFailedSqlTransaction(): never {
  throw new HeadlessPostgresSqlError(
    HEADLESS_PG_SQLSTATE.IN_FAILED_SQL_TRANSACTION,
  );
}

function throwUniqueViolation(): never {
  const err = new HeadlessPostgresSqlError(HEADLESS_PG_SQLSTATE.UNIQUE_VIOLATION);
  throw err;
}

/**
 * Scripted executor — returns preconfigured results in order.
 * Models PostgreSQL aborted-transaction semantics + savepoints.
 */
export class ScriptedHeadlessSqlExecutor implements HeadlessSqlExecutor {
  private readonly script: FakeSqlScriptedResult[];
  private index = 0;
  readonly queries: FakeSqlCapturedQuery[] = [];
  readonly savepointEvents: string[] = [];
  private forceConnectionFailure = false;
  private txState: FakeTxState = "idle";
  private savepoints: string[] = [];
  private rolledBack = false;
  private committed = false;

  constructor(script: readonly FakeSqlScriptedResult[] = []) {
    this.script = [...script];
  }

  injectConnectionFailure(): void {
    this.forceConnectionFailure = true;
  }

  appendScript(steps: readonly FakeSqlScriptedResult[]): void {
    this.script.push(...steps);
  }

  get transactionRolledBack(): boolean {
    return this.rolledBack;
  }

  get transactionCommitted(): boolean {
    return this.committed;
  }

  get transactionState(): FakeTxState {
    return this.txState;
  }

  private nextResult(text: string): HeadlessSqlQueryResult<Record<string, unknown>> {
    const norm = normalizeSql(text);

    if (norm === "BEGIN") {
      this.txState = "open";
      this.savepoints = [];
      this.rolledBack = false;
      this.committed = false;
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith("SAVEPOINT ")) {
      if (this.txState === "aborted") throwInFailedSqlTransaction();
      if (this.txState !== "open") {
        throw new HeadlessSqlExecutorError(
          "INTERNAL_ERROR",
          "SAVEPOINT outside transaction.",
        );
      }
      const name = norm.slice("SAVEPOINT ".length).trim();
      this.savepoints.push(name);
      this.savepointEvents.push(`SAVEPOINT ${name}`);
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith("ROLLBACK TO SAVEPOINT ")) {
      if (this.txState === "idle") {
        throw new HeadlessSqlExecutorError(
          "INTERNAL_ERROR",
          "ROLLBACK TO SAVEPOINT outside transaction.",
        );
      }
      const name = norm.slice("ROLLBACK TO SAVEPOINT ".length).trim();
      const idx = this.savepoints.lastIndexOf(name);
      if (idx < 0) {
        throw new HeadlessSqlExecutorError(
          "INTERNAL_ERROR",
          "Unknown savepoint.",
        );
      }
      this.savepoints = this.savepoints.slice(0, idx + 1);
      this.txState = "open";
      this.savepointEvents.push(`ROLLBACK TO SAVEPOINT ${name}`);
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith("RELEASE SAVEPOINT ")) {
      if (this.txState === "aborted") throwInFailedSqlTransaction();
      const name = norm.slice("RELEASE SAVEPOINT ".length).trim();
      const idx = this.savepoints.lastIndexOf(name);
      if (idx >= 0) {
        this.savepoints = this.savepoints.slice(0, idx);
      }
      this.savepointEvents.push(`RELEASE SAVEPOINT ${name}`);
      return { rows: [], rowCount: 0 };
    }
    if (norm === "COMMIT") {
      if (this.txState === "aborted") throwInFailedSqlTransaction();
      this.txState = "idle";
      this.savepoints = [];
      this.committed = true;
      return { rows: [], rowCount: 0 };
    }
    if (norm === "ROLLBACK") {
      this.txState = "idle";
      this.savepoints = [];
      this.rolledBack = true;
      return { rows: [], rowCount: 0 };
    }

    if (this.txState === "aborted") {
      throwInFailedSqlTransaction();
    }

    if (this.index >= this.script.length) {
      throw new HeadlessSqlExecutorError(
        "INTERNAL_ERROR",
        "Scripted SQL executor exhausted.",
      );
    }
    const step = this.script[this.index]!;
    this.index += 1;
    if (step.kind === "connection_failure") {
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    if (step.kind === "query_failure") {
      if (this.txState === "open") this.txState = "aborted";
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    if (step.kind === "unique_violation") {
      if (this.txState === "open") this.txState = "aborted";
      throwUniqueViolation();
    }
    return {
      rows: step.rows,
      rowCount: step.rowCount ?? step.rows.length,
    };
  }

  private makeClient(): HeadlessSqlClient {
    return {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params?: readonly unknown[],
      ) => {
        this.queries.push({
          text,
          paramCount: params?.length ?? 0,
          paramKinds: (params ?? []).map(paramKind),
        });
        const result = this.nextResult(text);
        return result as HeadlessSqlQueryResult<Row>;
      },
    };
  }

  async withClient<T>(fn: (client: HeadlessSqlClient) => Promise<T>): Promise<T> {
    if (this.forceConnectionFailure) {
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    // Reset per-operation — state must not leak across operations.
    this.txState = "idle";
    this.savepoints = [];
    return fn(this.makeClient());
  }

  async withTransaction<T>(
    fn: (client: HeadlessSqlClient) => Promise<T>,
  ): Promise<T> {
    if (this.forceConnectionFailure) {
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    this.txState = "idle";
    this.savepoints = [];
    const client = this.makeClient();
    await client.query("BEGIN");
    try {
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    } finally {
      this.txState = "idle";
      this.savepoints = [];
    }
  }
}

type OwnershipRow = {
  project_id: string;
  owner_id: string;
  created_at_ms: number;
};

type JobRow = Record<string, unknown>;

/**
 * In-memory SQL fixture that understands Neon adapter query shapes.
 * Deterministic CAS / idempotency / ownership semantics for parity tests.
 */
type OwnedObjectRow = Record<string, unknown>;

export class InMemoryHeadlessSqlFixture implements HeadlessSqlExecutor {
  readonly ownership = new Map<string, OwnershipRow>();
  readonly jobsById = new Map<string, JobRow>();
  readonly ownedObjectsById = new Map<string, OwnedObjectRow>();
  readonly dispatchOutboxById = new Map<string, JobRow>();
  readonly queries: FakeSqlCapturedQuery[] = [];
  readonly savepointEvents: string[] = [];
  private forceConnectionFailure = false;
  private nextQueryFailure = false;
  private nextUniqueViolation = false;
  private nextOutboxInsertFailure = false;
  private txState: FakeTxState = "idle";
  private savepoints: string[] = [];
  private txDataSnapshot: {
    jobs: Map<string, JobRow>;
    outbox: Map<string, JobRow>;
  } | null = null;

  get transactionState(): FakeTxState {
    return this.txState;
  }

  injectConnectionFailure(): void {
    this.forceConnectionFailure = true;
  }

  injectNextQueryFailure(): void {
    this.nextQueryFailure = true;
  }

  injectNextUniqueViolation(): void {
    this.nextUniqueViolation = true;
  }

  /** Fail the next outbox INSERT inside an open transaction (rollback proof). */
  injectNextOutboxInsertFailure(): void {
    this.nextOutboxInsertFailure = true;
  }

  private captureTxDataSnapshot(): void {
    const jobs = new Map<string, JobRow>();
    for (const [k, v] of this.jobsById) {
      jobs.set(k, JSON.parse(JSON.stringify(v)) as JobRow);
    }
    const outbox = new Map<string, JobRow>();
    for (const [k, v] of this.dispatchOutboxById) {
      outbox.set(k, JSON.parse(JSON.stringify(v)) as JobRow);
    }
    this.txDataSnapshot = { jobs, outbox };
  }

  private restoreTxDataSnapshot(): void {
    if (this.txDataSnapshot == null) return;
    this.jobsById.clear();
    for (const [k, v] of this.txDataSnapshot.jobs) {
      this.jobsById.set(k, v);
    }
    this.dispatchOutboxById.clear();
    for (const [k, v] of this.txDataSnapshot.outbox) {
      this.dispatchOutboxById.set(k, v);
    }
    this.txDataSnapshot = null;
  }

  private discardTxDataSnapshot(): void {
    this.txDataSnapshot = null;
  }

  seedOwnership(row: OwnershipRow): void {
    this.ownership.set(row.project_id, { ...row });
  }

  seedJob(row: JobRow): void {
    if (typeof row.job_id !== "string") {
      throw new Error("seedJob requires job_id");
    }
    this.jobsById.set(row.job_id, { ...row });
  }

  seedOwnedObject(row: OwnedObjectRow): void {
    if (typeof row.object_id !== "string") {
      throw new Error("seedOwnedObject requires object_id");
    }
    this.ownedObjectsById.set(row.object_id, { ...row });
  }

  private cloneOwnedObject(row: OwnedObjectRow): OwnedObjectRow {
    const cloned = JSON.parse(JSON.stringify(row)) as OwnedObjectRow;
    for (const key of [
      "store_version",
      "expected_byte_length",
      "byte_length",
      "upload_capability_issued_at_ms",
      "upload_capability_expires_at_ms",
      "uploaded_observed_at_ms",
      "verification_claimed_at_ms",
      "verified_at_ms",
      "expires_at_ms",
      "cleanup_scheduled_at_ms",
      "created_at_ms",
      "updated_at_ms",
    ] as const) {
      if (typeof cloned[key] === "number") {
        cloned[key] = String(cloned[key]);
      }
    }
    return cloned;
  }

  private findOwnedByStoreKey(
    storeId: string,
    objectKey: string,
  ): OwnedObjectRow | null {
    for (const row of this.ownedObjectsById.values()) {
      if (row.store_id === storeId && row.object_key === objectKey) {
        return row;
      }
    }
    return null;
  }

  private capture(text: string, params?: readonly unknown[]): void {
    this.queries.push({
      text,
      paramCount: params?.length ?? 0,
      paramKinds: (params ?? []).map(paramKind),
    });
  }

  private assertNoInjection(): void {
    if (this.forceConnectionFailure) {
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    if (this.nextQueryFailure) {
      this.nextQueryFailure = false;
      if (this.txState === "open") this.txState = "aborted";
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    if (this.nextUniqueViolation) {
      this.nextUniqueViolation = false;
      if (this.txState === "open") this.txState = "aborted";
      throwUniqueViolation();
    }
  }

  private handleTxControl(
    norm: string,
  ): HeadlessSqlQueryResult<Record<string, unknown>> | null {
    if (norm === "BEGIN") {
      this.txState = "open";
      this.savepoints = [];
      this.captureTxDataSnapshot();
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith("SAVEPOINT ")) {
      if (this.txState === "aborted") throwInFailedSqlTransaction();
      if (this.txState !== "open") {
        throw new HeadlessSqlExecutorError(
          "INTERNAL_ERROR",
          "SAVEPOINT outside transaction.",
        );
      }
      const name = norm.slice("SAVEPOINT ".length).trim();
      this.savepoints.push(name);
      this.savepointEvents.push(`SAVEPOINT ${name}`);
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith("ROLLBACK TO SAVEPOINT ")) {
      if (this.txState === "idle") {
        throw new HeadlessSqlExecutorError(
          "INTERNAL_ERROR",
          "ROLLBACK TO SAVEPOINT outside transaction.",
        );
      }
      const name = norm.slice("ROLLBACK TO SAVEPOINT ".length).trim();
      const idx = this.savepoints.lastIndexOf(name);
      if (idx < 0) {
        throw new HeadlessSqlExecutorError(
          "INTERNAL_ERROR",
          "Unknown savepoint.",
        );
      }
      this.savepoints = this.savepoints.slice(0, idx + 1);
      this.txState = "open";
      this.savepointEvents.push(`ROLLBACK TO SAVEPOINT ${name}`);
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith("RELEASE SAVEPOINT ")) {
      if (this.txState === "aborted") throwInFailedSqlTransaction();
      const name = norm.slice("RELEASE SAVEPOINT ".length).trim();
      const idx = this.savepoints.lastIndexOf(name);
      if (idx >= 0) this.savepoints = this.savepoints.slice(0, idx);
      this.savepointEvents.push(`RELEASE SAVEPOINT ${name}`);
      return { rows: [], rowCount: 0 };
    }
    if (norm === "COMMIT") {
      if (this.txState === "aborted") throwInFailedSqlTransaction();
      this.txState = "idle";
      this.savepoints = [];
      this.discardTxDataSnapshot();
      return { rows: [], rowCount: 0 };
    }
    if (norm === "ROLLBACK") {
      this.restoreTxDataSnapshot();
      this.txState = "idle";
      this.savepoints = [];
      return { rows: [], rowCount: 0 };
    }
    return null;
  }

  private cloneJob(row: JobRow): JobRow {
    const cloned = JSON.parse(JSON.stringify(row)) as JobRow;
    for (const key of [
      "store_version",
      "created_at_ms",
      "updated_at_ms",
      "expires_at_ms",
      "claimed_at_ms",
      "verification_claimed_at_ms",
    ] as const) {
      if (typeof cloned[key] === "number") {
        cloned[key] = String(cloned[key]);
      }
    }
    return cloned;
  }

  private findByIdempotency(
    ownerId: string,
    projectId: string,
    key: string,
  ): JobRow | null {
    for (const row of this.jobsById.values()) {
      if (
        row.owner_id === ownerId &&
        row.project_id === projectId &&
        row.idempotency_authority_key === key
      ) {
        return row;
      }
    }
    return null;
  }

  private parseJsonParam(value: unknown): unknown {
    if (value == null) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  private handleQuery(
    text: string,
    params: readonly unknown[] = [],
  ): HeadlessSqlQueryResult<Record<string, unknown>> {
    this.capture(text, params);
    const norm = normalizeSql(text);
    const txControl = this.handleTxControl(norm);
    if (txControl) return txControl;

    if (this.txState === "aborted") {
      throwInFailedSqlTransaction();
    }
    this.assertNoInjection();

    // Ownership insert
    if (norm.includes("INSERT INTO HEADLESS_PROJECT_OWNERSHIP")) {
      const projectId = String(params[0]);
      const ownerId = String(params[1]);
      const createdAtMs = Number(params[2]);
      if (!this.ownership.has(projectId)) {
        this.ownership.set(projectId, {
          project_id: projectId,
          owner_id: ownerId,
          created_at_ms: createdAtMs,
        });
      }
      return { rows: [], rowCount: 0 };
    }

    // Ownership select
    if (
      norm.includes("FROM HEADLESS_PROJECT_OWNERSHIP") &&
      norm.includes("WHERE PROJECT_ID")
    ) {
      const projectId = String(params[0]);
      const row = this.ownership.get(projectId);
      return row
        ? {
            rows: [
              {
                ...row,
                created_at_ms: String(row.created_at_ms),
              },
            ],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 };
    }

    // Job insert
    if (norm.startsWith("INSERT INTO HEADLESS_JOBS")) {
      const jobId = String(params[0]);
      const isCanonical = norm.includes("'CANONICAL'");
      let row: JobRow;

      if (isCanonical) {
        // createIfAbsent param order
        row = {
          job_id: jobId,
          stage: "canonical",
          state: params[1],
          owner_id: params[2],
          project_id: params[3],
          store_version: 1,
          operation_id: params[4],
          idempotency_authority_key: params[5],
          creator_idempotency_key: null,
          requested_renderer_profile: null,
          requested_renderer_build_id: null,
          provisional: null,
          canonical_job: this.parseJsonParam(params[6]),
          canonical_request: this.parseJsonParam(params[7]),
          claim_token: params[8],
          claimed_at_ms: params[9],
          artifact_object_binding: this.parseJsonParam(params[10]),
          created_at_ms: params[11],
          updated_at_ms: params[12],
          expires_at_ms: null,
          terminal_reason: null,
          verification_claim_token: null,
          verification_claimed_at_ms: null,
        };
      } else {
        row = {
          job_id: jobId,
          stage: "provisional",
          state: params[1],
          owner_id: params[2],
          project_id: params[3],
          store_version: 1,
          operation_id: params[4],
          idempotency_authority_key: params[5],
          creator_idempotency_key: params[6],
          requested_renderer_profile: this.parseJsonParam(params[7]),
          requested_renderer_build_id: params[8],
          provisional: this.parseJsonParam(params[9]),
          canonical_job: null,
          canonical_request: null,
          claim_token: null,
          claimed_at_ms: null,
          artifact_object_binding: null,
          created_at_ms: params[10],
          updated_at_ms: params[11],
          expires_at_ms: params[12],
          terminal_reason: this.parseJsonParam(params[13]),
          verification_claim_token: params[14],
          verification_claimed_at_ms: params[15],
        };
      }

      // Mirror Postgres ON CONFLICT (owner_id, project_id, idempotency_authority_key)
      // DO NOTHING: same-row replay returns empty without PK error.
      const existingIdem = this.findByIdempotency(
        String(row.owner_id),
        String(row.project_id),
        String(row.idempotency_authority_key),
      );
      if (existingIdem) {
        return { rows: [], rowCount: 0 };
      }
      if (this.jobsById.has(jobId)) {
        if (this.txState === "open") this.txState = "aborted";
        throwUniqueViolation();
      }
      this.jobsById.set(jobId, row);
      return { rows: [this.cloneJob(row)], rowCount: 1 };
    }

    // Render dispatch outbox ensure (promotion atomic write).
    if (
      norm.includes("INSERT INTO PUBLIC.HEADLESS_RENDER_DISPATCH_OUTBOX") ||
      norm.includes("INSERT INTO HEADLESS_RENDER_DISPATCH_OUTBOX")
    ) {
      if (this.nextOutboxInsertFailure) {
        this.nextOutboxInsertFailure = false;
        if (this.txState === "open") this.txState = "aborted";
        throw new HeadlessSqlExecutorError(
          "DATABASE_UNAVAILABLE",
          "Durable database is temporarily unavailable.",
        );
      }
      const dispatchId = String(params[0]);
      const jobId = String(params[2]);
      const attempt = Number(params[3]);
      const ownerId = String(params[4]);
      const projectId = String(params[5]);
      const deliveryId = String(params[6]);
      const nowMs = Number(params[7]);
      for (const row of this.dispatchOutboxById.values()) {
        if (
          row.job_id === jobId &&
          Number(row.attempt) === attempt
        ) {
          if (row.delivery_id !== deliveryId) {
            throw Object.assign(new Error("unique_violation"), {
              code: "23505",
              constraint: "headless_render_dispatch_outbox_job_attempt_unique",
            });
          }
          return { rows: [], rowCount: 0 };
        }
      }
      if (this.dispatchOutboxById.has(dispatchId)) {
        return { rows: [], rowCount: 0 };
      }
      const row: JobRow = {
        dispatch_id: dispatchId,
        version: 1,
        job_id: jobId,
        attempt,
        owner_id: ownerId,
        project_id: projectId,
        delivery_id: deliveryId,
        state: "pending",
        claim_token: null,
        claimed_at_ms: null,
        retry_count: 0,
        next_attempt_at_ms: nowMs,
        store_version: 1,
        created_at_ms: nowMs,
        updated_at_ms: nowMs,
        dispatched_at_ms: null,
        reject_reason_id: null,
      };
      this.dispatchOutboxById.set(dispatchId, row);
      return { rows: [{ dispatch_id: dispatchId }], rowCount: 1 };
    }

    if (
      norm.includes("FROM PUBLIC.HEADLESS_RENDER_DISPATCH_OUTBOX") ||
      norm.includes("FROM HEADLESS_RENDER_DISPATCH_OUTBOX")
    ) {
      if (norm.includes("WHERE JOB_ID = $1 AND ATTEMPT = $2")) {
        const jobId = String(params[0]);
        const attempt = Number(params[1]);
        const ownerId = String(params[2]);
        for (const row of this.dispatchOutboxById.values()) {
          if (
            row.job_id === jobId &&
            Number(row.attempt) === attempt &&
            row.owner_id === ownerId
          ) {
            return { rows: [{ ...row }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
    }

    // List queued dispatch candidates (rich) or legacy job_id-only.
    if (
      (norm.includes("FROM HEADLESS_JOBS") ||
        norm.includes("FROM PUBLIC.HEADLESS_JOBS")) &&
      norm.includes("STATE = 'QUEUED'") &&
      norm.includes("CLAIM_TOKEN IS NULL") &&
      (norm.includes("SELECT JOB_ID FROM") ||
        (norm.includes("CANONICAL_JOB") && norm.includes("AS ATTEMPT")))
    ) {
      const limit = Number(params[0] ?? 0);
      const rich =
        norm.includes("OWNER_ID") &&
        norm.includes("AS ATTEMPT") &&
        norm.includes("STORE_VERSION");
      const rows: Record<string, unknown>[] = [];
      const sorted = [...this.jobsById.values()].sort(
        (a, b) => Number(a.created_at_ms) - Number(b.created_at_ms),
      );
      for (const row of sorted) {
        if (
          row.stage === "canonical" &&
          row.state === "queued" &&
          row.claim_token == null
        ) {
          if (rich) {
            const job =
              row.canonical_job && typeof row.canonical_job === "object"
                ? (row.canonical_job as { attempt?: unknown })
                : null;
            const attempt = Number(job?.attempt ?? 0);
            rows.push({
              job_id: row.job_id,
              owner_id: row.owner_id,
              attempt,
              store_version: row.store_version,
              updated_at_ms: row.updated_at_ms,
            });
          } else {
            rows.push({ job_id: row.job_id });
          }
          if (rows.length >= limit) break;
        }
      }
      return { rows, rowCount: rows.length };
    }

    // Select by job_id only (column list may include owner_id — match WHERE shape)
    if (
      norm.includes("FROM HEADLESS_JOBS") &&
      norm.includes("WHERE JOB_ID = $1") &&
      !norm.includes("OWNER_ID =")
    ) {
      const jobId = String(params[0]);
      const row = this.jobsById.get(jobId);
      return row
        ? { rows: [this.cloneJob(row)], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    // Select by idempotency
    if (
      norm.includes("IDEMPOTENCY_AUTHORITY_KEY = $3") ||
      (norm.includes("IDEMPOTENCY_AUTHORITY_KEY") &&
        norm.includes("PROJECT_ID = $2"))
    ) {
      const row = this.findByIdempotency(
        String(params[0]),
        String(params[1]),
        String(params[2]),
      );
      return row
        ? { rows: [this.cloneJob(row)], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    // Select by job+owner
    if (
      norm.includes("FROM HEADLESS_JOBS") &&
      norm.includes("JOB_ID = $1") &&
      norm.includes("OWNER_ID = $2") &&
      !norm.startsWith("UPDATE")
    ) {
      const jobId = String(params[0]);
      const ownerId = String(params[1]);
      const row = this.jobsById.get(jobId);
      if (!row || row.owner_id !== ownerId) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [this.cloneJob(row)], rowCount: 1 };
    }

    // Provisional CAS update
    if (
      norm.startsWith("UPDATE HEADLESS_JOBS") &&
      norm.includes("STAGE = 'PROVISIONAL'") &&
      norm.includes("STATE = 'MATERIALIZING'") &&
      !norm.includes("STAGE = 'CANONICAL'")
    ) {
      // promote sets stage = 'canonical' — handled below
    }

    // Promotion update
    if (
      (norm.startsWith("UPDATE HEADLESS_JOBS") ||
        norm.startsWith("UPDATE PUBLIC.HEADLESS_JOBS")) &&
      norm.includes("STAGE = 'CANONICAL'") &&
      norm.includes("PROVISIONAL = NULL")
    ) {
      const jobId = String(params[4]);
      const ownerId = String(params[5]);
      const expectedVersion = Number(params[6]);
      const expectedOp = String(params[7]);
      const row = this.jobsById.get(jobId);
      if (
        !row ||
        row.owner_id !== ownerId ||
        row.stage !== "provisional" ||
        row.state !== "materializing" ||
        Number(row.store_version) !== expectedVersion ||
        row.operation_id !== expectedOp
      ) {
        return { rows: [], rowCount: 0 };
      }
      const next: JobRow = {
        ...row,
        stage: "canonical",
        state: params[0],
        store_version: Number(row.store_version) + 1,
        updated_at_ms: params[1],
        provisional: null,
        canonical_job: this.parseJsonParam(params[2]),
        canonical_request: this.parseJsonParam(params[3]),
        requested_renderer_profile: null,
        requested_renderer_build_id: null,
        creator_idempotency_key: null,
        expires_at_ms: null,
        terminal_reason: null,
        verification_claim_token: null,
        verification_claimed_at_ms: null,
        claim_token: null,
        claimed_at_ms: null,
        artifact_object_binding: null,
      };
      this.jobsById.set(jobId, next);
      return { rows: [this.cloneJob(next)], rowCount: 1 };
    }

    // Provisional CAS (not promotion)
    if (
      norm.startsWith("UPDATE HEADLESS_JOBS") &&
      norm.includes("PROVISIONAL =") &&
      norm.includes("STAGE = 'PROVISIONAL'")
    ) {
      const jobId = String(params[6]);
      const ownerId = String(params[7]);
      const expectedVersion = Number(params[8]);
      const row = this.jobsById.get(jobId);
      if (
        !row ||
        row.owner_id !== ownerId ||
        row.stage !== "provisional" ||
        row.state !== "materializing" ||
        Number(row.store_version) !== expectedVersion
      ) {
        return { rows: [], rowCount: 0 };
      }
      const next: JobRow = {
        ...row,
        state: params[0],
        store_version: Number(row.store_version) + 1,
        updated_at_ms: params[1],
        provisional: this.parseJsonParam(params[2]),
        terminal_reason: this.parseJsonParam(params[3]),
        verification_claim_token: params[4],
        verification_claimed_at_ms: params[5],
      };
      this.jobsById.set(jobId, next);
      return { rows: [this.cloneJob(next)], rowCount: 1 };
    }

    // Claim queued
    if (
      norm.startsWith("UPDATE HEADLESS_JOBS") &&
      norm.includes("CLAIM_TOKEN = $1") &&
      norm.includes("STATE = 'QUEUED'")
    ) {
      const jobId = String(params[2]);
      const ownerId = String(params[3]);
      const expectedVersion = Number(params[4]);
      const row = this.jobsById.get(jobId);
      if (
        !row ||
        row.owner_id !== ownerId ||
        row.stage !== "canonical" ||
        row.state !== "queued" ||
        Number(row.store_version) !== expectedVersion ||
        row.claim_token != null
      ) {
        return { rows: [], rowCount: 0 };
      }
      const next: JobRow = {
        ...row,
        store_version: Number(row.store_version) + 1,
        claim_token: params[0],
        claimed_at_ms: params[1],
      };
      this.jobsById.set(jobId, next);
      return { rows: [this.cloneJob(next)], rowCount: 1 };
    }

    // Recover expired
    if (
      norm.startsWith("UPDATE HEADLESS_JOBS") &&
      norm.includes("STATE = 'FAILED'") &&
      norm.includes("CLAIM_TOKEN IS NOT NULL")
    ) {
      const jobId = String(params[4]);
      const ownerId = String(params[5]);
      const expectedVersion = Number(params[6]);
      const row = this.jobsById.get(jobId);
      if (
        !row ||
        row.owner_id !== ownerId ||
        row.stage !== "canonical" ||
        Number(row.store_version) !== expectedVersion ||
        row.claim_token == null
      ) {
        return { rows: [], rowCount: 0 };
      }
      const terminal = String(row.state);
      if (
        terminal === "succeeded" ||
        terminal === "failed" ||
        terminal === "cancelled" ||
        terminal === "expired"
      ) {
        return { rows: [], rowCount: 0 };
      }
      const next: JobRow = {
        ...row,
        state: "failed",
        store_version: Number(row.store_version) + 1,
        updated_at_ms: params[0],
        canonical_job: this.parseJsonParam(params[1]),
        canonical_request: this.parseJsonParam(params[2]),
        claim_token: null,
        claimed_at_ms: null,
        artifact_object_binding: null,
        terminal_reason: this.parseJsonParam(params[3]),
      };
      this.jobsById.set(jobId, next);
      return { rows: [this.cloneJob(next)], rowCount: 1 };
    }

    // Canonical transition CAS
    if (
      norm.startsWith("UPDATE HEADLESS_JOBS") &&
      norm.includes("CANONICAL_JOB =") &&
      norm.includes("STAGE = 'CANONICAL'") &&
      !norm.includes("PROVISIONAL = NULL")
    ) {
      const jobId = String(params[7]);
      const ownerId = String(params[8]);
      const expectedVersion = Number(params[9]);
      const row = this.jobsById.get(jobId);
      if (
        !row ||
        row.owner_id !== ownerId ||
        row.stage !== "canonical" ||
        Number(row.store_version) !== expectedVersion
      ) {
        return { rows: [], rowCount: 0 };
      }
      const terminal = String(row.state);
      if (
        terminal === "succeeded" ||
        terminal === "failed" ||
        terminal === "cancelled" ||
        terminal === "expired"
      ) {
        return { rows: [], rowCount: 0 };
      }
      const next: JobRow = {
        ...row,
        state: params[0],
        store_version: Number(row.store_version) + 1,
        updated_at_ms: params[1],
        canonical_job: this.parseJsonParam(params[2]),
        canonical_request: this.parseJsonParam(params[3]),
        claim_token: params[4],
        claimed_at_ms: params[5],
        artifact_object_binding: this.parseJsonParam(params[6]),
      };
      this.jobsById.set(jobId, next);
      return { rows: [this.cloneJob(next)], rowCount: 1 };
    }

    // ── Owned objects ──────────────────────────────────────────────
    const isOwnedObjectSql =
      norm.includes("PUBLIC.HEADLESS_OWNED_OBJECTS") ||
      norm.includes("HEADLESS_OWNED_OBJECTS");

    if (norm.startsWith("INSERT INTO PUBLIC.HEADLESS_OWNED_OBJECTS")) {
      const objectId = String(params[0]);
      const storeId = String(params[7]);
      const objectKey = String(params[8]);
      if (this.ownedObjectsById.has(objectId)) {
        if (this.txState === "open") this.txState = "aborted";
        throwUniqueViolation();
      }
      if (this.findOwnedByStoreKey(storeId, objectKey)) {
        if (this.txState === "open") this.txState = "aborted";
        throwUniqueViolation();
      }
      // FK membership: project_id + owner_id must exist in ownership
      const projectId = String(params[2]);
      const ownerId = String(params[1]);
      const ownership = this.ownership.get(projectId);
      if (!ownership || ownership.owner_id !== ownerId) {
        throw new HeadlessPostgresSqlError(
          HEADLESS_PG_SQLSTATE.FOREIGN_KEY_VIOLATION,
        );
      }
      const row: OwnedObjectRow = {
        object_id: objectId,
        owner_id: ownerId,
        project_id: projectId,
        job_id: params[3],
        operation_id: params[4],
        purpose: params[5],
        slot_key: params[6],
        stage: "staging",
        store_id: storeId,
        object_key: objectKey,
        store_version: 1,
        expected_content_digest_claim: params[9],
        expected_byte_length: params[10],
        expected_mime_type: params[11],
        content_digest: null,
        byte_length: null,
        mime_type: null,
        upload_capability_issued_at_ms: params[12],
        upload_capability_expires_at_ms: params[13],
        uploaded_observed_at_ms: null,
        verification_state: "unclaimed",
        verification_claim_token: null,
        verification_claimed_at_ms: null,
        verified_at_ms: null,
        expires_at_ms: params[14],
        finalized_metadata: null,
        terminal_reason: null,
        cleanup_scheduled_at_ms: null,
        created_at_ms: params[15],
        updated_at_ms: params[16],
      };
      this.ownedObjectsById.set(objectId, row);
      return { rows: [this.cloneOwnedObject(row)], rowCount: 1 };
    }

    if (isOwnedObjectSql) {
      // DELETE cleanup
      if (norm.startsWith("DELETE FROM PUBLIC.HEADLESS_OWNED_OBJECTS")) {
        const objectId = String(params[0]);
        const ownerId = String(params[1]);
        const expectedVersion = Number(params[2]);
        const row = this.ownedObjectsById.get(objectId);
        if (
          !row ||
          row.owner_id !== ownerId ||
          Number(row.store_version) !== expectedVersion ||
          row.stage !== "cleanup_pending"
        ) {
          return { rows: [], rowCount: 0 };
        }
        this.ownedObjectsById.delete(objectId);
        return { rows: [], rowCount: 1 };
      }

      // UPDATE owned objects
      if (norm.startsWith("UPDATE PUBLIC.HEADLESS_OWNED_OBJECTS")) {
        const isFinalize = norm.includes("STAGE = 'FINALIZED'");
        const isReject = norm.includes("STAGE = 'REJECTED'");
        const isCleanup = norm.includes("STAGE = 'CLEANUP_PENDING'");
        const isClaim =
          norm.includes("VERIFICATION_STATE = 'CLAIMED'") &&
          !isFinalize &&
          !isReject &&
          !isCleanup;
        const isRelease =
          norm.includes("VERIFICATION_STATE = 'UNCLAIMED'") &&
          !isFinalize;
        const isFail =
          norm.includes("VERIFICATION_STATE = 'FAILED'") &&
          !isReject &&
          !isCleanup &&
          !isFinalize;
        const isMarkUploaded = norm.includes("UPLOADED_OBSERVED_AT_MS = $1");

        let objectId: string;
        let ownerId: string;
        let expectedVersion: number;

        if (isFinalize) {
          objectId = String(params[7]);
          ownerId = String(params[8]);
          expectedVersion = Number(params[9]);
        } else if (isReject) {
          objectId = String(params[2]);
          ownerId = String(params[3]);
          expectedVersion = Number(params[4]);
        } else if (isCleanup) {
          objectId = String(params[3]);
          ownerId = String(params[4]);
          expectedVersion = Number(params[5]);
        } else if (isClaim) {
          objectId = String(params[3]);
          ownerId = String(params[4]);
          expectedVersion = Number(params[5]);
        } else if (isRelease || isFail) {
          objectId = String(params[1]);
          ownerId = String(params[2]);
          expectedVersion = Number(params[3]);
        } else if (isMarkUploaded) {
          objectId = String(params[2]);
          ownerId = String(params[3]);
          expectedVersion = Number(params[4]);
        } else {
          throw new HeadlessSqlExecutorError(
            "INTERNAL_ERROR",
            "Unhandled owned-object UPDATE in fixture.",
          );
        }

        const row = this.ownedObjectsById.get(objectId);
        if (
          !row ||
          row.owner_id !== ownerId ||
          Number(row.store_version) !== expectedVersion
        ) {
          return { rows: [], rowCount: 0 };
        }

        let next: OwnedObjectRow = {
          ...row,
          store_version: Number(row.store_version) + 1,
        };

        if (isClaim) {
          if (row.stage !== "staging") return { rows: [], rowCount: 0 };
          next = {
            ...next,
            verification_state: "claimed",
            verification_claim_token: params[0],
            verification_claimed_at_ms: params[1],
            updated_at_ms: params[2],
          };
        } else if (isRelease) {
          if (
            row.stage !== "staging" ||
            row.verification_claim_token !== params[4]
          ) {
            return { rows: [], rowCount: 0 };
          }
          next = {
            ...next,
            verification_state: "unclaimed",
            verification_claim_token: null,
            verification_claimed_at_ms: null,
            updated_at_ms: params[0],
          };
        } else if (isFail) {
          if (
            row.stage !== "staging" ||
            row.verification_claim_token !== params[4]
          ) {
            return { rows: [], rowCount: 0 };
          }
          next = {
            ...next,
            verification_state: "failed",
            verification_claim_token: null,
            verification_claimed_at_ms: null,
            updated_at_ms: params[0],
          };
        } else if (isFinalize) {
          if (
            row.stage !== "staging" ||
            row.verification_claim_token !== params[10]
          ) {
            return { rows: [], rowCount: 0 };
          }
          next = {
            ...next,
            stage: "finalized",
            verification_state: "verified",
            verification_claim_token: null,
            verification_claimed_at_ms: null,
            content_digest: params[0],
            byte_length: params[1],
            mime_type: params[2],
            verified_at_ms: params[3],
            expires_at_ms: params[4],
            finalized_metadata: this.parseJsonParam(params[5]),
            terminal_reason: null,
            cleanup_scheduled_at_ms: null,
            updated_at_ms: params[6],
          };
        } else if (isReject) {
          if (row.stage !== "staging") return { rows: [], rowCount: 0 };
          next = {
            ...next,
            stage: "rejected",
            verification_state: "failed",
            verification_claim_token: null,
            verification_claimed_at_ms: null,
            content_digest: null,
            byte_length: null,
            mime_type: null,
            verified_at_ms: null,
            finalized_metadata: null,
            terminal_reason: this.parseJsonParam(params[0]),
            cleanup_scheduled_at_ms: null,
            updated_at_ms: params[1],
          };
        } else if (isCleanup) {
          if (row.stage !== "staging" && row.stage !== "rejected") {
            return { rows: [], rowCount: 0 };
          }
          next = {
            ...next,
            stage: "cleanup_pending",
            verification_state: "failed",
            verification_claim_token: null,
            verification_claimed_at_ms: null,
            content_digest: null,
            byte_length: null,
            mime_type: null,
            verified_at_ms: null,
            finalized_metadata: null,
            terminal_reason: this.parseJsonParam(params[0]),
            cleanup_scheduled_at_ms: params[1],
            updated_at_ms: params[2],
          };
        } else if (isMarkUploaded) {
          if (row.stage !== "staging") return { rows: [], rowCount: 0 };
          next = {
            ...next,
            uploaded_observed_at_ms: params[0],
            updated_at_ms: params[1],
          };
        }

        this.ownedObjectsById.set(objectId, next);
        return { rows: [this.cloneOwnedObject(next)], rowCount: 1 };
      }

      // SELECT by store_id + object_key
      if (norm.includes("STORE_ID = $1") && norm.includes("OBJECT_KEY = $2")) {
        const row = this.findOwnedByStoreKey(
          String(params[0]),
          String(params[1]),
        );
        return row
          ? { rows: [this.cloneOwnedObject(row)], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      // SELECT by object_id only
      if (
        norm.includes("WHERE OBJECT_ID = $1") &&
        !norm.includes("OWNER_ID =")
      ) {
        const row = this.ownedObjectsById.get(String(params[0]));
        return row
          ? { rows: [this.cloneOwnedObject(row)], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      // SELECT by object_id + owner_id
      if (
        norm.includes("OBJECT_ID = $1") &&
        norm.includes("OWNER_ID = $2") &&
        !norm.startsWith("UPDATE") &&
        !norm.startsWith("DELETE")
      ) {
        const row = this.ownedObjectsById.get(String(params[0]));
        if (!row || row.owner_id !== params[1]) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [this.cloneOwnedObject(row)], rowCount: 1 };
      }

      // list by job + owner
      if (norm.includes("JOB_ID = $1") && norm.includes("OWNER_ID = $2")) {
        const jobId = String(params[0]);
        const ownerId = String(params[1]);
        const rows = [...this.ownedObjectsById.values()]
          .filter((r) => r.job_id === jobId && r.owner_id === ownerId)
          .sort((a, b) =>
            String(a.object_id).localeCompare(String(b.object_id)),
          )
          .map((r) => this.cloneOwnedObject(r));
        return { rows, rowCount: rows.length };
      }

      // list verifier candidates
      if (
        norm.includes("STAGE = 'STAGING'") &&
        norm.includes("VERIFICATION_STATE IN")
      ) {
        const hasOwner = norm.includes("OWNER_ID = $1");
        const ownerId = hasOwner ? String(params[0]) : null;
        const limit = Number(hasOwner ? params[1] : params[0]);
        const rows = [...this.ownedObjectsById.values()]
          .filter((r) => {
            if (r.stage !== "staging") return false;
            if (ownerId != null && r.owner_id !== ownerId) return false;
            const uploaded = r.uploaded_observed_at_ms != null;
            const eligible =
              r.verification_state === "unclaimed" ||
              r.verification_state === "failed";
            return uploaded || eligible;
          })
          .sort((a, b) =>
            String(a.object_id).localeCompare(String(b.object_id)),
          )
          .slice(0, limit)
          .map((r) => this.cloneOwnedObject(r));
        return { rows, rowCount: rows.length };
      }

      // list cleanup candidates
      if (
        norm.includes("STAGE = 'CLEANUP_PENDING'") &&
        norm.includes("EXPIRES_AT_MS <=")
      ) {
        const nowMs = Number(params[0]);
        const limit = Number(params[1]);
        const rows = [...this.ownedObjectsById.values()]
          .filter((r) => {
            if (r.stage === "cleanup_pending") return true;
            return (
              r.stage === "staging" &&
              r.expires_at_ms != null &&
              Number(r.expires_at_ms) <= nowMs
            );
          })
          .sort((a, b) =>
            String(a.object_id).localeCompare(String(b.object_id)),
          )
          .slice(0, limit)
          .map((r) => this.cloneOwnedObject(r));
        return { rows, rowCount: rows.length };
      }
    }

    throw new HeadlessSqlExecutorError(
      "INTERNAL_ERROR",
      "Unhandled SQL in in-memory fixture.",
    );
  }

  async withClient<T>(fn: (client: HeadlessSqlClient) => Promise<T>): Promise<T> {
    if (this.forceConnectionFailure) {
      throw new HeadlessSqlExecutorError(
        "DATABASE_UNAVAILABLE",
        "Durable database is temporarily unavailable.",
      );
    }
    this.txState = "idle";
    this.savepoints = [];
    const client: HeadlessSqlClient = {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params?: readonly unknown[],
      ) =>
        this.handleQuery(text, params) as HeadlessSqlQueryResult<Row>,
    };
    return fn(client);
  }

  async withTransaction<T>(
    fn: (client: HeadlessSqlClient) => Promise<T>,
  ): Promise<T> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const value = await fn(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // ignore
        }
        throw error;
      } finally {
        this.txState = "idle";
        this.savepoints = [];
      }
    });
  }
}

/** Ensure SELECT column list stays explicit in fixtures. */
export function assertExplicitJobSelectColumns(sql: string): boolean {
  return HEADLESS_JOB_SELECT_COLUMNS.every((col) =>
    sql.toLowerCase().includes(col),
  );
}

export function assertExplicitOwnedObjectSelectColumns(sql: string): boolean {
  return HEADLESS_OWNED_OBJECT_SELECT_COLUMNS.every((col) =>
    sql.toLowerCase().includes(col),
  );
}
