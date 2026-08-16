/**
 * Export success-screen duration must match the rendered artifact clock.
 * Run via: npm run test:export-canonical-timing
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createDefaultShortForgeBrandSting } from "@/features/brand-sting";
import {
  buildExportManifest,
  resolveCanonicalExportSuccessDurationSec,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { resolveExportRenderEndMs } from "@/features/export/timing";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";
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

function qaStory(stingDurationMs?: number): FootieScript {
  const sceneDurationMs = 19_000;
  const sceneDurationSec = sceneDurationMs / 1000;
  const script = syncFootieScript({
    title: "QA duration",
    narration: "Hello world from a local certification fixture.",
    totalDuration: sceneDurationSec,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: sceneDurationMs,
    scenes: [
      {
        id: "scene-a",
        start: 0,
        end: sceneDurationSec,
        duration: sceneDurationSec,
        startMs: 0,
        endMs: sceneDurationMs,
        durationMs: sceneDurationMs,
        subtitle: "Hello world",
        narration: "Hello world from a local certification fixture.",
        captionMode: "subtitles",
        media: {
          type: "image",
          url: "https://example.com/qa.jpg",
          source: "upload",
        },
      },
    ],
  });
  if (stingDurationMs == null) {
    return script;
  }
  return {
    ...script,
    visualRetentionExtensions: {
      version: 1,
      shortForgeBrandSting: createDefaultShortForgeBrandSting(stingDurationMs),
    },
  };
}

function durationSec(story: FootieScript, stingEnabled: boolean): number {
  return resolveCanonicalExportSuccessDurationSec({
    story,
    environment: CAPABLE_ENV,
    audioMode: "silent",
    shortForgeBrandStingEnabled: stingEnabled,
  });
}

function main(): void {
  console.log("\nexport-success-duration\n");

  test("success duration equals resolveExportRenderEndMs for 2s/2.5s/3s Brand Stings", () => {
    for (const stingMs of [2000, 2500, 3000] as const) {
      const story = qaStory(stingMs);
      const manifest = buildExportManifest({
        story,
        environment: CAPABLE_ENV,
        audioMode: "silent",
        shortForgeBrandStingEnabled: true,
      });
      const displayed = durationSec(story, true);
      assert.equal(displayed, resolveExportRenderEndMs(manifest) / 1000);
      assert.equal(displayed, manifest.project.renderDurationMs / 1000);
    }
  });

  test("Brand Sting disabled preserves the old displayed duration", () => {
    const story = qaStory(2500);
    const preflight = prepareStoryForExport(story);
    const displayed = durationSec(story, false);
    assert.equal(displayed, preflight.exportDurationMs / 1000);
    assert.equal(displayed, preflight.masterTimeline.renderDurationMs / 1000);
  });

  test("QA artifact 19.8s without sting becomes 22.3s with a 2.5s Brand Sting", () => {
    const without = qaStory();
    const withSting = qaStory(2500);
    const oldDisplayed = durationSec(without, false);
    const newDisplayed = durationSec(withSting, true);
    assert.equal(formatDisplayDurationSec(oldDisplayed), "19.8s");
    assert.equal(formatDisplayDurationSec(newDisplayed), "22.3s");
    assert.equal(Math.round((newDisplayed - oldDisplayed) * 1000), 2500);
  });

  test("ExportPanel reuses the manifest duration authority and does not add sting locally", () => {
    const panel = readSrc("src/components/ExportPanel.tsx");
    assert.match(panel, /resolveCanonicalExportSuccessDurationSec/);
    assert.doesNotMatch(panel, /prepareStoryForExport\(exportScript\)/);
    assert.doesNotMatch(panel, /preflight\.exportDurationMs \/ 1000/);
    const durationCall = panel.slice(
      panel.indexOf("durationSec: resolveCanonicalExportSuccessDurationSec"),
      panel.indexOf("durationSec: resolveCanonicalExportSuccessDurationSec") + 800,
    );
    assert.match(durationCall, /shortForgeBrandStingEnabled/);
    assert.doesNotMatch(durationCall, /brandStingDurationMs\s*\+/);
    assert.doesNotMatch(durationCall, /contentEndMs\s*\+/);
    const helper = readSrc(
      "src/features/export/domain/resolve-canonical-export-success-duration.ts",
    );
    assert.match(helper, /buildExportManifest/);
    assert.match(helper, /resolveExportRenderEndMs/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
