/**
 * Sprint 6D — chunk segment encoding contract.
 * Run: npm run test:export-chunk-encoding
 */
import assert from "node:assert/strict";

import {
  assertExportSegmentEncodeArgs,
  buildExportSegmentEncodeArgs,
  EXPORT_SEGMENT_BITRATE,
  EXPORT_SEGMENT_CODEC,
  validateEncodedExportChunk,
} from "@/features/export/chunking";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-chunk-encoding (Sprint 6D)\n");

test("dynamic FPS from input", () => {
  const args30 = buildExportSegmentEncodeArgs({
    outputFile: "segment-000.webm",
    fps: 30,
    frameCount: 120,
  });
  const args24 = buildExportSegmentEncodeArgs({
    outputFile: "segment-000.webm",
    fps: 24,
    frameCount: 120,
  });
  assert.equal(args30[args30.indexOf("-framerate") + 1], "30");
  assert.equal(args24[args24.indexOf("-framerate") + 1], "24");
});

test("exact frame count limit", () => {
  const args = buildExportSegmentEncodeArgs({
    outputFile: "segment-000.webm",
    fps: 30,
    frameCount: 90,
  });
  assert.equal(args[args.indexOf("-frames:v") + 1], "90");
});

test("identical codec settings across chunks", () => {
  const a = buildExportSegmentEncodeArgs({
    outputFile: "segment-000.webm",
    fps: 30,
    frameCount: 120,
  });
  const b = buildExportSegmentEncodeArgs({
    outputFile: "segment-001.webm",
    fps: 30,
    frameCount: 80,
  });
  const profileKeys = ["-c:v", "-b:v", "-pix_fmt", "-deadline", "-cpu-used", "-auto-alt-ref"];
  for (const key of profileKeys) {
    assert.equal(a[a.indexOf(key) + 1], b[b.indexOf(key) + 1], key);
  }
  assert.equal(a[a.indexOf("-c:v") + 1], EXPORT_SEGMENT_CODEC);
  assert.equal(a[a.indexOf("-b:v") + 1], EXPORT_SEGMENT_BITRATE);
});

test("keyframe policy at segment start", () => {
  const args = buildExportSegmentEncodeArgs({
    outputFile: "segment-000.webm",
    fps: 30,
    frameCount: 120,
  });
  const check = assertExportSegmentEncodeArgs(args);
  assert.equal(check.hasKeyframePolicy, true);
  assert.equal(args[args.indexOf("-g") + 1], "120");
  assert.equal(args[args.indexOf("-keyint_min") + 1], "120");
});

test("validation rejects missing / tiny segments", () => {
  const descriptor = {
    chunkIndex: 0,
    globalStartFrame: 0,
    globalEndFrameExclusive: 120,
    frameCount: 120,
    startTimestampMs: 0,
    endTimestampMs: 3950,
    outputPath: "segment-000.webm",
  };
  assert.equal(
    validateEncodedExportChunk({
      descriptor,
      byteSize: 0,
      fps: 30,
      exists: false,
    }).ok,
    false,
  );
  assert.equal(
    validateEncodedExportChunk({
      descriptor,
      byteSize: 10,
      fps: 30,
      exists: true,
    }).ok,
    false,
  );
  assert.equal(
    validateEncodedExportChunk({
      descriptor,
      byteSize: 50_000,
      fps: 30,
      exists: true,
    }).ok,
    true,
  );
});

test("encode args use framerate authority only", () => {
  const args = buildExportSegmentEncodeArgs({
    outputFile: "out.webm",
    fps: 30,
    frameCount: 60,
  });
  const check = assertExportSegmentEncodeArgs(args);
  assert.equal(check.hasFramerateInput, true);
  assert.equal(check.hasFrameCountLimit, true);
  assert.equal(check.hasVideoOnly, true);
  assert.equal(check.hasLibvpx, true);
  assert.equal(check.identicalCodecProfile, true);
  assert.ok(!args.includes("-r"));
  assert.ok(!args.some((a) => a.includes("setpts")));
});

console.log(`\n${passed} tests passed.\n`);
