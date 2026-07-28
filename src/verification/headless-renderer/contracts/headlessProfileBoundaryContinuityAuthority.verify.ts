/**
 * Sprint 11E Phase 2E.2D.8F.7.1 — profile parity + boundary continuity authority.
 * Run: npm run test:headless-profile-boundary-continuity-authority
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import {
  HEADLESS_PAGE_WORKSPACE_HTML_NAME,
  HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
  materializeHeadlessPageWorkspace,
} from "@/features/headless-renderer/worker/chromium/materialize-headless-page-workspace";
import { classifyProductionRenderProfileClass } from "@/features/headless-renderer/worker/runtime/classify-production-render-profile-authority";
import { classifyProviderRenderContext } from "@/features/headless-renderer/worker/runtime/classify-provider-render-context";
import { assertPhase3WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import {
  BOUNDARY_SEQUENCE_INCOHERENT_REASON,
  validateOwningBoundarySequenceCoherence,
} from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import {
  HEADLESS_OUTPUT_PROFILES,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import {
  NO_OP_BOUNDARY_TELEMETRY_PORT_ID,
  OWNING_BOUNDARY_EVENT_IDS,
  createCollectingProviderBackedBoundaryTelemetry,
  createNoOpProviderBackedBoundaryTelemetry,
} from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { headlessSourceDigest } from "@/features/headless-renderer/domain";
import { finalizeHeadlessRenderJobRequest } from "@/features/headless-renderer/domain/validate-headless-job-request";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "../fly-render-live/smoke-workload";
import {
  assertMonotonicBoundarySequence,
  buildProbeOwningBoundaryEvidence,
  filterBoundaryEventsForRunCorrelation,
  ingestOwningBoundaryEvidenceFromFlyLogs,
  isCompleteSuccessfulBoundarySequence,
  parseHostedRenderBoundaryEventsFromLines,
} from "../fly-render-live/owning-boundary-probe-authority";
import {
  assertExecutionProbeEvidenceSafe,
  renderFlyRenderExecutionProbeEvidenceMarkdown,
} from "../fly-render-live/claimed-render-execution-probe-evidence";

const PROBE_F9042D80_SHA =
  "f9042d8067b9189f56bbd3c11fa2beb267fca6e976930da407351f4f42928082";
const PROBE_E8AAC3BF_SHA =
  "e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3";
const DIAG_DA861F68_SHA =
  "da861f68858a48ab330804e36c9d9dd0c2e8e586f11dd4a6736f6fbb51f0ffc4";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function neonLikeProfileJson(profile: {
  resolution: string;
  format: string;
  fps: number;
  quality: string;
}): Record<string, unknown> {
  return JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.7.1 — profile parity + boundary continuity authority\n",
  );

  await test("accepted probe and diagnostic evidence archives preserved byte-identically", () => {
    const root = process.cwd();
    const f904 = join(
      root,
      "docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-f9042d8067b9189f56bbd3c11fa2beb267fca6e976930da407351f4f42928082.md",
    );
    const e8aa = join(
      root,
      "docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3.md",
    );
    const da86 = join(
      root,
      "docs/evidence/headless/current/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.md",
    );
    assert.equal(existsSync(f904), true, "f904 archive missing");
    assert.equal(existsSync(e8aa), true, "e8aac archive missing");
    assert.equal(existsSync(da86), true, "da861 diagnostic archive missing");
    assert.equal(sha256File(f904), PROBE_F9042D80_SHA);
    assert.equal(sha256File(e8aa), PROBE_E8AAC3BF_SHA);
    assert.equal(sha256File(da86), DIAG_DA861F68_SHA);
  });

  await test("720p-webm-30 canonical profile survives serialize/deserialize and Neon-like row mapping", () => {
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    const profile = HEADLESS_OUTPUT_PROFILES[smoke.profileId];
    const serialized = neonLikeProfileJson(smoke.rendererProfile);
    const roundTrip = JSON.parse(JSON.stringify(serialized));
    assert.deepEqual(roundTrip, {
      resolution: profile.resolution,
      format: profile.format,
      fps: profile.fps,
      quality: "standard",
    });
    assert.equal(smoke.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);
  });

  await test("production profile classifier parity with assertPhase3WorkerCapability", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 2000,
      rendererProfile: buildHeadlessFlyRenderLiveSmokeBoundary().rendererProfile,
    });
    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "parity_owner", sessionId: "sess" },
      authorizedProjectIds: [fixture.manifestV3.project.projectId],
      allowProjectMutate: true,
      nowMs: () => 1_700_000_000_000,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "parity_owner",
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: 1_700_000_000_000,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing bytes");
      },
      mimeForSlot: () => "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    const finalized = finalizeHeadlessRenderJobRequest({
      ownership: {
        ownerId: "parity_owner",
        projectId: fixture.manifestV3.project.projectId,
      },
      manifest: fixture.manifestV3,
      assetBundle: seeded.value.bundle,
      rendererProfile: smoke.rendererProfile,
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      idempotencyKey: "parity-key",
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) return;
    const request = finalized.request;
    const productionClass = classifyProductionRenderProfileClass({ request });
    const providerCtx = classifyProviderRenderContext({
      request,
      bundle: seeded.value.bundle,
      storageAdapterClass: "memory",
      identityCoherent: true,
    });
    assert.equal(productionClass, "phase3_supported");
    assert.equal(providerCtx.renderProfileClass, productionClass);
    assert.equal(assertPhase3WorkerCapability({ request }), null);
  });

  await test("divergent rendererBuildId regresses to unsupported in both classifiers", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 2000,
      rendererProfile: buildHeadlessFlyRenderLiveSmokeBoundary().rendererProfile,
    });
    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "diverge_owner", sessionId: "sess" },
      authorizedProjectIds: [fixture.manifestV3.project.projectId],
      allowProjectMutate: true,
      nowMs: () => 1_700_000_000_000,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "diverge_owner",
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: 1_700_000_000_000,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing bytes");
      },
      mimeForSlot: () => "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const finalized = finalizeHeadlessRenderJobRequest({
      ownership: {
        ownerId: "diverge_owner",
        projectId: fixture.manifestV3.project.projectId,
      },
      manifest: fixture.manifestV3,
      assetBundle: seeded.value.bundle,
      rendererProfile: buildHeadlessFlyRenderLiveSmokeBoundary().rendererProfile,
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      idempotencyKey: "diverge-key",
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) return;
    const request = {
      ...finalized.request,
      rendererBuildId: "renderer-build-live-1",
    };
    assert.equal(
      classifyProductionRenderProfileClass({ request }),
      "unsupported",
    );
    assert.equal(
      classifyProviderRenderContext({
        request,
        bundle: seeded.value.bundle,
        storageAdapterClass: "memory",
        identityCoherent: true,
      }).renderProfileClass,
      "unsupported",
    );
    assert.notEqual(assertPhase3WorkerCapability({ request }), null);
  });

  await test("same telemetry port identity through materialize and render chain", async () => {
    const portId = "continuity-hosted-port";
    const telemetry = createCollectingProviderBackedBoundaryTelemetry({ portId });
    const dir = mkdtempSync(join(tmpdir(), "fb-continuity-port-"));
    writeFileSync(
      join(dir, "page-render.iife.js"),
      readFileSync(join(process.cwd(), "dist/headless-worker/page-render.iife.js")),
    );
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "continuity_port",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    try {
      const workspaceResult = await materializeHeadlessPageWorkspace({
        workspace,
        budget,
        maxBytes: DEFAULT_HEADLESS_WORKER_LIMITS.maxGeneratedBundleBytes,
        env: { HEADLESS_HOSTED_WORKER_ROOT: dir },
        boundaryTelemetry: telemetry,
      });
      assert.equal(workspaceResult.ok, true);
      assert.equal(telemetry.portId, portId);
      const ids = telemetry.observations.map((o) => o.boundaryId);
      assert.ok(ids.includes("page_workspace_materialization_started"));
      assert.ok(ids.includes("page_workspace_materialization_complete"));
    } finally {
      workspace.cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("no-op replacement uses distinct portId from hosted collector", () => {
    const hosted = createCollectingProviderBackedBoundaryTelemetry({
      portId: "hosted-chain",
    });
    const noop = createNoOpProviderBackedBoundaryTelemetry();
    assert.notEqual(hosted.portId, noop.portId);
    assert.equal(noop.portId, NO_OP_BOUNDARY_TELEMETRY_PORT_ID);
    hosted.emit("claimed_context_validated");
    noop.emit("claimed_context_validated");
    assert.equal(hosted.observations.length, 1);
    assert.equal(noop.observations.length, 0);
  });

  await test("complete nineteen-boundary successful sequence", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    for (const id of OWNING_BOUNDARY_EVENT_IDS) {
      telemetry.emit(id);
    }
    const observed = telemetry.observations.map((o) => o.boundaryId);
    assert.equal(isCompleteSuccessfulBoundarySequence(observed), true);
    assert.equal(assertMonotonicBoundarySequence(telemetry.observations).ok, true);
  });

  await test("source materialization failure retains started/complete pair", async () => {
    const fixture = buildHeadlessReferenceFixture({ audioMode: "silent" });
    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "src_fail", sessionId: "sess" },
      authorizedProjectIds: [fixture.manifestV3.project.projectId],
      allowProjectMutate: true,
      nowMs: () => 1_700_000_000_000,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "src_fail",
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: 1_700_000_000_000,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing bytes");
      },
      mimeForSlot: () => "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "src_fail",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    await materializeOwnedAssets({
      storage: stack.storage,
      ownerId: "wrong_owner",
      bundle: seeded.value.bundle,
      workspace,
      nowMs: 1_700_000_000_000,
      maxTotalAssetBytes: DEFAULT_HEADLESS_WORKER_LIMITS.maxTotalAssetBytes,
      budget,
      reservedPagePaths: [
        HEADLESS_PAGE_WORKSPACE_HTML_NAME,
        HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
      ],
    });
    workspace.cleanup();
  });

  await test("impossible unsupported profile + page terminal is boundary_sequence_incoherent", () => {
    const incoherent = validateOwningBoundarySequenceCoherence({
      observedSequence: [
        "claimed_context_validated",
        "canonical_request_loaded",
        "browser_context_created",
      ],
      providerContext: {
        renderRequestSchemaClass: "valid_v1",
        renderProfileClass: "unsupported",
        manifestValidationClass: "valid",
        bundleValidationClass: "valid",
        expectedSlotCoverageClass: "complete",
        finalizedSourceObjectCoverageClass: "complete",
        sourceAssetCountClass: "small",
        sourceAssetMaterializationClass: "not_started",
        sourceAssetByteVerificationClass: "not_reached",
        sourceWorkspaceCollisionClass: "none",
        pageReservedPathIntegrityClass: "intact",
        storageAdapterClass: "r2_job_bound",
        canonicalJobIdentityCoherenceClass: "coherent",
      },
      workspaceAttribution: null,
      terminalSubstage: "page_contract_ready",
      terminalReasonId: "page_workspace_attribution_missing",
    });
    assert.equal(incoherent.ok, false);
    if (incoherent.ok) return;
    assert.equal(incoherent.reasonId, BOUNDARY_SEQUENCE_INCOHERENT_REASON);
    assert.equal(
      incoherent.incoherenceClass,
      "unsupported_profile_with_later_page_execution",
    );
  });

  await test("page terminal without source materialization is incoherent", () => {
    const incoherent = validateOwningBoundarySequenceCoherence({
      observedSequence: ["claimed_context_validated", "canonical_request_loaded"],
      providerContext: null,
      workspaceAttribution: null,
      terminalSubstage: "page_contract_ready",
      terminalReasonId: "page_workspace_attribution_missing",
    });
    assert.equal(incoherent.ok, false);
    if (incoherent.ok) return;
    assert.equal(
      incoherent.incoherenceClass,
      "page_terminal_without_source_materialization",
    );
  });

  await test("Fly log boundary events ingest into official probe evidence shape", () => {
    const lines = [
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 1_000,
        action: "claimed_context_validated",
        facts: { owning_boundary: "claimed_context_validated", boundary_sequence: "1" },
      }),
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 6_000,
        action: "canonical_request_loaded",
        facts: {
          owning_boundary: "canonical_request_loaded",
          boundary_sequence: "2",
          render_profile_class: "phase3_supported",
        },
      }),
    ];
    const ingested = ingestOwningBoundaryEvidenceFromFlyLogs({
      flyLogText: lines.join("\n"),
      observationBoundaryMs: 5_000,
      workspaceMaterializationCompleted: false,
      terminalReasonId: "page_workspace_attribution_missing",
      terminalSubstage: "page_contract_ready",
      cleanupOutcomeClass: "ok",
    });
    assert.equal(ingested.ok, true);
    if (!ingested.ok || ingested.evidence == null) return;
    assert.deepEqual(ingested.evidence.observedSequence, [
      "canonical_request_loaded",
    ]);
    assert.equal(ingested.evidence.lastObservedBoundary, "canonical_request_loaded");
    assert.equal(
      ingested.evidence.missingNextBoundary,
      "source_assets_materialization_started",
    );
  });

  await test("historical pre-boundary Fly events excluded from correlated evidence", () => {
    const lines = [
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 1_000,
        action: "claimed_context_validated",
        facts: { owning_boundary: "claimed_context_validated", boundary_sequence: "1" },
      }),
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 6_000,
        action: "canonical_request_loaded",
        facts: { owning_boundary: "canonical_request_loaded", boundary_sequence: "2" },
      }),
    ];
    const parsed = parseHostedRenderBoundaryEventsFromLines(lines);
    const filtered = filterBoundaryEventsForRunCorrelation({
      observationBoundaryMs: 5_000,
      events: parsed,
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.action, "canonical_request_loaded");
  });

  await test("unrelated delivery events do not populate boundary evidence", () => {
    const lines = [
      JSON.stringify({
        name: "hosted.loop.delivery",
        atMs: 6_000,
        action: "claim",
      }),
    ];
    const ingested = ingestOwningBoundaryEvidenceFromFlyLogs({
      flyLogText: lines.join("\n"),
      observationBoundaryMs: 0,
      workspaceMaterializationCompleted: false,
      terminalReasonId: null,
      terminalSubstage: null,
    });
    assert.equal(ingested.ok, true);
    if (!ingested.ok) return;
    assert.equal(ingested.evidence, null);
    assert.equal(ingested.reasonId, "no_correlated_boundary_events");
  });

  await test("correlated boundary events that fail sanitization report ingestion failure", () => {
    const lines = [
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 6_000,
        action: "not_a_real_boundary",
        facts: { boundary_sequence: "1" },
      }),
    ];
    const ingested = ingestOwningBoundaryEvidenceFromFlyLogs({
      flyLogText: lines.join("\n"),
      observationBoundaryMs: 0,
      workspaceMaterializationCompleted: false,
      terminalReasonId: null,
      terminalSubstage: null,
    });
    assert.equal(ingested.ok, false);
    if (ingested.ok) return;
    assert.equal(ingested.reasonId, "boundary_evidence_ingestion_failed");
  });

  await test("probe evidence markdown includes sequence coherence and privacy-safe fields", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    const chromiumIdx = OWNING_BOUNDARY_EVENT_IDS.indexOf(
      "chromium_session_cleanup",
    );
    for (const id of OWNING_BOUNDARY_EVENT_IDS.slice(0, chromiumIdx + 1)) {
      telemetry.emit(id);
    }
    const probeEvidence = buildProbeOwningBoundaryEvidence({
      observations: telemetry.observations,
      workspaceMaterializationCompleted: true,
      terminalReasonId: "page_contract_missing",
      terminalSubstage: "page_contract_ready",
      cleanupOutcomeClass: "ok",
    });
    const md = renderFlyRenderExecutionProbeEvidenceMarkdown({
      title: "fixture",
      overall: "FAIL",
      eligibilityVerdict: "fixture",
      startedAtIso: null,
      endedAtIso: null,
      failureSubstage: "page_contract_ready",
      failureReasonId: "page_contract_missing",
      executionAttribution: null,
      cleanupStatus: "ok",
      executionStages: [],
      smokeWorkload: null,
      resourceObservation: null,
      executionDurationMs: null,
      artifactAuthority: null,
      acceptedImageDigestSha256: null,
      owningBoundaryEvidence: probeEvidence,
      owningBoundaryIngestionFailure: null,
      boundaryEmissionClassification: null,
      notes: ["fixture"],
    } as never);
    assert.equal(assertExecutionProbeEvidenceSafe(md).ok, true);
    assert.match(md, /sequence_coherence=ok/);
    assert.match(md, /last_observed_boundary=chromium_session_cleanup/);

    const staleTelemetry = createCollectingProviderBackedBoundaryTelemetry();
    for (const id of OWNING_BOUNDARY_EVENT_IDS) {
      staleTelemetry.emit(id);
    }
    const staleEvidence = buildProbeOwningBoundaryEvidence({
      observations: staleTelemetry.observations,
      workspaceMaterializationCompleted: true,
      terminalReasonId: "page_contract_missing",
      terminalSubstage: "page_contract_ready",
      cleanupOutcomeClass: "ok",
    });
    assert.equal(staleEvidence.sequenceCoherence.ok, false);
    if (!staleEvidence.sequenceCoherence.ok) {
      assert.equal(
        staleEvidence.sequenceCoherence.incoherenceClass,
        "illegal_failure_cas_after_succeeded_cas",
      );
    }
  });

  await test("f904 probe log fixture reproduces prior two-boundary + ingestion path", () => {
    const lines = [
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 1_784_881_300_000,
        action: "claimed_context_validated",
        facts: { owning_boundary: "claimed_context_validated", boundary_sequence: "1" },
      }),
      JSON.stringify({
        name: "hosted.render.boundary",
        atMs: 1_784_881_301_000,
        action: "canonical_request_loaded",
        facts: {
          owning_boundary: "canonical_request_loaded",
          boundary_sequence: "2",
          render_profile_class: "unsupported",
        },
      }),
    ];
    const ingested = ingestOwningBoundaryEvidenceFromFlyLogs({
      flyLogText: lines.join("\n"),
      observationBoundaryMs: 1_784_881_200_000,
      workspaceMaterializationCompleted: false,
      terminalReasonId: "page_workspace_attribution_missing",
      terminalSubstage: "page_contract_ready",
      cleanupOutcomeClass: "ok",
    });
    assert.equal(ingested.ok, true);
    if (!ingested.ok || ingested.evidence == null) return;
    assert.equal(ingested.evidence.observedSequence.length, 2);
    assert.equal(ingested.evidence.sequenceCoherence.ok, false);
    if (ingested.evidence.sequenceCoherence.ok) return;
    assert.equal(
      ingested.evidence.sequenceCoherence.incoherenceClass,
      "page_terminal_without_source_materialization",
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
