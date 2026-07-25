/**
 * Sprint 11E Phase 2C.1A — owned-object purpose authority.
 * Run: npm run test:headless-owned-object-purpose-authority
 */

import assert from "node:assert/strict";

import {
  assertArtifactPurposeNotSourceCoverage,
  assertSourcePurposeNotArtifact,
  isHeadlessArtifactOwnedObjectPurpose,
  isHeadlessSourceOwnedObjectPurpose,
} from "@/features/headless-renderer/control-plane/services/owned-object-purpose-authority";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2C.1A — owned-object purpose authority\n");

  test("source purposes cannot be artifact", () => {
    assert.equal(assertSourcePurposeNotArtifact("manifest").ok, true);
    assert.equal(assertSourcePurposeNotArtifact("asset_bundle_record").ok, true);
    assert.equal(assertSourcePurposeNotArtifact("asset_bytes").ok, true);
    assert.equal(assertSourcePurposeNotArtifact("artifact").ok, false);
  });

  test("artifact purpose cannot be source coverage / downloadable sources", () => {
    assert.equal(assertArtifactPurposeNotSourceCoverage("artifact").ok, true);
    assert.equal(assertArtifactPurposeNotSourceCoverage("manifest").ok, false);
    assert.equal(
      assertArtifactPurposeNotSourceCoverage("asset_bytes").ok,
      false,
    );
  });

  test("type guards", () => {
    assert.equal(isHeadlessSourceOwnedObjectPurpose("manifest"), true);
    assert.equal(isHeadlessSourceOwnedObjectPurpose("artifact"), false);
    assert.equal(isHeadlessArtifactOwnedObjectPurpose("artifact"), true);
    assert.equal(isHeadlessArtifactOwnedObjectPurpose("manifest"), false);
  });

  console.log(`\n${passed} passed\n`);
}

main();
