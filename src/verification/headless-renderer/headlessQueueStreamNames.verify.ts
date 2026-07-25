/**
 * Sprint 11E Phase 2D.1 — queue stream name derivation.
 * Run: npm run test:headless-queue-stream-names
 */

import assert from "node:assert/strict";

import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2D.1 — queue stream names\n");

  test("staging names", () => {
    const n = deriveHeadlessQueueStreamNames("staging");
    assert.equal(n.renderStream, "hfq:render:staging");
    assert.equal(n.renderDlq, "hfq:render-dlq:staging");
    assert.equal(n.verifyStream, "hfq:verify:staging");
    assert.equal(n.verifyDlq, "hfq:verify-dlq:staging");
    assert.equal(n.renderGroup, "hfq:render-workers");
    assert.equal(n.verifyGroup, "hfq:verify-workers");
  });

  test("local and production differ by env suffix", () => {
    const local = deriveHeadlessQueueStreamNames("local");
    const prod = deriveHeadlessQueueStreamNames("production");
    assert.equal(local.renderStream, "hfq:render:local");
    assert.equal(prod.renderStream, "hfq:render:production");
    assert.equal(local.renderGroup, prod.renderGroup);
  });

  test("rejects hostile env name", () => {
    assert.throws(() =>
      deriveHeadlessQueueStreamNames("prod" as "local"),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
