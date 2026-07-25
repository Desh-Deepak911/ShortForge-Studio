/**
 * Sprint 11E Phase 2B.2 — Neon import / privacy / composition boundary.
 * Run: npm run test:headless-neon-import-boundary
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  classifyHeadlessNeonEnvironment,
  composeProductionHeadlessControlPlane,
} from "@/features/headless-renderer/control-plane";

const ROOT = path.resolve(__dirname, "../..");
const FEATURE = path.join(ROOT, "features/headless-renderer");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function walk(dir: string, out: string[] = []): string[] {
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
  console.log("\nSprint 11E Phase 2B.2 — Neon import boundary\n");

  test("production availability remains false", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
    assert.equal(prod.reason, "CONFIGURATION_UNAVAILABLE");
  });

  test("composition does not connect for classification-only status", () => {
    const status = classifyHeadlessNeonEnvironment({
      DATABASE_URL: "postgresql://u:p@127.0.0.1:1/db",
    });
    assert.ok(status === "configured" || status === "invalid" || status === "unconfigured");
    // compose reads env but Pool.connect only happens on adapter method calls.
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
  });

  test("no Neon imports in product / worker / domain / Export UI", () => {
    const blockedDirs = [
      path.join(FEATURE, "product"),
      path.join(FEATURE, "worker"),
      path.join(FEATURE, "domain"),
      path.join(ROOT, "components"),
    ];
    const hits: string[] = [];
    for (const dir of blockedDirs) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, "utf8");
        if (
          src.includes("@neondatabase/serverless") ||
          src.includes("createNeonSqlExecutor") ||
          src.includes("FakeHeadlessSql") ||
          src.includes("InMemoryHeadlessSqlFixture") ||
          src.includes("ScriptedHeadlessSqlExecutor")
        ) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  test("testing SQL adapter not in production barrel", () => {
    const prodIndex = readFileSync(
      path.join(FEATURE, "control-plane/index.ts"),
      "utf8",
    );
    assert.equal(prodIndex.includes("fake-sql-executor"), false);
    assert.equal(prodIndex.includes("InMemoryHeadlessSqlFixture"), false);
    assert.equal(prodIndex.includes("ScriptedHeadlessSqlExecutor"), false);
    assert.equal(prodIndex.includes("control-plane/testing"), false);
    assert.equal(prodIndex.includes("NeonHeadlessOwnedObjectStoreAdapter"), false);
  });

  test("testing barrel exports Neon owned-object store (QA surface)", () => {
    const testingIndex = readFileSync(
      path.join(FEATURE, "control-plane/testing/index.ts"),
      "utf8",
    );
    assert.ok(testingIndex.includes("NeonHeadlessOwnedObjectStoreAdapter"));
    assert.ok(testingIndex.includes("NeonHeadlessJobStoreAdapter"));
  });

  test("public feature barrel does not export Neon runtime", () => {
    const root = readFileSync(path.join(FEATURE, "index.ts"), "utf8");
    assert.equal(root.includes("@neondatabase"), false);
    assert.equal(root.includes("neon-"), false);
    assert.equal(root.includes("DATABASE_URL"), false);
  });

  test("Neon Pool import stays in server control-plane runtime only", () => {
    const files = walk(path.join(FEATURE, "control-plane"));
    const neonImporters = files.filter((f) =>
      readFileSync(f, "utf8").includes("@neondatabase/serverless"),
    );
    assert.ok(neonImporters.length >= 1);
    for (const f of neonImporters) {
      const rel = path.relative(path.join(FEATURE, "control-plane"), f);
      assert.ok(
        rel.startsWith("runtime/") || rel.includes("neon-sql-executor"),
        `unexpected neon import: ${rel}`,
      );
    }
  });

  test("proxy/middleware does not import Neon adapters", () => {
    const proxy = path.join(ROOT, "proxy.ts");
    const src = readFileSync(proxy, "utf8");
    assert.equal(src.includes("@neondatabase"), false);
    assert.equal(src.includes("NeonHeadless"), false);
    assert.equal(src.includes("DATABASE_URL"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
