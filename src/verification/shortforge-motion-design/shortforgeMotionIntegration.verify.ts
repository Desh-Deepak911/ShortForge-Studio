/**
 * Integrated CTA + outro stacking, duration, and capability isolation.
 * Run via: npm run test:shortforge-motion-contract
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createDefaultShortForgeBrandSting,
  enableBrandSting,
  resolveBrandStingFrame,
  resolveBrandStingLocalElapsedMs,
  resolveBrandStingTerminalElapsedMs,
  resolveBrandStingTimelineBounds,
} from "@/features/brand-sting";
import {
  resolveEngagementOverlayFrame,
} from "@/features/engagement-overlays";
import {
  buildExportManifest,
  isExportManifestV5,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { prepareExportFromManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function story(): FootieScript {
  const base = syncFootieScript({
    title: "Motion integration",
    narration: "Hello world",
    totalDuration: 4,
    scenes: [
      {
        id: "scene-a",
        start: 0,
        end: 4,
        duration: 4,
        startMs: 0,
        endMs: 4000,
        durationMs: 4000,
        subtitle: "Hello",
        narration: "Hello",
        media: {
          type: "image",
          url: "https://example.com/i.jpg",
          source: "upload",
        },
      },
    ],
  });
  return {
    ...base,
    visualRetentionExtensions: {
      version: 1,
      engagementOverlaysBySceneId: {
        "scene-a": [
          {
            version: 1,
            id: "cta",
            kind: "combined",
            startOffsetMs: 0,
            durationMs: 2500,
            position: "top-right",
            size: "medium",
            scale: 1,
            presetId: "compact-pill-v1",
          },
        ],
      },
      shortForgeBrandSting: createDefaultShortForgeBrandSting(2500),
    },
  };
}

console.log("\nshortforge-motion-integration\n");

test("preview and export suppress CTA, captions, and watermark over the active outro", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /watermarkEnabled=\{!brandStingActive\}/);
  assert.match(
    preview,
    /brandStingActive && script \? \([\s\S]*<BrandStingPreview[\s\S]*\/>\s*\) : \([\s\S]*EngagementOverlayPreview/,
  );
  assert.match(
    preview,
    /brandStingActive && script \? \([\s\S]*<BrandStingPreview[\s\S]*\/>\s*\) : \([\s\S]*SubtitleOverlay/,
  );

  const prepare = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  const brandBranch = prepare.slice(
    prepare.indexOf("if (brandStingFrame)"),
    prepare.indexOf("const scene = resolveExportSceneFrame(manifest, timestampMs)"),
  );
  assert.match(brandBranch, /captions: \[\]/);
  assert.doesNotMatch(brandBranch, /resolveExportCaptionFrames/);
  assert.doesNotMatch(brandBranch, /prepareExportSceneMediaFrame/);

  const draw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  const stingDraw = draw.slice(
    draw.indexOf("if (frame.brandSting)"),
    draw.indexOf("const transition = frame.transition"),
  );
  assert.match(stingDraw, /drawBrandSting/);
  assert.match(stingDraw, /return;/);
  assert.doesNotMatch(stingDraw, /drawEngagementOverlay|watermarkText|fillText/);
});

test("CTA never changes scene duration; Brand Sting adds only its trailing window", () => {
  const base = story();
  const overlay = base.visualRetentionExtensions?.engagementOverlaysBySceneId?.[
    "scene-a"
  ]?.[0];
  assert.ok(overlay);
  const cta = resolveEngagementOverlayFrame({
    overlay,
    sceneDurationMs: 4000,
    sceneElapsedMs: 1000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assert.equal(cta.visible, true);
  assert.equal(base.scenes[0]!.durationMs, 4000);

  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: 4000,
    endBufferMs: 250,
    brandStingDurationMs: 2500,
  });
  assert.equal(bounds.brandStingStartMs, 4000);
  assert.equal(bounds.brandStingEndMs, 6500);
  assert.equal(bounds.contentDurationMs, 6500);
  assert.equal(bounds.renderDurationMs, 6750);
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: 3999,
      narrationEndMs: 4000,
      durationMs: 2500,
    }),
    null,
  );
});

test("active outro prepared frames omit captions and engagement; terminal is unbranded", () => {
  const enabled = enableBrandSting(story(), {
    shortForgeBrandStingEnabled: true,
  }).script;
  const manifest = buildExportManifest({
    story: enabled,
    environment: CAPABLE_ENV,
    audioMode: "silent",
    shortForgeBrandStingEnabled: true,
    engagementOverlaysEnabled: true,
  });
  assert.equal(isExportManifestV5(manifest), true);
  assert.ok(isExportManifestV5(manifest) && manifest.brandSting);
  const plan = prepareExportFromManifest(manifest);
  assert.equal(plan.shortForgeBrandStingEnabled, true);
  assert.equal(plan.engagementOverlaysEnabled, true);

  const startMs = manifest.brandSting!.startMs;
  const holdLocal = resolveBrandStingLocalElapsedMs({
    absoluteTimeMs: startMs + 1200,
    narrationEndMs: startMs,
    durationMs: 2500,
  });
  assert.equal(holdLocal, 1200);
  const holdPlan = resolveBrandStingFrame({
    sting: createDefaultShortForgeBrandSting(2500),
    elapsedMs: holdLocal!,
  });
  assert.equal(holdPlan.visible, true);
  assert.equal(holdPlan.leadInDisplay, "MADE WITH");

  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: startMs + 2500,
      narrationEndMs: startMs,
      durationMs: 2500,
    }),
    null,
  );
  const terminalPlan = resolveBrandStingFrame({
    sting: createDefaultShortForgeBrandSting(2500),
    elapsedMs: resolveBrandStingTerminalElapsedMs(2500),
  });
  assert.equal(terminalPlan.visible, false);
});

test("legacy stories without either feature stay duration-stable", () => {
  const legacy = syncFootieScript({
    title: "Legacy",
    narration: "Hello",
    totalDuration: 4,
    scenes: [
      {
        id: "scene-a",
        start: 0,
        end: 4,
        duration: 4,
        startMs: 0,
        endMs: 4000,
        durationMs: 4000,
        subtitle: "Hello",
        narration: "Hello",
        media: {
          type: "image",
          url: "https://example.com/l.jpg",
          source: "upload",
        },
      },
    ],
  });
  assert.equal(legacy.visualRetentionExtensions, undefined);
  assert.equal(legacy.scenes[0]!.durationMs, 4000);
  const off = resolveBrandStingFrame({
    sting: undefined,
    elapsedMs: 1200,
  });
  assert.equal(off.visible, false);
  const missingCta = resolveEngagementOverlayFrame({
    overlay: undefined,
    sceneDurationMs: 4000,
    sceneElapsedMs: 1000,
  });
  assert.equal(missingCta.visible, false);
});

test("capability-off Brand Sting does not add duration or rewrite overlays", () => {
  const script = story();
  const refused = enableBrandSting(script, {
    shortForgeBrandStingEnabled: false,
  });
  assert.equal(refused.status, "terminal");
  assert.equal(
    JSON.stringify(refused.script.visualRetentionExtensions?.engagementOverlaysBySceneId),
    JSON.stringify(script.visualRetentionExtensions?.engagementOverlaysBySceneId),
  );
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: 4000,
    endBufferMs: 250,
    brandStingDurationMs: 0,
  });
  assert.equal(bounds.brandStingEndMs, 4000);
  assert.equal(bounds.contentDurationMs, 4000);
});

test("renderers stay provider-free and clock-free", () => {
  const files = [
    "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
    "src/features/engagement-overlays/render/draw-engagement-overlay.ts",
    "src/features/brand-sting/preview/BrandStingPreview.tsx",
    "src/features/brand-sting/render/draw-brand-sting.ts",
    "src/features/shortforge-motion-design/domain/shortforge-motion-palette.ts",
  ];
  for (const file of files) {
    const src = readSrc(file);
    assert.doesNotMatch(src, /Date\.now|Math\.random|requestAnimationFrame|fetch\(/);
    assert.doesNotMatch(src, /https?:\/\/(?!www\.w3\.org)/);
  }
});

console.log(`\n${passed} passed\n`);
