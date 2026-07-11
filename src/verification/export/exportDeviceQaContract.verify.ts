/**
 * Sprint 6F — Device QA report contract.
 * Run: npm run test:export-device-qa-contract
 */
import assert from "node:assert/strict";

import {
  DEFAULT_MANUAL_QA_NOT_TESTED,
  EXPORT_BROWSER_SUPPORT_MATRIX,
  createExportDeviceQaReport,
  hasFreezeBlockingManualFailure,
  serializeExportDeviceQaReport,
} from "@/features/export/qa";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-device-qa-contract (Sprint 6F)\n");

test("QA report schema includes required fields", () => {
  const run = createExportDeviceQaReport({
    runId: "run-1",
    manifestFingerprint: "fp-abc",
    goldenId: "golden-a",
    evidenceClass: "automated-semantic",
    browser: "chrome",
    format: "webm",
    width: 720,
    height: 1280,
    projectDurationMs: 10_000,
    wallClockExportMs: 1200,
  });
  assert.equal(run.fps, 30);
  assert.equal(run.goldenId, "golden-a");
  assert.equal(run.manualChecks.playbackStarts, "not-tested");
  assert.ok(run.createdAtIso);
});

test("manual checks merge defaults", () => {
  const run = createExportDeviceQaReport({
    runId: "run-2",
    manifestFingerprint: "fp",
    goldenId: "golden-c",
    evidenceClass: "manual-device",
    browser: "chrome",
    format: "webm",
    width: 720,
    height: 1280,
    projectDurationMs: 20_000,
    wallClockExportMs: 5000,
    manualChecks: {
      playbackStarts: "pass",
      finalFrameVisible: "fail",
    },
  });
  assert.equal(run.manualChecks.playbackStarts, "pass");
  assert.equal(run.manualChecks.finalFrameVisible, "fail");
  assert.equal(run.manualChecks.seekingWorks, "not-tested");
  assert.deepEqual(
    { ...DEFAULT_MANUAL_QA_NOT_TESTED, playbackStarts: "pass", finalFrameVisible: "fail" },
    run.manualChecks,
  );
});

test("freeze blocker only when evidence exists and check fails", () => {
  const notTested = createExportDeviceQaReport({
    runId: "r3",
    manifestFingerprint: "fp",
    goldenId: "golden-a",
    evidenceClass: "not-tested",
    browser: "safari",
    format: "webm",
    width: 720,
    height: 1280,
    projectDurationMs: 1000,
    wallClockExportMs: 1,
    manualChecks: { playbackStarts: "fail" },
  });
  assert.equal(hasFreezeBlockingManualFailure(notTested), false);

  const failed = createExportDeviceQaReport({
    runId: "r4",
    manifestFingerprint: "fp",
    goldenId: "golden-a",
    evidenceClass: "manual-device",
    browser: "chrome",
    format: "webm",
    width: 720,
    height: 1280,
    projectDurationMs: 1000,
    wallClockExportMs: 1,
    manualChecks: { playbackStarts: "fail" },
  });
  assert.equal(hasFreezeBlockingManualFailure(failed), true);
});

test("serialize produces JSON", () => {
  const run = createExportDeviceQaReport({
    runId: "r5",
    manifestFingerprint: "fp",
    goldenId: "golden-b",
    evidenceClass: "local-artifact",
    browser: "chrome",
    format: "webm",
    width: 720,
    height: 1280,
    projectDurationMs: 1000,
    wallClockExportMs: 10,
  });
  const json = serializeExportDeviceQaReport(run);
  const parsed = JSON.parse(json);
  assert.equal(parsed.runId, "r5");
});

test("browser matrix is honest about evidence classes", () => {
  assert.ok(EXPORT_BROWSER_SUPPORT_MATRIX.length >= 3);
  const safari = EXPORT_BROWSER_SUPPORT_MATRIX.find((r) =>
    /Safari/i.test(r.browser),
  );
  assert.ok(safari);
  assert.equal(safari!.evidenceClass, "not-tested");
});

console.log(`\nexport-device-qa-contract: ${passed} passed\n`);
