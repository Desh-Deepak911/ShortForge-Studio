/**
 * Sprint 11E Phase 2E.2D.8F.2 — gated hosted page diagnostic authority.
 * Run: npm run test:headless-hosted-page-diagnostic
 */

import assert from "node:assert/strict";

import {
  HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE,
  isHostedPageDiagnosticGateOn,
  runHostedPageDiagnostic,
} from "../fly-render-live/hosted-page-diagnostic";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8F.2 — hosted page diagnostic gate\n");

  await test("gate env constant is frozen", () => {
    assert.equal(
      HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE,
      "HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC",
    );
  });

  await test("gate-off returns NOT_TESTED without side effects", async () => {
    const result = await runHostedPageDiagnostic({});
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.exitCode, 0);
    assert.equal(isHostedPageDiagnosticGateOn({}), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
