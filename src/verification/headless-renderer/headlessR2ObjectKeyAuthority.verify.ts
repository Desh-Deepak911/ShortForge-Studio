/**
 * Sprint 11E Phase 2C.1 — R2 object key authority.
 * Run: npm run test:headless-r2-object-key
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  deriveHeadlessR2ObjectKey,
  recomputeHeadlessR2ObjectKey,
} from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2C.1 — R2 object key authority\n");

  const base = {
    environmentNamespace: "test" as const,
    objectNamespace: "staging" as const,
    ownerId: "owner_1",
    projectId: "project_1",
    jobId: "job_1",
    operationId: "op_1",
    purpose: "manifest" as const,
    slotKey: null as string | null,
    nonce: "a".repeat(32),
  };

  test("derive canonical key for assets purpose", () => {
    const result = deriveHeadlessR2ObjectKey(base);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.storeId, "assets");
    const hOwner = createHash("sha256")
      .update("owner_1", "utf8")
      .digest("hex")
      .slice(0, 16);
    assert.ok(result.objectKey.startsWith(`test/staging/assets/manifest/${hOwner}/`));
    assert.ok(result.objectKey.endsWith(`/none/${"a".repeat(32)}`));
    assert.equal(result.objectKey.includes("owner_1"), false);
  });

  test("artifact purpose → artifacts storeId", () => {
    const result = deriveHeadlessR2ObjectKey({
      ...base,
      purpose: "artifact",
      objectNamespace: "finalized",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.storeId, "artifacts");
    assert.ok(result.objectKey.includes("/artifacts/artifact/"));
  });

  test("slotKey hashed segment", () => {
    const result = deriveHeadlessR2ObjectKey({
      ...base,
      purpose: "asset_bytes",
      slotKey: "scene:1:media:2",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const slotSeg = createHash("sha256")
      .update("scene:1:media:2", "utf8")
      .digest("hex")
      .slice(0, 16);
    assert.ok(result.objectKey.includes(`/${slotSeg}/`));
    assert.equal(result.objectKey.includes("scene:1"), false);
  });

  test("recompute matches derive", () => {
    const a = deriveHeadlessR2ObjectKey(base);
    const b = recomputeHeadlessR2ObjectKey(base);
    assert.deepEqual(a, b);
  });

  test("reject bad nonce / traversal / empty ids", () => {
    assert.equal(
      deriveHeadlessR2ObjectKey({ ...base, nonce: "zz" }).ok,
      false,
    );
    assert.equal(
      deriveHeadlessR2ObjectKey({ ...base, ownerId: "../evil" }).ok,
      false,
    );
    assert.equal(
      deriveHeadlessR2ObjectKey({ ...base, ownerId: "" }).ok,
      false,
    );
    assert.equal(
      deriveHeadlessR2ObjectKey({ ...base, slotKey: "a/../b" }).ok,
      false,
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
