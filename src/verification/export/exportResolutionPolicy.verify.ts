/**
 * Sprint 6F.1 — Resolution policy classifications.
 * Run: npm run test:export-resolution-policy
 */
import assert from "node:assert/strict";

import {
  EXPORT_1080P_RESOLUTION_POLICY,
  EXPORT_720P_RESOLUTION_POLICY,
  approveExportResolution,
  type ExportDeviceCapabilityEstimate,
} from "@/features/export/capabilities";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function estimate(
  partial: Partial<ExportDeviceCapabilityEstimate> &
    Pick<ExportDeviceCapabilityEstimate, "resolution">,
): ExportDeviceCapabilityEstimate {
  return {
    projectDurationMs: 10_000,
    estimatedFrames: 300,
    sceneCount: 3,
    mediaItemCount: 3,
    videoMediaItemCount: 0,
    imageMediaItemCount: 3,
    videoSceneCount: 0,
    imageSceneCount: 3,
    estimatedPeakMemoryBytes: 200 * 1024 * 1024,
    estimatedChunkCount: 3,
    chunkSizeFrames: 120,
    durationClass: "short",
    rendererVersion: "chunked-browser-v1",
    browserName: "chrome",
    browserApisReady: true,
    ...partial,
  };
}

console.log("\nexport-resolution-policy (Sprint 6F.1)\n");

test("720p production default is approved", () => {
  assert.equal(EXPORT_720P_RESOLUTION_POLICY.productionDefault, "approved");
  const result = approveExportResolution({ estimate: estimate({ resolution: "720p" }) });
  assert.equal(result.classification, "approved");
});

test("1080p image-heavy short is approved", () => {
  const result = approveExportResolution({
    estimate: estimate({
      resolution: "1080p",
      videoSceneCount: 0,
      imageSceneCount: 4,
      sceneCount: 4,
      durationClass: "short",
    }),
  });
  assert.equal(result.classification, "approved");
});

test("1080p mixed is approved-with-warning", () => {
  const result = approveExportResolution({
    estimate: estimate({
      resolution: "1080p",
      videoSceneCount: 1,
      imageSceneCount: 2,
      sceneCount: 3,
      mediaItemCount: 3,
      videoMediaItemCount: 1,
      imageMediaItemCount: 2,
      durationClass: "short",
    }),
  });
  assert.equal(result.classification, "approved-with-warning");
});

test("1080p video-heavy long is approved-with-warning (2G.24B)", () => {
  const result = approveExportResolution({
    estimate: estimate({
      resolution: "1080p",
      videoSceneCount: 4,
      imageSceneCount: 0,
      sceneCount: 4,
      projectDurationMs: 50_000,
      estimatedFrames: 1500,
      durationClass: "long",
    }),
  });
  assert.equal(result.classification, "approved-with-warning");
  assert.match(result.message, /Keep this tab open/i);
  assert.match(result.message, /Headless/i);
  assert.ok(
    result.reasons.some((reason) =>
      ["video-heavy-non-short", "long-with-video", "duration-exceeded"].includes(
        reason,
      ),
    ),
  );
});

test("1080p peak-memory-unsafe remains blocked", () => {
  const result = approveExportResolution({
    estimate: estimate({
      resolution: "1080p",
      estimatedPeakMemoryBytes: 520 * 1024 * 1024,
    }),
  });
  assert.equal(result.classification, "blocked");
  assert.ok(result.reasons.includes("peak-memory-unsafe"));
  assert.match(result.message, /720p browser export/);
});

test("developer override bypasses 1080p block with warning", () => {
  const result = approveExportResolution({
    estimate: estimate({
      resolution: "1080p",
      videoSceneCount: 4,
      imageSceneCount: 0,
      sceneCount: 4,
      projectDurationMs: 60_000,
      durationClass: "long",
    }),
    allow1080Override: true,
  });
  assert.equal(result.classification, "approved-with-warning");
  assert.equal(result.overrideApplied, true);
  assert.match(result.message, /experimental developer mode/i);
  assert.deepEqual(result.reasons, ["DEV_1080P_OVERRIDE"]);
});

console.log(`\nexport-resolution-policy: ${passed} passed\n`);
