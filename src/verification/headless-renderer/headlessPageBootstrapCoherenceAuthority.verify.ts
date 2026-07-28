/**
 * Sprint 11E Phase 2E.2D.8H — page bootstrap coherence + source-binding success attribution.
 * Run: npm run test:headless-page-bootstrap-coherence-authority
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createR2JobBoundStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import {
  createProvisionalMaterializingRecord,
  deriveRequiredVerificationTargets,
  materializeCanonicalFromFinalizedCoverage,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import {
  buildHeadlessAssetBundleFingerprint,
  finalizeHeadlessAssetBundle,
  validateHeadlessAssetBundle,
} from "@/features/headless-renderer/domain";
import {
  HEADLESS_PAGE_BOOTSTRAP_REJECTION_REASON_IDS,
  isHeadlessPageBootstrapRejectionReasonId,
} from "@/features/headless-renderer/worker/chromium/page-bootstrap-rejection";
import {
  classifyScrubbedPageFailureMessage,
  mapBootstrapRejectionToPageFailureReason,
} from "@/features/headless-renderer/worker/chromium/page-execution-attribution";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import {
  buildAggregateSourceBindingSuccessSnapshot,
  sourceBindingAttributionToTelemetryFacts,
} from "@/features/headless-renderer/worker/runtime/source-binding-resolution";
import { validateOwningBoundarySequenceCoherence } from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";

import { deriveFlyRenderJobCreateStagingPayloads } from "./fly-render-live/job-create-fixture-identity";
import { runHeadlessPageContractHarness } from "./fly-render-live/page-contract-harness";
import { runOwnedObjectFinalizeChain } from "./fly-render-live/owned-object-finalize-chain";
import { runOwnedObjectStagingRecordChain } from "./fly-render-live/owned-object-staging-chain";
import { buildLiveDraft } from "./neon-live/live-fixtures";

const CURRENT_PROBE_EVIDENCE_SHA =
  "c7f944dba578539ad4f3ebc2431f38fb60640c041cb582bb28e239067adf500a";
const PRE_8H_PROBE_EVIDENCE_SHA =
  "a863e3cf06cb63085f5490f53ff0c69a97614ca540628b32e88ab56d3a621b33";
const PRIOR_BOOTSTRAP_FAIL_EVIDENCE_SHA =
  "aafd4161ca3f071e1dd5fd68cd7c536cafc1e367b3ff7991e5a2d939388540c0";

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

const CLOCK = 1_700_000_300_000;

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function sha256File(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), relativePath)))
    .digest("hex");
}

async function buildProviderChainFixture() {
  const runId = randomUUID();
  const draftCtx = await buildLiveDraft({
    runId,
    ownerId: `owner-${runId.slice(0, 8)}`,
  });
  const payloads = deriveFlyRenderJobCreateStagingPayloads(draftCtx);
  const fake = new FakeS3Client();
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const jobStore = new MemoryHeadlessJobStoreAdapter();
  const io = new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });

  const staged = await runOwnedObjectStagingRecordChain({
    ctx: {
      runId,
      ownerId: draftCtx.ownerId,
      projectId: draftCtx.projectId,
      nowMs: CLOCK,
      io,
      ownedObjectStore,
      jobStore,
      createdObjectIds: [],
      createdJobIds: [],
      createdProjectIds: [],
      createdR2Locators: [],
    },
    payloads,
    jobId: draftCtx.jobId,
    operationId: draftCtx.operationId,
  });
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error("staging failed");

  const finalized = await runOwnedObjectFinalizeChain({
    ctx: {
      runId,
      ownerId: draftCtx.ownerId,
      projectId: draftCtx.projectId,
      nowMs: CLOCK,
      io,
      ownedObjectStore,
      jobStore,
      createdObjectIds: [],
      createdJobIds: [],
      createdProjectIds: [],
      createdR2Locators: [],
    },
    staged: staged.staged,
    payloads,
  });
  assert.equal(finalized.ok, true);
  if (!finalized.ok) throw new Error("finalize failed");

  const targets = deriveRequiredVerificationTargets(draftCtx.draft.snapshotClaim);
  const provisional = createProvisionalMaterializingRecord({
    jobId: draftCtx.jobId,
    ownerId: draftCtx.ownerId,
    projectId: draftCtx.projectId,
    operationId: draftCtx.operationId,
    creatorIdempotencyKey: draftCtx.draft.creatorIdempotencyKey,
    idempotencyAuthorityKey: draftCtx.draft.idempotencyAuthorityKey,
    requestedRendererProfile: draftCtx.draft.requestedRendererProfile,
    requestedRendererBuildId: draftCtx.draft.requestedRendererBuildId,
    snapshotClaim: draftCtx.draft.snapshotClaim,
    stagingObjectRefs: draftCtx.draft.stagingObjectRefs,
    createdAtMs: CLOCK,
    updatedAtMs: CLOCK,
    expiresAtMs: CLOCK + 7_200_000,
  });
  assert.equal(provisional.ok, true);
  if (!provisional.ok) throw new Error(provisional.message);

  const created = await jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: draftCtx.draft.idempotencyAuthorityKey,
    record: {
      ...provisional.record,
      verificationCoverage: {
        requiredTargets: targets,
        verifiedTargets: [...targets],
        complete: true,
      },
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("provisional create failed");

  const materialized = await materializeCanonicalFromFinalizedCoverage({
    jobStore,
    ownedObjectStore,
    io,
    jobId: draftCtx.jobId,
    ownerId: draftCtx.ownerId,
    nowMs: CLOCK,
  });
  assert.equal(materialized.ok, true);
  if (!materialized.ok) {
    throw new Error(`${materialized.issues[0]?.code}: ${materialized.issues[0]?.message}`);
  }

  return { draftCtx, materialized, jobStore, ownedObjectStore, io };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8H — page bootstrap coherence authority\n",
  );

  await test("execution probe evidence archived byte-identically", () => {
    assert.equal(
      sha256File("docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md"),
      CURRENT_PROBE_EVIDENCE_SHA,
    );
    assert.equal(
      sha256File(
        "docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-a863e3cf06cb63085f5490f53ff0c69a97614ca540628b32e88ab56d3a621b33.md",
      ),
      PRE_8H_PROBE_EVIDENCE_SHA,
    );
    assert.equal(
      sha256File(
        "docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-aafd4161ca3f071e1dd5fd68cd7c536cafc1e367b3ff7991e5a2d939388540c0.md",
      ),
      PRIOR_BOOTSTRAP_FAIL_EVIDENCE_SHA,
    );
  });

  await test("bootstrap rejection taxonomy frozen and privacy-safe", () => {
    assert.equal(HEADLESS_PAGE_BOOTSTRAP_REJECTION_REASON_IDS.length, 11);
    for (const reasonId of HEADLESS_PAGE_BOOTSTRAP_REJECTION_REASON_IDS) {
      assert.equal(isHeadlessPageBootstrapRejectionReasonId(reasonId), true);
      const mapped = mapBootstrapRejectionToPageFailureReason(reasonId);
      assert.ok(mapped.startsWith("page_"));
      assert.ok(!mapped.includes("sha256"));
      assert.ok(!mapped.includes("/"));
    }
  });

  await test("asset bundle fingerprint excludes storage locator identity", async () => {
    const { materialized } = await buildProviderChainFixture();
    const bundle = materialized.value.canonicalRequest.assetBundle;
    const rebound = buildHeadlessAssetBundleFingerprint(bundle.bundleId, bundle.assets);
    assert.equal(rebound.ok, true);
    if (!rebound.ok) throw new Error("fingerprint failed");
    assert.equal(rebound.fingerprint, bundle.fingerprint);
    assert.equal(
      rebound.fingerprint,
      materialized.value.provisional.snapshotClaim.assetBundleFingerprintClaim,
    );
  });

  await test("manifest/bundle fingerprint mismatch → safe bootstrap rejection mapping", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      bootstrapRejected: true,
      bootstrapReasonId: "bundle_fingerprint_mismatch",
    });
    assert.equal(
      attribution.pageFailureReason,
      "page_bootstrap_fingerprint_mismatch",
    );
    assert.equal(attribution.pageResponseClass, "rejected");
  });

  await test("aggregate source-binding success snapshot is safe", () => {
    const snapshot = buildAggregateSourceBindingSuccessSnapshot({
      resolvedAssetCount: 3,
      allowlistedCount: 3,
    });
    assert.equal(snapshot.sourceBindingSubstage, "binding_resolution_complete");
    assert.equal(snapshot.sourceBindingResultClass, "resolved");
    assert.equal(snapshot.sourceBindingSlotCoverageClass, "complete");
    assert.equal(snapshot.sourceStreamCapabilityClass, "ready");
    const facts = sourceBindingAttributionToTelemetryFacts(snapshot);
    for (const value of Object.values(facts)) {
      assert.ok(!value.includes("objectKey"));
      assert.ok(!value.includes("sha256"));
    }
  });

  await test("provider-shaped chain materializes assets with success attribution", async () => {
    const { materialized, draftCtx, ownedObjectStore, jobStore, io } =
      await buildProviderChainFixture();
    const allowed = materialized.value.canonicalRequest.assetBundle.assets.map(
      (a) => a.storageLocator,
    );
    const storage = createR2JobBoundStorageAdapter({
      r2: io,
      ownedObjectStore,
      jobStore,
      context: {
        ownerId: draftCtx.ownerId,
        projectId: draftCtx.projectId,
        jobId: draftCtx.jobId,
        operationId: draftCtx.operationId,
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: CLOCK + 600_000,
        allowedSourceLocators: allowed,
        nowMs: () => CLOCK,
      },
    });
    const workspace = createHeadlessWorkerWorkspace({
      jobId: draftCtx.jobId,
      attempt: 1,
    });
    const result = await materializeOwnedAssets({
      storage,
      ownerId: draftCtx.ownerId,
      bundle: materialized.value.canonicalRequest.assetBundle,
      workspace,
      nowMs: CLOCK,
      maxTotalAssetBytes: 32 * 1024 * 1024,
    });
    workspace.cleanup();
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.message);
    assert.equal(
      result.sourceBindingAttribution.sourceBindingSubstage,
      "binding_resolution_complete",
    );
  });

  await test("bootstrap-terminal failure sequence coherent without frame boundaries", () => {
    const coherence = validateOwningBoundarySequenceCoherence({
      observedSequence: [
        "claimed_context_validated",
        "canonical_request_loaded",
        "source_assets_materialization_started",
        "source_assets_materialization_complete",
        "page_workspace_materialization_started",
        "page_workspace_materialization_complete",
        "browser_context_created",
        "page_created",
        "page_navigation_started",
        "page_navigation_complete",
        "page_script_execution_started",
        "page_script_execution_complete",
        "page_contract_observation_started",
        "page_contract_observation_complete",
        "page_bootstrap_started",
        "page_bootstrap_terminal",
        "chromium_session_cleanup",
      ],
      providerContext: null,
      workspaceAttribution: {
        shippedArtifactResolutionClass: "resolved_readable",
        sourcePageArtifactPresent: "present_readable",
        sourceArtifactDigestMatch: "match",
        materializedArtifactPresent: "present_readable",
        materializedArtifactDigestMatch: "match",
        materializedByteLengthMatch: "match",
        indexScriptReferenceClass: "valid_relative",
        fileNavigationLoadClass: "loaded",
        scriptLoadClass: "loaded",
        scriptExecutionClass: "executed",
        pageErrorClass: "bootstrap_rejected",
        contractGlobalPresence: "present",
        contractVersionMatch: "match",
        bootstrapResponseClass: "rejected",
        cleanupDisposition: "not_run",
      },
      terminalSubstage: "page_contract_ready",
      terminalReasonId: "page_bootstrap_asset_incoherent",
    });
    assert.equal(coherence.ok, true);
  });

  await test("invalid ordering: bootstrap before observation complete rejected", () => {
    const coherence = validateOwningBoundarySequenceCoherence({
      observedSequence: [
        "page_contract_observation_started",
        "page_bootstrap_started",
        "page_contract_observation_complete",
        "page_bootstrap_terminal",
        "chromium_session_cleanup",
      ],
      providerContext: null,
      workspaceAttribution: null,
    });
    assert.equal(coherence.ok, false);
    if (coherence.ok) throw new Error("expected incoherent");
    assert.equal(coherence.incoherenceClass, "non_monotonic_sequence");
  });

  await test("invalid ordering: frame request after rejected bootstrap rejected", () => {
    const coherence = validateOwningBoundarySequenceCoherence({
      observedSequence: [
        "page_bootstrap_started",
        "page_bootstrap_terminal",
        "frame_request_started",
        "chromium_session_cleanup",
      ],
      providerContext: null,
      workspaceAttribution: {
        shippedArtifactResolutionClass: "not_applicable",
        sourcePageArtifactPresent: "not_applicable",
        sourceArtifactDigestMatch: "not_applicable",
        materializedArtifactPresent: "not_applicable",
        materializedArtifactDigestMatch: "not_applicable",
        materializedByteLengthMatch: "not_applicable",
        indexScriptReferenceClass: "not_applicable",
        fileNavigationLoadClass: "not_applicable",
        scriptLoadClass: "not_applicable",
        scriptExecutionClass: "not_applicable",
        pageErrorClass: "bootstrap_rejected",
        contractGlobalPresence: "not_applicable",
        contractVersionMatch: "not_applicable",
        bootstrapResponseClass: "rejected",
        cleanupDisposition: "not_run",
      },
    });
    assert.equal(coherence.ok, false);
    if (coherence.ok) throw new Error("expected incoherent");
    assert.equal(coherence.incoherenceClass, "bootstrap_rejected_with_frame_request");
  });

  await test("incoherent bundle record fails validateHeadlessAssetBundle", async () => {
    const { materialized } = await buildProviderChainFixture();
    const bundle = materialized.value.canonicalRequest.assetBundle;
    const tampered = {
      ...bundle,
      fingerprint: "hab:sha256:" + "00".repeat(32),
    };
    const validated = validateHeadlessAssetBundle(
      tampered,
      materialized.value.canonicalRequest.manifest,
    );
    assert.equal(validated.ok, false);
  });

  await test("rebind preserves bundle fingerprint when only locators drift", async () => {
    const { materialized, draftCtx } = await buildProviderChainFixture();
    const driftedAssets = materialized.value.canonicalRequest.assetBundle.assets.map(
      (row, index) =>
        index === 0
          ? {
              ...row,
              storageLocator: {
                kind: "object_storage" as const,
                storeId: "assets" as const,
                objectKey: `client/upload/drift/${index}`,
              },
            }
          : row,
    );
    const rebound = finalizeHeadlessAssetBundle({
      bundleId: materialized.value.canonicalRequest.assetBundle.bundleId,
      manifest: materialized.value.canonicalRequest.manifest,
      assets: driftedAssets,
    });
    assert.equal(rebound.ok, true);
    if (!rebound.ok) throw new Error("rebind failed");
    assert.equal(
      rebound.bundle.fingerprint,
      draftCtx.draft.snapshotClaim.assetBundleFingerprintClaim,
    );
  });

  const chrome = resolveSystemChromeExecutable();
  if (chrome.ok) {
    await test("720p/2s reference fixture: provider-shaped Chrome bootstrap PASS", async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 2000,
        rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
      });
      const result = await runHeadlessPageContractHarness({
        fixture,
        contentDurationMs: 2000,
      });
      assert.equal(result.ok, true, result.ok ? "" : `${result.executionSubstage}/${result.pageFailureReason}`);
      if (result.ok) {
        assert.ok(result.frameCount > 0);
      }
    });
  } else {
    console.log("  ○ Chrome live bootstrap PASS skipped (no system Chrome)");
  }

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
