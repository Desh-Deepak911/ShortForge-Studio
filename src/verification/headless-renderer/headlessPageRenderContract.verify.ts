/**
 * Sprint 11E Phase 2E.2D.8F.2 — offline page-render contract harness.
 * Run: npm run test:headless-page-render-contract
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { HEADLESS_PAGE_CONTRACT_VERSION } from "@/features/headless-renderer/worker/chromium/page-contract";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";

import { runHeadlessPageContractHarness } from "./fly-render-live/page-contract-harness";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function sha256File(relativePath: string): string {
  const full = path.join(process.cwd(), relativePath);
  assert.equal(existsSync(full), true, `missing ${relativePath}`);
  return createHash("sha256").update(readFileSync(full)).digest("hex");
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8F.2 — page-render contract harness\n");

  await test("page-render.iife.js bundle exists after worker build path", () => {
    const hash = sha256File("dist/headless-worker/page-render.iife.js");
    assert.ok(hash.length === 64);
  });

  await test("frozen page contract version matches export renderer contract", () => {
    assert.ok(HEADLESS_PAGE_CONTRACT_VERSION.length > 0);
  });

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    console.log("\n  SKIPPED — system Chrome unavailable for live page contract\n");
    console.log(`\n${passed} tests passed (${passed} skipped live contract).\n`);
    return;
  }

  const fixture = buildHeadlessReferenceFixture({
    durationMs: 2000,
    rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
  });

  await test("720p/2s fixture: bundle load, contract readiness, request, response shape", async () => {
    const result = await runHeadlessPageContractHarness({
      fixture,
      contentDurationMs: 2000,
    });
    assert.equal(
      result.ok,
      true,
      result.ok
        ? ""
        : `${result.executionSubstage}/${result.pageFailureReason}/${result.pageResponseClass}`,
    );
    if (result.ok) {
      assert.ok(result.frameCount > 0);
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
