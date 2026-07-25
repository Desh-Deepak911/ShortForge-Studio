/**
 * Sprint 11E Phase 2E.2D.8F.3 — page diagnostic image authority.
 * Run: npm run test:headless-page-diagnostic-image-authority
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256 } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import {
  assertPageDiagnosticImageManifest,
  buildHeadlessPageDiagnosticBuildManifest,
  HEADLESS_PAGE_DIAGNOSTIC_IMAGE_CLASS,
} from "@/features/headless-renderer/worker/page-diagnostic/page-diagnostic-image-classification";
import {
  assertPageDiagnosticEventSafe,
  formatPageDiagnosticEvent,
} from "@/features/headless-renderer/worker/page-diagnostic/page-diagnostic-events";
import {
  HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE,
  validatePageDiagnosticEnvironment,
} from "@/features/headless-renderer/worker/page-diagnostic/page-diagnostic-environment";
import { pageDiagnosticFixtureFingerprint } from "@/features/headless-renderer/worker/page-diagnostic/page-diagnostic-fixture";
import { runPageDiagnostic } from "@/features/headless-renderer/worker/page-diagnostic/page-diagnostic-runner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const DIST = path.join(ROOT, "dist/headless-worker");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");

const PRODUCTION_WORKER_SHA =
  "ef9c43b8b8e27f6a53359939d4fc6b3939dd41f9ab8e069671eca8c02f928e2a";
const PRODUCTION_PAGE_SHA =
  "424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d";
const PRODUCTION_BUILD_INFO_SHA =
  "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a";

const EXECUTION_PROBE_CURRENT_FAIL_EVIDENCE_SHA =
  "e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3";
const EXECUTION_PROBE_PRIOR_REAL_SHAPE_FAIL_EVIDENCE_SHA =
  "f0f4a92d987653cd236b12640d65bb2b870fc444c6d847b063a671dd2e8ff010";
const EXECUTION_PROBE_HISTORICAL_FAIL_EVIDENCE_SHA =
  "aa9df339bb81a47e1e3ac637e0c1f149b92122e96b554c96af417ef67df0c1fa";
const EXECUTION_PROBE_PRIOR_FAIL_EVIDENCE_SHA =
  "36773913c5c9d22aa179381dddc611eec5adaf5da98a982a40e6b4ca39ee44d5";
const PACKAGING_GATE_EVIDENCE_SHA =
  "b4b76f8ec90c22e5931ab37f61914c172a585e2d27a8fa0055f08ba348ee2a1c";
const PAGE_DIAGNOSTIC_PASS_EVIDENCE_SHA =
  "20c848203e0932511b531b477958169b8d254f5a7b287869bd21e42f33a1bd8b";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

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
    HEADLESS_WORKER_WORKSPACE_ROOT: "/tmp/footiebitz-headless-page-diagnostic-test",
    ...extra,
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8F.3 — Page diagnostic image authority\n");

  await test("prior evidence SHAs preserved byte-identically", () => {
    assert.equal(
      sha256(
        readFileSync(
          path.join(ROOT, "docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md"),
        ),
      ),
      EXECUTION_PROBE_CURRENT_FAIL_EVIDENCE_SHA,
    );
    assert.equal(
      sha256(
        readFileSync(
          path.join(
            ROOT,
            `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${EXECUTION_PROBE_CURRENT_FAIL_EVIDENCE_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_CURRENT_FAIL_EVIDENCE_SHA,
    );
    assert.equal(
      sha256(
        readFileSync(
          path.join(
            ROOT,
            `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${EXECUTION_PROBE_PRIOR_FAIL_EVIDENCE_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_PRIOR_FAIL_EVIDENCE_SHA,
    );
    assert.equal(
      sha256(
        readFileSync(
          path.join(
            ROOT,
            `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-8f51-real-shape-${EXECUTION_PROBE_PRIOR_REAL_SHAPE_FAIL_EVIDENCE_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_PRIOR_REAL_SHAPE_FAIL_EVIDENCE_SHA,
    );
    assert.equal(
      sha256(
        readFileSync(
          path.join(
            ROOT,
            `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-8f5-attribution-${EXECUTION_PROBE_HISTORICAL_FAIL_EVIDENCE_SHA}.md`,
          ),
        ),
      ),
      EXECUTION_PROBE_HISTORICAL_FAIL_EVIDENCE_SHA,
    );
    assert.equal(
      sha256(
        readFileSync(
          path.join(
            ROOT,
            `docs/HEADLESS_11E_FLY_HOSTED_PAGE_DIAGNOSTIC.pre-run-${PACKAGING_GATE_EVIDENCE_SHA}.md`,
          ),
        ),
      ),
      PACKAGING_GATE_EVIDENCE_SHA,
    );
    assert.equal(
      sha256(
        readFileSync(
          path.join(ROOT, "docs/HEADLESS_11E_FLY_HOSTED_PAGE_DIAGNOSTIC.md"),
        ),
      ),
      PAGE_DIAGNOSTIC_PASS_EVIDENCE_SHA,
    );
  });

  await test("image manifest classifies page_diagnostic non-deployable", () => {
    const manifest = buildHeadlessPageDiagnosticBuildManifest();
    assert.equal(manifest.imageClass, HEADLESS_PAGE_DIAGNOSTIC_IMAGE_CLASS);
    assert.equal(manifest.deployable, false);
    assert.equal(manifest.canStartConsumerLoop, false);
    assert.equal(manifest.providerAccess, false);
    assert.equal(manifest.publicService, false);
    assert.doesNotThrow(() => assertPageDiagnosticImageManifest(manifest));
  });

  await test("gate off returns NOT_TESTED without provider contact", async () => {
    const events: string[] = [];
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv(),
      eventSink: (event) => {
        events.push(formatPageDiagnosticEvent(event));
      },
    });
    assert.equal(result.overall, "FAIL");
    assert.equal(result.reasonId, "gate_off");
    assert.equal(events.length, 1);
  });

  await test("forbidden secret present fails closed at diagnostic_environment", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
        DATABASE_URL: "postgresql://blocked.example/db",
      }),
      forceGateOn: true,
    });
    assert.equal(result.overall, "FAIL");
    assert.equal(result.reasonId, "forbidden_secret_present");
  });

  await test("forbidden worker mode rejected", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
        HEADLESS_WORKER_MODE: "render",
      }),
      forceGateOn: true,
    });
    assert.equal(result.reasonId, "forbidden_worker_mode");
  });

  await test("validatePageDiagnosticEnvironment rejects R2 and Upstash prefixes", () => {
    const verdict = validatePageDiagnosticEnvironment({
      [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
      R2_BUCKET_ASSETS: "blocked",
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reasonId, "forbidden_secret_present");
    }
  });

  await test("missing page artifact attribution", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
        HEADLESS_PAGE_DIAGNOSTIC_ROOT: "/nonexistent-page-artifact-root",
      }),
      forceGateOn: true,
      materializePageArtifact: () => ({
        ok: false,
        reasonId: "page_artifact_absent",
      }),
    });
    assert.equal(result.failedSubstage, "page_artifact_materialize");
    assert.equal(result.reasonId, "page_artifact_absent");
  });

  await test("unreadable page artifact attribution", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      materializePageArtifact: () => ({
        ok: false,
        reasonId: "page_artifact_unreadable",
      }),
    });
    assert.equal(result.reasonId, "page_artifact_unreadable");
  });

  await test("injected contract global missing maps to stable reason", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      materializePageArtifact: () => ({
        ok: true,
        byteLength: 100,
        digestSha256: PRODUCTION_PAGE_SHA,
      }),
      renderContract: async () => ({
        ok: false,
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_contract_missing",
        pageResponseClass: "missing_api",
        message: "scrubbed",
      }),
    });
    assert.equal(result.failedSubstage, "page_contract_ready");
    assert.equal(result.reasonId, "contract_global_missing");
  });

  await test("injected contract version mismatch", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      materializePageArtifact: () => ({
        ok: true,
        byteLength: 100,
        digestSha256: PRODUCTION_PAGE_SHA,
      }),
      renderContract: async () => ({
        ok: false,
        executionSubstage: "page_contract_ready",
        pageFailureReason: "page_contract_version_mismatch",
        pageResponseClass: "invalid_payload",
        message: "scrubbed",
      }),
    });
    assert.equal(result.reasonId, "contract_version_mismatch");
  });

  await test("injected bootstrap rejection via frame failure path", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      materializePageArtifact: () => ({
        ok: true,
        byteLength: 100,
        digestSha256: PRODUCTION_PAGE_SHA,
      }),
      renderContract: async () => ({
        ok: false,
        executionSubstage: "page_request_submit",
        pageFailureReason: "page_request_rejected",
        pageResponseClass: "rejected",
        message: "scrubbed",
      }),
    });
    assert.equal(result.failedSubstage, "frame_request");
    assert.equal(result.reasonId, "frame_request_failed");
  });

  await test("injected png response failure", async () => {
    const result = await runPageDiagnostic({
      env: cleanDiagnosticEnv({
        [HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE]: "1",
      }),
      forceGateOn: true,
      materializePageArtifact: () => ({
        ok: true,
        byteLength: 100,
        digestSha256: PRODUCTION_PAGE_SHA,
      }),
      renderContract: async () => ({
        ok: false,
        executionSubstage: "page_response_validate",
        pageFailureReason: "page_response_invalid",
        pageResponseClass: "invalid_payload",
        message: "scrubbed",
      }),
    });
    assert.equal(result.reasonId, "png_response_invalid");
  });

  await test("safe JSON-line output privacy", () => {
    const line = formatPageDiagnosticEvent({
      name: "hosted.page_diagnostic",
      status: "failed",
      diagnosticStage: "page_contract_ready",
      pageSubstage: "page_contract_ready",
      reasonId: "contract_global_missing",
      filePresentClass: "present_readable",
      scriptLoadedClass: "loaded",
      contractGlobalClass: "missing",
      contractVersionClass: "not_applicable",
      responseClass: "missing_api",
      chromiumExitClass: "failed",
      boundedDurationMs: 120,
      cleanupStatus: "ok",
    });
    assert.equal(assertPageDiagnosticEventSafe(line).ok, true);
    assert.ok(!line.includes("/Users/"));
    assert.ok(!line.includes("postgresql"));
  });

  await test("deterministic fixture fingerprint stable", () => {
    const a = pageDiagnosticFixtureFingerprint();
    const b = pageDiagnosticFixtureFingerprint();
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  await test("production worker artifacts unchanged after diagnostic packaging", () => {
    assert.ok(existsSync(path.join(DIST, "hosted-worker.js")));
    assert.ok(existsSync(path.join(DIST, "page-render.iife.js")));
    assert.ok(existsSync(path.join(DIST, "BUILD_INFO.json")));
    assert.equal(sha256(readFileSync(path.join(DIST, "hosted-worker.js"))), PRODUCTION_WORKER_SHA);
    assert.equal(sha256(readFileSync(path.join(DIST, "page-render.iife.js"))), PRODUCTION_PAGE_SHA);
    assert.equal(sha256(readFileSync(path.join(DIST, "BUILD_INFO.json"))), PRODUCTION_BUILD_INFO_SHA);
    assert.equal(
      sha256(readFileSync(path.join(DIST, "page-render.iife.js"))),
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    );
  });

  await test("diagnostic bundle and docker assets present", () => {
    assert.ok(existsSync(path.join(DIST, "page-diagnostic.js")));
    assert.ok(existsSync(path.join(DIST, "PAGE_DIAGNOSTIC_BUILD_INFO.json")));
    const dockerfile = readFileSync(
      path.join(DEPLOY, "Dockerfile.page-diagnostic"),
      "utf8",
    );
    assert.match(dockerfile, /page-diagnostic\.js/);
    assert.match(dockerfile, /page-render\.iife\.js/);
    assert.match(dockerfile, /page_diagnostic/);
    assert.doesNotMatch(dockerfile, /hosted-worker\.js/);
    const entry = readFileSync(
      path.join(DEPLOY, "docker-page-diagnostic-entrypoint.sh"),
      "utf8",
    );
    assert.match(entry, /HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC/);
    assert.doesNotMatch(entry, /verify\|render/);
    const diagnosticBundle = readFileSync(
      path.join(DIST, "page-diagnostic.js"),
      "utf8",
    );
    assert.doesNotMatch(diagnosticBundle, /materializeHostedWorkerAdapters/);
    assert.doesNotMatch(diagnosticBundle, /createHostedWorkerLoop/);
    assert.doesNotMatch(diagnosticBundle, /runHostedWorkerEntrypoint/);
    const productionEntry = readFileSync(
      path.join(DEPLOY, "docker-entrypoint.sh"),
      "utf8",
    );
    assert.doesNotMatch(productionEntry, /page-diagnostic/);
    assert.doesNotMatch(productionEntry, /page_diagnostic/);
  });

  await test("hosted-worker.js does not expose page diagnostic gate", () => {
    const worker = readFileSync(path.join(DIST, "hosted-worker.js"), "utf8");
    assert.doesNotMatch(worker, /HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC/);
    assert.doesNotMatch(worker, /runPageDiagnostic/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
