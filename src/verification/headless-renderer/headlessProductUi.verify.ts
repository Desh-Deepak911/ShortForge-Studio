/**
 * Sprint 11E Phase 1 — product UI + polling + accessibility fixtures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { startBoundedJobPoller } from "@/features/headless-renderer/product/polling/bounded-job-poller";
import { HEADLESS_EXPORT_INTRO, HEADLESS_4K_DURATION_COPY } from "@/features/headless-renderer/product/client/creator-messages";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok - ${name}`);
    });
}

async function main(): Promise<void> {
  await test("ExportPanel wires HeadlessExportSection", () => {
    const panel = readFileSync(
      path.join(process.cwd(), "src/components/ExportPanel.tsx"),
      "utf8",
    );
    assert.ok(panel.includes("HeadlessExportSection"));
    assert.ok(panel.includes("exportRenderer"));
    assert.ok(
      panel.includes("Headless failure never starts a browser export automatically"),
    );
  });

  await test("HeadlessExportSection has required creator copy + a11y", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
      ),
      "utf8",
    );
    assert.ok(src.includes("HEADLESS_EXPORT_INTRO") || src.includes(HEADLESS_EXPORT_INTRO));
    assert.ok(src.includes("HEADLESS_4K_DURATION_COPY") || src.includes(HEADLESS_4K_DURATION_COPY));
    assert.ok(src.includes('aria-label="Renderer"'));
    assert.ok(src.includes("Browser"));
    assert.ok(src.includes("Headless"));
    assert.ok(src.includes("HttpOwnedUploadAdapter"));
    assert.equal(src.includes("UnavailableOwnedUploadAdapter"), false);
    assert.ok(src.includes("ownedUploadPort"));
    assert.ok(src.includes("allowTestAuthority"));
    assert.ok(src.includes("useTestAuthority = allowTestAuthority === true"));
    assert.ok(src.includes("rendererLocked"));
    assert.ok(src.includes("dispatchOwnedHeadlessJob"));
    assert.ok(src.includes("Export again with Headless"));
    assert.equal(src.includes('"Export complete"'), false);
    assert.equal(src.includes("usesInjectedTestPorts"), false);
    assert.equal(src.includes("process.env"), false);
    assert.equal(src.includes("control-plane/testing"), false);
  });

  await test("HeadlessJobStatusPanel announces via aria-live", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/product/ui/HeadlessJobStatusPanel.tsx",
      ),
      "utf8",
    );
    assert.ok(src.includes('aria-live="polite"'));
    assert.ok(src.includes("statusDescriptionForProductState"));
    assert.ok(src.includes("isTerminalError"));
    assert.ok(src.includes("announcedMessage"));
    assert.ok(src.includes("Cancel"));
    assert.ok(src.includes("Retry"));
    assert.ok(src.includes("Download"));
    assert.equal(src.includes("stack"), false);
    assert.equal(src.includes("fingerprint"), false);
  });

  await test("bounded poller: immediate first tick, terminal stop, stale stop", async () => {
    const results: number[] = [];
    let calls = 0;
    const handle = startBoundedJobPoller({
      runId: 7,
      isCurrentRun: (id) => id === 7,
      fetchStatus: async () => {
        calls += 1;
        return { n: calls, terminal: calls >= 2 };
      },
      isTerminal: (v) => v.terminal,
      onResult: (v) => {
        results.push(v.n);
      },
      onTransientFailure: () => {
        assert.fail("unexpected transient");
      },
      onTerminalFailure: () => {
        assert.fail("unexpected terminal failure");
      },
      baseIntervalMs: 10,
      maxIntervalMs: 20,
      jitterRatio: 0,
      schedule: (fn, ms) => setTimeout(fn, ms),
      clearSchedule: (id) => clearTimeout(id),
      getHidden: () => false,
    });

    await new Promise((r) => setTimeout(r, 200));
    handle.stop();
    assert.ok(calls >= 2);
    assert.deepEqual(results, [1, 2]);
  });

  await test("bounded poller ignores stale run", async () => {
    let current = 1;
    let onResultCalls = 0;
    const handle = startBoundedJobPoller({
      runId: 1,
      isCurrentRun: (id) => id === current,
      fetchStatus: async () => {
        current = 2; // become stale mid-flight
        return { terminal: false };
      },
      isTerminal: () => false,
      onResult: () => {
        onResultCalls += 1;
      },
      onTransientFailure: () => undefined,
      onTerminalFailure: () => undefined,
      baseIntervalMs: 5,
      jitterRatio: 0,
    });
    await new Promise((r) => setTimeout(r, 100));
    handle.stop();
    assert.equal(onResultCalls, 0);
  });

  await test("dev QA page uses fake client + upload port with remount key", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/dev/headless-render-qa/page.tsx"),
      "utf8",
    );
    assert.ok(src.includes("FakeHeadlessRenderClient"));
    assert.ok(src.includes("FakeOwnedUploadAdapter"));
    assert.ok(src.includes("ownedUploadPort={uploadPort}"));
    assert.ok(src.includes("allowTestAuthority"));
    assert.ok(src.includes("key={`${mode}-${harnessEpoch}`}"));
    assert.ok(src.includes("not production"));
    assert.ok(src.includes("Force fail latest job"));
    assert.equal(src.includes("composeProductionHeadlessControlPlane"), false);
  });

  await test("recommended copy constants stable", () => {
    assert.ok(HEADLESS_EXPORT_INTRO.includes("dedicated worker"));
    assert.ok(HEADLESS_4K_DURATION_COPY.includes("60 seconds"));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
