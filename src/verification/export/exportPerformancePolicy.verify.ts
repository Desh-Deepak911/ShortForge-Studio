/**
 * Sprint 6F / 6F.1 — 720p / 1080p performance policy.
 * Run: npm run test:export-performance-policy
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_1080P_PERFORMANCE_POLICY,
  EXPORT_720P_PERFORMANCE_POLICY,
  classifyExportCostAgainstPolicy,
} from "@/features/export/qa";
import {
  buildExportManifest,
  runExportCapabilityPreflight,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const CAPABLE: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

function story(resolution: "720x1280" | "1080x1920"): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 3,
    duration: 3,
    startMs: 0,
    endMs: 3000,
    durationMs: 3000,
    subtitle: "Perf",
    media: {
      type: "image" as const,
      url: "https://example.com/a.jpg",
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    image: {
      url: "https://example.com/a.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit" as const,
    },
  };
  return syncFootieScript({
    title: "Perf",
    narration: "Perf",
    totalDuration: 3,
    exportSettings: {
      fileName: "perf",
      format: "webm",
      quality: "standard",
      resolution,
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

console.log("\nexport-performance-policy (Sprint 6F.1)\n");

test("720p policy is approved with conservative thresholds", () => {
  assert.equal(EXPORT_720P_PERFORMANCE_POLICY.classification, "approved");
  assert.equal(EXPORT_720P_PERFORMANCE_POLICY.resolution, "720p");
  assert.ok(EXPORT_720P_PERFORMANCE_POLICY.maxProjectDurationMs >= 60_000);
});

test("1080p policy is capability-gated (not blanket blocked)", () => {
  assert.equal(
    EXPORT_1080P_PERFORMANCE_POLICY.classification,
    "approved-with-warning",
  );
  assert.match(
    EXPORT_1080P_PERFORMANCE_POLICY.rationale,
    /capability|Approved|warning|Blocked/i,
  );
});

test("classifyExportCostAgainstPolicy — 720p approved / warning / blocked", () => {
  assert.equal(
    classifyExportCostAgainstPolicy({
      resolution: "720p",
      projectDurationMs: 10_000,
      estimatedFrames: 300,
      videoSceneCount: 1,
      estimatedPeakMemoryBytes: 64 * 1024 * 1024,
    }),
    "approved",
  );

  assert.equal(
    classifyExportCostAgainstPolicy({
      resolution: "720p",
      projectDurationMs: EXPORT_720P_PERFORMANCE_POLICY.maxProjectDurationMs * 0.8,
      estimatedFrames: 1000,
      videoSceneCount: 2,
      estimatedPeakMemoryBytes: 100 * 1024 * 1024,
      durationClass: "long",
    }),
    "approved-with-warning",
  );

  assert.equal(
    classifyExportCostAgainstPolicy({
      resolution: "720p",
      projectDurationMs: EXPORT_720P_PERFORMANCE_POLICY.maxProjectDurationMs + 1,
      estimatedFrames: 1000,
      videoSceneCount: 2,
      estimatedPeakMemoryBytes: 100 * 1024 * 1024,
    }),
    "blocked",
  );
});

test("classifyExportCostAgainstPolicy — 1080p image short approved", () => {
  assert.equal(
    classifyExportCostAgainstPolicy({
      resolution: "1080p",
      projectDurationMs: 5_000,
      estimatedFrames: 150,
      videoSceneCount: 0,
      imageSceneCount: 3,
      sceneCount: 3,
      estimatedPeakMemoryBytes: 200 * 1024 * 1024,
      durationClass: "short",
    }),
    "approved",
  );
});

test("classifyExportCostAgainstPolicy — 1080p video-heavy long blocked", () => {
  assert.equal(
    classifyExportCostAgainstPolicy({
      resolution: "1080p",
      projectDurationMs: 50_000,
      estimatedFrames: 1500,
      videoSceneCount: 4,
      imageSceneCount: 0,
      sceneCount: 4,
      estimatedPeakMemoryBytes: 200 * 1024 * 1024,
      durationClass: "long",
    }),
    "blocked",
  );
});

test("short 1080p image-only is not preflight-blocked", () => {
  const prev = process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
  delete process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
  delete process.env.SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
  try {
    const manifest = buildExportManifest({
      story: story("1080x1920"),
      environment: CAPABLE,
    });
    assert.equal(manifest.output.resolution, "1080p");
    const preflight = runExportCapabilityPreflight(manifest);
    assert.equal(preflight.supported, true);
    assert.equal(preflight.renderer, "browser");
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
    } else {
      process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER = prev;
    }
  }
});

test("override env is NEXT_PUBLIC and centralized", () => {
  const override = read(
    "src/features/export/capabilities/export1080pOverride.ts",
  );
  assert.match(override, /NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER/);
  const cost = read("src/features/export/domain/export-cost-estimate.utils.ts");
  assert.match(cost, /is1080pBrowserOverrideEnabled/);
  assert.doesNotMatch(cost, /SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER ===/);
});

console.log(`\nexport-performance-policy: ${passed} passed\n`);
