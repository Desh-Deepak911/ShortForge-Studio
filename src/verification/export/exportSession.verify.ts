/**
 * Sprint 6F.1 — ExportSession contract.
 * Run: npm run test:export-session
 */
import assert from "node:assert/strict";

import {
  beginExportSessionAttempt,
  cancelExportSession,
  closeExportSessionResult,
  completeExportSession,
  createExportSession,
  failExportSession,
  openExportSessionConfiguration,
  resolveExportAgainOptions,
  sessionOptionsToExportSettings,
  updateExportSessionOptions,
  type ExportSessionOptions,
} from "@/features/export/session";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const baseOptions: ExportSessionOptions = {
  format: "webm",
  resolution: "720x1280",
  quality: "standard",
  fileName: "short",
  includeNarration: true,
  includeBackgroundMusic: false,
};

console.log("\nexport-session (Sprint 6F.1)\n");

test("session stores options only — no manifest field", () => {
  const session = createExportSession(baseOptions);
  assert.equal(session.view, "configuration");
  assert.equal(session.status, "idle");
  assert.equal(session.lastSuccessfulOptions, null);
  assert.equal(session.lastArtifact, null);
  assert.ok(!("manifest" in session));
});

test("update options preserves last successful", () => {
  let session = createExportSession(baseOptions);
  session = completeExportSession(session, {
    options: baseOptions,
    artifact: { blob: new Blob(["x"]), fileName: "a.webm" },
    manifestFingerprint: "fp-1",
    renderer: "browser",
  });
  session = openExportSessionConfiguration(session);
  session = updateExportSessionOptions(session, {
    ...baseOptions,
    resolution: "1080x1920",
  });
  assert.equal(session.currentOptions.resolution, "1080x1920");
  assert.equal(session.lastSuccessfulOptions?.resolution, "720x1280");
});

test("Export Again resolves last successful options", () => {
  let session = createExportSession(baseOptions);
  session = completeExportSession(session, {
    options: baseOptions,
    artifact: { blob: new Blob(["x"]), fileName: "a.webm" },
    manifestFingerprint: "fp-1",
    renderer: "browser",
  });
  session = updateExportSessionOptions(session, {
    ...baseOptions,
    format: "mp4",
  });
  const again = resolveExportAgainOptions(session);
  assert.equal(again.format, "webm");
  assert.equal(session.currentOptions.format, "mp4");
});

test("close keeps options defaults", () => {
  let session = createExportSession(baseOptions);
  session = completeExportSession(session, {
    options: baseOptions,
    artifact: { blob: new Blob(["x"]), fileName: "a.webm" },
    manifestFingerprint: "fp-1",
    renderer: "browser",
  });
  session = closeExportSessionResult(session);
  assert.equal(session.view, "configuration");
  assert.equal(session.status, "idle");
  assert.equal(session.lastSuccessfulOptions?.fileName, "short");
  assert.deepEqual(sessionOptionsToExportSettings(session.currentOptions).resolution, "720x1280");
});

test("fail and cancel result views", () => {
  let session = beginExportSessionAttempt(createExportSession(baseOptions));
  session = failExportSession(session);
  assert.equal(session.status, "failed");
  assert.equal(session.view, "result");
  session = cancelExportSession(session);
  assert.equal(session.status, "cancelled");
});

console.log(`\nexport-session: ${passed} passed\n`);
