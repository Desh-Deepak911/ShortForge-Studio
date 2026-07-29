/**
 * Sprint 11D Phase 3.3A / 3.3A.1 — Binding / cleanup evidence (gitignored .tmp).
 * Preserves Phase 3.3 60s 4K evidence-file SHA-256; does not re-render 60s.
 * Exit non-zero if required proofs fail or preserved source is missing/malformed.
 * Run: npm run test:headless-artifact-binding-evidence
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createMemoryArtifactObjectIO } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-object-io.adapter";
import {
  isCanonicalStoredJobRecord,
  type HeadlessCanonicalStoredJobRecord,
  type HeadlessStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import { toHeadlessPublicJobView } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import { processHeadlessArtifactCleanupOnce } from "@/features/headless-renderer/control-plane/services/process-artifact-cleanup";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import type { HeadlessArtifactCleanupIntentV1 } from "@/features/headless-renderer/control-plane/types/artifact-cleanup-intent";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import {
  assertHeadlessPreserved4k60sEvidenceArchive,
  HEADLESS_PRESERVED_4K_60S_ARTIFACT_BYTE_LENGTH,
  HEADLESS_PRESERVED_4K_60S_ARTIFACT_DIGEST,
  HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL,
  HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_SHA256,
  resolveHeadlessPreserved4k60sEvidencePath,
} from "../support/headless-local-evidence-registry";

const EVIDENCE_DIR = join(process.cwd(), ".tmp/headless-11d-evidence");
const PRESERVED = "phase33a-preserved-4k-60s-checksum.json";

type Status = "REAL_LOCAL_PASS" | "HONESTLY_BLOCKED" | "PRESERVED";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 60_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitUntil timed out");
    await sleep(20);
  }
}

function requireCanonicalStoredJobRecord(
  record: HeadlessStoredJobRecord,
  scenario: string,
): HeadlessCanonicalStoredJobRecord {
  if (!isCanonicalStoredJobRecord(record)) {
    throw new Error(`expected canonical stored job: ${scenario}`);
  }
  return record;
}

function sha256FileBytes(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Seed durable owned-object parity for memory-storage cleanup maintenance. */
async function seedFinalizedOwnedFromIntent(input: {
  store: MemoryHeadlessOwnedObjectStoreAdapter;
  intent: HeadlessArtifactCleanupIntentV1;
  operationId: string;
  byteLength: number;
  mimeType: string;
}) {
  const now = input.intent.createdAtMs;
  const staged = await input.store.createStagingRecord({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    projectId: input.intent.projectId,
    jobId: input.intent.jobId,
    operationId: input.operationId,
    purpose: "artifact",
    slotKey: null,
    storeId: "artifacts",
    objectKey: input.intent.storageLocator.objectKey,
    expectedContentDigestClaim: input.intent.contentDigest,
    expectedByteLength: input.byteLength,
    expectedMimeType: input.mimeType,
    uploadCapabilityIssuedAtMs: now,
    uploadCapabilityExpiresAtMs: input.intent.expiresAtMs,
    expiresAtMs: input.intent.expiresAtMs,
    createdAtMs: now,
  });
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  const observed = await input.store.markUploadedObserved({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    expectedStoreVersion: staged.value.storeVersion,
    uploadedObservedAtMs: now,
    nowMs: now,
  });
  assert.equal(observed.ok, true);
  if (!observed.ok) return;
  const claimToken = `vclaim_${randomUUID()}`;
  const claimed = await input.store.acquireVerificationClaim({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    claimToken,
    nowMs: now,
    expectedStoreVersion: observed.value.storeVersion,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;
  const finalized = await input.store.finalizeStagingRecord({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: claimToken,
    contentDigest: input.intent.contentDigest,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    verifiedAtMs: now,
    expiresAtMs: input.intent.expiresAtMs,
    nowMs: now,
    verifiedBy: "trusted_worker_upload_stream",
  });
  assert.equal(finalized.ok, true);
}

async function recoverPendingCleanupAfterDeleteFail(input: {
  stack: Awaited<ReturnType<typeof seedAndCreateReferenceJob>>["stack"];
  ownerId: string;
  cleanupId: string;
}): Promise<{
  readonly recovered: Awaited<ReturnType<typeof processHeadlessArtifactCleanupOnce>>;
  readonly ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  readonly objectIo: ReturnType<typeof createMemoryArtifactObjectIO>;
}> {
  const intentRow = await input.stack.artifactCleanup.getByCleanupIdAndOwner(
    input.cleanupId,
    input.ownerId,
  );
  assert.equal(intentRow.ok, true);
  if (!intentRow.ok) throw new Error("missing cleanup intent");
  const storedJob = await input.stack.jobStore.getByJobIdAndOwner(
    intentRow.value.intent.jobId,
    input.ownerId,
  );
  assert.equal(storedJob.ok, true);
  if (!storedJob.ok) throw new Error("missing job for cleanup intent");
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const objectIo = createMemoryArtifactObjectIO(input.stack.storage);
  const peeked = input.stack.storage.testingPeekStoredObject(
    intentRow.value.intent.storageLocator,
  );
  assert.ok(peeked);
  await seedFinalizedOwnedFromIntent({
    store: ownedObjectStore,
    intent: intentRow.value.intent,
    operationId: storedJob.value.operationId,
    byteLength: peeked!.bytes.byteLength,
    mimeType: peeked!.metadata.mimeType,
  });
  const recovered = await processHeadlessArtifactCleanupOnce({
    cleanup: input.stack.artifactCleanup,
    ownedObjectStore,
    jobStore: input.stack.jobStore,
    objectIo,
    ownerId: input.ownerId,
    nowMs: () => 1_700_000_000_000,
    limit: 4,
  });
  return Object.freeze({ recovered, ownedObjectStore, objectIo });
}

function validatePreserved4k60sEvidenceShape(value: unknown): {
  readonly ok: true;
  readonly artifactDigest: string;
  readonly artifactByteLength: number;
  readonly rendererBuildId: string;
} | { readonly ok: false; readonly message: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "evidence must be an object" };
  }
  const rec = value as Record<string, unknown>;
  if (rec.status !== "REAL_LOCAL_PASS" || rec.kind !== "measured") {
    return { ok: false, message: "evidence status/kind invalid" };
  }
  if (rec.profileId !== "4k-mp4-30") {
    return { ok: false, message: "evidence profileId invalid" };
  }
  if (typeof rec.rendererBuildId !== "string" || rec.rendererBuildId.length < 8) {
    return { ok: false, message: "evidence rendererBuildId invalid" };
  }
  if (
    typeof rec.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(rec.digest)
  ) {
    return { ok: false, message: "evidence artifact digest invalid" };
  }
  if (rec.digest !== HEADLESS_PRESERVED_4K_60S_ARTIFACT_DIGEST) {
    return { ok: false, message: "evidence artifact digest mismatch" };
  }
  if (
    typeof rec.byteLength !== "number" ||
    !Number.isSafeInteger(rec.byteLength) ||
    rec.byteLength !== HEADLESS_PRESERVED_4K_60S_ARTIFACT_BYTE_LENGTH
  ) {
    return { ok: false, message: "evidence artifact byteLength invalid" };
  }
  if (rec.contentDurationMs !== 60000) {
    return { ok: false, message: "evidence contentDurationMs invalid" };
  }
  const streamedDelivery =
    rec.streamedDelivery != null && typeof rec.streamedDelivery === "object"
      ? (rec.streamedDelivery as { wholeArtifactBufferUsed?: unknown })
      : null;
  const streaming =
    rec.streaming != null && typeof rec.streaming === "object"
      ? (rec.streaming as { totalFramesAccepted?: unknown })
      : null;
  if (streamedDelivery != null) {
    if (streamedDelivery.wholeArtifactBufferUsed !== false) {
      return { ok: false, message: "evidence streamedDelivery invalid" };
    }
  } else if (streaming != null) {
    if (
      typeof streaming.totalFramesAccepted !== "number" ||
      streaming.totalFramesAccepted !== 1812
    ) {
      return { ok: false, message: "evidence streaming frame count invalid" };
    }
  } else {
    return { ok: false, message: "evidence delivery facts missing" };
  }
  return {
    ok: true,
    artifactDigest: rec.digest,
    artifactByteLength: rec.byteLength,
    rendererBuildId: rec.rendererBuildId,
  };
}

async function main() {
  console.log("\nSprint 11D Phase 3.3A.1 — Binding / cleanup evidence\n");
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const summary: Record<string, Status> = {};

  // Preserve canonical Phase 3.2 60s 4K evidence archive (do not relabel as newly rendered).
  assertHeadlessPreserved4k60sEvidenceArchive();
  const sourcePath = resolveHeadlessPreserved4k60sEvidencePath();
  const sourceBytes = readFileSync(sourcePath);
  const evidenceFileSha256 = `sha256:${HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_SHA256}`;
  if (sha256FileBytes(sourceBytes) !== evidenceFileSha256) {
    console.error("Canonical preserved 4k 60s evidence archive SHA mismatch.");
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceBytes.toString("utf8"));
  } catch {
    console.error(
      `Malformed canonical preserved evidence JSON: ${HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL}`,
    );
    process.exit(1);
  }
  const shape = validatePreserved4k60sEvidenceShape(parsed);
  if (!shape.ok) {
    console.error(`Invalid canonical preserved evidence shape: ${shape.message}`);
    process.exit(1);
  }

  const preservedPath = join(EVIDENCE_DIR, PRESERVED);
  if (existsSync(preservedPath)) {
    const prior = JSON.parse(readFileSync(preservedPath, "utf8")) as Record<
      string,
      unknown
    >;
    if (
      typeof prior.evidenceFileSha256 === "string" &&
      prior.evidenceFileSha256 !== evidenceFileSha256
    ) {
      console.error(
        "Preserved evidence-file checksum mismatch against source Phase 3.3 JSON bytes.",
      );
      process.exit(1);
    }
  }

  writeFileSync(
    preservedPath,
    JSON.stringify(
      {
        status: "PRESERVED",
        sourceFile: HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL,
        evidenceFileSha256,
        artifactDigest: shape.artifactDigest,
        artifactByteLength: shape.artifactByteLength,
        rendererBuildId: shape.rendererBuildId,
        note: "Canonical Phase 3.2 60s 4K REAL_LOCAL_PASS archive preserved; not re-rendered in 3.3A/3.3A.1. evidenceFileSha256 is of the JSON evidence file bytes — not the artifact digest.",
      },
      null,
      2,
    ),
  );
  summary[PRESERVED] = "PRESERVED";
  console.log(
    `  → preserved ${HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL} evidence-file checksum`,
  );

  // Short success: binding survives workspace cleanup + owned retrieval.
  {
    const file = "phase33a-binding-survives-cleanup-evidence.json";
    console.log(`  → ${file} …`);
    try {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "silent",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p33a-ev-bind-survive",
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("process failed");
      assert.equal(result.value.succeeded, 1);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) throw new Error("missing store");
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "binding survives cleanup evidence",
      );
      const canonicalJob = canonicalRecord.canonicalJob;
      const binding = canonicalRecord.artifactObjectBinding;
      assert.ok(binding);
      const opened = await stack.storage.openOwnedObject(
        binding!.storageLocator,
        ownerId,
      );
      assert.equal(opened.ok, true);
      const view = toHeadlessPublicJobView(canonicalJob);
      const record = {
        status: "REAL_LOCAL_PASS",
        kind: "measured",
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        jobId,
        digest: canonicalJob.artifact!.contentDigest,
        byteLength: canonicalJob.artifact!.byteLength,
        bindingPresent: true,
        ownedObjectRetrieved: opened.ok,
        artifactAvailable: view.artifactAvailable,
        publicViewLeaksLocator: JSON.stringify(view).includes("objectKey"),
        workspacePathLeaked: JSON.stringify(result.value.lastEvidence).includes(
          "footiebitz-headless",
        ),
        cleanupIntents: stack.artifactCleanup.testingCountForOwner(ownerId),
      };
      assert.equal(record.publicViewLeaksLocator, false);
      assert.equal(record.workspacePathLeaked, false);
      assert.equal(record.cleanupIntents, 0);
      writeFileSync(join(EVIDENCE_DIR, file), JSON.stringify(record, null, 2));
      summary[file] = "REAL_LOCAL_PASS";
      console.log("    REAL_LOCAL_PASS");
    } catch (error) {
      writeFileSync(
        join(EVIDENCE_DIR, file),
        JSON.stringify(
          {
            status: "HONESTLY_BLOCKED",
            error: error instanceof Error ? error.message : "unknown",
          },
          null,
          2,
        ),
      );
      summary[file] = "HONESTLY_BLOCKED";
      console.log("    HONESTLY_BLOCKED");
    }
  }

  // Cancel after finalize deletes object; no binding persisted.
  {
    const file = "phase33a-cancel-after-finalize-deletes-object-evidence.json";
    console.log(`  → ${file} …`);
    try {
      let release!: () => void;
      let paused = false;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "silent",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p33a-ev-cancel-race",
        testHooks: {
          afterFinalizeBeforeSucceededCas: async () => {
            paused = true;
            await gate;
          },
        },
      });
      const runPromise = worker.processOnce(1);
      await waitUntil(() => paused);
      const countWhilePaused = stack.storage.testingCountFinalizedArtifacts(ownerId);
      assert.ok(countWhilePaused >= 1);
      const cancelled = await stack.service.cancelJob({
        requestContext: {},
        jobId,
      });
      assert.equal(cancelled.ok, true);
      release();
      const result = await runPromise;
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("process failed");
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) throw new Error("missing");
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "cancel after finalize evidence",
      );
      const canonicalJob = canonicalRecord.canonicalJob;
      const record = {
        status: "REAL_LOCAL_PASS",
        kind: "measured",
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        jobState: canonicalJob.state,
        bindingPresent: canonicalRecord.artifactObjectBinding != null,
        finalizedArtifactsRemaining:
          stack.storage.testingCountFinalizedArtifacts(ownerId),
        artifactsWhilePaused: countWhilePaused,
        orphanCleanupStatus: result.value.lastOrphanCleanup?.status ?? null,
        cleanupIntents: stack.artifactCleanup.testingCountForOwner(ownerId),
        artifactAvailable: toHeadlessPublicJobView(canonicalJob).artifactAvailable,
      };
      assert.equal(record.jobState, "cancelled");
      assert.equal(record.bindingPresent, false);
      assert.equal(record.finalizedArtifactsRemaining, 0);
      assert.equal(record.orphanCleanupStatus, "deleted");
      assert.equal(record.cleanupIntents, 0);
      assert.equal(record.artifactAvailable, false);
      writeFileSync(join(EVIDENCE_DIR, file), JSON.stringify(record, null, 2));
      summary[file] = "REAL_LOCAL_PASS";
      console.log("    REAL_LOCAL_PASS");
    } catch (error) {
      writeFileSync(
        join(EVIDENCE_DIR, file),
        JSON.stringify(
          {
            status: "HONESTLY_BLOCKED",
            error: error instanceof Error ? error.message : "unknown",
          },
          null,
          2,
        ),
      );
      summary[file] = "HONESTLY_BLOCKED";
      console.log("    HONESTLY_BLOCKED");
    }
  }

  // Delete failure → durable cleanup → successful retry.
  {
    const file =
      "phase33a1-delete-fail-durable-cleanup-retry-evidence.json";
    console.log(`  → ${file} …`);
    try {
      let release!: () => void;
      let paused = false;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "silent",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p33a1-ev-cleanup-retry",
        testHooks: {
          afterFinalizeBeforeSucceededCas: async () => {
            paused = true;
            await gate;
          },
        },
      });
      stack.storage.testingDeleteFail = true;
      const runPromise = worker.processOnce(1);
      await waitUntil(() => paused);
      await stack.service.cancelJob({ requestContext: {}, jobId });
      release();
      const result = await runPromise;
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("process failed");
      assert.equal(result.value.lastOrphanCleanup?.status, "scheduled");
      const cleanupId = result.value.lastOrphanCleanup!.cleanupId!;
      assert.ok(stack.storage.testingCountFinalizedArtifacts(ownerId) >= 1);
      assert.equal(stack.artifactCleanup.testingCountPendingForOwner(ownerId), 1);

      stack.storage.testingDeleteFail = false;
      const { recovered, ownedObjectStore, objectIo } =
        await recoverPendingCleanupAfterDeleteFail({
          stack,
          ownerId,
          cleanupId,
        });
      assert.equal(recovered.ok, true);
      if (!recovered.ok) throw new Error("cleanup recovery failed");
      assert.equal(recovered.value.completed, 1);
      const replay = await processHeadlessArtifactCleanupOnce({
        cleanup: stack.artifactCleanup,
        ownedObjectStore,
        jobStore: stack.jobStore,
        objectIo,
        ownerId,
        nowMs: () => 1_700_000_000_000,
        limit: 4,
      });
      assert.equal(replay.ok, true);
      if (!replay.ok) throw new Error("cleanup replay failed");
      assert.equal(replay.value.completed, 0);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) throw new Error("missing");
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "delete fail durable cleanup retry evidence",
      );
      const canonicalJob = canonicalRecord.canonicalJob;
      const record = {
        status: "REAL_LOCAL_PASS",
        kind: "measured",
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        jobState: canonicalJob.state,
        bindingPresent: canonicalRecord.artifactObjectBinding != null,
        orphanCleanupStatus: result.value.lastOrphanCleanup?.status ?? null,
        cleanupCompleted: recovered.value.completed,
        cleanupReplayCompleted: replay.value.completed,
        deleteFailureHonest: true,
        primaryJobStatePreserved: canonicalJob.state,
        finalizedArtifactsRemaining:
          stack.storage.testingCountFinalizedArtifacts(ownerId),
        pendingCleanupIntents:
          stack.artifactCleanup.testingCountPendingForOwner(ownerId),
        publicViewLeaksLocator: JSON.stringify(
          toHeadlessPublicJobView(canonicalJob),
        ).includes("objectKey"),
      };
      assert.equal(record.jobState, "cancelled");
      assert.equal(record.bindingPresent, false);
      assert.equal(record.finalizedArtifactsRemaining, 0);
      assert.equal(record.pendingCleanupIntents, 0);
      assert.equal(record.publicViewLeaksLocator, false);
      writeFileSync(join(EVIDENCE_DIR, file), JSON.stringify(record, null, 2));
      summary[file] = "REAL_LOCAL_PASS";
      console.log("    REAL_LOCAL_PASS");
    } catch (error) {
      writeFileSync(
        join(EVIDENCE_DIR, file),
        JSON.stringify(
          {
            status: "HONESTLY_BLOCKED",
            error: error instanceof Error ? error.message : "unknown",
          },
          null,
          2,
        ),
      );
      summary[file] = "HONESTLY_BLOCKED";
      console.log("    HONESTLY_BLOCKED");
    }
  }

  const requiredOk =
    summary["phase33a-binding-survives-cleanup-evidence.json"] ===
      "REAL_LOCAL_PASS" &&
    summary["phase33a-cancel-after-finalize-deletes-object-evidence.json"] ===
      "REAL_LOCAL_PASS" &&
    summary["phase33a1-delete-fail-durable-cleanup-retry-evidence.json"] ===
      "REAL_LOCAL_PASS" &&
    summary[PRESERVED] === "PRESERVED";

  writeFileSync(
    join(EVIDENCE_DIR, "phase33a-binding-evidence-summary.json"),
    JSON.stringify(
      {
        phase: "11d-phase3.3a.1",
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        summary,
        coreAcceptance: requiredOk ? "PASS" : "FAIL",
        preservedPhase33Evidence: HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL,
        preservedEvidenceFileSha256: evidenceFileSha256,
      },
      null,
      2,
    ),
  );

  console.log("\nPhase 3.3A.1 evidence recorded\n");
  for (const [file, status] of Object.entries(summary)) {
    console.log(`  ${file}: ${status}`);
  }
  console.log("");

  if (!requiredOk) {
    console.error("Phase 3.3A.1 evidence acceptance FAILED.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
