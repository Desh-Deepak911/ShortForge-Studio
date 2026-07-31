/**
 * Sprint 11E Phase 2E.2D.8F.6D — claimed-render diagnostic bootstrap authority.
 * Run: npm run test:headless-claimed-render-diagnostic-bootstrap-authority
 */

import assert from "node:assert/strict";
import { sha256Bytes } from "../../support/evidence-hash";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertClaimedRenderBootstrapLifecycleEventSafe,
  CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
  formatClaimedRenderBootstrapLifecycleEvent,
  parseClaimedRenderBootstrapLifecycleLines,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-bootstrap-lifecycle";
import {
  HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE,
  validateClaimedRenderDiagnosticEnvironment,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-environment";
import { runClaimedRenderDiagnostic } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-runner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const DIST = path.join(ROOT, "dist/headless-worker");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");
const ENTRYPOINT_SRC = path.join(
  DEPLOY,
  "docker-claimed-render-diagnostic-entrypoint.sh",
);
const DOCKERFILE = path.join(DEPLOY, "Dockerfile.claimed-render-diagnostic");

const PRODUCTION_WORKER_SHA =
  "a9baf3ea910eeae41b4eadfb10d9dfb100b74042500884c761a8c5b946774e1b";
const PRODUCTION_PAGE_SHA =
  "e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c";
const PRODUCTION_BUILD_INFO_SHA =
  "815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d";

const EVIDENCE_8F6A_SHA =
  "fecae38cc2f26fc3d839e6ec0914403187663fadc77299ea34577a086b3e2083";
const EVIDENCE_8F6B_SHA =
  "4b0ccdd4f78f34b5dfa9f0d0663a0c2800b1b7d4b4a4b20a8ac633ac38935d27";
const EVIDENCE_8F6C_SHA =
  "e6f1268c9e9ec974dfa507811aee37e26144b8305b9114efc810202599dbafce";
const EVIDENCE_8F6E_SHA =
  "c6d92173cdc5c4cceef0ca3a0f584bee5dd5632f568231c864064e77a0c30925";
const EVIDENCE_8F6F_SHA =
  "720ffc97a6b0e9062bdabeeb8274042c932c4c70d2cafeb45edd0cde1b0ae012";
const EXECUTION_PROBE_CURRENT_PASS_SHA =
  "1342cc902cd0051effb4a4f3b466d9d6b717401a4776a073678f16a1072eac7b";
const PAGE_DIAGNOSTIC_SHA =
  "20c848203e0932511b531b477958169b8d254f5a7b287869bd21e42f33a1bd8b";

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
      "footiebitz-crd-bootstrap-test",
    ),
    [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
    HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC: "1",
    ...extra,
  };
}

function materializeAppRoot(): { appRoot: string; entrypoint: string } {
  const appRoot = mkdtempSync(path.join(tmpdir(), "crd-app-root-"));
  copyFileSync(
    path.join(DIST, "claimed-render-diagnostic.js"),
    path.join(appRoot, "claimed-render-diagnostic.js"),
  );
  copyFileSync(
    path.join(DIST, "page-render.iife.js"),
    path.join(appRoot, "page-render.iife.js"),
  );
  copyFileSync(
    path.join(DIST, "claimed-render-probe-fixture.embed.json"),
    path.join(appRoot, "claimed-render-probe-fixture.embed.json"),
  );
  copyFileSync(
    path.join(DIST, "CLAIMED_RENDER_DIAGNOSTIC_BUILD_INFO.json"),
    path.join(appRoot, "CLAIMED_RENDER_DIAGNOSTIC_BUILD_INFO.json"),
  );
  const entrypoint = path.join(appRoot, "docker-claimed-render-diagnostic-entrypoint.sh");
  copyFileSync(ENTRYPOINT_SRC, entrypoint);
  chmodSync(entrypoint, 0o755);
  return { appRoot, entrypoint };
}

function runPackagedEntrypoint(input: {
  readonly appRoot: string;
  readonly entrypoint: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
}) {
  return spawnSync("sh", [input.entrypoint], {
    env: {
      ...process.env,
      ...cleanGateEnv(),
      HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_APP_ROOT: input.appRoot,
      HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_ROOT: input.appRoot,
      HEADLESS_PAGE_BUNDLE_PATH: path.join(input.appRoot, "page-render.iife.js"),
      ...input.env,
    },
    encoding: "utf8",
    timeout: input.timeoutMs ?? 180_000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function lifecycleStages(output: string): string[] {
  return parseClaimedRenderBootstrapLifecycleLines(output).map((e) => e.lifecycleStage);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.6D — Claimed-render diagnostic bootstrap authority\n",
  );

  await test("prior Fly diagnostic and probe evidence preserved byte-identically", () => {
    assert.equal(
      sha256Bytes(
        readFileSync(
          path.join(
            ROOT,
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.pre-run-${EVIDENCE_8F6A_SHA}.md`,
          ),
        ),
      ),
      EVIDENCE_8F6A_SHA,
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
            `docs/evidence/headless/archive/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.pre-8f6f-${EVIDENCE_8F6F_SHA}.md`,
          ),
        ),
      ),
      EVIDENCE_8F6F_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md"))),
      EXECUTION_PROBE_CURRENT_PASS_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_HOSTED_PAGE_DIAGNOSTIC.md"))),
      PAGE_DIAGNOSTIC_SHA,
    );
  });

  await test("Dockerfile OCI: diagnostic ENTRYPOINT/CMD, copies, mode, non-root", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    assert.match(dockerfile, /ENTRYPOINT \["\/app\/docker-claimed-render-diagnostic-entrypoint\.sh"\]/);
    assert.doesNotMatch(dockerfile, /^CMD /m);
    assert.match(dockerfile, /COPY dist\/headless-worker\/claimed-render-diagnostic\.js/);
    assert.match(dockerfile, /COPY dist\/headless-worker\/CLAIMED_RENDER_DIAGNOSTIC_BUILD_INFO\.json/);
    assert.match(dockerfile, /COPY dist\/headless-worker\/claimed-render-probe-fixture\.embed\.json/);
    assert.match(dockerfile, /COPY deploy\/headless-worker\/docker-claimed-render-diagnostic-entrypoint\.sh/);
    assert.match(dockerfile, /chmod 755 \/app\/docker-claimed-render-diagnostic-entrypoint\.sh/);
    assert.match(dockerfile, /USER worker/);
    assert.doesNotMatch(dockerfile, /docker-entrypoint\.sh/);
    assert.doesNotMatch(dockerfile, /hosted-worker\.js/);
  });

  await test("entrypoint: shebang, LF, bootstrap sentinel before Node, no shell gate", () => {
    const entry = readFileSync(ENTRYPOINT_SRC, "utf8");
    assert.match(entry, /^#!\/bin\/sh/m);
    assert.equal(entry.includes("\r"), false);
    const shellStart = entry.indexOf("shell_entrypoint_started");
    const nodeStart = entry.indexOf("node_process_starting");
    assert.ok(shellStart >= 0 && nodeStart > shellStart);
    assert.doesNotMatch(entry, /HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC/);
    assert.doesNotMatch(entry, /HEADLESS_WORKER_MODE/);
    assert.doesNotMatch(entry, /docker-entrypoint\.sh/);
    assert.match(entry, /wait "\$CRD_CHILD_PID"/);
    assert.match(entry, /shell_child_exit/);
    assert.match(entry, /evidence_hold_started/);
    assert.match(entry, /evidence_hold_completed/);
    assert.match(entry, /shortforge-claimed-render-diagnostic/);
    assert.match(entry, /trap crd_forward_signal TERM INT/);
  });

  await test("fly machine run does not override diagnostic ENTRYPOINT in Dockerfile", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    assert.doesNotMatch(dockerfile, /CMD \["verify"\]/);
    assert.doesNotMatch(dockerfile, /CMD \["render"\]/);
    assert.match(dockerfile, /claimed-render-diagnostic\.js/);
  });

  await test("bootstrap lifecycle privacy sanitization", () => {
    const line = formatClaimedRenderBootstrapLifecycleEvent({
      name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
      lifecycleStage: "shell_entrypoint_started",
      status: "ok",
      reasonId: null,
    });
    assert.equal(assertClaimedRenderBootstrapLifecycleEventSafe(line).ok, true);
    assert.ok(!line.includes("/Users/"));
    assert.ok(!line.includes("postgresql"));
  });

  await test("successful shell→Node bootstrap emits ordered lifecycle markers", () => {
    const { appRoot, entrypoint } = materializeAppRoot();
    try {
      const result = runPackagedEntrypoint({
        appRoot,
        entrypoint,
        timeoutMs: 180_000,
      });
      const stages = lifecycleStages(`${result.stdout}\n${result.stderr}`);
      assert.ok(stages.includes("shell_entrypoint_started"));
      assert.ok(stages.includes("node_process_starting"));
      assert.ok(stages.includes("node_entrypoint_started"));
      assert.ok(stages.includes("shell_child_exit"));
      const shellIdx = stages.indexOf("shell_entrypoint_started");
      const nodeProcIdx = stages.indexOf("node_process_starting");
      const nodeEntryIdx = stages.indexOf("node_entrypoint_started");
      assert.ok(shellIdx < nodeProcIdx && nodeProcIdx < nodeEntryIdx);
      if (stages.includes("diagnostic_gate_passed")) {
        assert.ok(nodeEntryIdx < stages.indexOf("diagnostic_gate_passed"));
      }
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("missing bundle fails before Node with bundle_unreadable", () => {
    const appRoot = mkdtempSync(path.join(tmpdir(), "crd-missing-bundle-"));
    const entrypoint = path.join(appRoot, "entrypoint.sh");
    copyFileSync(ENTRYPOINT_SRC, entrypoint);
    chmodSync(entrypoint, 0o755);
    try {
      const result = runPackagedEntrypoint({ appRoot, entrypoint, timeoutMs: 10_000 });
      assert.notEqual(result.status, 0);
      const stages = lifecycleStages(`${result.stdout}\n${result.stderr}`);
      assert.ok(stages.includes("shell_entrypoint_started"));
      assert.deepEqual(
        stages.filter((s) => s === "node_process_starting"),
        ["node_process_starting"],
      );
      const failEvent = parseClaimedRenderBootstrapLifecycleLines(
        `${result.stdout}\n${result.stderr}`,
      ).find((e) => e.lifecycleStage === "node_process_starting");
      assert.equal(failEvent?.status, "failed");
      assert.equal(failEvent?.reasonId, "bundle_unreadable");
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("non-executable entrypoint cannot be invoked directly", () => {
    const { appRoot, entrypoint } = materializeAppRoot();
    chmodSync(entrypoint, 0o644);
    try {
      const result = spawnSync(entrypoint, [], {
        env: {
          ...process.env,
          HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_APP_ROOT: appRoot,
        },
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("gate-off refusal occurs after node_entrypoint_started", () => {
    const { appRoot, entrypoint } = materializeAppRoot();
    try {
      const result = runPackagedEntrypoint({
        appRoot,
        entrypoint,
        env: { [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "0" },
        timeoutMs: 60_000,
      });
      const stages = lifecycleStages(`${result.stdout}\n${result.stderr}`);
      assert.ok(stages.includes("node_entrypoint_started"));
      assert.ok(!stages.includes("diagnostic_gate_passed"));
      assert.match(`${result.stdout}\n${result.stderr}`, /gate_off/);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("forbidden provider env refusal after bootstrap markers", () => {
    const { appRoot, entrypoint } = materializeAppRoot();
    try {
      const result = runPackagedEntrypoint({
        appRoot,
        entrypoint,
        env: { DATABASE_URL: "postgresql://blocked.example/db" },
        timeoutMs: 60_000,
      });
      const stages = lifecycleStages(`${result.stdout}\n${result.stderr}`);
      assert.ok(stages.includes("node_entrypoint_started"));
      assert.ok(!stages.includes("diagnostic_gate_passed"));
      assert.match(`${result.stdout}\n${result.stderr}`, /forbidden_secret_present/);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("Node import failure surfaces diagnostic_terminal without gate_passed", () => {
    const { appRoot, entrypoint } = materializeAppRoot();
    writeFileSync(path.join(appRoot, "claimed-render-diagnostic.js"), "throw new Error('import_fail');");
    try {
      const result = runPackagedEntrypoint({ appRoot, entrypoint, timeoutMs: 30_000 });
      const stages = lifecycleStages(`${result.stdout}\n${result.stderr}`);
      assert.ok(stages.includes("shell_entrypoint_started"));
      assert.ok(stages.includes("node_process_starting"));
      assert.ok(!stages.includes("diagnostic_gate_passed"));
      assert.ok(stages.includes("shell_child_exit"));
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("child nonzero exit propagates with shell_child_exit failed", () => {
    const { appRoot, entrypoint } = materializeAppRoot();
    try {
      const result = runPackagedEntrypoint({
        appRoot,
        entrypoint,
        env: { [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "0" },
        timeoutMs: 30_000,
      });
      assert.notEqual(result.status, 0);
      const exitEvent = parseClaimedRenderBootstrapLifecycleLines(
        `${result.stdout}\n${result.stderr}`,
      ).find((e) => e.lifecycleStage === "shell_child_exit");
      assert.equal(exitEvent?.status, "failed");
      assert.equal(exitEvent?.reasonId, "nonzero_exit");
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  await test("complete A/B lifecycle markers via injected runner", async () => {
    assert.ok(
      existsSync(path.join(DIST, "claimed-render-probe-fixture.embed.json")),
      "missing claimed-render-probe-fixture.embed.json — run diagnostic build first",
    );
    const lifecycle: string[] = [];
    const result = await runClaimedRenderDiagnostic({
      env: cleanGateEnv(),
      forceGateOn: true,
      skipLiveSmoke: true,
      executeRenderJob: async () =>
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
        }) as never,
      bootstrapLifecycleSink: (stage) => {
        lifecycle.push(stage);
      },
    });
    assert.equal(result.overall, "PASS");
    assert.deepEqual(lifecycle, [
      "variant_minimal_started",
      "variant_minimal_terminal",
    ]);
  });

  await test("diagnostic bundle has no production consumer entrypoint imports", () => {
    const bundle = readFileSync(path.join(DIST, "claimed-render-diagnostic.js"), "utf8");
    assert.doesNotMatch(bundle, /materializeHostedWorkerAdapters/);
    assert.doesNotMatch(bundle, /docker-entrypoint\.sh/);
    assert.doesNotMatch(bundle, /hosted-worker-loop/);
    assert.doesNotMatch(bundle, /NeonHeadless/);
    assert.doesNotMatch(bundle, /UpstashRest/);
    assert.doesNotMatch(bundle, /R2StorageAdapter/);
  });

  await test("production worker artifacts unchanged", () => {
    assert.equal(sha256Bytes(readFileSync(path.join(DIST, "hosted-worker.js"))), PRODUCTION_WORKER_SHA);
    assert.equal(sha256Bytes(readFileSync(path.join(DIST, "page-render.iife.js"))), PRODUCTION_PAGE_SHA);
    assert.equal(sha256Bytes(readFileSync(path.join(DIST, "BUILD_INFO.json"))), PRODUCTION_BUILD_INFO_SHA);
  });

  const dockerAvailable =
    spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;

  if (dockerAvailable) {
    await test("final local OCI image: ENTRYPOINT and bootstrap output with network none", () => {
      const build = spawnSync(
        "docker",
        [
          "build",
          "-f",
          "deploy/headless-worker/Dockerfile.claimed-render-diagnostic",
          "-t",
          "footiebitz-crd-bootstrap-local:8f6d",
          ".",
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 600_000 },
      );
      assert.equal(build.status, 0, build.stderr);

      const inspect = spawnSync(
        "docker",
        ["inspect", "footiebitz-crd-bootstrap-local:8f6d", "--format", "{{json .Config.Entrypoint}}"],
        { encoding: "utf8" },
      );
      assert.equal(inspect.status, 0);
      assert.match(inspect.stdout, /docker-claimed-render-diagnostic-entrypoint\.sh/);

      const run = spawnSync(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          "-e",
          "HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC=1",
          "-e",
          "HEADLESS_ENV_NAME=staging",
          "-e",
          "HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC=1",
          "footiebitz-crd-bootstrap-local:8f6d",
        ],
        { encoding: "utf8", timeout: 300_000 },
      );
      const output = `${run.stdout}\n${run.stderr}`;
      const stages = lifecycleStages(output);
      assert.ok(stages.includes("shell_entrypoint_started"));
      assert.ok(stages.includes("node_process_starting"));
      assert.ok(stages.includes("node_entrypoint_started"));
      assert.ok(stages.includes("diagnostic_gate_passed"));
      assert.ok(stages.includes("shell_child_exit"));
      assert.ok(
        stages.includes("diagnostic_terminal") ||
          stages.includes("variant_minimal_terminal"),
      );
    });
  } else {
    console.log("  ○ final local OCI container execution NOT_TESTED (docker unavailable)");
  }

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
