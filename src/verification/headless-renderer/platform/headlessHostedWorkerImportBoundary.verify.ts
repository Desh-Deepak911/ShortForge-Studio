/**
 * Sprint 11E Phase 2E.1 — Hosted worker import / bundle / route boundaries.
 * Run: npm run test:headless-hosted-worker-import-boundary
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { composeProductionHeadlessControlPlane } from "@/features/headless-renderer/control-plane";

const ROOT = path.resolve(__dirname, "../../../..");
const FEATURE = path.join(ROOT, "src/features/headless-renderer");
const HOSTED = path.join(FEATURE, "worker/hosted");
const DIST = path.join(ROOT, "dist/headless-worker");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "migrations") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  console.log("\nSprint 11E Phase 2E.1 — Hosted worker import boundary\n");

  test("production routes remain configuration-blocked", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
  });

  test("hosted source does not import Next/React/product/testing", () => {
    const hits: string[] = [];
    for (const file of walk(HOSTED)) {
      const src = readFileSync(file, "utf8");
      if (
        /from ["']next\//.test(src) ||
        /from ["']react["']/.test(src) ||
        /from ["']react-dom/.test(src) ||
        /from ["'][^"']*\/product\//.test(src) ||
        /from ["'][^"']*control-plane\/testing/.test(src) ||
        /from ["'][^"']*worker\/testing/.test(src) ||
        /from ["'][^"']*MemoryHeadless/.test(src) ||
        /from ["'][^"']*FakeRedis/.test(src) ||
        /from ["'][^"']*ClerkHeadless/.test(src)
      ) {
        hits.push(path.relative(FEATURE, file));
      }
    }
    assert.deepEqual(hits, []);
  });

  test("product / app routes do not import hosted worker", () => {
    const dirs = [
      path.join(FEATURE, "product"),
      path.join(ROOT, "src/app"),
      path.join(ROOT, "src/components"),
    ];
    const hits: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, "utf8");
        if (
          src.includes("worker/hosted") ||
          src.includes("hosted-worker-cli") ||
          src.includes("runHostedWorkerEntrypoint")
        ) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  test("worker bundle builds and excludes Next/product tokens", () => {
    const build = spawnSync("node", ["scripts/build-headless-worker.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(
      build.status,
      0,
      `build failed: ${build.stderr || build.stdout}`,
    );
    assert.ok(existsSync(path.join(DIST, "hosted-worker.js")));
    const bundle = readFileSync(path.join(DIST, "hosted-worker.js"), "utf8");
    assert.equal(bundle.includes('from "next/'), false);
    assert.equal(bundle.includes("require(\"next/"), false);
    assert.equal(bundle.includes("StoryWorkspace"), false);
    assert.equal(bundle.includes("HeadlessExportSection"), false);
    assert.equal(bundle.includes('from "next/'), false);
    // Source maps disabled.
    assert.equal(existsSync(path.join(DIST, "hosted-worker.js.map")), false);
  });

  console.log(`\n${passed} passed\n`);
}

main();
