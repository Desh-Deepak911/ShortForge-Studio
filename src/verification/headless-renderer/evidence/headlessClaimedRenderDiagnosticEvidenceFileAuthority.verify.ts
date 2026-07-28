/**
 * Sprint 11E Phase 2E.2D.8F.6F — ephemeral file-captured evidence authority.
 * Run: npm run test:headless-claimed-render-diagnostic-evidence-file-authority
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
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendClaimedRenderDiagnosticEvidenceLine,
  assertClaimedRenderDiagnosticEvidenceLineSafe,
  assertClaimedRenderDiagnosticEvidencePathFixed,
  CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR,
  CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH,
  CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_MAX_SEC,
  createClaimedRenderDiagnosticEvidenceBootstrapSink,
  createClaimedRenderDiagnosticEvidenceEventSink,
  parseClaimedRenderDiagnosticEvidenceFile,
  resolveClaimedRenderDiagnosticEvidencePath,
  validateClaimedRenderDiagnosticEvidenceLine,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-evidence-file";
import {
  CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
  formatClaimedRenderBootstrapLifecycleEvent,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-bootstrap-lifecycle";
import {
  createInitialBoundaryPresence,
  formatClaimedRenderDiagnosticEvent,
} from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-events";
import {
  HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE,
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

const EVIDENCE_8F6E_SHA =
  "c6d92173cdc5c4cceef0ca3a0f584bee5dd5632f568231c864064e77a0c30925";
const EVIDENCE_8F6F_SHA =
  "720ffc97a6b0e9062bdabeeb8274042c932c4c70d2cafeb45edd0cde1b0ae012";
const EXECUTION_PROBE_SHA =
  "e8aac3bfb4abcc384b7ddfc614d00d1005d065cc0f678d53bdc8af7b38b01da3";
const PAGE_DIAG_SHA =
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
    HEADLESS_WORKER_WORKSPACE_ROOT: path.join(tmpdir(), "footiebitz-crd-evidence-test"),
    HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC: "1",
    [HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE]: "1",
    ...extra,
  };
}

function resetEvidenceFile(): void {
  if (!existsSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR)) return;
  const stat = lstatSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
  if (stat.isSymbolicLink()) {
    unlinkSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
    return;
  }
  rmSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR, { recursive: true, force: true });
}

function materializeAppRoot(): { appRoot: string; entrypoint: string } {
  const appRoot = mkdtempSync(path.join(tmpdir(), "crd-evidence-app-"));
  for (const file of [
    "claimed-render-diagnostic.js",
    "page-render.iife.js",
    "claimed-render-probe-fixture.embed.json",
    "CLAIMED_RENDER_DIAGNOSTIC_BUILD_INFO.json",
  ]) {
    copyFileSync(path.join(DIST, file), path.join(appRoot, file));
  }
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
  readonly signal?: NodeJS.Signals;
  readonly signalDelayMs?: number;
}) {
  const child = spawnSync("sh", [input.entrypoint], {
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
  return child;
}

function bootstrapStagesFromFile(): string[] {
  const content = readFileSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "utf8");
  return parseClaimedRenderDiagnosticEvidenceFile(content)
    .filter((e) => "lifecycleStage" in e)
    .map((e) => (e as { lifecycleStage: string }).lifecycleStage);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.6F — Claimed-render diagnostic evidence file authority\n",
  );

  await test("8F.6E and prior probe evidence preserved byte-identically", () => {
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
      EXECUTION_PROBE_SHA,
    );
    assert.equal(
      sha256Bytes(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_HOSTED_PAGE_DIAGNOSTIC.md"))),
      PAGE_DIAG_SHA,
    );
  });

  await test("fixed evidence path is frozen and rejects operator override", () => {
    assert.equal(
      resolveClaimedRenderDiagnosticEvidencePath(),
      "/tmp/shortforge-claimed-render-diagnostic/evidence.jsonl",
    );
    assert.equal(
      assertClaimedRenderDiagnosticEvidencePathFixed(
        "/tmp/shortforge-claimed-render-diagnostic/evidence.jsonl",
      ).ok,
      true,
    );
    assert.equal(
      assertClaimedRenderDiagnosticEvidencePathFixed("/tmp/other/evidence.jsonl").ok,
      false,
    );
    assert.equal(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_MAX_SEC, 300);
  });

  await test("Dockerfile creates fixed evidence directory owned by worker", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    assert.match(dockerfile, /shortforge-claimed-render-diagnostic/);
    assert.match(dockerfile, /USER worker/);
    const entry = readFileSync(ENTRYPOINT_SRC, "utf8");
    assert.match(entry, /CRD_EVIDENCE_ROOT="\/tmp\/shortforge-claimed-render-diagnostic"/);
    assert.match(entry, /evidence_hold_started/);
    assert.match(entry, /evidence_hold_completed/);
  });

  await test("JSONL schema accepts bootstrap and diagnostic records", () => {
    const bootstrap = formatClaimedRenderBootstrapLifecycleEvent({
      name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
      lifecycleStage: "shell_entrypoint_started",
      status: "ok",
      reasonId: null,
    });
    assert.equal(validateClaimedRenderDiagnosticEvidenceLine(bootstrap).ok, true);
    const diagnostic = formatClaimedRenderDiagnosticEvent({
      name: "hosted.claimed_render_diagnostic",
      status: "ok",
      variant: "minimal",
      diagnosticStage: "binary_preflight",
      reasonId: null,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: null,
      cleanupStatus: "not_run",
    });
    assert.equal(validateClaimedRenderDiagnosticEvidenceLine(diagnostic).ok, true);
  });

  await test("JSONL schema rejects free-form provider/runtime text", () => {
    const bad = JSON.stringify({
      name: "hosted.claimed_render_diagnostic",
      status: "ok",
      variant: "minimal",
      diagnostic_stage: "binary_preflight",
      reason_id: "postgresql://secret",
      boundary_presence: createInitialBoundaryPresence(),
      workspace_classification_count: 0,
      bounded_duration_ms: null,
      cleanup_status: "not_run",
    });
    assert.equal(validateClaimedRenderDiagnosticEvidenceLine(bad).ok, false);
    assert.equal(assertClaimedRenderDiagnosticEvidenceLineSafe(bad).ok, false);
  });

  await test("ordered atomic JSONL appends via Node sink", () => {
    resetEvidenceFile();
    const sink = createClaimedRenderDiagnosticEvidenceBootstrapSink();
    sink("node_entrypoint_started");
    sink("diagnostic_gate_passed");
    const lines = readFileSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "utf8")
      .trim()
      .split("\n");
    assert.equal(lines.length, 2);
    assert.equal(validateClaimedRenderDiagnosticEvidenceLine(lines[0]!).ok, true);
    assert.equal(validateClaimedRenderDiagnosticEvidenceLine(lines[1]!).ok, true);
    resetEvidenceFile();
  });

  await test("file created before Node launch via shell entrypoint", () => {
    resetEvidenceFile();
    const { appRoot, entrypoint } = materializeAppRoot();
    try {
      runPackagedEntrypoint({ appRoot, entrypoint, timeoutMs: 180_000 });
      assert.ok(existsSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH));
      const content = readFileSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "utf8");
      const stages = bootstrapStagesFromFile();
      assert.ok(content.length > 0);
      assert.ok(stages.includes("shell_entrypoint_started"));
      assert.ok(stages.indexOf("shell_entrypoint_started") < stages.indexOf("node_entrypoint_started"));
      assert.ok(stages.includes("evidence_hold_completed"));
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
      resetEvidenceFile();
    }
  });

  await test("shell marker survives Node import failure", () => {
    resetEvidenceFile();
    const appRoot = mkdtempSync(path.join(tmpdir(), "crd-import-fail-"));
    copyFileSync(ENTRYPOINT_SRC, path.join(appRoot, "entrypoint.sh"));
    chmodSync(path.join(appRoot, "entrypoint.sh"), 0o755);
    writeFileSync(path.join(appRoot, "claimed-render-diagnostic.js"), "throw new Error('import_fail');");
    copyFileSync(path.join(DIST, "page-render.iife.js"), path.join(appRoot, "page-render.iife.js"));
    try {
      runPackagedEntrypoint({
        appRoot,
        entrypoint: path.join(appRoot, "entrypoint.sh"),
        timeoutMs: 60_000,
      });
      const stages = bootstrapStagesFromFile();
      assert.ok(stages.includes("shell_entrypoint_started"));
      assert.ok(stages.includes("node_process_starting"));
      assert.ok(stages.includes("shell_child_exit"));
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
      resetEvidenceFile();
    }
  });

  await test("complete A/B lifecycle written to evidence file via injected runner", async () => {
    resetEvidenceFile();
    const bootstrapSink = createClaimedRenderDiagnosticEvidenceBootstrapSink();
    const eventSink = createClaimedRenderDiagnosticEvidenceEventSink();
    bootstrapSink("node_entrypoint_started");
    bootstrapSink("diagnostic_gate_passed");
    await runClaimedRenderDiagnostic({
      env: cleanGateEnv(),
      eventSink,
      bootstrapLifecycleSink: bootstrapSink,
      forceGateOn: true,
      skipLiveSmoke: true,
    });
    bootstrapSink("diagnostic_terminal", "ok", "not_run");
    const content = readFileSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "utf8");
    assert.match(content, /variant_minimal_started/);
    assert.match(content, /variant_minimal_terminal/);
    assert.match(content, /diagnostic_terminal/);
    resetEvidenceFile();
  });

  await test("partial lifecycle remains retrievable without fabricated terminal", () => {
    resetEvidenceFile();
    appendClaimedRenderDiagnosticEvidenceLine(
      formatClaimedRenderBootstrapLifecycleEvent({
        name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
        lifecycleStage: "shell_entrypoint_started",
        status: "ok",
        reasonId: null,
      }),
    );
    appendClaimedRenderDiagnosticEvidenceLine(
      formatClaimedRenderBootstrapLifecycleEvent({
        name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
        lifecycleStage: "node_entrypoint_started",
        status: "ok",
        reasonId: null,
      }),
    );
    const stages = bootstrapStagesFromFile();
    assert.ok(stages.includes("node_entrypoint_started"));
    assert.ok(!stages.includes("diagnostic_terminal"));
    resetEvidenceFile();
  });

  await test("child nonzero exit retained in evidence file", () => {
    resetEvidenceFile();
    const { appRoot, entrypoint } = materializeAppRoot();
    writeFileSync(
      path.join(appRoot, "claimed-render-diagnostic.js"),
      "process.exit(7);",
    );
    try {
      const result = runPackagedEntrypoint({ appRoot, entrypoint, timeoutMs: 60_000 });
      assert.notEqual(result.status, 0);
      const stages = bootstrapStagesFromFile();
      const shellExit = parseClaimedRenderDiagnosticEvidenceFile(
        readFileSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH, "utf8"),
      ).find(
        (e) => "lifecycleStage" in e && e.lifecycleStage === "shell_child_exit",
      );
      assert.ok(stages.includes("shell_child_exit"));
      assert.equal(
        shellExit && "reasonId" in shellExit ? shellExit.reasonId : null,
        "nonzero_exit",
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
      resetEvidenceFile();
    }
  });

  await test("bounded evidence hold completes within configured window", () => {
    resetEvidenceFile();
    const { appRoot, entrypoint } = materializeAppRoot();
    const started = Date.now();
    try {
      runPackagedEntrypoint({
        appRoot,
        entrypoint,
        env: { HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC: "2" },
        timeoutMs: 120_000,
      });
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 2000);
      assert.ok(elapsed < 120_000);
      const stages = bootstrapStagesFromFile();
      assert.ok(stages.includes("evidence_hold_started"));
      assert.ok(stages.includes("evidence_hold_completed"));
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
      resetEvidenceFile();
    }
  });

  await test("symlink evidence path refusal in shell entrypoint", () => {
    resetEvidenceFile();
    const fakeRoot = mkdtempSync(path.join(tmpdir(), "crd-symlink-"));
    try {
      symlinkSync(fakeRoot, CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
      const { appRoot, entrypoint } = materializeAppRoot();
      try {
        const result = runPackagedEntrypoint({
          appRoot,
          entrypoint,
          timeoutMs: 10_000,
        });
        assert.notEqual(result.status, 0);
      } finally {
        rmSync(appRoot, { recursive: true, force: true });
      }
    } finally {
      if (existsSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR)) {
        const linkStat = lstatSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
        if (linkStat.isSymbolicLink()) {
          unlinkSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR);
        } else {
          rmSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_DIR, { recursive: true, force: true });
        }
      }
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  await test("evidence file mode is writable by invoking user", () => {
    resetEvidenceFile();
    appendClaimedRenderDiagnosticEvidenceLine(
      formatClaimedRenderBootstrapLifecycleEvent({
        name: CLAIMED_RENDER_DIAGNOSTIC_BOOTSTRAP_EVENT_NAME,
        lifecycleStage: "shell_entrypoint_started",
        status: "ok",
        reasonId: null,
      }),
    );
    const stat = lstatSync(CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_FILE_PATH);
    assert.ok(stat.isFile());
    resetEvidenceFile();
  });

  const dockerAvailable =
    spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;

  if (dockerAvailable) {
    await test("final local OCI image: evidence file authoritative with network none", () => {
      resetEvidenceFile();
      const build = spawnSync(
        "docker",
        [
          "build",
          "-f",
          "deploy/headless-worker/Dockerfile.claimed-render-diagnostic",
          "-t",
          "footiebitz-crd-evidence-local:8f6f",
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
          "HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_EVIDENCE_HOLD_SEC=2",
          "footiebitz-crd-evidence-local:8f6f",
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
      );
      assert.equal(start.status, 0, start.stderr);
      const containerId = start.stdout.trim();
      assert.ok(containerId.length > 0);

      let fileContent = "";
      for (let i = 0; i < 30; i += 1) {
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
        if (cat.status === 0 && cat.stdout.includes("shell_entrypoint_started")) {
          fileContent = cat.stdout;
          if (fileContent.includes("evidence_hold_started")) {
            break;
          }
        }
      }
      spawnSync("docker", ["rm", "-f", containerId], { encoding: "utf8" });
      assert.ok(fileContent.includes("shell_entrypoint_started"));
      assert.ok(fileContent.includes("node_entrypoint_started"));
      assert.ok(fileContent.includes("diagnostic_gate_passed"));
      assert.ok(fileContent.includes("shell_child_exit"));
      assert.ok(fileContent.includes("evidence_hold_started"));
      const stages = parseClaimedRenderDiagnosticEvidenceFile(fileContent)
        .filter((e) => "lifecycleStage" in e)
        .map((e) => (e as { lifecycleStage: string }).lifecycleStage);
      assert.ok(stages.includes("evidence_hold_started"));
      for (const line of fileContent.split("\n")) {
        if (!line.trim()) continue;
        assert.equal(validateClaimedRenderDiagnosticEvidenceLine(line).ok, true);
      }
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
