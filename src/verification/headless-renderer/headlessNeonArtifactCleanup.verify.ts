/**
 * Sprint 11E Phase 2E.2A — Neon artifact cleanup adapter (scripted SQL).
 * Run: npm run test:headless-neon-artifact-cleanup
 */

import assert from "node:assert/strict";

import { NeonHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-artifact-cleanup.adapter";
import { mapHeadlessCleanupIntentSqlRow } from "@/features/headless-renderer/control-plane/services/map-headless-cleanup-intent-sql-row";
import { ScriptedHeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/testing/fake-sql-executor";
import {
  HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
  type HeadlessArtifactCleanupIntentV1,
} from "@/features/headless-renderer/control-plane/types/artifact-cleanup-intent";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function intent(overrides: Partial<HeadlessArtifactCleanupIntentV1> = {}) {
  return {
    version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
    cleanupId: "cleanup_intent_aaaaaaaa",
    jobId: "job_cleanup_1",
    attempt: 1,
    ownerId: "owner_cleanup",
    projectId: "11111111-1111-4111-8111-111111111111",
    objectId: "art_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageLocator: {
      kind: "object_storage" as const,
      storeId: "artifacts",
      objectKey: "test/finalized/artifacts/artifact/aa/bb/cc/dd/none/abcdabcdabcdabcdabcdabcdabcdabcd",
    },
    contentDigest: `sha256:${"ab".repeat(32)}`,
    reasonId: "UPLOAD_SESSION_ORPHAN" as const,
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_360_000,
    ...overrides,
  } satisfies HeadlessArtifactCleanupIntentV1;
}

function rowFromIntent(
  i: HeadlessArtifactCleanupIntentV1,
  extra: Record<string, unknown> = {},
) {
  return {
    cleanup_id: i.cleanupId,
    version: i.version,
    job_id: i.jobId,
    attempt: String(i.attempt),
    owner_id: i.ownerId,
    project_id: i.projectId,
    object_id: i.objectId,
    locator_kind: i.storageLocator.kind,
    store_id: i.storageLocator.storeId,
    object_key: i.storageLocator.objectKey,
    content_digest: i.contentDigest,
    reason_id: i.reasonId,
    state: "pending",
    claim_token: null,
    claimed_at_ms: null,
    expires_at_ms: String(i.expiresAtMs),
    store_version: "1",
    idempotency_key: "idem_cleanup_aaaaaaaa",
    created_at_ms: String(i.createdAtMs),
    completed_at_ms: null,
    ...extra,
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2A — Neon artifact cleanup\n");

  await test("BIGINT string row maps; hostile row rejected", () => {
    const i = intent();
    const mapped = mapHeadlessCleanupIntentSqlRow(rowFromIntent(i));
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.stored.storeVersion, 1);
    assert.equal(mapped.stored.intent.attempt, 1);

    const hostile = mapHeadlessCleanupIntentSqlRow({
      ...rowFromIntent(i),
      attempt: "1e3",
    });
    assert.equal(hostile.ok, false);

    const urlKey = mapHeadlessCleanupIntentSqlRow({
      ...rowFromIntent(i),
      object_key: "https://evil.example/obj",
    });
    assert.equal(urlKey.ok, false);
  });

  await test("createIfAbsent created + idempotent replay", async () => {
    const i = intent();
    const createdRow = rowFromIntent(i);
    const sql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [createdRow] },
    ]);
    const adapter = new NeonHeadlessArtifactCleanupAdapter(sql);
    const created = await adapter.createIfAbsent({
      idempotencyKey: "idem_cleanup_aaaaaaaa",
      intent: i,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.kind, "created");

    const sqlReplay = new ScriptedHeadlessSqlExecutor([
      { kind: "unique_violation" },
      { kind: "rows", rows: [createdRow] }, // by idempotency
      { kind: "rows", rows: [] }, // by cleanup id (unused when idem hit)
    ]);
    const adapter2 = new NeonHeadlessArtifactCleanupAdapter(sqlReplay);
    const existing = await adapter2.createIfAbsent({
      idempotencyKey: "idem_cleanup_aaaaaaaa",
      intent: i,
    });
    assert.equal(existing.ok, true);
    if (!existing.ok) return;
    assert.equal(existing.value.kind, "existing");
  });

  await test("createIfAbsent semantic conflict", async () => {
    const i = intent();
    const conflictRow = rowFromIntent(i, {
      content_digest: `sha256:${"cd".repeat(32)}`,
    });
    const sql = new ScriptedHeadlessSqlExecutor([
      { kind: "unique_violation" },
      { kind: "rows", rows: [conflictRow] },
      { kind: "rows", rows: [] },
    ]);
    const adapter = new NeonHeadlessArtifactCleanupAdapter(sql);
    const result = await adapter.createIfAbsent({
      idempotencyKey: "idem_cleanup_aaaaaaaa",
      intent: i,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "IDEMPOTENCY_CONFLICT");
    }
  });

  await test("claim race / stale reclaim / CAS complete / fail / immutability", async () => {
    const i = intent();
    const pending = rowFromIntent(i);
    const claimed = rowFromIntent(i, {
      state: "claimed",
      claim_token: "claim_token_aaaaaaaa",
      claimed_at_ms: "1700000001000",
      store_version: "2",
    });
    const completed = rowFromIntent(i, {
      state: "completed",
      claim_token: null,
      claimed_at_ms: "1700000001000",
      completed_at_ms: "1700000002000",
      store_version: "3",
    });

    // Claim success
    const claimSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [pending] },
      { kind: "rows", rows: [claimed] },
    ]);
    const claimAdapter = new NeonHeadlessArtifactCleanupAdapter(claimSql);
    const claimedResult = await claimAdapter.claimPending({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_aaaaaaaa",
      nowMs: 1_700_000_001_000,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimedResult.ok, true);
    if (!claimedResult.ok) return;
    assert.equal(claimedResult.value.kind, "claimed");

    // Active claim race rejected
    const raceSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [claimed] },
    ]);
    const raceAdapter = new NeonHeadlessArtifactCleanupAdapter(raceSql);
    const raced = await raceAdapter.claimPending({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_bbbbbbbb",
      nowMs: 1_700_000_001_500,
      claimLeaseMs: 60_000,
    });
    assert.equal(raced.ok, true);
    if (!raced.ok) return;
    assert.equal(raced.value.kind, "rejected");

    // Stale claim reclaim
    const staleClaimed = rowFromIntent(i, {
      state: "claimed",
      claim_token: "claim_token_old______",
      claimed_at_ms: "1700000000000",
      store_version: "2",
    });
    const reclaimed = rowFromIntent(i, {
      state: "claimed",
      claim_token: "claim_token_new______",
      claimed_at_ms: "1700000007000",
      store_version: "3",
    });
    const reclaimSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [staleClaimed] },
      { kind: "rows", rows: [reclaimed] },
    ]);
    const reclaimAdapter = new NeonHeadlessArtifactCleanupAdapter(reclaimSql);
    const reclaimedResult = await reclaimAdapter.claimPending({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_new______",
      nowMs: 1_700_000_007_000,
      claimLeaseMs: 1_000,
    });
    assert.equal(reclaimedResult.ok, true);
    if (!reclaimedResult.ok) return;
    assert.equal(reclaimedResult.value.kind, "claimed");

    // Complete CAS
    const completeSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [claimed] },
      { kind: "rows", rows: [completed] },
    ]);
    const completeAdapter = new NeonHeadlessArtifactCleanupAdapter(completeSql);
    const completeResult = await completeAdapter.complete({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_aaaaaaaa",
      expectedStoreVersion: 2,
      nowMs: 1_700_000_002_000,
    });
    assert.equal(completeResult.ok, true);
    if (!completeResult.ok) return;
    assert.equal(completeResult.value.kind, "completed");

    // Fail claim → pending
    const pendingAgain = rowFromIntent(i, { store_version: "3" });
    const failSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [claimed] },
      { kind: "rows", rows: [pendingAgain] },
    ]);
    const failAdapter = new NeonHeadlessArtifactCleanupAdapter(failSql);
    const failed = await failAdapter.failClaim({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_aaaaaaaa",
      expectedStoreVersion: 2,
    });
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    assert.equal(failed.value.kind, "pending");

    // Completed immutable
    const immSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [completed] },
    ]);
    const immAdapter = new NeonHeadlessArtifactCleanupAdapter(immSql);
    const imm = await immAdapter.failClaim({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_aaaaaaaa",
      expectedStoreVersion: 3,
    });
    assert.equal(imm.ok, true);
    if (!imm.ok) return;
    assert.equal(imm.value.kind, "already_terminal");
    if (imm.value.kind === "already_terminal") {
      assert.equal(imm.value.record.state, "completed");
    }
  });

  await test("listRetryable bounded + owner isolation miss", async () => {
    const i = intent();
    const sql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [rowFromIntent(i)] },
    ]);
    const adapter = new NeonHeadlessArtifactCleanupAdapter(sql);
    const listed = await adapter.listRetryableForOwner(i.ownerId);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.value.length, 1);

    const missSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [] },
    ]);
    const missAdapter = new NeonHeadlessArtifactCleanupAdapter(missSql);
    const miss = await missAdapter.getByCleanupIdAndOwner(
      i.cleanupId,
      "other_owner",
    );
    assert.equal(miss.ok, false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
