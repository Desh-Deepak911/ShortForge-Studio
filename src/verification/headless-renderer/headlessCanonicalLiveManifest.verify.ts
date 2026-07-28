/**
 * Sprint 11E Phase 2B.2D.4 — canonical live manifest identity (deterministic).
 * Run: npm run test:headless-canonical-live-manifest
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  buildExportManifestFingerprint,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  appendProvisionalStagingObjectRefs,
  type HeadlessProvisionalStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import {
  MemoryHeadlessJobStoreAdapter,
  TestHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import {
  buildCanonicalLiveExportManifest,
  buildStaleProjectIdOverwrittenManifest,
} from "./neon-live/canonical-live-manifest";
import {
  buildLiveCanonicalPair,
  buildLiveDraft,
  casLiveCoverage,
  LIVE_CLOCK_MS,
} from "./neon-live/live-fixtures";
import { runNeonPromotionProbe } from "./neon-live/promotion-probe";

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

function fixStory(): FootieScript {
  return syncFootieScript({
    title: "Canonical Live Manifest Verify",
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

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2B.2D.4 — canonical live manifest identity\n");

  await test("overwrite projectId without recomputing fingerprint fails", () => {
    const projectId = randomUUID();
    const stale = buildStaleProjectIdOverwrittenManifest({
      projectId,
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    assert.equal(stale.project.projectId, projectId);
    const validated = validateExportManifest(stale);
    assert.equal(validated.ok, false);
    const draft = { ...stale };
    delete (draft as { fingerprint?: string }).fingerprint;
    const expected = buildExportManifestFingerprint(
      draft as Parameters<typeof buildExportManifestFingerprint>[0],
    );
    assert.notEqual(stale.fingerprint, expected);
  });

  await test("final projectId + canonical fingerprint recomputation passes", () => {
    const projectId = randomUUID();
    const built = buildCanonicalLiveExportManifest({
      projectId,
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    if (!built.ok) throw new Error(built.message);
    assert.equal(built.manifest.project.projectId, projectId);
    const draft = { ...built.manifest };
    delete (draft as { fingerprint?: string }).fingerprint;
    assert.equal(
      buildExportManifestFingerprint(
        draft as Parameters<typeof buildExportManifestFingerprint>[0],
      ),
      built.manifest.fingerprint,
    );
  });

  await test("validateExportManifest accepts the corrected fixture", () => {
    const built = buildCanonicalLiveExportManifest({
      projectId: randomUUID(),
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    if (!built.ok) throw new Error(built.message);
    assert.equal(validateExportManifest(built.manifest).ok, true);
  });

  await test("different project IDs produce different manifest fingerprints", () => {
    const a = buildCanonicalLiveExportManifest({
      projectId: randomUUID(),
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    const b = buildCanonicalLiveExportManifest({
      projectId: randomUUID(),
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) throw new Error("build failed");
    assert.notEqual(a.manifest.fingerprint, b.manifest.fingerprint);
    assert.notEqual(a.manifest.project.projectId, b.manifest.project.projectId);
  });

  await test("canonical request/job construction succeeds; ownership matches projectId", async () => {
    const projectId = randomUUID();
    const ownerId = "owner_live_manifest_1";
    const draftCtx = await buildLiveDraft({
      runId: randomUUID(),
      ownerId,
      projectId,
      randomUUID,
    });
    assert.equal(draftCtx.projectId, projectId);
    assert.equal(draftCtx.manifest.project.projectId, projectId);
    assert.equal(validateExportManifest(draftCtx.manifest).ok, true);

    const store = new MemoryHeadlessJobStoreAdapter();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") {
      throw new Error("create failed");
    }
    let record = created.value.record as HeadlessProvisionalStoredJobRecord;
    const coverage = await casLiveCoverage(
      store,
      record,
      record.verificationCoverage.requiredTargets,
    );
    assert.equal(coverage.ok, true);
    if (!coverage.ok) throw new Error("coverage failed");
    record = coverage.record;

    const pair = buildLiveCanonicalPair(
      draftCtx.manifest,
      draftCtx.seeded.bundle,
      record,
    );
    assert.equal(pair.ok, true);
    if (!pair.ok) throw new Error("pair failed");
    assert.equal(pair.job.ownership.projectId, projectId);
    assert.equal(pair.request.ownership.projectId, projectId);
    assert.equal(pair.job.ownership.ownerId, ownerId);
    assert.equal(pair.request.ownership.ownerId, ownerId);
  });

  await test("caller mutation cannot alter the canonical manifest", () => {
    const built = buildCanonicalLiveExportManifest({
      projectId: randomUUID(),
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    if (!built.ok) throw new Error(built.message);
    const beforeFp = built.manifest.fingerprint;
    const beforeProjectId = built.manifest.project.projectId;
    assert.equal(Object.isFrozen(built.manifest), true);
    assert.equal(Object.isFrozen(built.manifest.project), true);
    try {
      (built.manifest.project as { projectId: string }).projectId =
        randomUUID();
    } catch {
      // strict freeze may throw — either way identity must be unchanged
    }
    assert.equal(built.manifest.project.projectId, beforeProjectId);
    assert.equal(built.manifest.fingerprint, beforeFp);
  });

  await test("malformed / blank / hostile / oversized project identity fails closed", () => {
    const story = fixStory();
    const cases: unknown[] = [
      "",
      "   ",
      "project-1",
      "NOT-A-UUID",
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
      "A".repeat(200),
      null,
      undefined,
      { projectId: randomUUID() },
      ["not-a-string"],
    ];
    for (const projectId of cases) {
      const built = buildCanonicalLiveExportManifest({
        projectId,
        story,
        environment: CAPABLE_ENV,
      });
      assert.equal(built.ok, false, String(projectId));
      if (built.ok) throw new Error("expected fail");
      assert.equal(built.code, "PROJECT_ID_INVALID");
    }
  });

  await test("no production builder bypass — stale helper still fails validation", () => {
    const stale = buildStaleProjectIdOverwrittenManifest({
      projectId: randomUUID(),
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    assert.equal(validateExportManifest(stale).ok, false);
    const canonical = buildCanonicalLiveExportManifest({
      projectId: randomUUID(),
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    assert.equal(canonical.ok, true);
  });

  await test("local full promotion chain (memory) — storeVersion +1", async () => {
    const runId = randomUUID();
    const ownerId = `owner_promo_chain_${runId.slice(0, 8)}`;
    const projectId = randomUUID();
    const auth = new TestHeadlessProjectAuthorizationAdapter({
      ownerId,
      allowedProjectIds: [projectId],
    });
    const principal = { ownerId, sessionId: `sess-${runId}` };
    const claim = await auth.claimUnownedProject(principal, projectId);
    assert.equal(claim.ok, true);

    const store = new MemoryHeadlessJobStoreAdapter();
    const draftCtx = await buildLiveDraft({
      runId,
      ownerId,
      projectId,
      emptyStaging: true,
      randomUUID,
    });
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") {
      throw new Error("create failed");
    }
    let provisional = created.value.record as HeadlessProvisionalStoredJobRecord;
    assert.equal(provisional.stagingObjectRefs.length, 0);

    const appended = appendProvisionalStagingObjectRefs(
      provisional,
      draftCtx.authoritativeStagingObjectRefs,
      LIVE_CLOCK_MS + 500,
    );
    if (!appended.ok) throw new Error(appended.message);
    const staged = await store.compareAndSetProvisional({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: provisional.storeVersion,
      next: appended.record,
    });
    assert.equal(staged.ok && staged.value.kind === "updated", true);
    if (!staged.ok || staged.value.kind !== "updated") {
      throw new Error("staging CAS failed");
    }
    provisional = staged.value.record as HeadlessProvisionalStoredJobRecord;

    const coverage = await casLiveCoverage(
      store,
      provisional,
      provisional.verificationCoverage.requiredTargets,
    );
    assert.equal(coverage.ok, true);
    if (!coverage.ok) throw new Error("coverage failed");
    provisional = coverage.record;
    assert.equal(provisional.verificationCoverage.complete, true);

    const beforeVersion = provisional.storeVersion;
    const pair = buildLiveCanonicalPair(
      draftCtx.manifest,
      draftCtx.seeded.bundle,
      provisional,
    );
    assert.equal(pair.ok, true, "canonical pair must succeed after fixture fix");
    if (!pair.ok) throw new Error("pair failed");

    const promoted = await store.promoteProvisionalToCanonicalAttributed({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: provisional.storeVersion,
      expectedOperationId: provisional.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(promoted.result.ok, true);
    if (!promoted.result.ok) throw new Error("promote failed");
    assert.equal(promoted.result.value.kind, "updated");
    if (promoted.result.value.kind !== "updated") throw new Error("kind");
    assert.equal(promoted.attribution.promotionResultKind, "updated");
    assert.equal(promoted.attribution.storeVersionDelta, "plus_one");
    assert.equal(promoted.attribution.durableCanonicalRowExists, true);
    assert.equal(promoted.attribution.stageClassification, "canonical");
    assert.equal(promoted.result.value.record.storeVersion, beforeVersion + 1);

    const reread = await store.getByJobIdAndOwner(
      provisional.jobId,
      provisional.ownerId,
    );
    assert.equal(reread.ok, true);
    if (!reread.ok) throw new Error("reread failed");
    assert.equal(reread.value.stage, "canonical");
    assert.equal(reread.value.storeVersion, beforeVersion + 1);

    // Forged replay / rejection negatives
    const replay = await store.promoteProvisionalToCanonical({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: beforeVersion,
      expectedOperationId: provisional.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(replay.ok && replay.value.kind === "already_promoted", true);

    const forged = await store.promoteProvisionalToCanonical({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: beforeVersion,
      expectedOperationId: "op_forged_replay_mismatch",
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(forged.ok && forged.value.kind === "rejected", true);
  });

  await test("diagnostic truth: pair failure still attributes canonical_pair_construction", async () => {
    // Stale overwrite remains a fixture-construction failure, not a Neon failure.
    const projectId = randomUUID();
    const stale = buildStaleProjectIdOverwrittenManifest({
      projectId,
      story: fixStory(),
      environment: CAPABLE_ENV,
    });
    const draftCtx = await buildLiveDraft({
      runId: randomUUID(),
      ownerId: "owner_diag_pair",
      projectId,
      randomUUID,
    });
    // Force pair against the stale (invalid) manifest while draft is coherent.
    const store = new MemoryHeadlessJobStoreAdapter();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") {
      throw new Error("create failed");
    }
    const coverage = await casLiveCoverage(
      store,
      created.value.record as HeadlessProvisionalStoredJobRecord,
      (created.value.record as HeadlessProvisionalStoredJobRecord)
        .verificationCoverage.requiredTargets,
    );
    assert.equal(coverage.ok, true);
    if (!coverage.ok) throw new Error("coverage");
    const pair = buildLiveCanonicalPair(
      stale,
      draftCtx.seeded.bundle,
      coverage.record,
    );
    assert.equal(pair.ok, false);
    if (pair.ok) throw new Error("expected pair fail");
    assert.equal(pair.code, "CANONICAL_PAIR_FAILED");
  });

  await test("promotion probe gate-off: zero connections, preserve, NOT_TESTED", async () => {
    let factoryCalls = 0;
    const result = await runNeonPromotionProbe(
      { HEADLESS_NEON_QA_PROMOTION_PROBE: "0" },
      {
        createSqlExecutor: (() => {
          factoryCalls += 1;
          throw new Error("must not connect");
        }) as never,
      },
    );
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.exitCode, 0);
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(factoryCalls, 0);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
