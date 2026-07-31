/**
 * Sprint 11E Phase 2E.2D.8F.6 — claimed-render diagnostic image authority.
 * Run: npm run test:headless-claimed-render-diagnostic-image-authority
 */

import assert from "node:assert/strict";
import { sha256Bytes } from "../../support/evidence-hash";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertClaimedRenderDiagnosticImageManifest,
  buildHeadlessClaimedRenderDiagnosticBuildManifest,
  HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-image-classification";
import {
  assertClaimedRenderDiagnosticEventSafe,
  createInitialBoundaryPresence,
  formatClaimedRenderDiagnosticEvent,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-events";
import {
  HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE,
  validateClaimedRenderDiagnosticEnvironment,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-environment";
import { buildClaimedRenderDiagnosticLiveSmokeFixture, readEmbeddedProbeFixtureFingerprint } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-fixture-live-smoke";
import { buildClaimedRenderDiagnosticMinimalFixture } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-fixture-minimal";
import { buildClaimedRenderDiagnosticSmokeBoundary } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-smoke-boundary";
import { runClaimedRenderDiagnostic } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-runner";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import {
  createInitialPageWorkspaceAttribution,
  pageWorkspaceAttributionToTelemetryFacts,
} from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const DIST = path.join(ROOT, "dist/headless-worker");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");

const PRODUCTION_WORKER_SHA =
  "a9baf3ea910eeae41b4eadfb10d9dfb100b74042500884c761a8c5b946774e1b";
const PRODUCTION_PAGE_SHA =
  "e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c";
const PRODUCTION_BUILD_INFO_SHA =
  "815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d";

const EXECUTION_PROBE_CURRENT_FAIL_SHA =
  "e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3";
const EXECUTION_PROBE_CURRENT_PASS_SHA =
  "1342cc902cd0051effb4a4f3b466d9d6b717401a4776a073678f16a1072eac7b";
const EXECUTION_PROBE_PRIOR_FAIL_SHA =
  "f0f4a92d987653cd236b12640d65bb2b870fc444c6d847b063a671dd2e8ff010";
const PAGE_DIAGNOSTIC_PASS_EVIDENCE_SHA =
  "20c848203e0932511b531b477958169b8d254f5a7b287869bd21e42f33a1bd8b";

const EVIDENCE_8F6A_SHA =
  "fecae38cc2f26fc3d839e6ec0914403187663fadc77299ea34577a086b3e2083";
const EVIDENCE_8F6B_SHA =
  "4b0ccdd4f78f34b5dfa9f0d0663a0c2800b1b7d4b4a4b20a8ac633ac38935d27";
const EVIDENCE_8F6C_SHA =
  "e6f1268c9e9ec974dfa507811aee37e26144b8305b9114efc810202599dbafce";


let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function cleanDiagnosticEnv(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    HEADLESS_ENV_NAME: "staging",
    HEADLESS_CHROME_PATH: process.env.HEADLESS_CHROME_PATH ?? "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: process.env.HEADLESS_FFMPEG_PATH ?? "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: process.env.HEADLESS_FFPROBE_PATH ?? "/usr/bin/ffprobe",
    HEADLESS_WORKER_WORKSPACE_ROOT:
      "/tmp/footiebitz-headless-claimed-render-diagnostic-test",
    HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_ROOT: DIST,
    HEADLESS_PAGE_BUNDLE_PATH: path.join(DIST, "page-render.iife.js"),
    ...extra,
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.6 — Claimed-render diagnostic image authority\n",
  );

  await test("prior evidence SHAs preserved byte-identically", () => {
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.pre-run-${EVIDENCE_8F6C_SHA}.md`,
          ),
        ),
      ),
      EVIDENCE_8F6C_SHA,
    );
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.pre-run-${EVIDENCE_8F6B_SHA}.md`,
          ),
        ),
      ),
      EVIDENCE_8F6B_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md"))),
      EXECUTION_PROBE_CURRENT_PASS_SHA,
    );
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-8f51-real-shape-${EXECUTION_PROBE_PRIOR_FAIL_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_PRIOR_FAIL_SHA,
    );
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${EXECUTION_PROBE_CURRENT_FAIL_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_CURRENT_FAIL_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_HOSTED_PAGE_DIAGNOSTIC.md"))),
      PAGE_DIAGNOSTIC_PASS_EVIDENCE_SHA,
    );
  });

  await test("image manifest classifies claimed_render_diagnostic non-deployable", () => {
    const manifest = buildHeadlessClaimedRenderDiagnosticBuildManifest();
    assert.equal(manifest.imageClass, HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS);
    assert.equal(manifest.deployable, false);
    assert.equal(manifest.canStartConsumerLoop, false);
    assert.equal(manifest.providerAccess, false);
    assert.equal(manifest.publicService, false);
    assert.doesNotThrow(() => assertClaimedRenderDiagnosticImageManifest(manifest));
  });

  await test("embedded live-smoke fixture matches buildHeadlessReferenceFixture", () => {
    const smoke = buildClaimedRenderDiagnosticSmokeBoundary();
    const reference = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: smoke.contentDurationMs,
      rendererProfile: smoke.rendererProfile,
    });
    const embedded = readEmbeddedProbeFixtureFingerprint(cleanDiagnosticEnv());
    assert.equal(embedded, reference.manifestV3.fingerprint);
    const liveSmoke = buildClaimedRenderDiagnosticLiveSmokeFixture(cleanDiagnosticEnv());
    assert.equal(liveSmoke.manifest.fingerprint, reference.manifestV3.fingerprint);
  });

  await test("gate off returns FAIL without provider contact", async () => {
    const events: string[] = [];
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv(),
      eventSink: (event) => {
        events.push(formatClaimedRenderDiagnosticEvent(event));
      },
    });
    assert.equal(result.overall, "FAIL");
    assert.equal(result.comparisonClass, "not_run");
    assert.equal(events.length, 1);
    assert.match(events[0]!, /gate_off/);
  });

  await test("forbidden secret present fails closed", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
        DATABASE_URL: "postgresql://blocked.example/db",
      }),
      forceGateOn: true,
    });
    assert.equal(result.overall, "FAIL");
    assert.equal(result.minimal, null);
  });

  await test("forbidden worker mode rejected", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
        HEADLESS_WORKER_MODE: "render",
      }),
      forceGateOn: true,
    });
    assert.equal(result.overall, "FAIL");
  });

  await test("provider-env and deployment gate refusal", () => {
    const r2 = validateClaimedRenderDiagnosticEnvironment({
      [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      R2_BUCKET_ASSETS: "blocked",
    });
    assert.equal(r2.ok, false);
    const deploy = validateClaimedRenderDiagnosticEnvironment({
      [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      HEADLESS_FLY_STAGING_AUTHORIZE_IMAGE_DEPLOY: "1",
    });
    assert.equal(deploy.ok, false);
    if (!deploy.ok) {
      assert.equal(deploy.reasonId, "forbidden_deployment_gate");
    }
  });

  await test("injected materializer not entered when execute fails without substage", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
        ok: false,
        reasonId: "WORKER_FAILED",
        message: "scrubbed",
        retryable: false,
      }),
    });
    assert.equal(result.minimal?.overall, "FAIL");
    assert.equal(
      result.minimal?.boundaryPresence.materializer_entered,
      "not_observed",
    );
  });

  await test("injected post-materializer substage marks materializer entered", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
        ok: false,
        reasonId: "WORKER_FAILED",
        message: "scrubbed",
        retryable: false,
        executionSubstage: "chromium_preflight",
      }),
    });
    assert.equal(result.minimal?.overall, "FAIL");
    assert.equal(
      result.minimal?.boundaryPresence.materializer_entered,
      "observed",
    );
  });

  await test("injected incomplete workspace attribution", async () => {
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      }),
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
    assert.equal(result.minimal?.pageFailureReason, "page_workspace_attribution_missing");
    assert.equal(
      result.minimal?.boundaryPresence.workspace_attribution_complete,
      "not_observed",
    );
  });

  await test("injected page contract missing with complete attribution", async () => {
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
    const facts = pageWorkspaceAttributionToTelemetryFacts(workspace);
    assert.equal(Object.keys(facts).length, 15);
    const result = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      }),
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
    assert.equal(result.minimal?.pageFailureReason, "page_contract_missing");
    assert.equal(
      result.minimal?.boundaryPresence.workspace_attribution_complete,
      "observed",
    );
    assert.equal(
      result.minimal?.boundaryPresence.contract_globals_observed,
      "observed",
    );
  });

  await test("injected bootstrap rejection and valid frame pass paths", async () => {
    const reject = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
        ok: false,
        reasonId: "WORKER_FAILED",
        message: "scrubbed",
        retryable: false,
        executionSubstage: "page_request_submit",
        pageFailureReason: "page_request_rejected",
        pageResponseClass: "rejected",
      }),
    });
    assert.equal(reject.minimal?.overall, "FAIL");

    const pass = await runClaimedRenderDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () => ({
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
      }) as never,
    });
    assert.equal(pass.minimal?.overall, "PASS");
    assert.equal(pass.minimal?.boundaryPresence.frame_requested, "observed");
    assert.equal(pass.minimal?.boundaryPresence.cleanup_complete, "observed");
  });

  await test("safe JSON-line output privacy sanitization", () => {
    const line = formatClaimedRenderDiagnosticEvent({
      name: "hosted.claimed_render_diagnostic",
      status: "failed",
      variant: "live_smoke",
      diagnosticStage: "execute_render_job",
      reasonId: "page_workspace_attribution_missing",
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: 100,
      cleanupStatus: "ok",
    });
    assert.equal(assertClaimedRenderDiagnosticEventSafe(line).ok, true);
    assert.ok(!line.includes("/Users/"));
    assert.ok(!line.includes("postgresql"));
    assert.ok(!line.includes("https://"));
  });

  await test("production worker artifacts remain byte-identical through diagnostic packaging", () => {
    assert.ok(existsSync(path.join(DIST, "hosted-worker.js")));
    assert.ok(existsSync(path.join(DIST, "page-render.iife.js")));
    assert.ok(existsSync(path.join(DIST, "BUILD_INFO.json")));
    assert.equal(
      sha256Bytes(readFileSync(path.join(DIST, "hosted-worker.js"))),
      PRODUCTION_WORKER_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(DIST, "page-render.iife.js"))),
      PRODUCTION_PAGE_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(DIST, "BUILD_INFO.json"))),
      PRODUCTION_BUILD_INFO_SHA,
    );
  });

  await test("diagnostic bundle includes production render path modules", () => {
    assert.ok(existsSync(path.join(DIST, "claimed-render-diagnostic.js")));
    assert.ok(
      existsSync(path.join(DIST, "claimed-render-probe-fixture.embed.json")),
    );
    const bundle = readFileSync(
      path.join(DIST, "claimed-render-diagnostic.js"),
      "utf8",
    );
    assert.match(bundle, /executeHeadlessRenderJob/);
    assert.match(bundle, /renderFramesWithChromium/);
    assert.match(bundle, /materializeHeadlessPageWorkspace/);
    assert.match(bundle, /buildPageDiagnosticManifestV3/);
    assert.match(bundle, /loadEmbeddedProbeFixture/);
    assert.doesNotMatch(bundle, /materializeHostedWorkerAdapters/);
    assert.doesNotMatch(bundle, /NeonHeadless/);
    assert.doesNotMatch(bundle, /UpstashRest/);
    assert.doesNotMatch(bundle, /R2StorageAdapter/);
  });

  await test("docker assets separate from production entrypoint", () => {
    const dockerfile = readFileSync(
      path.join(DEPLOY, "Dockerfile.claimed-render-diagnostic"),
      "utf8",
    );
    assert.match(dockerfile, /claimed-render-diagnostic\.js/);
    assert.match(dockerfile, /page-render\.iife\.js/);
    assert.match(dockerfile, /claimed_render_diagnostic/);
    assert.doesNotMatch(dockerfile, /hosted-worker\.js/);
    const entry = readFileSync(
      path.join(DEPLOY, "docker-claimed-render-diagnostic-entrypoint.sh"),
      "utf8",
    );
    assert.match(entry, /shell_entrypoint_started/);
    assert.match(entry, /node_process_starting/);
    assert.match(entry, /shell_child_exit/);
    const productionEntry = readFileSync(
      path.join(DEPLOY, "docker-entrypoint.sh"),
      "utf8",
    );
    assert.doesNotMatch(productionEntry, /claimed-render-diagnostic/);
    assert.doesNotMatch(productionEntry, /claimed_render_diagnostic/);
    const worker = readFileSync(path.join(DIST, "hosted-worker.js"), "utf8");
    assert.doesNotMatch(worker, /HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC/);
    assert.doesNotMatch(worker, /runClaimedRenderDiagnostic/);
  });

  await test("minimal and live-smoke fixture packs differ", () => {
    const minimal = buildClaimedRenderDiagnosticMinimalFixture();
    const liveSmoke = buildClaimedRenderDiagnosticLiveSmokeFixture(cleanDiagnosticEnv());
    assert.notEqual(
      minimal.manifest.fingerprint,
      liveSmoke.manifest.fingerprint,
    );
    assert.equal(minimal.profileId, "720p-webm-30");
    assert.equal(liveSmoke.profileId, "720p-webm-30");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
