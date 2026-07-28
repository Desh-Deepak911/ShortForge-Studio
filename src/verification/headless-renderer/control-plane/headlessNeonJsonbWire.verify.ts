/**
 * Sprint 11E Phase 2B.2D / 2B.2D.1 — PostgreSQL JSONB wire vs slot-key authority.
 * Run: npm run test:headless-neon-jsonb-wire
 *
 * Proves: NUL-delimited composites are rejected by PostgreSQL jsonb (22P05);
 * hslot:v2 keys round-trip and remain canonical after JSONB-wire simulation.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  mapHeadlessJobSqlRow,
  serializeProvisionalJsonPayload,
} from "@/features/headless-renderer/control-plane/services/map-headless-job-sql-row";
import { validateHeadlessProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane/services/validate-provisional-stored-job";
import { NeonHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/testing";
import { InMemoryHeadlessSqlFixture } from "@/features/headless-renderer/control-plane/testing/fake-sql-executor";
import {
  HEADLESS_SOURCE_SLOT_KEY_PREFIX,
  headlessSourceSlotKey,
  isCanonicalHeadlessSourceSlotKey,
} from "@/features/headless-renderer/domain/headless-source-coverage";
import { HEADLESS_PG_SQLSTATE } from "@/features/headless-renderer/control-plane/runtime/map-database-failure";

import { buildLiveDraft } from "../neon-live/live-fixtures";

let passed = 0;

async function test(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    throw error;
  }
}

/**
 * Simulate PostgreSQL jsonb ingest of a JSON text parameter:
 * reject `\u0000` escapes the same way PG does for jsonb (22P05).
 */
function simulatePostgresJsonbIngest(jsonText: string):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly sqlState: string } {
  if (jsonText.includes("\\u0000") || jsonText.includes("\0")) {
    return { ok: false, sqlState: HEADLESS_PG_SQLSTATE.UNTRANSLATABLE_CHARACTER };
  }
  try {
    return { ok: true, value: JSON.parse(jsonText) as unknown };
  } catch {
    return { ok: false, sqlState: HEADLESS_PG_SQLSTATE.INVALID_TEXT_REPRESENTATION };
  }
}

async function main(): Promise<void> {
  console.log("\nSprint 11E Phase 2B.2D.1 — PostgreSQL JSONB wire authority\n");

  await test("hslot:v2 keys are JSONB-safe (no raw NUL)", () => {
    const key = headlessSourceSlotKey({
      role: "scene_media",
      sceneId: "sc\0ene",
      mediaItemId: "it\u001fem",
      sourceDigest: "sha256:" + "ab".repeat(32),
    });
    assert.equal(key.startsWith(HEADLESS_SOURCE_SLOT_KEY_PREFIX), true);
    assert.equal(key.includes("\0"), false);
    assert.equal(key.includes("\u001f"), false);
    assert.equal(isCanonicalHeadlessSourceSlotKey(key), true);
  });

  await test("NUL-delimited legacy composite fails PG jsonb ingest", () => {
    const legacy = ["scene_media", "scene-1", "item-1", "sha256:" + "ab".repeat(32)].join(
      "\0",
    );
    const payload = JSON.stringify({ slotKey: legacy });
    const ingested = simulatePostgresJsonbIngest(payload);
    assert.equal(ingested.ok, false);
    if (!ingested.ok) {
      assert.equal(ingested.sqlState, HEADLESS_PG_SQLSTATE.UNTRANSLATABLE_CHARACTER);
    }
  });

  await test("Unit-separator delimiter join is not canonical", () => {
    const legacy = ["scene_media", "scene-1", "item-1", "sha256:" + "ab".repeat(32)].join(
      "\u001f",
    );
    assert.equal(isCanonicalHeadlessSourceSlotKey(legacy), false);
    const payload = JSON.stringify({ slotKey: legacy });
    const ingested = simulatePostgresJsonbIngest(payload);
    assert.equal(ingested.ok, true);
  });

  await test("portable hslot:v2 survives PG jsonb ingest simulation", () => {
    const key = headlessSourceSlotKey({
      role: "scene_media",
      sceneId: "scene-1",
      mediaItemId: "item-1",
      sourceDigest: "sha256:" + "cd".repeat(32),
    });
    const payload = JSON.stringify({ slotKey: key });
    const ingested = simulatePostgresJsonbIngest(payload);
    assert.equal(ingested.ok, true);
    if (ingested.ok) {
      assert.equal((ingested.value as { slotKey: string }).slotKey, key);
    }
  });

  await test(
    "exact live draft: pre-insert accept, jsonb wire, RETURNING map, fake create",
    async () => {
      const runId = randomUUID();
      const ownerId = `owner_wire_${runId.replace(/-/g, "").slice(0, 16)}`;
      const projectId = randomUUID();
      const draftCtx = await buildLiveDraft({ runId, ownerId, projectId });
      const validated = validateHeadlessProvisionalStoredJobRecord(
        { ...draftCtx.draft, storeVersion: 1 },
        { requireStoreVersion: true },
      );
      assert.equal(validated.ok, true);
      if (!validated.ok) return;

      for (const slot of validated.record.snapshotClaim.expectedSlotClaims) {
        assert.equal(slot.slotKey.includes("\0"), false);
        assert.equal(isCanonicalHeadlessSourceSlotKey(slot.slotKey), true);
      }

      const provisionalJson = serializeProvisionalJsonPayload(validated.record);
      const jsonText = JSON.stringify(provisionalJson);
      const ingested = simulatePostgresJsonbIngest(jsonText);
      assert.equal(ingested.ok, true);
      if (!ingested.ok) return;

      const profileText = JSON.stringify(validated.record.requestedRendererProfile);
      assert.equal(simulatePostgresJsonbIngest(profileText).ok, true);

      const pgRow = {
        job_id: validated.record.jobId,
        stage: "provisional",
        state: validated.record.state,
        owner_id: validated.record.ownerId,
        project_id: validated.record.projectId,
        store_version: "1",
        operation_id: validated.record.operationId,
        idempotency_authority_key: validated.record.idempotencyAuthorityKey,
        creator_idempotency_key: validated.record.creatorIdempotencyKey,
        requested_renderer_profile: JSON.parse(profileText) as unknown,
        requested_renderer_build_id: validated.record.requestedRendererBuildId,
        provisional: ingested.ok ? ingested.value : null,
        canonical_job: null,
        canonical_request: null,
        claim_token: null,
        claimed_at_ms: null,
        artifact_object_binding: null,
        created_at_ms: String(validated.record.createdAtMs),
        updated_at_ms: String(validated.record.updatedAtMs),
        expires_at_ms: String(validated.record.expiresAtMs),
        terminal_reason: null,
        verification_claim_token: validated.record.verificationClaimToken,
        verification_claimed_at_ms: validated.record.verificationClaimedAtMs,
      };
      const mapped = mapHeadlessJobSqlRow(pgRow);
      assert.equal(mapped.ok, true);
      if (!mapped.ok || mapped.record.stage !== "provisional") {
        assert.fail("mapped provisional record required");
      }
      assert.equal(mapped.record.jobId, validated.record.jobId);
      assert.equal(
        mapped.record.snapshotClaim.expectedSlotClaims.length,
        validated.record.snapshotClaim.expectedSlotClaims.length,
      );

      const callerClone = {
        ...draftCtx.draft,
        state: "failed" as const,
      };
      assert.equal(callerClone.state, "failed");
      assert.equal(mapped.record.state, "materializing");

      const fake = new InMemoryHeadlessSqlFixture();
      const store = new NeonHeadlessJobStoreAdapter(fake);
      const created = await store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
        record: draftCtx.draft,
      });
      assert.equal(created.ok, true);
      if (!created.ok) assert.fail("create required");
      assert.equal(created.value.kind, "created");
    },
  );

  await test("legacy delimiter slotKey remains fail-closed at provisional validation", async () => {
    const runId = randomUUID();
    const ownerId = `owner_wire_${runId.replace(/-/g, "").slice(0, 16)}`;
    const projectId = randomUUID();
    const draftCtx = await buildLiveDraft({ runId, ownerId, projectId });
    const poisoned = {
      ...draftCtx.draft,
      snapshotClaim: {
        ...draftCtx.draft.snapshotClaim,
        expectedSlotClaims: draftCtx.draft.snapshotClaim.expectedSlotClaims.map(
          (slot) => ({
            ...slot,
            slotKey: ["scene_media", "scene-1", "item-1", "sha256:" + "ab".repeat(32)].join(
              "\u001f",
            ),
          }),
        ),
      },
    };
    const validated = validateHeadlessProvisionalStoredJobRecord(
      { ...poisoned, storeVersion: 1 },
      { requireStoreVersion: true },
    );
    assert.equal(validated.ok, false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch(() => {
  console.log("\nFAIL — JSONB wire authority terminated unexpectedly.\n");
  process.exitCode = 1;
});
