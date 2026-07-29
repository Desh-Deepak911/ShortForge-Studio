/**
 * Sprint 6F.1 — 1080p capability + NEXT_PUBLIC developer override.
 * Run: npm run test:export-1080p-capability
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_1080P_BROWSER_OVERRIDE_ENV,
  EXPORT_1080P_OVERRIDE_WARNING_MESSAGE,
  is1080pBrowserOverrideEnabled,
} from "@/features/export/capabilities";
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

function withOverrideEnv(value: string | undefined, fn: () => void) {
  const key = EXPORT_1080P_BROWSER_OVERRIDE_ENV;
  const prev = process.env[key];
  const prevLegacy = process.env.SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
  try {
    delete process.env.SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
    if (prevLegacy === undefined) {
      delete process.env.SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER;
    } else {
      process.env.SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER = prevLegacy;
    }
  }
}

function imageStory(resolution: "720x1280" | "1080x1920"): FootieScript {
  const scene = {
    id: "img-1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Image only",
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
    title: "Image 1080",
    narration: "Image only",
    totalDuration: 4,
    exportSettings: {
      fileName: "image-1080",
      format: "webm",
      quality: "standard",
      resolution,
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

function longVideoHeavyStory(): FootieScript {
  const scenes = [0, 1, 2, 3].map((i) => {
    const startMs = i * 10_000;
    return {
      id: `vid-${i}`,
      start: startMs / 1000,
      end: (startMs + 10_000) / 1000,
      duration: 10,
      startMs,
      endMs: startMs + 10_000,
      durationMs: 10_000,
      subtitle: `Video ${i + 1}`,
      media: {
        type: "video" as const,
        url: `https://example.com/v${i}.mp4`,
        source: "upload" as const,
        durationMs: 20_000,
        trimStartMs: 0,
        trimEndMs: 10_000,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        fitMode: "cover" as const,
      },
    };
  });
  return syncFootieScript({
    title: "Long Video Heavy",
    narration: scenes.map((s) => s.subtitle).join(". "),
    totalDuration: 40,
    exportSettings: {
      fileName: "long-video-heavy",
      format: "webm",
      quality: "high",
      resolution: "1080x1920",
    },
    scenes,
    timelineItems: scenes.map((scene) => ({
      id: `ti-${scene.id}`,
      type: "scene" as const,
      scene,
    })),
  });
}

console.log("\nexport-1080p-capability (Sprint 6F.1 override fix)\n");

test("720p remains production approved", () => {
  withOverrideEnv(undefined, () => {
    const manifest = buildExportManifest({
      story: imageStory("720x1280"),
      environment: CAPABLE,
    });
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.supported, true);
    assert.equal(result.renderer, "browser");
  });
});

test("1080p image-heavy short is approved (not blanket blocked)", () => {
  withOverrideEnv(undefined, () => {
    const manifest = buildExportManifest({
      story: imageStory("1080x1920"),
      environment: CAPABLE,
    });
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.renderer, "browser");
    assert.equal(result.blockers.length, 0);
  });
});

test("flag missing → normal 1080p policy applies (video-heavy long warns)", () => {
  withOverrideEnv(undefined, () => {
    assert.equal(is1080pBrowserOverrideEnabled(), false);
    const result = runExportCapabilityPreflight(
      buildExportManifest({
        story: longVideoHeavyStory(),
        environment: CAPABLE,
      }),
    );
    assert.equal(result.renderer, "browser");
    assert.equal(result.supported, true);
    assert.equal(result.blockers.length, 0);
    assert.ok(
      result.warnings.some((w) => w.code === "RESOLUTION_PERFORMANCE_WARNING"),
    );
    assert.match(
      result.warnings.find((w) => w.code === "RESOLUTION_PERFORMANCE_WARNING")!
        .message,
      /Keep this tab open/i,
    );
    assert.doesNotMatch(JSON.stringify(result.blockers), /SERVER_RENDERER_REQUIRED/);
  });
});

test("flag 0 → normal policy applies with warning", () => {
  withOverrideEnv("0", () => {
    assert.equal(is1080pBrowserOverrideEnabled(), false);
    const result = runExportCapabilityPreflight(
      buildExportManifest({
        story: longVideoHeavyStory(),
        environment: CAPABLE,
      }),
    );
    assert.equal(result.renderer, "browser");
    assert.equal(result.supported, true);
  });
});

test("flag 1 → 1080p memory blocker bypassed with DEV warning", () => {
  withOverrideEnv("1", () => {
    assert.equal(is1080pBrowserOverrideEnabled(), true);
    const result = runExportCapabilityPreflight(
      buildExportManifest({
        story: longVideoHeavyStory(),
        environment: CAPABLE,
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.renderer, "browser");
    assert.equal(result.blockers.length, 0);
    assert.ok(
      result.warnings.some((w) => w.code === "DEV_1080P_OVERRIDE"),
    );
    assert.match(
      result.warnings.find((w) => w.code === "DEV_1080P_OVERRIDE")!.message,
      /experimental developer mode/i,
    );
    assert.doesNotMatch(
      JSON.stringify(result.blockers),
      /SERVER_RENDERER_REQUIRED|UNSAFE_MEMORY_ESTIMATE/,
    );
  });
});

test("legacy non-public env alone does not enable override", () => {
  withOverrideEnv(undefined, () => {
    process.env.SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER = "1";
    assert.equal(is1080pBrowserOverrideEnabled(), false);
  });
});

test("override does not bypass missing-media blocker", () => {
  withOverrideEnv("1", () => {
    const story = imageStory("1080x1920");
    story.scenes[0]!.media = { type: "placeholder" };
    delete story.scenes[0]!.image;
    const result = runExportCapabilityPreflight(
      buildExportManifest({ story, environment: CAPABLE }),
    );
    assert.ok(result.blockers.some((b) => b.code === "MISSING_MEDIA"));
    assert.equal(result.renderer, "blocked");
    assert.equal(result.supported, false);
  });
});

test("override does not bypass codec / format probe blocker", () => {
  withOverrideEnv("1", () => {
    const story = imageStory("1080x1920");
    story.exportSettings = {
      ...story.exportSettings!,
      format: "mp4",
    };
    const result = runExportCapabilityPreflight(
      buildExportManifest({
        story,
        environment: { ...CAPABLE, mp4EncoderAvailable: false },
      }),
    );
    assert.ok(result.blockers.some((b) => b.code === "UNSUPPORTED_FORMAT"));
    assert.equal(result.supported, false);
  });
});

test("UI maps ready-with-warnings so export stays enabled for resource warnings", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.match(panel, /ready-with-warnings/);
  assert.match(panel, /capabilityBlocked/);
  assert.match(panel, /Browser export supports 720p and 1080p/i);
  assert.match(panel, /4K is available[\s\S]*Headless/i);
  // Blocked only for blocked/server-required/checking — not ready-with-warnings.
  assert.match(
    panel,
    /capabilityPreflightStatus === "blocked"[\s\S]*server-required[\s\S]*checking/,
  );
  assert.equal(
    EXPORT_1080P_OVERRIDE_WARNING_MESSAGE.includes("experimental developer mode"),
    true,
  );
});

test("central helper is the sole env reader", () => {
  const overrideSrc = read(
    "src/features/export/capabilities/export1080pOverride.ts",
  );
  assert.match(overrideSrc, /NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER/);
  const approval = read(
    "src/features/export/capabilities/resolutionApproval.ts",
  );
  assert.doesNotMatch(approval, /process\.env\.NEXT_PUBLIC_SHORTFORGE/);
  assert.doesNotMatch(approval, /process\.env\.SHORTFORGE_EXPORT_ALLOW_1080P/);
  const cost = read("src/features/export/domain/export-cost-estimate.utils.ts");
  assert.doesNotMatch(cost, /SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER ===/);
});

console.log(`\nexport-1080p-capability: ${passed} passed\n`);
