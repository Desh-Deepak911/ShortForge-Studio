/**
 * Sprint 11E Phase 2G.24B — Browser 1080p capability restoration.
 * Run: npm run test:export-browser-1080p-capability-restored
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_1080P_WARNING_USER_MESSAGE,
  approveExportResolution,
} from "@/features/export/capabilities";
import {
  buildExportManifest,
  estimateExportCost,
  runExportCapabilityPreflight,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { evaluateHeadlessOutputCompatibility } from "@/features/headless-renderer/product/snapshot/output-compatibility";
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

function imageScene(durationSec: number, id = "img-1") {
  const durationMs = durationSec * 1000;
  return {
    id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Image",
    media: {
      type: "image" as const,
      url: `https://example.com/${id}.jpg`,
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit" as const,
    },
  };
}

function buildStory(input: {
  resolution: "720x1280" | "1080x1920";
  format: "webm" | "mp4";
  durationSec: number;
  scenes?: FootieScript["scenes"];
}): FootieScript {
  const scene = imageScene(input.durationSec);
  const scenes = input.scenes ?? [scene];
  return syncFootieScript({
    title: "Browser export QA",
    narration: "Browser export QA",
    totalDuration: input.durationSec,
    exportSettings: {
      fileName: "browser-export-qa",
      format: input.format,
      quality: "standard",
      resolution: input.resolution,
    },
    scenes,
    timelineItems: scenes.map((s) => ({
      id: `ti-${s.id}`,
      type: "scene" as const,
      scene: s,
    })),
  });
}

function videoScenes(count: number, sceneDurationSec = 10) {
  return Array.from({ length: count }, (_, i) => {
    const startMs = i * sceneDurationSec * 1000;
    const durationMs = sceneDurationSec * 1000;
    return {
      id: `vid-${i}`,
      start: startMs / 1000,
      end: (startMs + durationMs) / 1000,
      duration: sceneDurationSec,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      subtitle: `Video ${i + 1}`,
      media: {
        type: "video" as const,
        url: `https://example.com/v${i}.mp4`,
        source: "upload" as const,
        durationMs: durationMs * 2,
        trimStartMs: 0,
        trimEndMs: durationMs,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        fitMode: "cover" as const,
      },
    };
  });
}

function preflight(story: FootieScript, env: Partial<ExportEnvironmentSnapshot> = CAPABLE) {
  return runExportCapabilityPreflight(buildExportManifest({ story, environment: env }));
}

console.log("\nexport-browser-1080p-capability-restored (Sprint 11E 2G.24B)\n");

test("1. Browser 720p WebM short workload → approved", () => {
  const result = preflight(buildStory({ resolution: "720x1280", format: "webm", durationSec: 8 }));
  assert.equal(result.renderer, "browser");
  assert.equal(result.supported, true);
  assert.equal(result.blockers.length, 0);
});

test("2. Browser 720p MP4 with supported capability → approved", () => {
  const result = preflight(buildStory({ resolution: "720x1280", format: "mp4", durationSec: 8 }));
  assert.equal(result.renderer, "browser");
  assert.equal(result.supported, true);
});

test("3. Browser 1080p still-image workload → approved", () => {
  const result = preflight(buildStory({ resolution: "1080x1920", format: "webm", durationSec: 8 }));
  assert.equal(result.renderer, "browser");
  assert.equal(result.blockers.length, 0);
});

test("4. Browser 1080p long-with-video → approved with warning", () => {
  const scenes = videoScenes(4, 10);
  const story = buildStory({
    resolution: "1080x1920",
    format: "webm",
    durationSec: 40,
    scenes,
  });
  const result = preflight(story);
  assert.equal(result.renderer, "browser");
  assert.equal(result.supported, true);
  assert.ok(result.warnings.some((w) => w.code === "RESOLUTION_PERFORMANCE_WARNING"));
});

test("5. Browser 1080p video-heavy non-short → approved with warning", () => {
  const scenes = videoScenes(3, 10);
  const story = buildStory({
    resolution: "1080x1920",
    format: "webm",
    durationSec: 30,
    scenes,
  });
  const result = preflight(story);
  assert.equal(result.renderer, "browser");
  assert.ok(result.warnings.some((w) => w.code === "RESOLUTION_PERFORMANCE_WARNING"));
});

test("6. Browser 1080p duration-exceeded but otherwise safe → approved with warning", () => {
  const story = buildStory({ resolution: "1080x1920", format: "webm", durationSec: 50 });
  const result = preflight(story);
  assert.equal(result.renderer, "browser");
  assert.ok(result.warnings.some((w) => w.code === "RESOLUTION_PERFORMANCE_WARNING"));
});

test("7. Browser 1080p peak-memory-unsafe → blocked", () => {
  const approval = approveExportResolution({
    estimate: {
      projectDurationMs: 10_000,
      estimatedFrames: 300,
      sceneCount: 1,
      mediaItemCount: 1,
      videoMediaItemCount: 0,
      imageMediaItemCount: 1,
      videoSceneCount: 0,
      imageSceneCount: 1,
      estimatedPeakMemoryBytes: 520 * 1024 * 1024,
      estimatedChunkCount: 1,
      chunkSizeFrames: 120,
      durationClass: "short",
      rendererVersion: "chunked-browser-v1",
      browserName: "chrome",
      browserApisReady: true,
      resolution: "1080p",
    },
  });
  assert.equal(approval.classification, "blocked");
  assert.ok(approval.reasons.includes("peak-memory-unsafe"));
});

test("8. Browser 1080p estimatedCost.risk === unsafe → blocked", () => {
  const story = buildStory({ resolution: "1080x1920", format: "webm", durationSec: 90 });
  const manifest = buildExportManifest({ story, environment: CAPABLE });
  assert.equal(estimateExportCost(manifest).risk, "unsafe");
  const result = runExportCapabilityPreflight(manifest);
  assert.equal(result.renderer, "blocked");
  assert.ok(result.blockers.some((b) => b.code === "UNSAFE_MEMORY_ESTIMATE"));
});

test("9. Browser MP4 without runtime support → blocked", () => {
  const story = buildStory({ resolution: "720x1280", format: "mp4", durationSec: 8 });
  const result = preflight(story, { ...CAPABLE, mp4EncoderAvailable: false });
  assert.equal(result.supported, false);
  assert.ok(result.blockers.some((b) => b.code === "UNSUPPORTED_FORMAT"));
});

test("10. Browser 4K → blocked and directed to Headless", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.doesNotMatch(panel, /option value=\"4k\"/i);
  assert.match(panel, /4K is available[\s\S]*Headless/i);
  const headless4k = evaluateHeadlessOutputCompatibility({
    resolution: "4k",
    format: "webm",
    contentDurationMs: 30_000,
    renderDurationMs: 30_400,
  });
  assert.equal(headless4k.allowed, true);
});

test("11. Headless 720p/1080p/4K behavior unchanged", () => {
  for (const resolution of ["720p", "1080p", "4k"] as const) {
    const compat = evaluateHeadlessOutputCompatibility({
      resolution,
      format: "webm",
      contentDurationMs: 30_000,
      renderDurationMs: 30_400,
    });
    assert.equal(compat.allowed, true, resolution);
  }
});

test("12. Browser 1080p does not require server-renderer availability", () => {
  const scenes = videoScenes(4, 10);
  const story = buildStory({
    resolution: "1080x1920",
    format: "webm",
    durationSec: 40,
    scenes,
  });
  const result = preflight(story, { ...CAPABLE, serverRendererAvailable: false });
  assert.equal(result.renderer, "browser");
  assert.doesNotMatch(JSON.stringify(result.blockers), /SERVER_RENDERER_REQUIRED/);
});

test("13. Browser 1080p selection is not automatically changed to Headless", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.doesNotMatch(panel, /setExportRenderer\(["']headless["']\)/);
  assert.match(panel, /exportRenderer === "browser"/);
});

test("14. Warning text distinguishes local browser work from Headless", () => {
  assert.match(EXPORT_1080P_WARNING_USER_MESSAGE, /device resources/i);
  assert.match(EXPORT_1080P_WARNING_USER_MESSAGE, /Keep this tab open/i);
  assert.match(EXPORT_1080P_WARNING_USER_MESSAGE, /Headless/i);
  assert.match(EXPORT_1080P_WARNING_USER_MESSAGE, /background/i);
});

test("15. Existing Browser 720p functionality remains unchanged", () => {
  const story = buildStory({ resolution: "720x1280", format: "webm", durationSec: 30 });
  const result = preflight(story);
  assert.equal(result.renderer, "browser");
  assert.equal(result.supported, true);
  assert.equal(result.blockers.length, 0);
});

console.log(`\nexport-browser-1080p-capability-restored: ${passed} passed\n`);
