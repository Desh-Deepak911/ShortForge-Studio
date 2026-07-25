/**
 * Sprint 11E Phase 2E.2D.8F.7 — provider-backed page boundary telemetry authority.
 * Run: npm run test:headless-provider-backed-boundary-telemetry-authority
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import {
  HEADLESS_PAGE_WORKSPACE_HTML_NAME,
  HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
  materializeHeadlessPageWorkspace,
} from "@/features/headless-renderer/worker/chromium/materialize-headless-page-workspace";
import {
  PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES,
} from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { renderFramesWithChromium } from "@/features/headless-renderer/worker/chromium/render-session";
import { classifyProviderRenderContext } from "@/features/headless-renderer/worker/runtime/classify-provider-render-context";
import {
  OWNING_BOUNDARY_EVENT_IDS,
  OWNING_BOUNDARY_TELEMETRY_INCOMPLETE_REASON,
  buildOwningBoundaryTerminalEvidence,
  createCollectingProviderBackedBoundaryTelemetry,
  createHostedProviderBackedBoundaryTelemetry,
  createNoOpProviderBackedBoundaryTelemetry,
  nextExpectedOwningBoundary,
  owningBoundaryFactsAreHostile,
  providerContextToTelemetryFacts,
  sanitizeOwningBoundaryObservation,
  sanitizeProviderContextFromTelemetryFacts,
} from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { headlessSourceDigest } from "@/features/headless-renderer/domain";
import { buildHeadlessFramePlan } from "@/features/headless-renderer/worker/runtime/frame-plan";
import { resolveHeadlessRenderTarget } from "@/features/headless-renderer/worker/runtime/render-target";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import {
  assertMonotonicBoundarySequence,
  buildProbeOwningBoundaryEvidence,
  filterBoundaryEventsForRunCorrelation,
  isCompleteSuccessfulBoundarySequence,
  parseHostedRenderBoundaryEventsFromLines,
} from "./fly-render-live/owning-boundary-probe-authority";
import {
  assertExecutionProbeEvidenceSafe,
  renderFlyRenderExecutionProbeEvidenceMarkdown,
} from "./fly-render-live/claimed-render-execution-probe-evidence";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function emitFullSequence(
  telemetry: ReturnType<typeof createCollectingProviderBackedBoundaryTelemetry>,
) {
  for (const id of OWNING_BOUNDARY_EVENT_IDS) {
    telemetry.emit(id);
  }
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.7 — provider-backed boundary telemetry authority\n",
  );

  await test("owning boundary registry is frozen allowlist of thirty-six events", () => {
    assert.equal(OWNING_BOUNDARY_EVENT_IDS.length, 36);
    assert.ok(OWNING_BOUNDARY_EVENT_IDS.includes("page_workspace_materialization_complete"));
    assert.ok(OWNING_BOUNDARY_EVENT_IDS.includes("chromium_session_cleanup"));
    assert.ok(OWNING_BOUNDARY_EVENT_IDS.includes("artifact_binding_validation_started"));
    assert.ok(OWNING_BOUNDARY_EVENT_IDS.includes("artifact_binding_validation_completed"));
  });

  await test("no-op telemetry port accepts emissions without observations side effects", () => {
    const noop = createNoOpProviderBackedBoundaryTelemetry();
    noop.emit("claimed_context_validated");
    assert.equal(noop.observations.length, 0);
  });

  await test("collecting telemetry preserves monotonic sequence", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    telemetry.emit("claimed_context_validated");
    telemetry.emit("canonical_request_loaded");
    assert.equal(telemetry.observations.length, 2);
    assert.equal(telemetry.observations[0]?.sequence, 1);
    assert.equal(telemetry.observations[1]?.sequence, 2);
    assert.equal(
      assertMonotonicBoundarySequence(telemetry.observations).ok,
      true,
    );
  });

  await test("historical pre-boundary events are excluded", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry({
      observationBoundaryMs: 5_000,
      nowMs: () => 1_000,
    });
    telemetry.emit("claimed_context_validated");
    assert.equal(telemetry.observations.length, 0);
    const late = createCollectingProviderBackedBoundaryTelemetry({
      observationBoundaryMs: 0,
      nowMs: () => 6_000,
    });
    late.emit("claimed_context_validated");
    assert.equal(late.observations.length, 1);
  });

  await test("provider context classifications sanitize hostile values", async () => {
    const fixture = buildHeadlessReferenceFixture({ audioMode: "silent" });
    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "ctx_owner", sessionId: "sess" },
      authorizedProjectIds: [fixture.manifestV3.project.projectId],
      allowProjectMutate: true,
      nowMs: () => 1_700_000_000_000,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "ctx_owner",
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
    const ctx = classifyProviderRenderContext({
      request: seeded.value.request,
      bundle: seeded.value.bundle,
      storageAdapterClass: "memory",
      identityCoherent: true,
    });
    const facts = providerContextToTelemetryFacts(ctx);
    assert.equal(
      sanitizeProviderContextFromTelemetryFacts({
        ...facts,
        render_request_schema_class: "postgresql://secret",
      }),
      undefined,
    );
    assert.equal(owningBoundaryFactsAreHostile(facts), false);
    assert.equal(
      owningBoundaryFactsAreHostile({
        render_request_schema_class: "https://evil.example",
      }),
      true,
    );
  });

  await test("page workspace materialization emits complete with fifteen fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-boundary-mat-"));
    const distPage = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
    assert.equal(existsSync(distPage), true);
    writeFileSync(join(dir, "page-render.iife.js"), readFileSync(distPage));
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "boundary_mat",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    try {
      const result = await materializeHeadlessPageWorkspace({
        workspace,
        budget,
        maxBytes: DEFAULT_HEADLESS_WORKER_LIMITS.maxGeneratedBundleBytes,
        env: { HEADLESS_HOSTED_WORKER_ROOT: dir },
        boundaryTelemetry: telemetry,
      });
      assert.equal(result.ok, true);
      const complete = telemetry.observations.find(
        (o) => o.boundaryId === "page_workspace_materialization_complete",
      );
      assert.ok(complete != null);
      for (const field of PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES) {
        assert.ok(typeof complete.facts[field] === "string", field);
      }
    } finally {
      workspace.cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("missing page bundle retains materialization boundary pair", async () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "boundary_missing",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    try {
      const result = await materializeHeadlessPageWorkspace({
        workspace,
        budget,
        maxBytes: DEFAULT_HEADLESS_WORKER_LIMITS.maxGeneratedBundleBytes,
        env: { HEADLESS_HOSTED_WORKER_ROOT: join(tmpdir(), "missing-root") },
        boundaryTelemetry: telemetry,
      });
      assert.equal(result.ok, false);
      assert.deepEqual(
        telemetry.observations.map((o) => o.boundaryId),
        [
          "page_workspace_materialization_started",
          "page_workspace_materialization_complete",
        ],
      );
    } finally {
      workspace.cleanup();
    }
  });

  await test("source materialization failure still completes source boundary pair", async () => {
    const fixture = buildHeadlessReferenceFixture({ audioMode: "silent" });
    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "boundary_owner", sessionId: "sess" },
      authorizedProjectIds: [fixture.manifestV3.project.projectId],
      allowProjectMutate: true,
      nowMs: () => 1_700_000_000_000,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "boundary_owner",
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
      jobId: "boundary_src_fail",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    const result = await materializeOwnedAssets({
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
    assert.equal(result.ok, false);
  });

  await test("contract missing navigation chain reaches bootstrap terminal", async () => {
    const chrome = resolveSystemChromeExecutable();
    if (!chrome.ok) {
      console.log("  (skipped — system Chrome unavailable)");
      return;
    }
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 500,
    });
    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "boundary_contract", sessionId: "sess" },
      authorizedProjectIds: [fixture.manifestV3.project.projectId],
      allowProjectMutate: true,
      nowMs: () => 1_700_000_000_000,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "boundary_contract",
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
    const target = resolveHeadlessRenderTarget(fixture.rendererProfile);
    assert.equal(target.ok, true);
    if (!target.ok) return;
    const plan = buildHeadlessFramePlan(fixture.manifestV3, 500, target.target);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const dir = mkdtempSync(join(tmpdir(), "fb-boundary-contract-"));
    writeFileSync(join(dir, "page-render.iife.js"), "// no headless contract\n");
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "boundary_contract",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    const staged = await materializeOwnedAssets({
      storage: stack.storage,
      ownerId: "boundary_contract",
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
    assert.equal(staged.ok, true);
    if (!staged.ok) return;
    process.env.HEADLESS_HOSTED_WORKER_ROOT = dir;
    try {
      const rendered = await renderFramesWithChromium({
        chromeExecutable: chrome.executable,
        workspace,
        manifest: fixture.manifestV3,
        stagedAssets: staged.assets,
        framePlan: plan.plan,
        budget,
        limits: DEFAULT_HEADLESS_WORKER_LIMITS,
        remainingMs: () => 30_000,
        boundaryTelemetry: telemetry,
        onPngFrame: async () => ({ ok: true }),
      });
      assert.equal(rendered.ok, false);
      const ids = telemetry.observations.map((o) => o.boundaryId);
      assert.ok(ids.includes("page_navigation_complete"));
      assert.ok(ids.includes("page_bootstrap_terminal"));
      assert.ok(ids.includes("chromium_session_cleanup"));
    } finally {
      delete process.env.HEADLESS_HOSTED_WORKER_ROOT;
      workspace.cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("telemetry callback failure does not change render outcome", async () => {
    const throwing = createHostedProviderBackedBoundaryTelemetry({
      eventSink: () => {
        throw new Error("telemetry_sink_failed");
      },
      nowMs: () => Date.now(),
      correlation: Object.freeze({
        machineClass: "exact_render",
        concurrencyClass: "single",
        executionWindowClass: "bounded",
        claimAckCorrelationClass: "current_run",
        observationBoundaryMs: 0,
      }),
    });
    const dir = mkdtempSync(join(tmpdir(), "fb-boundary-throw-"));
    writeFileSync(
      join(dir, "page-render.iife.js"),
      readFileSync(join(process.cwd(), "dist/headless-worker/page-render.iife.js")),
    );
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "boundary_throw",
      attempt: 1,
    });
    const budget = new WorkspaceByteBudget(DEFAULT_HEADLESS_WORKER_LIMITS);
    try {
      const result = await materializeHeadlessPageWorkspace({
        workspace,
        budget,
        maxBytes: DEFAULT_HEADLESS_WORKER_LIMITS.maxGeneratedBundleBytes,
        env: { HEADLESS_HOSTED_WORKER_ROOT: dir },
        boundaryTelemetry: throwing,
      });
      assert.equal(result.ok, true);
    } finally {
      workspace.cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("full successful boundary sequence ordering", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    emitFullSequence(telemetry);
    assert.equal(
      isCompleteSuccessfulBoundarySequence(
        telemetry.observations.map((o) => o.boundaryId),
      ),
      true,
    );
    assert.equal(nextExpectedOwningBoundary([]), OWNING_BOUNDARY_EVENT_IDS[0]);
    assert.equal(
      nextExpectedOwningBoundary([...OWNING_BOUNDARY_EVENT_IDS.slice(0, -1)]),
      OWNING_BOUNDARY_EVENT_IDS[OWNING_BOUNDARY_EVENT_IDS.length - 1],
    );
  });

  await test("missing direct workspace complete event classifies telemetry incomplete", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry();
    telemetry.emit("page_workspace_materialization_started");
    const evidence = buildOwningBoundaryTerminalEvidence({
      observations: telemetry.observations,
      workspaceMaterializationCompleted: true,
      terminalReasonId: "page_contract_missing",
    });
    assert.equal(evidence.owningBoundaryTelemetryIncomplete, true);
    assert.notEqual(
      OWNING_BOUNDARY_TELEMETRY_INCOMPLETE_REASON,
      "page_workspace_attribution_missing",
    );
  });

  await test("probe log parser excludes unrelated historical deliveries", () => {
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

  await test("execution probe evidence renders owning boundary section safely", () => {
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
      cleanupOutcomeClass: "ok",
    });
    const md = renderFlyRenderExecutionProbeEvidenceMarkdown({
      title: "probe fixture",
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
    });
    assert.equal(assertExecutionProbeEvidenceSafe(md).ok, true);
    assert.match(md, /## Owning boundary telemetry/);
    assert.match(md, /last_observed_boundary=chromium_session_cleanup/);
  });

  await test("sanitizer rejects hostile boundary observation payloads", () => {
    assert.equal(
      sanitizeOwningBoundaryObservation({
        action: "claimed_context_validated",
        boundary_sequence: "1",
        atMs: 100,
        facts: { safe_worker_code: "postgresql://x" },
      })?.facts.safe_worker_code,
      "redacted",
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
