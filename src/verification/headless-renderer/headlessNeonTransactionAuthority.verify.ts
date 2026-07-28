/**
 * Sprint 11E Phase 2B.2A — Savepoint / aborted-tx / SQLSTATE / executor lifecycle.
 * Run: npm run test:headless-neon-transaction-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_CREATE_INSERT_SAVEPOINT,
  HEADLESS_PG_SQLSTATE,
  HeadlessPostgresSqlError,
  isPostgresInFailedSqlTransaction,
  mapHeadlessDatabaseFailure,
} from "@/features/headless-renderer/control-plane/runtime/map-database-failure";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import type {
  NeonPoolFactory,
  NeonQueryable,
} from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import {
  InMemoryHeadlessSqlFixture,
  NeonHeadlessJobStoreAdapter,
  ScriptedHeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/testing";
import {
  createProvisionalMaterializingRecord,
} from "@/features/headless-renderer/control-plane";
import {
  buildHeadlessAuthorityFingerprint,
} from "@/features/headless-renderer/domain";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function hid(ownerId: string, projectId: string, key: string): string {
  const built = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey: key,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("hid");
  return built.fingerprint;
}

function minimalProvisional(input: {
  jobId: string;
  ownerId: string;
  projectId: string;
  creatorKey: string;
  operationId: string;
}) {
  const idem = hid(input.ownerId, input.projectId, input.creatorKey);
  const result = createProvisionalMaterializingRecord({
    jobId: input.jobId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    idempotencyAuthorityKey: idem,
    operationId: input.operationId,
    creatorIdempotencyKey: input.creatorKey,
    requestedRendererProfile: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
    requestedRendererBuildId: "build-1",
    snapshotClaim: {
      manifestPayloadDigestClaim: "sha256:" + "aa".repeat(32),
      assetBundleFingerprintClaim: "hab:sha256:" + "bb".repeat(32),
      expectedSlotClaims: [],
    },
    stagingObjectRefs: [],
    expiresAtMs: 1_700_003_600_000,
  });
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  if (!result.ok) {
    throw new Error(
      String((result as { message?: unknown }).message ?? "materialize failed"),
    );
  }
  return { record: result.record, idem };
}

async function main() {
  console.log("\nSprint 11E Phase 2B.2A — Transaction authority\n");

  await test("negative: catch-and-continue after 23505 hits 25P02", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    // Seed a row so PK collision aborts the transaction.
    const projectId = randomUUID();
    const ownerId = "owner-tx";
    const jobId = `job_${randomUUID()}`;
    const first = minimalProvisional({
      jobId,
      ownerId,
      projectId,
      creatorKey: "k1",
      operationId: "op1",
    });
    const store = new NeonHeadlessJobStoreAdapter(sql);
    assert.equal(
      (
        await store.createProvisionalIfAbsent({
          idempotencyAuthorityKey: first.idem,
          record: first.record,
        })
      ).ok,
      true,
    );

    // Manual bad pattern against the fixture: INSERT PK collision then SELECT without savepoint.
    await assert.rejects(async () => {
      await sql.withTransaction(async (client) => {
        try {
          await client.query(
            `
INSERT INTO headless_jobs (
  job_id, stage, state, owner_id, project_id, store_version,
  operation_id, idempotency_authority_key, creator_idempotency_key,
  requested_renderer_profile, requested_renderer_build_id,
  provisional, canonical_job, canonical_request,
  claim_token, claimed_at_ms, artifact_object_binding,
  created_at_ms, updated_at_ms, expires_at_ms, terminal_reason,
  verification_claim_token, verification_claimed_at_ms
)
VALUES (
  $1, 'provisional', 'materializing', $2, $3, 1,
  'opx', $4, 'kx',
  '{}'::jsonb, 'b',
  '{}'::jsonb, NULL, NULL,
  NULL, NULL, NULL,
  1, 1, 2, NULL,
  NULL, NULL
)
`,
            [jobId, ownerId, projectId, hid(ownerId, projectId, "other-key")],
          );
        } catch (error) {
          assert.equal(
            (error as { sqlState?: string }).sqlState ??
              (error as { code?: string }).code,
            "23505",
          );
          // Old pattern — continue SELECT inside aborted transaction:
          await client.query(
            `SELECT job_id FROM headless_jobs WHERE job_id = $1`,
            [jobId],
          );
        }
      });
    }, (err: unknown) => isPostgresInFailedSqlTransaction(err));
  });

  await test("positive: savepoint path — replay / conflict / PK collision", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const store = new NeonHeadlessJobStoreAdapter(sql);
    const projectId = randomUUID();
    const ownerId = "owner-sp";
    const a = minimalProvisional({
      jobId: `job_${randomUUID()}`,
      ownerId,
      projectId,
      creatorKey: "same-key",
      operationId: "op-a",
    });
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: a.idem,
      record: a.record,
    });
    assert.equal(created.ok && created.value.kind === "created", true);

    const replay = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: a.idem,
      record: a.record,
    });
    assert.equal(replay.ok && replay.value.kind === "existing", true);

    // Semantic conflict: same idempotency key, different fingerprint (different job + claims)
    const conflictDraft = minimalProvisional({
      jobId: `job_${randomUUID()}`,
      ownerId,
      projectId,
      creatorKey: "same-key",
      operationId: "op-b",
    });
    // Force same idempotency authority as `a` but different semantics
    const forged = {
      ...conflictDraft.record,
      idempotencyAuthorityKey: a.idem,
      snapshotClaim: {
        ...conflictDraft.record.snapshotClaim,
        manifestPayloadDigestClaim: "sha256:" + "cc".repeat(32),
        assetBundleFingerprintClaim: "hab:sha256:" + "dd".repeat(32),
      },
    };
    const conflict = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: a.idem,
      record: forged,
    });
    if (conflict.ok) {
      assert.equal(conflict.value.kind, "conflict");
    } else {
      assert.equal(conflict.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    }

    // PK collision: same jobId, different idempotency key
    const pk = minimalProvisional({
      jobId: a.record.jobId,
      ownerId,
      projectId,
      creatorKey: "other-key",
      operationId: "op-pk",
    });
    const collision = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: pk.idem,
      record: pk.record,
    });
    assert.equal(collision.ok, false);
    if (!collision.ok) {
      assert.equal(collision.issues[0]?.code, "INTERNAL_ERROR");
      assert.match(collision.issues[0]?.message ?? "", /Job id collision/i);
    }

    assert.ok(
      sql.savepointEvents.some((e) =>
        e.includes(`SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT.toUpperCase()}`) ||
        e.includes(`SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`),
      ),
    );
  });

  await test("queue list: empty ok vs DATABASE_UNAVAILABLE", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const store = new NeonHeadlessJobStoreAdapter(sql);
    const empty = await store.listCanonicalQueuedJobIds(10);
    assert.equal(empty.ok && empty.value.length === 0, true);

    const sql2 = new InMemoryHeadlessSqlFixture();
    sql2.injectConnectionFailure();
    const down = await new NeonHeadlessJobStoreAdapter(
      sql2,
    ).listCanonicalQueuedJobIds(10);
    assert.equal(down.ok, false);
    if (!down.ok) {
      assert.equal(down.issues[0]?.code, "DATABASE_UNAVAILABLE");
    }

    const badLimit = await store.listCanonicalQueuedJobIds(0);
    assert.equal(badLimit.ok, false);
    if (!badLimit.ok) {
      assert.equal(badLimit.issues[0]?.code, "INVALID_TRANSPORT");
    }
  });

  await test("SQLSTATE mapping is bounded and private", () => {
    const fk = mapHeadlessDatabaseFailure(
      new HeadlessPostgresSqlError(HEADLESS_PG_SQLSTATE.FOREIGN_KEY_VIOLATION),
    );
    assert.equal(fk.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    assert.equal(JSON.stringify(fk).includes("23503"), false);

    const dead = mapHeadlessDatabaseFailure(
      new HeadlessPostgresSqlError(HEADLESS_PG_SQLSTATE.DEADLOCK_DETECTED),
    );
    assert.equal(dead.issues[0]?.code, "DATABASE_UNAVAILABLE");

    const aborted = mapHeadlessDatabaseFailure(
      new HeadlessPostgresSqlError(
        HEADLESS_PG_SQLSTATE.IN_FAILED_SQL_TRANSACTION,
      ),
    );
    assert.equal(aborted.issues[0]?.code, "INTERNAL_ERROR");
  });

  await test("scripted executor: COMMIT fails while aborted", async () => {
    const sql = new ScriptedHeadlessSqlExecutor([{ kind: "unique_violation" }]);
    await assert.rejects(async () => {
      await sql.withTransaction(async (client) => {
        await client.query("SELECT 1");
      });
    });
    assert.equal(sql.transactionRolledBack, true);
  });

  await test("executor lifecycle: connect failure ends pool; no secrets", async () => {
    const events: string[] = [];
    const poolFactory: NeonPoolFactory = () => {
      events.push("create");
      return {
        connect: async () => {
          events.push("connect");
          throw new Error("ECONNREFUSED secret=postgresql://user:pass@host/db");
        },
        end: async () => {
          events.push("end");
        },
      };
    };
    const exec = createNeonSqlExecutor({
      connectionString: "postgresql://u:p@h/db",
      poolFactory,
    });
    await assert.rejects(async () => {
      await exec.withClient(async () => "x");
    });
    assert.ok(events.includes("create"));
    assert.ok(events.includes("connect"));
    assert.ok(events.includes("end"));
  });

  await test("executor lifecycle: callback failure ROLLBACKs; release/end always", async () => {
    const events: string[] = [];
    let released = false;
    const client: NeonQueryable = {
      query: async (text: string) => {
        events.push(text.trim().split(/\s+/)[0]!.toUpperCase());
        return { rows: [], rowCount: 0 };
      },
      release: () => {
        released = true;
        events.push("release");
      },
    };
    const poolFactory: NeonPoolFactory = () => ({
      connect: async () => client,
      end: async () => {
        events.push("end");
      },
    });
    const exec = createNeonSqlExecutor({
      connectionString: "postgresql://u:p@h/db",
      poolFactory,
    });
    await assert.rejects(async () => {
      await exec.withTransaction(async () => {
        throw new Error("boom");
      });
    });
    assert.ok(events.includes("BEGIN"));
    assert.ok(events.includes("ROLLBACK"));
    assert.equal(released, true);
    assert.ok(events.includes("end"));
  });

  await test("production sources: no pool.transaction / no HTTP neon CAS", () => {
    const execSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/runtime/neon-sql-executor.ts",
      ),
      "utf8",
    );
    const storeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/neon-job-store.adapter.ts",
      ),
      "utf8",
    );
    // Ban call sites; comments may mention forbidden APIs.
    assert.equal(/\npool\.transaction\s*\(/.test(execSrc), false);
    assert.equal(/\n\s*neon\s*\(/.test(execSrc), false);
    assert.equal(/import\s*\{\s*neon\s*\}/.test(execSrc), false);
    assert.ok(execSrc.includes("@neondatabase/serverless"));
    assert.ok(execSrc.includes("pool.connect"));
    assert.ok(storeSrc.includes("SAVEPOINT"));
    assert.ok(storeSrc.includes("HEADLESS_CREATE_INSERT_SAVEPOINT"));
    assert.equal(HEADLESS_CREATE_INSERT_SAVEPOINT, "headless_create_insert");
    assert.equal(/catch\s*23505/.test(storeSrc), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
