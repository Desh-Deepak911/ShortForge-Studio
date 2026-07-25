/**
 * Sprint 11E Phase 2E.1A — Hosted worker foundation corrections.
 * Run: npm run test:headless-hosted-worker-2e1a-correction
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import {
  HEADLESS_HOSTED_IMAGE_CLASS,
  HEADLESS_HOSTED_NODE_MAJOR,
  HEADLESS_HOSTED_REJECTED_NODE_MAJORS,
  assertDeployableWorkerImage,
  buildHeadlessHostedBuildManifest,
  composeHostedHeadlessWorker,
  serializeHeadlessHostedBuildManifest,
} from "@/features/headless-renderer/worker/hosted";

const ROOT = path.resolve(__dirname, "../../..");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");
const DIST = path.join(ROOT, "dist/headless-worker");
const FLY = path.join(DEPLOY, "fly.staging.template.toml");
const DOCKERFILE = path.join(DEPLOY, "Dockerfile");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function parseVmBlocks(fly: string): Array<{
  processes: string[];
  memoryMb: number | null;
  cpus: number | null;
  cpuKind: string | null;
}> {
  const blocks = fly.split(/\[\[vm\]\]/).slice(1);
  return blocks.map((block) => {
    const processesMatch = block.match(
      /processes\s*=\s*\[([^\]]*)\]/,
    );
    const processes = (processesMatch?.[1] ?? "")
      .split(",")
      .map((s) => s.replace(/["'\s]/g, ""))
      .filter(Boolean);
    const memoryMatch = block.match(/memory_mb\s*=\s*(\d+)/);
    const cpusMatch = block.match(/cpus\s*=\s*(\d+)/);
    const kindMatch = block.match(/cpu_kind\s*=\s*"([^"]+)"/);
    return {
      processes,
      memoryMb: memoryMatch ? Number(memoryMatch[1]) : null,
      cpus: cpusMatch ? Number(cpusMatch[1]) : null,
      cpuKind: kindMatch?.[1] ?? null,
    };
  });
}

function main() {
  console.log("\nSprint 11E Phase 2E.1A — Hosted worker corrections\n");

  const dockerfile = readFileSync(DOCKERFILE, "utf8");
  const fly = readFileSync(FLY, "utf8");
  const rootDockerignore = readFileSync(
    path.join(ROOT, ".dockerignore"),
    "utf8",
  );

  test("Node 24 target coherence in Dockerfile + manifest", () => {
    assert.match(dockerfile, /NODE_MAJOR=24/);
    assert.equal(dockerfile.includes("NODE_MAJOR=20"), false);
    assert.match(dockerfile, /test "\$NODE_MAJOR" = "24"/);
    const manifest = buildHeadlessHostedBuildManifest();
    assert.equal(manifest.nodeMajor, 24);
    assert.equal(manifest.target, "node24");
    assert.equal(HEADLESS_HOSTED_NODE_MAJOR, 24);
  });

  test("Node 20 and other EOL majors are rejected by hosted authority", () => {
    assert.ok(HEADLESS_HOSTED_REJECTED_NODE_MAJORS.includes(20));
    assert.ok(HEADLESS_HOSTED_REJECTED_NODE_MAJORS.includes(18));
    assert.equal(
      HEADLESS_HOSTED_REJECTED_NODE_MAJORS.includes(
        HEADLESS_HOSTED_NODE_MAJOR as 16 | 18 | 20,
      ),
      false,
    );
    // Dockerfile must not accept EOL override silently.
    assert.match(dockerfile, /HOSTED_WORKER_REQUIRES_NODE_24/);
    assert.equal(/NODE_MAJOR=20/.test(dockerfile), false);
    assert.equal(/target["']?\s*:\s*["']node20["']/.test(fly), false);
  });

  test("process-specific VM blocks; no unscoped [[vm]]", () => {
    const vms = parseVmBlocks(fly);
    assert.equal(vms.length, 2);
    for (const vm of vms) {
      assert.ok(
        vm.processes.length > 0,
        "every [[vm]] must list processes",
      );
    }
    // Unscoped block would be [[vm]] without processes= — ensure none.
    const rawBlocks = fly.split(/\[\[vm\]\]/).slice(1);
    for (const block of rawBlocks) {
      assert.match(block, /processes\s*=\s*\[/);
    }
  });

  test("verifier smaller capacity; renderer 8 GB floor + 4 perf CPUs", () => {
    const vms = parseVmBlocks(fly);
    const verify = vms.find((v) => v.processes.includes("verify"));
    const render = vms.find((v) => v.processes.includes("render"));
    assert.ok(verify, "verify vm missing");
    assert.ok(render, "render vm missing");
    assert.equal(verify!.processes.includes("render"), false);
    assert.equal(render!.processes.includes("verify"), false);
    assert.ok(
      verify!.memoryMb != null && verify!.memoryMb <= 2048,
      "verifier must stay at bounded smaller staging capacity",
    );
    assert.equal(render!.cpuKind, "performance");
    assert.equal(render!.cpus, 4);
    assert.ok(
      render!.memoryMb != null && render!.memoryMb >= 8192,
      "renderer memory floor is 8192 MB",
    );
    // Renderer cannot inherit verifier 2 GB.
    assert.notEqual(render!.memoryMb, verify!.memoryMb);
    assert.ok((render!.memoryMb ?? 0) > (verify!.memoryMb ?? 0));
  });

  test("Fly Dockerfile path + repo-root build context", () => {
    assert.match(
      fly,
      /dockerfile\s*=\s*"deploy\/headless-worker\/Dockerfile"/,
    );
    assert.equal(/dockerfile\s*=\s*"Dockerfile"/.test(fly), false);
    assert.ok(
      !existsSync(path.join(ROOT, "Dockerfile")),
      "root Dockerfile must not exist (Fly must not look for nonexistent root Dockerfile)",
    );
    assert.ok(existsSync(DOCKERFILE));
    assert.match(dockerfile, /COPY dist\/headless-worker\/hosted-worker\.js/);
    assert.match(dockerfile, /COPY dist\/headless-worker\/page-render\.iife\.js/);
    assert.match(dockerfile, /COPY dist\/headless-worker\/BUILD_INFO\.json/);
    assert.match(dockerfile, /COPY deploy\/headless-worker\/docker-entrypoint\.sh/);
    assert.match(fly, /DEPLOY FROM REPOSITORY ROOT/);
    assert.match(rootDockerignore, /dist\/headless-worker\/hosted-worker\.js/);
    assert.match(rootDockerignore, /dist\/headless-worker\/page-render\.iife\.js/);
    // Instructions must not require cd into deploy/ that loses root context.
    assert.equal(
      /cd\s+deploy\/headless-worker/.test(fly),
      false,
    );
    assert.match(
      readFileSync(path.join(DEPLOY, ".dockerignore"), "utf8"),
      /DEPRECATED for build context/,
    );
  });

  test("deployable_worker classification; unconfigured still blocks loop", () => {
    const manifest = buildHeadlessHostedBuildManifest();
    assert.equal(HEADLESS_HOSTED_IMAGE_CLASS, "deployable_worker");
    assert.equal(manifest.imageClass, "deployable_worker");
    assert.equal(manifest.deployable, true);
    assert.equal(manifest.canStartConsumerLoop, true);
    assertDeployableWorkerImage(manifest);
    assert.deepEqual([...manifest.unresolvedDynamicModules], []);
    assert.deepEqual([...manifest.unresolvedCompositionSeams], []);
    const composition = composeHostedHeadlessWorker({
      HEADLESS_WORKER_MODE: "render",
    });
    assert.equal(composition.canStartConsumerLoop, false);
  });

  test("no wall-clock in BUILD_INFO serialization", () => {
    const text = serializeHeadlessHostedBuildManifest(
      buildHeadlessHostedBuildManifest(),
      HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT,
    );
    assert.equal(/builtAt|Date\.now|SOURCE_DATE_EPOCH|timestamp/i.test(text), false);
    assert.equal(text.includes("builtAtMs"), false);
  });

  test("two-build byte-identical SHA for worker + page + BUILD_INFO", () => {
    const run = () =>
      spawnSync("node", ["scripts/build-headless-worker.mjs"], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120_000,
      });
    const a = run();
    assert.equal(a.status, 0, a.stderr || a.stdout);
    const workerA = readFileSync(path.join(DIST, "hosted-worker.js"));
    const pageA = readFileSync(path.join(DIST, "page-render.iife.js"));
    const infoA = readFileSync(path.join(DIST, "BUILD_INFO.json"));
    const shaWorkerA = sha256(workerA);
    const shaPageA = sha256(pageA);
    const shaInfoA = sha256(infoA);

    const b = run();
    assert.equal(b.status, 0, b.stderr || b.stdout);
    const workerB = readFileSync(path.join(DIST, "hosted-worker.js"));
    const pageB = readFileSync(path.join(DIST, "page-render.iife.js"));
    const infoB = readFileSync(path.join(DIST, "BUILD_INFO.json"));
    assert.equal(sha256(workerB), shaWorkerA);
    assert.equal(sha256(pageB), shaPageA);
    assert.equal(sha256(infoB), shaInfoA);
    assert.equal(
      infoB.toString("utf8"),
      serializeHeadlessHostedBuildManifest(
        buildHeadlessHostedBuildManifest(),
        HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT,
      ),
    );
    assert.match(infoB.toString("utf8"), /"imageClass": "deployable_worker"/);
    assert.match(infoB.toString("utf8"), /"target": "node24"/);
    assert.match(infoB.toString("utf8"), /"deployable": true/);
    assert.match(infoB.toString("utf8"), /"canStartConsumerLoop": true/);
    console.log(`  · hosted-worker.js SHA-256: ${shaWorkerA}`);
    console.log(`  · page-render.iife.js SHA-256: ${shaPageA}`);
    console.log(`  · BUILD_INFO.json SHA-256:  ${shaInfoA}`);
  });

  test("Docker context cannot resolve dist when cwd is deploy/headless-worker", () => {
    // Fixture: if someone builds with context=deploy/headless-worker, the
    // Dockerfile COPY dist/... path does not exist relative to that context.
    const badContextDist = path.join(DEPLOY, "dist/headless-worker");
    assert.equal(existsSync(badContextDist), false);
    // Repo-root dist is the correct location after build.
    assert.ok(existsSync(path.join(DIST, "hosted-worker.js")));
  });

  test("native/sandbox honesty markers present", () => {
    assert.match(dockerfile, /NOT_TESTED until Docker runs/);
    assert.match(dockerfile, /NOT digest-pinned/);
    assert.match(dockerfile, /runtime preflight authority/);
    assert.equal(dockerfile.includes("--no-sandbox"), false);
    assert.match(dockerfile, /USER worker/);
    assert.match(dockerfile, /\btini\b/);
    assert.match(dockerfile, /PUPPETEER_SKIP_DOWNLOAD=1/);
    assert.match(dockerfile, /deployable_worker/);
    assert.match(dockerfile, /"deployable": true/);
    assert.match(dockerfile, /"canStartConsumerLoop": true/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
