/**
 * Sprint 6H — frame intermediate (JPEG) quality wiring.
 * Run: npm run test:export-frame-intermediate
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveExportVisualQualityProfile } from "@/features/export/domain";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-frame-intermediate (Sprint 6H)\n");

test("JPEG remains the intermediate; quality is resolution-aware and > 0.92 for 1080p", () => {
  const p1080 = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "high",
    bitrate: 8_000_000,
    width: 1080,
    height: 1920,
  });
  assert.equal(p1080.frameIntermediateFormat, "jpeg");
  assert.ok(p1080.frameIntermediateQuality > 0.92);
  assert.equal(p1080.frameIntermediateQuality, 0.97);
});

test("production chunk renderer consumes profile JPEG quality (not hardcoded 0.92)", () => {
  const source = read("src/features/export/chunking/render-export-chunk.ts");
  assert.match(source, /resolveExportVisualQualityProfile/);
  assert.match(source, /frameIntermediateQuality/);
  assert.match(source, /image\/jpeg/);
  assert.doesNotMatch(source, /JPEG_QUALITY\s*=\s*0\.92/);
  assert.doesNotMatch(source, /toDataURL/);
});

test("JPEG quality tiers are ordered: 720s < 720h ≤ 1080s < 1080h", () => {
  const q = (resolution: "720p" | "1080p", quality: "standard" | "high") =>
    resolveExportVisualQualityProfile({
      resolution,
      quality,
      bitrate: 4_000_000,
      width: resolution === "720p" ? 720 : 1080,
      height: resolution === "720p" ? 1280 : 1920,
    }).frameIntermediateQuality;

  assert.ok(q("720p", "standard") < q("720p", "high"));
  assert.ok(q("720p", "high") <= q("1080p", "standard"));
  assert.ok(q("1080p", "standard") < q("1080p", "high"));
});

console.log(`\nexport-frame-intermediate: ${passed} passed\n`);
