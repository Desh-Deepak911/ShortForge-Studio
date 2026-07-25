/**
 * Sprint 11E Phase 2B.1A / 2B.1B — provisional/canonical job store verification.
 * Run: npm run test:headless-provisional-store
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV3,
  isExportManifestV3,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  appendProvisionalStagingObjectRefs,
  createProvisionalMaterializingRecord,
  cancelProvisionalRecord,
  updateProvisionalVerificationCoverage,
  toHeadlessPublicJobViewFromStore,
  deriveRequiredVerificationTargets,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
  type HeadlessProvisionalStoredJobRecord,
  type HeadlessProvisionalStoreWrite,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  MemoryHeadlessJobStoreAdapter,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessRenderJobRequest,
  HEADLESS_CLAIM_LEASE_MS,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";

const CLOCK = 1_700_000_000_000;

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fixStory(): FootieScript {
  return syncFootieScript({
    title: "Provisional Store Verify",
    narration: "Hello world narration for export.",
    totalDuration: 6,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 6000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: "Hello",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          motion: null,
        },
      },
      {
        id: "scene-2",
        start: 3,
        end: 6,
        duration: 3,
        startMs: 3000,
        endMs: 6000,
        durationMs: 3000,
        subtitle: "World",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/b.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          motion: null,
        },
      },
    ],
  });
}

function fixZeroSlotStory(): FootieScript {
  return syncFootieScript({
    title: "Zero Slot Verify",
    narration: "",
    totalDuration: 6,
    voiceoverUrl: "",
    voiceoverDurationMs: 6000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 6,
        duration: 6,
        startMs: 0,
        endMs: 6000,
        durationMs: 6000,
        subtitle: "Silent placeholder",
        captionMode: "generated",
        media: {
          type: "placeholder",
          url: "",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          motion: null,
        },
      },
    ],
  });
}

function buildV3Manifest(story?: FootieScript): ExportManifestV3 {
  const manifest = buildExportManifest({
    story: story ?? fixStory(),
    environment: CAPABLE_ENV,
    audioMode: story === fixZeroSlotStory() ? "silent" : "with-voice",
    multiImageScenesEnabled: true,
  });
  assert.ok(isExportManifestV3(manifest));
  return manifest;
}

function buildIdempotencyKey(
  ownerId: string,
  projectId: string,
  creatorIdempotencyKey: string,
): string {
  const built = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey: creatorIdempotencyKey,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("idempotency build failed");
  return built.fingerprint;
}

function buildStagingObjectRefs(
  seeded: Awaited<ReturnType<typeof seedOwnedManifestAndBundle>> extends {
    ok: true;
    value: infer V;
  }
    ? V
    : never,
  manifest: ExportManifestV3,
) {
  const bundle = seeded.bundle;
  void manifest;
  return [
    {
      purpose: "manifest" as const,
      slotKey: null,
      locator: seeded.manifestLocator,
      contentDigestClaim: seeded.manifestPayloadDigest,
      byteLengthClaim: 100,
      mimeTypeClaim: "application/json",
    },
    {
      purpose: "asset_bundle_record" as const,
      slotKey: null,
      locator: seeded.bundleLocator,
      contentDigestClaim: "sha256:" + "cc".repeat(32),
      byteLengthClaim: 200,
      mimeTypeClaim: "application/json",
    },
    ...bundle.assets.map((asset) => ({
      purpose: "asset_bytes" as const,
      slotKey: headlessSourceSlotKey({
        role: asset.sourceIdentity.role,
        sceneId: asset.sourceIdentity.sceneId,
        mediaItemId: asset.sourceIdentity.mediaItemId,
        sourceDigest: asset.sourceIdentity.sourceDigest,
      }),
      locator: asset.storageLocator,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    })),
  ];
}

function buildExpectedSlotClaims(
  manifest: ExportManifestV3,
  bundle: Awaited<
    ReturnType<typeof seedOwnedManifestAndBundle>
  > extends { ok: true; value: infer V }
    ? V
    : never["bundle"],
) {
  const slots = extractRequiredHeadlessSourceSlots(manifest);
  return bundle.assets.map((asset) => {
    const slot = slots.find(
      (s) =>
        s.role === asset.sourceIdentity.role &&
        s.sceneId === asset.sourceIdentity.sceneId &&
        s.mediaItemId === asset.sourceIdentity.mediaItemId &&
        s.sourceDigest === asset.sourceIdentity.sourceDigest,
    );
    assert.ok(slot);
    return {
      slotKey: headlessSourceSlotKey(slot!),
      role: slot!.role,
      sceneId: slot!.sceneId,
      mediaItemId: slot!.mediaItemId,
      sourceDigestClaim: slot!.sourceDigest,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    };
  });
}

type StagingObjectRefs = ReturnType<typeof buildStagingObjectRefs>;

async function buildProvisionalDraftContext(input?: {
  ownerId?: string;
  projectId?: string;
  jobId?: string;
  operationId?: string;
  creatorIdempotencyKey?: string;
  jobStore?: MemoryHeadlessJobStoreAdapter;
  zeroSlots?: boolean;
  emptyStaging?: boolean;
  partialStaging?: boolean;
  stagingObjectRefs?: StagingObjectRefs;
}) {
  const zeroSlots = input?.zeroSlots === true;
  const manifest = buildV3Manifest(zeroSlots ? fixZeroSlotStory() : undefined);
  const ownerId = input?.ownerId ?? "owner-provisional-1";
  const projectId = input?.projectId ?? manifest.project.projectId;
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-1" },
    authorizedProjectIds: [projectId],
    nowMs: () => CLOCK,
  });
  const jobStore = input?.jobStore ?? stack.jobStore;

  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: CLOCK,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");

  const bundle = seeded.value.bundle;
  const expectedSlotClaims = zeroSlots
    ? []
    : buildExpectedSlotClaims(manifest, bundle);
  const fullStaging = buildStagingObjectRefs(seeded.value, manifest);
  const stagingObjectRefs =
    input?.stagingObjectRefs ??
    (input?.emptyStaging
      ? []
      : input?.partialStaging
        ? fullStaging.filter((ref) => ref.purpose === "manifest")
        : fullStaging);

  const creatorIdempotencyKey =
    input?.creatorIdempotencyKey ?? "creator-idem-1";
  const idempotencyAuthorityKey = buildIdempotencyKey(
    ownerId,
    projectId,
    creatorIdempotencyKey,
  );

  const materializeInput = {
    jobId: input?.jobId ?? `job_${randomUUID()}`,
    ownerId,
    projectId,
    createdAtMs: CLOCK,
    updatedAtMs: CLOCK,
    idempotencyAuthorityKey,
    operationId: input?.operationId ?? "op-provisional-1",
    creatorIdempotencyKey,
    requestedRendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    requestedRendererBuildId: "renderer-build-1",
    snapshotClaim: {
      manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
      assetBundleFingerprintClaim: bundle.fingerprint,
      expectedSlotClaims,
    },
    stagingObjectRefs,
    expiresAtMs: CLOCK + 60 * 60 * 1000,
  };

  const draft = createProvisionalMaterializingRecord(materializeInput);

  return {
    stack,
    jobStore,
    manifest,
    seeded: seeded.value,
    idempotencyAuthorityKey,
    draft: draft.ok ? draft.record : null,
    draftResult: draft,
    materializeInput,
    stagingObjectRefs,
    fullStaging,
  };
}

async function seedProvisionalMaterializing(input?: {
  ownerId?: string;
  projectId?: string;
  jobId?: string;
  operationId?: string;
  creatorIdempotencyKey?: string;
  jobStore?: MemoryHeadlessJobStoreAdapter;
  zeroSlots?: boolean;
  emptyStaging?: boolean;
  partialStaging?: boolean;
  stagingObjectRefs?: StagingObjectRefs;
}) {
  const ctx = await buildProvisionalDraftContext(input);
  assert.equal(ctx.draftResult.ok, true, ctx.draftResult.ok ? "" : ctx.draftResult.message);
  if (!ctx.draftResult.ok || !ctx.draft) throw new Error(ctx.draftResult.message);

  const created = await ctx.jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
    record: ctx.draft,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("createProvisionalIfAbsent failed");
  assert.equal(created.value.kind, "created");

  return {
    stack: ctx.stack,
    jobStore: ctx.jobStore,
    manifest: ctx.manifest,
    seeded: ctx.seeded,
    record: created.value.record as HeadlessProvisionalStoredJobRecord,
    idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
    draft: ctx.draft,
    stagingObjectRefs: ctx.stagingObjectRefs,
    materializeInput: ctx.materializeInput,
    fullStaging: ctx.fullStaging,
  };
}

function assetOnlyTargets(record: HeadlessProvisionalStoredJobRecord): string[] {
  return record.verificationCoverage.requiredTargets.filter((t) =>
    t.startsWith("asset_bytes:"),
  );
}

async function applyVerificationCoverage(
  jobStore: MemoryHeadlessJobStoreAdapter,
  record: HeadlessProvisionalStoredJobRecord,
  verifiedTargets: readonly string[],
) {
  const requiredTargets = [...record.verificationCoverage.requiredTargets];
  const complete =
    requiredTargets.length === verifiedTargets.length &&
    requiredTargets.every((t) => verifiedTargets.includes(t));
  const next = updateProvisionalVerificationCoverage(
    record,
    { requiredTargets, verifiedTargets: [...verifiedTargets], complete },
    "verify-claim-1",
    CLOCK + 1000,
    CLOCK + 2000,
  );
  assert.equal(next.ok, true, next.ok ? "" : next.message);
  if (!next.ok) throw new Error(next.message);

  const cas = await jobStore.compareAndSetProvisional({
    jobId: record.jobId,
    ownerId: record.ownerId,
    expectedStoreVersion: record.storeVersion,
    next: next.record,
  });
  assert.equal(cas.ok, true);
  if (!cas.ok) throw new Error("CAS failed");
  assert.equal(cas.value.kind, "updated");
  if (cas.value.kind !== "updated") throw new Error("expected updated");
  return cas.value.record as HeadlessProvisionalStoredJobRecord;
}

async function completeVerificationCoverage(
  jobStore: MemoryHeadlessJobStoreAdapter,
  record: HeadlessProvisionalStoredJobRecord,
) {
  return applyVerificationCoverage(
    jobStore,
    record,
    record.verificationCoverage.requiredTargets,
  );
}

async function appendAllStagingRefs(
  jobStore: MemoryHeadlessJobStoreAdapter,
  record: HeadlessProvisionalStoredJobRecord,
  stagingObjectRefs: ReturnType<typeof buildStagingObjectRefs>,
) {
  const appended = appendProvisionalStagingObjectRefs(
    record,
    stagingObjectRefs,
    CLOCK + 500,
  );
  assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
  if (!appended.ok) throw new Error(appended.message);
  const cas = await jobStore.compareAndSetProvisional({
    jobId: record.jobId,
    ownerId: record.ownerId,
    expectedStoreVersion: record.storeVersion,
    next: appended.record,
  });
  assert.equal(cas.ok, true);
  if (!cas.ok) throw new Error("append CAS failed");
  assert.equal(cas.value.kind, "updated");
  if (cas.value.kind !== "updated") throw new Error("expected updated");
  return cas.value.record as HeadlessProvisionalStoredJobRecord;
}

function buildCanonicalPair(
  manifest: ExportManifestV3,
  bundle: (Awaited<ReturnType<typeof seedProvisionalMaterializing>>)["seeded"]["bundle"],
  record: HeadlessProvisionalStoredJobRecord,
  overrides?: { rendererBuildId?: string },
) {
  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId: record.ownerId, projectId: record.projectId },
    manifest,
    assetBundle: bundle,
    rendererProfile: record.requestedRendererProfile,
    rendererBuildId:
      overrides?.rendererBuildId ?? record.requestedRendererBuildId,
    idempotencyKey: record.creatorIdempotencyKey,
  });
  assert.equal(requestResult.ok, true);
  if (!requestResult.ok) throw new Error("request failed");

  const accepted = createAcceptedHeadlessRenderJob({
    jobId: record.jobId,
    requestValue: requestResult.request,
    createdAtMs: record.createdAtMs,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("accept failed");
  return { job: accepted.job, request: accepted.request };
}

function assertSafeStoreView(record: HeadlessProvisionalStoredJobRecord) {
  const view = toHeadlessPublicJobViewFromStore(record);
  const json = JSON.stringify(view);
  assert.equal(json.includes("object_storage"), false);
  assert.equal(json.includes("sha256:"), false);
  assert.equal(json.includes("stagingObjectRefs"), false);
  assert.equal(json.includes("snapshotClaim"), false);
  assert.equal(view.artifactAvailable, false);
}

function recordToWrite(
  record: HeadlessProvisionalStoredJobRecord,
): HeadlessProvisionalStoreWrite {
  return {
    version: record.version,
    stage: record.stage,
    jobId: record.jobId,
    ownerId: record.ownerId,
    projectId: record.projectId,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    idempotencyAuthorityKey: record.idempotencyAuthorityKey,
    state: record.state,
    operationId: record.operationId,
    creatorIdempotencyKey: record.creatorIdempotencyKey,
    requestedRendererProfile: record.requestedRendererProfile,
    requestedRendererBuildId: record.requestedRendererBuildId,
    snapshotClaim: record.snapshotClaim,
    stagingObjectRefs: record.stagingObjectRefs,
    verificationCoverage: record.verificationCoverage,
    verificationClaimToken: record.verificationClaimToken,
    verificationClaimedAtMs: record.verificationClaimedAtMs,
    expiresAtMs: record.expiresAtMs,
    progress: record.progress,
    terminalReason: record.terminalReason,
    canonicalJob: null,
    canonicalRequest: null,
    artifactObjectBinding: null,
    claimToken: null,
    claimedAtMs: null,
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2B.1B — provisional job store\n");

  await test("createProvisionalIfAbsent: happy path materializing record", async () => {
    const { record } = await seedProvisionalMaterializing();
    assert.equal(record.stage, "provisional");
    assert.equal(record.state, "materializing");
    assert.equal(record.storeVersion, 1);
    assert.equal(record.canonicalJob, null);
    assert.equal(record.claimToken, null);
    assert.deepEqual(record.verificationCoverage.requiredTargets.slice(0, 2), [
      HEADLESS_VERIFICATION_TARGET_MANIFEST,
      HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
    ]);
    assert.equal(record.verificationCoverage.complete, false);
    assertSafeStoreView(record);
  });

  await test("createProvisionalIfAbsent: idempotent same semantics", async () => {
    const first = await seedProvisionalMaterializing({
      creatorIdempotencyKey: "idem-stable",
    });
    const second = await first.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: first.idempotencyAuthorityKey,
      record: first.draft,
    });
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error("second create failed");
    assert.equal(second.value.kind, "existing");
    if (second.value.kind === "existing") {
      assert.equal(second.value.record.jobId, first.record.jobId);
    }
  });

  await test("createProvisionalIfAbsent: conflict on different semantics", async () => {
    const first = await seedProvisionalMaterializing({
      creatorIdempotencyKey: "idem-conflict",
    });
    const conflict = await first.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: first.idempotencyAuthorityKey,
      record: {
        ...first.draft,
        requestedRendererBuildId: "renderer-build-conflict",
      },
    });
    assert.equal(conflict.ok, true);
    if (!conflict.ok) throw new Error("conflict call failed");
    assert.equal(conflict.value.kind, "conflict");
  });

  await test("owner isolation: getByJobIdAndOwner rejects wrong owner", async () => {
    const { jobStore, record } = await seedProvisionalMaterializing();
    const miss = await jobStore.getByJobIdAndOwner(record.jobId, "other-owner");
    assert.equal(miss.ok, false);
    if (!miss.ok) {
      assert.equal(miss.issues[0]?.code, "JOB_NOT_FOUND");
    }
  });

  await test("CAS provisional: stale when storeVersion mismatch", async () => {
    const { jobStore, record } = await seedProvisionalMaterializing();
    jobStore.testingBumpStoreVersion(record.jobId);
    const stale = await jobStore.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      next: {
        ...recordToWrite(record),
        updatedAtMs: record.updatedAtMs + 1,
        progress: { stage: "uploading", percent: 10 },
      },
    });
    assert.equal(stale.ok, true);
    if (!stale.ok) throw new Error("stale call failed");
    assert.equal(stale.value.kind, "stale");
  });

  await test("CAS provisional: terminal_locked after cancel", async () => {
    const { jobStore, record } = await seedProvisionalMaterializing();
    const cancelWrite = cancelProvisionalRecord(record, CLOCK + 5000);
    assert.equal(cancelWrite.ok, true);
    if (!cancelWrite.ok) throw new Error(cancelWrite.message);
    const cancelled = await jobStore.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      next: cancelWrite.record,
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) throw new Error("cancel CAS failed");
    assert.equal(cancelled.value.kind, "updated");

    const locked = await jobStore.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion + 1,
      next: cancelWrite.record,
    });
    assert.equal(locked.ok, true);
    if (!locked.ok) throw new Error("locked call failed");
    assert.equal(locked.value.kind, "terminal_locked");
  });

  await test("promotion: rejects incomplete verification coverage", async () => {
    const { jobStore, manifest, seeded, record } =
      await seedProvisionalMaterializing();
    const canonical = buildCanonicalPair(manifest, seeded.bundle, record);
    const rejected = await jobStore.promoteProvisionalToCanonical({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: record.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error("promote call failed");
    assert.equal(rejected.value.kind, "rejected");
    if (rejected.value.kind === "rejected") {
      assert.match(rejected.value.message, /coverage/i);
    }
  });

  await test("promotion: manifest missing but all assets verified → rejected", async () => {
    const ctx = await seedProvisionalMaterializing();
    const assetsOnly = assetOnlyTargets(ctx.record);
    assert.ok(assetsOnly.length > 0);
    const partial = await applyVerificationCoverage(
      ctx.jobStore,
      ctx.record,
      assetsOnly,
    );
    assert.equal(partial.verificationCoverage.complete, false);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      partial,
    );
    const rejected = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: partial.jobId,
      ownerId: partial.ownerId,
      expectedStoreVersion: partial.storeVersion,
      expectedOperationId: partial.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error("promote failed");
    assert.equal(rejected.value.kind, "rejected");
  });

  await test("promotion: bundle missing but all assets verified → rejected", async () => {
    const ctx = await seedProvisionalMaterializing();
    const verified = [
      ...assetOnlyTargets(ctx.record),
      HEADLESS_VERIFICATION_TARGET_MANIFEST,
    ];
    const partial = await applyVerificationCoverage(
      ctx.jobStore,
      ctx.record,
      verified,
    );
    assert.equal(partial.verificationCoverage.complete, false);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      partial,
    );
    const rejected = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: partial.jobId,
      ownerId: partial.ownerId,
      expectedStoreVersion: partial.storeVersion,
      expectedOperationId: partial.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error("promote failed");
    assert.equal(rejected.value.kind, "rejected");
  });

  await test("zero asset slots: requiredTargets still manifest + bundle; promotion rejected", async () => {
    const ctx = await seedProvisionalMaterializing({
      zeroSlots: true,
      emptyStaging: true,
    });
    const required = deriveRequiredVerificationTargets(ctx.record.snapshotClaim);
    assert.deepEqual(required, [
      HEADLESS_VERIFICATION_TARGET_MANIFEST,
      HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
    ]);
    assert.equal(ctx.record.verificationCoverage.complete, false);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ctx.record,
    );
    const rejected = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: ctx.record.jobId,
      ownerId: ctx.record.ownerId,
      expectedStoreVersion: ctx.record.storeVersion,
      expectedOperationId: ctx.record.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error("promote failed");
    assert.equal(rejected.value.kind, "rejected");
  });

  await test("promotion: exact manifest + bundle + all assets → accepted", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const promoted = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(promoted.ok, true);
    if (!promoted.ok) throw new Error("promote failed");
    assert.equal(
      promoted.value.kind,
      "updated",
      promoted.value.kind === "rejected" ? promoted.value.message : "",
    );
    if (promoted.value.kind === "updated") {
      assert.equal(promoted.value.record.stage, "canonical");
      assert.equal(promoted.value.record.operationId, ready.operationId);
    }
  });

  await test("staging: append-only valid reference via lifecycle helper → accepted", async () => {
    const ctx = await seedProvisionalMaterializing({ emptyStaging: true });
    assert.equal(ctx.record.stagingObjectRefs.length, 0);
    const withRefs = await appendAllStagingRefs(
      ctx.jobStore,
      ctx.record,
      ctx.stagingObjectRefs,
    );
    assert.equal(withRefs.stagingObjectRefs.length, ctx.stagingObjectRefs.length);
  });

  await test("staging: direct CAS removal/replacement → rejected", async () => {
    const { jobStore, record } = await seedProvisionalMaterializing();
    const removed = {
      ...recordToWrite(record),
      updatedAtMs: record.updatedAtMs + 1,
      stagingObjectRefs: record.stagingObjectRefs.slice(1),
    };
    const removeCas = await jobStore.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      next: removed,
    });
    assert.equal(removeCas.ok, false);

    const first = record.stagingObjectRefs[0]!;
    const replaced = {
      ...recordToWrite(record),
      updatedAtMs: record.updatedAtMs + 1,
      stagingObjectRefs: [
        { ...first, contentDigestClaim: "sha256:" + "ff".repeat(32) },
        ...record.stagingObjectRefs.slice(1),
      ],
    };
    const replaceCas = await jobStore.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      next: replaced,
    });
    assert.equal(replaceCas.ok, false);
  });

  await test("verification before staging reference exists → rejected", async () => {
    const ctx = await seedProvisionalMaterializing({ emptyStaging: true });
    const next = updateProvisionalVerificationCoverage(
      ctx.record,
      {
        requiredTargets: [...ctx.record.verificationCoverage.requiredTargets],
        verifiedTargets: [HEADLESS_VERIFICATION_TARGET_MANIFEST],
        complete: false,
      },
      "verify-early",
      CLOCK + 1000,
      CLOCK + 2000,
    );
    assert.equal(next.ok, false);
    if (next.ok) throw new Error("expected rejection");
  });

  await test("coverage regression via direct CAS → rejected", async () => {
    const ctx = await seedProvisionalMaterializing();
    const withManifest = await applyVerificationCoverage(ctx.jobStore, ctx.record, [
      HEADLESS_VERIFICATION_TARGET_MANIFEST,
    ]);
    const regressed = {
      ...recordToWrite(withManifest),
      updatedAtMs: withManifest.updatedAtMs + 1,
      verificationCoverage: {
        requiredTargets: [...withManifest.verificationCoverage.requiredTargets],
        verifiedTargets: [],
        complete: false,
      },
    };
    const cas = await ctx.jobStore.compareAndSetProvisional({
      jobId: withManifest.jobId,
      ownerId: withManifest.ownerId,
      expectedStoreVersion: withManifest.storeVersion,
      next: regressed,
    });
    assert.equal(cas.ok, false);
  });

  await test("already-promoted retry with same operation/request → already_promoted", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const input = {
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    };
    const first = await ctx.jobStore.promoteProvisionalToCanonical(input);
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("first promote failed");
    assert.equal(first.value.kind, "updated");

    const retry = await ctx.jobStore.promoteProvisionalToCanonical(input);
    assert.equal(retry.ok, true);
    if (!retry.ok) throw new Error("retry promote failed");
    assert.equal(retry.value.kind, "already_promoted");
  });

  await test("already-promoted retry with wrong operation or request → rejected", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const input = {
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    };
    const first = await ctx.jobStore.promoteProvisionalToCanonical(input);
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("promote failed");

    const wrongOp = await ctx.jobStore.promoteProvisionalToCanonical({
      ...input,
      expectedOperationId: "forged-operation-id",
    });
    assert.equal(wrongOp.ok, true);
    if (!wrongOp.ok) throw new Error("wrong op call failed");
    assert.equal(wrongOp.value.kind, "rejected");

    const wrongRequest = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
      { rendererBuildId: "forged-renderer-build" },
    );
    const wrongReq = await ctx.jobStore.promoteProvisionalToCanonical({
      ...input,
      canonicalJob: wrongRequest.job,
      canonicalRequest: wrongRequest.request,
    });
    assert.equal(wrongReq.ok, true);
    if (!wrongReq.ok) throw new Error("wrong req call failed");
    assert.equal(wrongReq.value.kind, "rejected");
  });

  await test("direct CAS cannot bypass lifecycle rules (mutate staging digest)", async () => {
    const { jobStore, record } = await seedProvisionalMaterializing();
    const first = record.stagingObjectRefs[0]!;
    const forged = {
      ...recordToWrite(record),
      updatedAtMs: record.updatedAtMs + 1,
      stagingObjectRefs: [
        { ...first, contentDigestClaim: "sha256:" + "ab".repeat(32) },
        ...record.stagingObjectRefs.slice(1),
      ],
    };
    const cas = await jobStore.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      next: forged,
    });
    assert.equal(cas.ok, false);
    if (!cas.ok) {
      assert.equal(cas.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    }
  });

  await test("concurrency: double promotion converges — second is already_promoted", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const input = {
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    };
    const [a, b] = await Promise.all([
      ctx.jobStore.promoteProvisionalToCanonical(input),
      ctx.jobStore.promoteProvisionalToCanonical(input),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    const kinds = [a.value.kind, b.value.kind].sort();
    assert.ok(kinds.includes("updated") || kinds.includes("already_promoted"));
    const final = await ctx.jobStore.getByJobIdAndOwner(ready.jobId, ready.ownerId);
    assert.equal(final.ok, true);
    if (final.ok) {
      assert.equal(final.value.stage, "canonical");
    }
  });

  await test("cancel-vs-promote: cancel wins — promotion rejected", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const cancelWrite = cancelProvisionalRecord(ready, CLOCK + 9000);
    assert.equal(cancelWrite.ok, true);
    if (!cancelWrite.ok) throw new Error(cancelWrite.message);
    const cancelled = await ctx.jobStore.compareAndSetProvisional({
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      next: cancelWrite.record,
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) throw new Error("cancel failed");
    assert.equal(cancelled.value.kind, "updated");
    if (cancelled.value.kind !== "updated") throw new Error("expected cancel update");

    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const promote = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: cancelled.value.record.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(promote.ok, true);
    if (!promote.ok) throw new Error("promote after cancel failed");
    assert.equal(promote.value.kind, "rejected");
  });

  await test("provisional cannot claim queued render work", async () => {
    const ctx = await seedProvisionalMaterializing();
    const claim = await ctx.jobStore.claimQueuedJob({
      jobId: ctx.record.jobId,
      ownerId: ctx.record.ownerId,
      expectedStoreVersion: ctx.record.storeVersion,
      claimToken: "claim-token-1",
      nowMs: CLOCK,
    });
    assert.equal(claim.ok, true);
    if (!claim.ok) throw new Error("claim call failed");
    assert.equal(claim.value.kind, "rejected");
  });

  await test("provisional cannot use recoverExpiredClaim", async () => {
    const ctx = await seedProvisionalMaterializing();
    const recover = await ctx.jobStore.recoverExpiredClaim({
      jobId: ctx.record.jobId,
      ownerId: ctx.record.ownerId,
      nowMs: CLOCK + HEADLESS_CLAIM_LEASE_MS + 1,
      leaseMs: HEADLESS_CLAIM_LEASE_MS,
    });
    assert.equal(recover.ok, true);
    if (!recover.ok) throw new Error("recover call failed");
    assert.equal(recover.value.kind, "rejected");
  });

  await test("returned records are deep-frozen; caller mutation cannot change store", async () => {
    const { jobStore, record } = await seedProvisionalMaterializing();
    const fetched = await jobStore.getByJobIdAndOwner(record.jobId, record.ownerId);
    assert.equal(fetched.ok, true);
    if (!fetched.ok) throw new Error("fetch failed");
    assert.equal(Object.isFrozen(fetched.value), true);
    assert.equal(Object.isFrozen(fetched.value.snapshotClaim), true);

    try {
      (fetched.value as { updatedAtMs: number }).updatedAtMs = CLOCK + 99999;
    } catch {
      /* frozen */
    }
    const again = await jobStore.getByJobIdAndOwner(record.jobId, record.ownerId);
    assert.equal(again.ok, true);
    if (!again.ok) throw new Error("refetch failed");
    assert.equal(again.value.updatedAtMs, record.updatedAtMs);
  });

  await test("hostile createProvisionalMaterializingRecord input rejected", async () => {
    const hostile = createProvisionalMaterializingRecord({
      jobId: "job-hostile",
      ownerId: "owner",
      projectId: "project",
      createdAtMs: CLOCK,
      updatedAtMs: CLOCK,
      idempotencyAuthorityKey: "not-a-valid-hid",
      operationId: "op",
      creatorIdempotencyKey: "creator",
      requestedRendererProfile: { evil: true },
      requestedRendererBuildId: "build",
      snapshotClaim: { bad: true },
      stagingObjectRefs: [],
      expiresAtMs: CLOCK + 1,
    });
    assert.equal(hostile.ok, false);

    const nullProto = Object.create(null);
    nullProto.requiredTargets = ["manifest"];
    nullProto.verifiedTargets = [];
    nullProto.complete = false;
    const ctx = await seedProvisionalMaterializing();
    const proxyCoverage = new Proxy(
      {
        requiredTargets: [...ctx.record.verificationCoverage.requiredTargets],
        verifiedTargets: [],
        complete: false,
      },
      {
        get(target, prop) {
          if (prop === "requiredTargets") throw new Error("hostile getter");
          return target[prop as keyof typeof target];
        },
      },
    );
    const hostileCoverage = updateProvisionalVerificationCoverage(
      ctx.record,
      proxyCoverage,
      "hostile",
      CLOCK + 1000,
      CLOCK + 2000,
    );
    assert.equal(hostileCoverage.ok, false);
  });

  await test("safe public view from store strips authority fields", async () => {
    const { record } = await seedProvisionalMaterializing();
    const view = toHeadlessPublicJobViewFromStore(record);
    assert.equal(view.jobId, record.jobId);
    assert.equal(view.state, "materializing");
    assert.equal(view.artifactAvailable, false);
    assertSafeStoreView(record);
  });

  await test("canonical coherence enforced on promotion", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const badJob = {
      ...canonical.job,
      jobId: `different_${randomUUID()}`,
    };
    const rejected = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: badJob,
      canonicalRequest: canonical.request,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) throw new Error("promote call failed");
    assert.equal(rejected.value.kind, "rejected");
  });

  await test("CAS after promotion returns already_promoted", async () => {
    const ctx = await seedProvisionalMaterializing();
    const ready = await completeVerificationCoverage(ctx.jobStore, ctx.record);
    const canonical = buildCanonicalPair(
      ctx.manifest,
      ctx.seeded.bundle,
      ready,
    );
    const promoted = await ctx.jobStore.promoteProvisionalToCanonical({
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      expectedOperationId: ready.operationId,
      canonicalJob: canonical.job,
      canonicalRequest: canonical.request,
    });
    assert.equal(promoted.ok, true);
    if (!promoted.ok) throw new Error("promote failed");

    const cas = await ctx.jobStore.compareAndSetProvisional({
      jobId: ready.jobId,
      ownerId: ready.ownerId,
      expectedStoreVersion: ready.storeVersion,
      next: recordToWrite(ready),
    });
    assert.equal(cas.ok, true);
    if (!cas.ok) throw new Error("cas failed");
    assert.equal(cas.value.kind, "already_promoted");
  });

  await test("createProvisionalMaterializingRecord: initial manifest digest mismatch → rejected", async () => {
    const ctx = await buildProvisionalDraftContext({ emptyStaging: true });
    const manifestRef = {
      purpose: "manifest" as const,
      slotKey: null,
      locator: ctx.seeded.manifestLocator,
      contentDigestClaim: "sha256:" + "ff".repeat(32),
      byteLengthClaim: 100,
      mimeTypeClaim: "application/json",
    };
    const result = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: [manifestRef],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /manifest.*digest/i);
    }
  });

  await test("createProvisionalIfAbsent: initial manifest digest mismatch → rejected", async () => {
    const ctx = await buildProvisionalDraftContext({ emptyStaging: true });
    assert.equal(ctx.draftResult.ok, true);
    if (!ctx.draftResult.ok || !ctx.draft) throw new Error("draft build failed");
    const manifestRef = {
      purpose: "manifest" as const,
      slotKey: null,
      locator: ctx.seeded.manifestLocator,
      contentDigestClaim: "sha256:" + "ff".repeat(32),
      byteLengthClaim: 100,
      mimeTypeClaim: "application/json",
    };
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: { ...ctx.draft, stagingObjectRefs: [manifestRef] },
    });
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
      assert.match(created.issues[0]?.message ?? "", /manifest.*digest/i);
    }
  });

  await test("createProvisionalMaterializingRecord: initial asset digest mismatch → rejected", async () => {
    const ctx = await buildProvisionalDraftContext();
    const assetRef = ctx.stagingObjectRefs.find((r) => r.purpose === "asset_bytes");
    assert.ok(assetRef);
    const badAsset = {
      ...assetRef!,
      contentDigestClaim: "sha256:" + "ab".repeat(32),
    };
    const result = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: [badAsset],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /digest|slot/i);
    }
  });

  await test("createProvisionalIfAbsent: initial asset digest mismatch → rejected", async () => {
    const ctx = await buildProvisionalDraftContext({ emptyStaging: true });
    assert.equal(ctx.draftResult.ok, true);
    if (!ctx.draftResult.ok || !ctx.draft) throw new Error("draft build failed");
    const assetRef = ctx.fullStaging.find((r) => r.purpose === "asset_bytes");
    assert.ok(assetRef);
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: {
        ...ctx.draft,
        stagingObjectRefs: [
          {
            ...assetRef!,
            contentDigestClaim: "sha256:" + "ab".repeat(32),
          },
        ],
      },
    });
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    }
  });

  await test("createProvisionalMaterializingRecord: initial asset length/MIME mismatch → rejected", async () => {
    const ctx = await buildProvisionalDraftContext();
    const assetRef = ctx.stagingObjectRefs.find((r) => r.purpose === "asset_bytes");
    assert.ok(assetRef);
    const badLength = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: [{ ...assetRef!, byteLengthClaim: assetRef!.byteLengthClaim + 1 }],
    });
    assert.equal(badLength.ok, false);
    const badMime = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: [{ ...assetRef!, mimeTypeClaim: "application/octet-stream" }],
    });
    assert.equal(badMime.ok, false);
  });

  await test("provisional locator accepts canonical object keys through 1024 bytes", async () => {
    const ctx = await buildProvisionalDraftContext();
    const withObjectKey = (objectKey: string) =>
      ctx.stagingObjectRefs.map((ref, index) =>
        index === 0
          ? {
              ...ref,
              locator: {
                ...ref.locator,
                objectKey,
              },
            }
          : ref,
      );

    const productionShaped = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: withObjectKey("k".repeat(142)),
    });
    assert.equal(
      productionShaped.ok,
      true,
      productionShaped.ok ? "" : productionShaped.message,
    );

    const atLimit = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: withObjectKey("k".repeat(1024)),
    });
    assert.equal(atLimit.ok, true, atLimit.ok ? "" : atLimit.message);

    const overLimit = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: withObjectKey("k".repeat(1025)),
    });
    assert.equal(overLimit.ok, false);
  });

  await test("createProvisionalIfAbsent: initial asset length/MIME mismatch → rejected", async () => {
    const ctx = await buildProvisionalDraftContext({ emptyStaging: true });
    assert.equal(ctx.draftResult.ok, true);
    if (!ctx.draftResult.ok || !ctx.draft) throw new Error("draft build failed");
    const assetRef = ctx.fullStaging.find((r) => r.purpose === "asset_bytes");
    assert.ok(assetRef);
    const badLength = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: {
        ...ctx.draft,
        stagingObjectRefs: [
          { ...assetRef!, byteLengthClaim: assetRef!.byteLengthClaim + 1 },
        ],
      },
    });
    assert.equal(badLength.ok, false);
    const badMime = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: {
        ...ctx.draft,
        stagingObjectRefs: [
          { ...assetRef!, mimeTypeClaim: "application/octet-stream" },
        ],
      },
    });
    assert.equal(badMime.ok, false);
  });

  await test("initial unknown asset slot → rejected at create", async () => {
    const ctx = await buildProvisionalDraftContext();
    const assetRef = ctx.stagingObjectRefs.find((r) => r.purpose === "asset_bytes");
    assert.ok(assetRef);
    const unknownSlot = {
      ...assetRef!,
      slotKey: "slot:unknown:fake:sha256:" + "aa".repeat(32),
    };
    const materialize = createProvisionalMaterializingRecord({
      ...ctx.materializeInput,
      stagingObjectRefs: [unknownSlot],
    });
    assert.equal(materialize.ok, false);
    if (!materialize.ok) {
      assert.match(materialize.message, /unknown|slot/i);
    }

    const persistCtx = await buildProvisionalDraftContext({ emptyStaging: true });
    assert.equal(persistCtx.draftResult.ok, true);
    if (!persistCtx.draftResult.ok || !persistCtx.draft) {
      throw new Error("draft build failed");
    }
    const persist = await persistCtx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: persistCtx.idempotencyAuthorityKey,
      record: { ...persistCtx.draft, stagingObjectRefs: [unknownSlot] },
    });
    assert.equal(persist.ok, false);
  });

  await test("valid partial initial staging refs → accepted", async () => {
    const ctx = await seedProvisionalMaterializing({ partialStaging: true });
    assert.equal(ctx.record.stagingObjectRefs.length, 1);
    assert.equal(ctx.record.stagingObjectRefs[0]?.purpose, "manifest");
    assert.equal(ctx.record.verificationCoverage.complete, false);
  });

  await test("empty initial staging refs → accepted", async () => {
    const ctx = await seedProvisionalMaterializing({ emptyStaging: true });
    assert.deepEqual(ctx.record.stagingObjectRefs, []);
    assert.equal(ctx.record.state, "materializing");
  });

  await test("memory adapter: no invented canon_op_ operation lineage synthesis", () => {
    const adapterSource = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/memory-job-store.adapter.ts",
      ),
      "utf8",
    );
    const authoritySource = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/job-store-authority.ts",
      ),
      "utf8",
    );
    assert.equal(adapterSource.includes("canon_op_${"), false);
    assert.equal(authoritySource.includes("canon_op_${"), false);
    assert.equal(/legacyOperationId/.test(adapterSource), false);
    assert.equal(/legacyOperationId/.test(authoritySource), false);
    assert.match(authoritySource, /canon_op_/);
    assert.match(authoritySource, /must not invent/i);
    assert.match(adapterSource, /legacyToCanonicalWrite/);
  });

  await test("createIfAbsent: canon_op_ operationId prefix rejected", async () => {
    const ctx = await buildProvisionalDraftContext();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const jobId = `job_${randomUUID()}`;
    const ownerId = ctx.materializeInput.ownerId;
    const projectId = ctx.materializeInput.projectId;
    const requestResult = finalizeHeadlessRenderJobRequest({
      ownership: { ownerId, projectId },
      manifest: ctx.manifest,
      assetBundle: ctx.seeded.bundle,
      rendererProfile: ctx.materializeInput.requestedRendererProfile,
      rendererBuildId: ctx.materializeInput.requestedRendererBuildId,
      idempotencyKey: "canon-op-forbidden-creator",
    });
    assert.equal(requestResult.ok, true);
    if (!requestResult.ok) throw new Error("request failed");
    const accepted = createAcceptedHeadlessRenderJob({
      jobId,
      requestValue: requestResult.request,
      createdAtMs: CLOCK,
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) throw new Error("accept failed");
    const idemKey = buildIdempotencyKey(ownerId, projectId, "canon-op-forbidden");
    const created = await jobStore.createIfAbsent({
      idempotencyAuthorityKey: idemKey,
      record: {
        job: accepted.job,
        request: accepted.request,
        idempotencyAuthorityKey: idemKey,
        operationId: `canon_op_${jobId}`,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
      assert.match(created.issues[0]?.message ?? "", /canon_op_/);
    }
  });

  await test("HeadlessCanonicalCreateLegacyWrite: operationId required (not optional)", () => {
    const typeSource = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/types/stored-job-record.ts",
      ),
      "utf8",
    );
    assert.match(
      typeSource,
      /HeadlessCanonicalCreateLegacyWrite[\s\S]*readonly operationId: string/,
    );
    assert.equal(
      /readonly operationId\?:/.test(typeSource),
      false,
      "operationId must not be optional on canonical create",
    );
  });

  await test("createIfAbsent: empty operationId rejected at runtime", async () => {
    const ctx = await buildProvisionalDraftContext();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const jobId = `job_${randomUUID()}`;
    const ownerId = ctx.materializeInput.ownerId;
    const projectId = ctx.materializeInput.projectId;
    const requestResult = finalizeHeadlessRenderJobRequest({
      ownership: { ownerId, projectId },
      manifest: ctx.manifest,
      assetBundle: ctx.seeded.bundle,
      rendererProfile: ctx.materializeInput.requestedRendererProfile,
      rendererBuildId: ctx.materializeInput.requestedRendererBuildId,
      idempotencyKey: "empty-op-id-creator",
    });
    assert.equal(requestResult.ok, true);
    if (!requestResult.ok) throw new Error("request failed");
    const accepted = createAcceptedHeadlessRenderJob({
      jobId,
      requestValue: requestResult.request,
      createdAtMs: CLOCK,
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) throw new Error("accept failed");
    const idemKey = buildIdempotencyKey(ownerId, projectId, "empty-op-id");
    const created = await jobStore.createIfAbsent({
      idempotencyAuthorityKey: idemKey,
      record: {
        job: accepted.job,
        request: accepted.request,
        idempotencyAuthorityKey: idemKey,
        operationId: "   ",
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
      assert.match(created.issues[0]?.message ?? "", /operationId/i);
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
