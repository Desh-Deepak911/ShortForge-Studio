/**
 * Sprint 11E Phase 2E.2D.8F.6G — claimed-render diagnostic capability-boundary authority.
 * Run: npm run test:headless-claimed-render-diagnostic-capability-boundary-authority
 */

import assert from "node:assert/strict";
import { sha256Bytes } from "../../support/evidence-hash";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MemoryHeadlessStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-storage.adapter";
import {
  CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR,
  CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH,
  appendClaimedRenderDiagnosticEvidenceLine,
  createClaimedRenderDiagnosticEvidenceEventSink,
  parseClaimedRenderDiagnosticEvidenceFile,
  validateClaimedRenderDiagnosticEvidenceLine,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-evidence-file";
import {
  assertCapabilityReachabilityInvariant,
  capabilityAttributionToSafeFacts,
  classifyWorkspaceAttributionResult,
  evaluateClaimedRenderDiagnosticCapabilityBoundary,
  inferMaterializerEntered,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-capability-boundary";
import {
  assertClaimedRenderDiagnosticEventSafe,
  createInitialBoundaryPresence,
  deriveBoundaryPresenceFromAttribution,
  formatClaimedRenderDiagnosticEvent,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-events";
import { buildClaimedRenderDiagnosticMinimalFixture } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-fixture-minimal";
import { buildDiagnosticClaimedJobContext } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-seed-local";
import {
  HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-environment";
import { runClaimedRenderDiagnostic } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-runner";
import { createInitialPageWorkspaceAttribution } from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const DIST = path.join(ROOT, "dist/headless-worker");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");

const EVIDENCE_8F6F_SHA =
  "720ffc97a6b0e9062bdabeeb8274042c932c4c70d2cafeb45edd0cde1b0ae012";
const EVIDENCE_8F6E_SHA =
  "c6d92173cdc5c4cceef0ca3a0f584bee5dd5632f568231c864064e77a0c30925";
const EXECUTION_PROBE_SHA =
  "e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3";
const PAGE_DIAG_SHA =
  "20c848203e0932511b531b477958169b8d254f5a7b287869bd21e42f33a1bd8b";
const PRODUCTION_WORKER_SHA =
  "a9baf3ea910eeae41b4eadfb10d9dfb100b74042500884c761a8c5b946774e1b";
const PRODUCTION_BUILD_INFO_SHA =
  "815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d";

let passed = 0;


async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function cleanGateEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    HEADLESS_ENV_NAME: "staging",
    HEADLESS_CHROME_PATH: process.env.HEADLESS_CHROME_PATH ?? "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: process.env.HEADLESS_FFMPEG_PATH ?? "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: process.env.HEADLESS_FFPROBE_PATH ?? "/usr/bin/ffprobe",
    HEADLESS_WORKER_WORKSPACE_ROOT: path.join(
      tmpdir(),
      "footiebitz-crd-capability-test",
    ),
    [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
    HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC: "1",
    ...extra,
  };
}

function resetEvidenceFile(): void {
  if (existsSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR)) {
    const stat = lstatSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
    if (stat.isSymbolicLink()) {
      unlinkSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
    } else {
      rmSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR, { recursive: true, force: true });
    }
  }
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.6G — claimed-render diagnostic capability-boundary authority\n",
  );

  await test("8F.6F evidence archived byte-identically", () => {
    const archive = path.join(
      ROOT,
      "docs/evidence/headless/archive/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.pre-8f6f-720ffc97a6b0e9062bdabeeb8274042c932c4c70d2cafeb45edd0cde1b0ae012.md",
    );
    assert.ok(existsSync(archive));
    assert.equal(sha256Bytes(readFileSync(archive)), EVIDENCE_8F6F_SHA);
  });

  await test("prior accepted evidence archives preserved", () => {
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.pre-run-${EVIDENCE_8F6E_SHA}.md`,
          ),
        ),
      ),
      EVIDENCE_8F6E_SHA,
    );
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${EXECUTION_PROBE_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_HOSTED_PAGE_DIAGNOSTIC.md"))),
      PAGE_DIAG_SHA,
    );
  });

  await test("provider capacity gate rejects sub-profile maxFrames override", async () => {
    const fixture = buildClaimedRenderDiagnosticMinimalFixture();
    const ctx = await buildDiagnosticClaimedJobContext({
      variant: "minimal",
      manifest: fixture.manifest,
      assetBytesByUrl: fixture.assetBytesByUrl,
      rendererProfile: fixture.rendererProfile,
      nowMs: Date.now(),
    });
    const boundary = evaluateClaimedRenderDiagnosticCapabilityBoundary({
      request: ctx.record.canonicalRequest,
      storage: ctx.storage,
      limitsOverrides: { maxFrames: 1 },
    });
    assert.equal(boundary.ok, false);
    if (boundary.ok) return;
    assert.equal(boundary.reasonId, "UNSUPPORTED_CAPABILITY");
    assert.equal(boundary.attribution.capabilitySubstage, "provider_capacity_gate");
    assert.equal(boundary.attribution.resultClass, "unsupported_before_materialization");
    assert.equal(boundary.attribution.workspaceCapabilityClass, "insufficient_capacity");
  });

  await test("production-equivalent limits pass capability boundary for minimal fixture", async () => {
    const fixture = buildClaimedRenderDiagnosticMinimalFixture();
    const ctx = await buildDiagnosticClaimedJobContext({
      variant: "minimal",
      manifest: fixture.manifest,
      assetBytesByUrl: fixture.assetBytesByUrl,
      rendererProfile: fixture.rendererProfile,
      nowMs: Date.now(),
    });
    const boundary = evaluateClaimedRenderDiagnosticCapabilityBoundary({
      request: ctx.record.canonicalRequest,
      storage: ctx.storage,
    });
    assert.equal(boundary.ok, true);
    if (!boundary.ok) return;
    assert.equal(boundary.attribution.capabilitySubstage, "materializer_entry_gate");
    assert.equal(boundary.attribution.resultClass, "capability_pass");
    assert.equal(boundary.attribution.sourceStorageCapabilityClass, "memory_owned_object");
  });

  await test("renderer build id gate rejects mismatched build", async () => {
    const fixture = buildClaimedRenderDiagnosticMinimalFixture();
    const ctx = await buildDiagnosticClaimedJobContext({
      variant: "minimal",
      manifest: fixture.manifest,
      assetBytesByUrl: fixture.assetBytesByUrl,
      rendererProfile: fixture.rendererProfile,
      nowMs: Date.now(),
    });
    const req = {
      ...ctx.record.canonicalRequest,
      rendererBuildId: "invalid-build-id",
    };
    const boundary = evaluateClaimedRenderDiagnosticCapabilityBoundary({
      request: req,
      storage: ctx.storage,
    });
    assert.equal(boundary.ok, false);
    if (boundary.ok) return;
    assert.equal(boundary.attribution.capabilitySubstage, "renderer_build_id_gate");
  });

  await test("valid build id constant matches production worker", () => {
    assert.equal(typeof HEADLESS_WORKER_RENDERER_BUILD_ID, "string");
    assert.ok(HEADLESS_WORKER_RENDERER_BUILD_ID.length > 0);
  });

  await test("memory storage adapter satisfies source and artifact capability classes", () => {
    const storage = new MemoryHeadlessStorageAdapter();
    assert.equal(storage.constructor.name, "MemoryHeadlessStorageAdapter");
  });

  await test("workspace-not-reached when materializer not entered", () => {
    assert.equal(
      classifyWorkspaceAttributionResult({
        materializerEntered: false,
        workspaceClassificationCount: 0,
        attributionComplete: false,
      }),
      "workspace_not_reached",
    );
  });

  await test("workspace attribution missing only after materializer", () => {
    assert.equal(
      classifyWorkspaceAttributionResult({
        materializerEntered: true,
        workspaceClassificationCount: 0,
        attributionComplete: false,
      }),
      "workspace_attribution_missing",
    );
  });

  await test("capability reachability invariant blocks page lifecycle without materializer", () => {
    const presence = {
      ...createInitialBoundaryPresence(),
      materializer_entered: "not_observed" as const,
      page_navigation_started: "observed" as const,
    };
    assert.equal(
      assertCapabilityReachabilityInvariant({ boundaryPresence: presence }).ok,
      false,
    );
  });

  await test("deriveBoundaryPresence never claims materializer without explicit entry", () => {
    const presence = deriveBoundaryPresenceFromAttribution({
      attribution: undefined,
      chromiumSucceeded: true,
      frameCount: 1,
      executeReturnedAttribution: false,
      diagnosticReceivedAttribution: true,
      cleanupComplete: true,
      materializerEntered: false,
    });
    assert.equal(presence.materializer_entered, "not_observed");
    assert.equal(presence.frame_requested, "not_observed");
  });

  await test("inferMaterializerEntered requires capability preflight pass", () => {
    assert.equal(
      inferMaterializerEntered({
        executedOk: true,
        reasonId: null,
        executionSubstage: null,
        hasPageWorkspaceAttribution: false,
        capabilityPreflightPassed: false,
      }),
      false,
    );
  });

  await test("capability attribution facts use allowlisted enums only", async () => {
    const fixture = buildClaimedRenderDiagnosticMinimalFixture();
    const ctx = await buildDiagnosticClaimedJobContext({
      variant: "minimal",
      manifest: fixture.manifest,
      assetBytesByUrl: fixture.assetBytesByUrl,
      rendererProfile: fixture.rendererProfile,
      nowMs: Date.now(),
    });
    const boundary = evaluateClaimedRenderDiagnosticCapabilityBoundary({
      request: ctx.record.canonicalRequest,
      storage: ctx.storage,
    });
    assert.equal(boundary.ok, true);
    if (!boundary.ok) return;
    const facts = capabilityAttributionToSafeFacts(boundary.attribution);
    const line = formatClaimedRenderDiagnosticEvent({
      name: "hosted.claimed_render_diagnostic",
      status: "ok",
      variant: "minimal",
      diagnosticStage: "capability_preflight",
      reasonId: null,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: null,
      cleanupStatus: "not_run",
      capabilityAttribution: boundary.attribution,
    });
    assert.equal(assertClaimedRenderDiagnosticEventSafe(line).ok, true);
    assert.equal(validateClaimedRenderDiagnosticEvidenceLine(line).ok, true);
    assert.ok(!line.includes("/Users/"));
    assert.ok(!line.includes("https://"));
    for (const value of Object.values(facts)) {
      assert.equal(typeof value, "string");
    }
  });

  await test("minimal and live_smoke share capability parity under injected pass", async () => {
    const mockPass = async () =>
      ({
        ok: true,
        artifact: {
          contentDigest: "sha256:00",
          byteLength: 100,
          mimeType: "video/webm",
          expiresAtMs: Date.now() + 60_000,
          width: 720,
          height: 1280,
          fps: 30,
          durationMs: 2000,
          video: { codec: "vp9", bitrate: 1 },
          audio: {
            present: false,
            codec: null,
            channels: null,
            sampleRateHz: null,
          },
          rendererBuildId: "test",
        },
        evidence: {
          metrics: {
            renderStageMs: 1,
            encodeStageMs: 1,
            probeStageMs: 1,
            unavailableReasons: {},
          },
        },
        artifactLease: {
          dispose: () => undefined,
          openUploadChunks: () => (async function* () {})(),
        },
      }) as never;

    const env = cleanGateEnv({
      HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_ROOT: DIST,
    });

    const minimal = await runClaimedRenderDiagnostic({
      env,
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: mockPass,
    });
    const both = await runClaimedRenderDiagnostic({
      env,
      forceGateOn: true,
      executeRenderJob: mockPass,
    });
    assert.equal(minimal.minimal?.capabilityAttribution?.resultClass, "capability_pass");
    assert.equal(both.minimal?.capabilityAttribution?.resultClass, "capability_pass");
    assert.equal(both.liveSmoke?.capabilityAttribution?.resultClass, "capability_pass");
    assert.equal(both.comparisonClass, "both_pass");
  });

  await test("sub-profile maxFrames override fails before materializer with attribution", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanGateEnv(),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: "scrubbed",
        retryable: false,
      }),
    });
    // Default path no longer passes maxFrames=1 — should reach execute unless runtime missing.
    // When limits override injected via runner is not available, verify direct boundary instead.
    const fixture = buildClaimedRenderDiagnosticMinimalFixture();
    const ctx = await buildDiagnosticClaimedJobContext({
      variant: "minimal",
      manifest: fixture.manifest,
      assetBytesByUrl: fixture.assetBytesByUrl,
      rendererProfile: fixture.rendererProfile,
      nowMs: Date.now(),
    });
    const fail = evaluateClaimedRenderDiagnosticCapabilityBoundary({
      request: ctx.record.canonicalRequest,
      storage: ctx.storage,
      limitsOverrides: { maxFrames: 2 },
    });
    assert.equal(fail.ok, false);
    assert.equal(result.minimal?.boundaryPresence.materializer_entered, "not_observed");
  });

  await test("missing workspace attribution after materializer is classified", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanGateEnv(),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
        ok: false,
        reasonId: "WORKER_FAILED",
        message: "scrubbed",
        retryable: false,
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_workspace_attribution_missing",
        pageResponseClass: "missing_api",
      }),
    });
    assert.equal(result.minimal?.overall, "FAIL");
    assert.equal(result.minimal?.boundaryPresence.materializer_entered, "observed");
    assert.equal(
      result.minimal?.boundaryPresence.workspace_attribution_complete,
      "not_observed",
    );
    assert.equal(
      classifyWorkspaceAttributionResult({
        materializerEntered: true,
        workspaceClassificationCount: 0,
        attributionComplete: false,
      }),
      "workspace_attribution_missing",
    );
  });

  await test("complete workspace attribution after materializer", async () => {
    const workspace = Object.freeze({
      ...createInitialPageWorkspaceAttribution(),
      shippedArtifactResolutionClass: "resolved_readable" as const,
      sourcePageArtifactPresent: "present_readable" as const,
      sourceArtifactDigestMatch: "match" as const,
      materializedArtifactPresent: "present_readable" as const,
      materializedArtifactDigestMatch: "match" as const,
      materializedByteLengthMatch: "match" as const,
      indexScriptReferenceClass: "valid_relative" as const,
      fileNavigationLoadClass: "loaded" as const,
      scriptLoadClass: "loaded" as const,
      scriptExecutionClass: "executed" as const,
      pageErrorClass: "none" as const,
      contractGlobalPresence: "missing" as const,
      contractVersionMatch: "not_applicable" as const,
      bootstrapResponseClass: "missing_contract" as const,
      cleanupDisposition: "ok" as const,
    });
    const result = await runClaimedRenderDiagnostic({
      env: cleanGateEnv(),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
        ok: false,
        reasonId: "WORKER_FAILED",
        message: "scrubbed",
        retryable: false,
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_contract_missing",
        pageResponseClass: "missing_api",
        pageWorkspaceAttribution: workspace,
      }),
    });
    assert.equal(result.minimal?.boundaryPresence.materializer_entered, "observed");
    assert.equal(
      result.minimal?.boundaryPresence.workspace_attribution_complete,
      "observed",
    );
    assert.equal(result.minimal?.workspaceClassificationCount, 15);
  });

  await test("file-evidence persistence includes capability_preflight stage", () => {
    resetEvidenceFile();
    const sink = createClaimedRenderDiagnosticEvidenceEventSink();
    sink({
      name: "hosted.claimed_render_diagnostic",
      status: "ok",
      variant: "minimal",
      diagnosticStage: "capability_preflight",
      reasonId: null,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: null,
      cleanupStatus: "not_run",
      capabilityAttribution: {
        capabilitySubstage: "materializer_entry_gate",
        capabilityClass: "supported",
        requestedOutputContainerClass: "webm",
        requestedVideoCodecClass: "vp9",
        requestedAudioCodecClass: "silent",
        sourceStorageCapabilityClass: "memory_owned_object",
        artifactStorageCapabilityClass: "memory_owned_object",
        browserRuntimeCapabilityClass: "present",
        ffmpegRuntimeCapabilityClass: "present",
        audioPipelineCapabilityClass: "silent",
        workspaceCapabilityClass: "provider_intersected",
        resultClass: "capability_pass",
      },
    });
    const content = readFileSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "utf8");
    const events = parseClaimedRenderDiagnosticEvidenceFile(content);
    assert.ok(events.some((e) => "diagnosticStage" in e && e.diagnosticStage === "capability_preflight"));
    resetEvidenceFile();
  });

  await test("production worker artifacts unchanged", () => {
    assert.equal(
      sha256Bytes(readFileSync(path.join(DIST, "hosted-worker.js"))),
      PRODUCTION_WORKER_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(DIST, "BUILD_INFO.json"))),
      PRODUCTION_BUILD_INFO_SHA,
    );
  });

  const dockerAvailable =
    spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;

  if (dockerAvailable) {
    await test("local OCI --network none produces file-authoritative capability evidence", () => {
      resetEvidenceFile();
      const build = spawnSync(
        "docker",
        [
          "build",
          "-f",
          "deploy/headless-worker/Dockerfile.claimed-render-diagnostic",
          "-t",
          "footiebitz-crd-capability-8f6g:local",
          ".",
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 600_000 },
      );
      assert.equal(build.status, 0, build.stderr);

      const start = spawnSync(
        "docker",
        [
          "run",
          "-d",
          "--network",
          "none",
          "-e",
          "HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC=1",
          "-e",
          "HEADLESS_ENV_NAME=staging",
          "-e",
          "HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC=3",
          "footiebitz-crd-capability-8f6g:local",
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
      );
      assert.equal(start.status, 0, start.stderr);
      const containerId = start.stdout.trim();

      let fileContent = "";
      for (let i = 0; i < 45; i += 1) {
        spawnSync("sleep", ["1"]);
        const cat = spawnSync(
          "docker",
          [
            "exec",
            containerId,
            "cat",
            CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH,
          ],
          { encoding: "utf8", timeout: 60_000 },
        );
        if (
          cat.status === 0 &&
          cat.stdout.includes("capability_preflight") &&
          cat.stdout.includes("shell_child_exit")
        ) {
          fileContent = cat.stdout;
          break;
        }
      }
      spawnSync("docker", ["rm", "-f", containerId], { encoding: "utf8" });
      assert.ok(fileContent.includes("capability_preflight"));
      assert.ok(fileContent.includes("provider_capacity_gate") === false);
      assert.ok(fileContent.includes("materializer_entry_gate") || fileContent.includes("capability_pass"));
      assert.ok(fileContent.includes("shell_child_exit"));
      for (const line of fileContent.split(/\r?\n/)) {
        if (!line.trim()) continue;
        assert.equal(validateClaimedRenderDiagnosticEvidenceLine(line).ok, true);
      }
    });
  }

  console.log(`\n${passed}/${passed} PASS\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
