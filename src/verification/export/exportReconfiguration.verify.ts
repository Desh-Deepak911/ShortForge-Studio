/**
 * Sprint 6F.1 — Export reconfiguration UX contract.
 * Run: npm run test:export-reconfiguration
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-reconfiguration (Sprint 6F.1)\n");

test("result screen exposes Download, Export Again, Change Settings, Close", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.match(panel, /ExportDownloadAgainButton/);
  assert.match(panel, /handleExportAgain/);
  assert.match(panel, /ChangeExportSettingsButton/);
  assert.match(panel, /CloseExportResultButton/);
  assert.match(panel, /openExportSessionConfiguration/);
  assert.match(panel, /closeExportSessionResult/);
});

test("failed and cancelled result screens support Change Settings", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.match(panel, /status === "failed"/);
  assert.match(panel, /status === "cancelled"/);
  assert.match(panel, /Resume is not supported/);
  assert.match(panel, /Export failed/);
});

test("Export Again builds fresh manifest path — no manifest reuse", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.match(panel, /Every attempt builds a fresh ExportManifest/);
  assert.match(panel, /exportFootieShort/);
  assert.doesNotMatch(panel, /reuseManifest|cachedManifest|lastManifest\s*=/);
  const session = read("src/features/export/session/export-session.types.ts");
  assert.doesNotMatch(session, /readonly manifest:/);
  assert.match(session, /Never stores ExportManifest/);
});

test("configuration remains reachable from result", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.match(panel, /handleChangeExportSettings/);
  assert.match(panel, /view === "configuration"/);
});

test("success summary buttons exist", () => {
  const summary = read("src/components/export/ExportSuccessSummary.tsx");
  assert.match(summary, /ChangeExportSettingsButton/);
  assert.match(summary, /CloseExportResultButton/);
});

console.log(`\nexport-reconfiguration: ${passed} passed\n`);
