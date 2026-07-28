/**
 * Sprint 11E Phase 2C.1 — R2 import / privacy / composition boundary.
 * Run: npm run test:headless-r2-import-boundary
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  classifyHeadlessR2Environment,
  composeProductionHeadlessControlPlane,
} from "@/features/headless-renderer/control-plane";

const ROOT = path.resolve(__dirname, "../../..");
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
  console.log("\nSprint 11E Phase 2C.1 — R2 import boundary\n");

  test("production availability remains false", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
    assert.equal(prod.reason, "CONFIGURATION_UNAVAILABLE");
  });

  test("classification alone does not flip productionAvailable", () => {
    const status = classifyHeadlessR2Environment({
      R2_ACCOUNT_ID: "a".repeat(32),
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secretvalue012345678901234",
      R2_BUCKET_ASSETS: "assets-bucket",
      R2_BUCKET_ARTIFACTS: "artifacts-bucket",
      R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      HEADLESS_ALLOWED_ORIGINS: "https://app.example.com",
    });
    assert.equal(status, "configured");
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
  });

  test("no AWS SDK imports in product / worker / domain / components", () => {
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
          src.includes("@aws-sdk/") ||
          src.includes("R2UploadCapabilityAdapter") ||
          src.includes("FakeS3Client") ||
          src.includes("MemoryHeadlessOwnedObjectStoreAdapter")
        ) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  test("production barrel does not export AWS adapters / FakeS3 / memory owned store", () => {
    const prodIndex = readFileSync(
      path.join(FEATURE, "control-plane/index.ts"),
      "utf8",
    );
    assert.equal(prodIndex.includes("R2UploadCapabilityAdapter"), false);
    assert.equal(prodIndex.includes("R2DownloadCapabilityAdapter"), false);
    assert.equal(prodIndex.includes("R2StorageAdapter"), false);
    assert.equal(prodIndex.includes("fake-s3-client"), false);
    assert.equal(prodIndex.includes("FakeS3Client"), false);
    assert.equal(prodIndex.includes("memory-owned-object-store"), false);
    assert.equal(prodIndex.includes("MemoryHeadlessOwnedObjectStore"), false);
    assert.equal(prodIndex.includes("NeonHeadlessOwnedObjectStoreAdapter"), false);
    assert.equal(prodIndex.includes("@aws-sdk/"), false);
    assert.equal(prodIndex.includes("readConfiguredHeadlessR2Config"), false);
  });

  test("production compose stays blocked and may report r2EnvironmentStatus", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
    assert.ok(
      prod.r2EnvironmentStatus === "unconfigured" ||
        prod.r2EnvironmentStatus === "configured" ||
        prod.r2EnvironmentStatus === "invalid",
    );
    assert.equal(typeof prod.r2Configured, "boolean");
  });

  test("production barrel exports classifier + unavailable adapters + verify", () => {
    const prodIndex = readFileSync(
      path.join(FEATURE, "control-plane/index.ts"),
      "utf8",
    );
    assert.ok(prodIndex.includes("classifyHeadlessR2Environment"));
    assert.ok(prodIndex.includes("UnavailableHeadlessUploadCapabilityAdapter"));
    assert.ok(prodIndex.includes("UnavailableHeadlessDownloadCapabilityAdapter"));
    assert.ok(prodIndex.includes("verifyAndFinalizeR2OwnedObject"));
    assert.ok(prodIndex.includes("toHeadlessPublicOwnedObjectView"));
  });

  test("AWS SDK imports stay in control-plane R2 adapters only", () => {
    const files = walk(path.join(FEATURE, "control-plane"));
    const awsImporters = files.filter((f) =>
      readFileSync(f, "utf8").includes("@aws-sdk/"),
    );
    assert.ok(awsImporters.length >= 1);
    for (const f of awsImporters) {
      const rel = path.relative(path.join(FEATURE, "control-plane"), f);
      assert.ok(
        rel.startsWith("adapters/r2-"),
        `unexpected aws import: ${rel}`,
      );
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
