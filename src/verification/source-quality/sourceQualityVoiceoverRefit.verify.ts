/**
 * Source-quality guidance after voiceover refit verification.
 * Run: npm run test:source-quality-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applyVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";
import { SOURCE_QUALITY_EXPORT_GUIDANCE_CODES } from "@/features/source-quality/adapters/resolve-source-quality-export-guidance";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { buildExportManifest } from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

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
  mp4EncoderAvailable: true,
};

function imageMedia(
  width: number,
  height: number,
  url: string,
): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    mimeType: "image/jpeg",
    width,
    height,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function seededScript(): FootieScript {
  let scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Short scene narration for export refit.",
  };
  for (let i = 0; i < 3; i += 1) {
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(640, 360, `https://example.com/${i}.jpg`),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => `m${i}`,
      },
    ).scene;
  }
  return {
    title: "Voiceover refit source quality",
    totalDuration: 6,
    narration: "Story narration",
    scenes: [scene],
    voiceoverUrl: "https://example.com/voice.mp3",
    // Longer voiceover forces export-time duration refit away from 6s editor scenes.
    voiceoverDurationMs: 12_000,
  };
}

function countCode(
  warnings: ReadonlyArray<{ code: string }>,
  code: string,
): number {
  return warnings.filter((warning) => warning.code === code).length;
}

async function main(): Promise<void> {
  console.log("\nSource quality voiceover refit\n");

  test("editor story remains immutable through prepareStoryForExport", () => {
    const story = seededScript();
    const before = JSON.stringify(story);
    prepareStoryForExport(story, { mixedMediaScenesEnabled: true });
    assert.equal(JSON.stringify(story), before);
  });

  await testAsync(
    "voiceover refit runs before guidance and does not mutate the editor story",
    async () => {
      const story = seededScript();
      const before = JSON.stringify(story);
      const prepared = await prepareExportRequest({
        story,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        sourceQualityExportTarget: "1080p",
        environment: CAPABLE_ENV,
      });
      assert.equal(JSON.stringify(story), before);
      assert.ok(
        (prepared.exportStory.scenes[0]?.durationMs ?? 0) >
          (story.scenes[0]?.durationMs ?? 0),
      );
      assert.ok(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
        ) >= 1,
      );
      const prepareSrc = readSrc(
        "src/features/export/domain/prepare-export-request.ts",
      );
      const storyPrepIndex = prepareSrc.indexOf("prepareStoryForExport(");
      const guidanceIndex = prepareSrc.indexOf(
        "resolveSourceQualityExportGuidance(",
      );
      assert.ok(storyPrepIndex >= 0);
      assert.ok(guidanceIndex > storyPrepIndex);
    },
  );

  await testAsync(
    "Visual pacing warnings remain exactly once beside source-quality",
    async () => {
      // Stable duration (no voiceover refit) so the draft stays draft, not stale.
      const stable = {
        ...seededScript(),
        voiceoverUrl: undefined,
        voiceoverDurationMs: undefined,
      };
      const suggested = suggestVisualBeatPlan(stable, {
        sceneId: "scene-1",
        density: "balanced",
        generatedAtIso: "2026-08-01T12:00:00.000Z",
        visualBeatDensityEnabled: true,
      });
      assert.equal(suggested.ok, true);
      if (!suggested.ok) return;
      // Leave draft unapplied so pacing emits DRAFT_NOT_APPLIED once.
      const prepared = await prepareExportRequest({
        story: suggested.script,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        sourceQualityExportTarget: "1080p",
        environment: CAPABLE_ENV,
      });
      assert.equal(
        countCode(prepared.preflight.warnings, "VISUAL_PACING_DRAFT_NOT_APPLIED"),
        1,
      );
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE,
        ),
        1,
      );
    },
  );

  await testAsync(
    "Browser and Headless receive identical final media windows after refit",
    async () => {
      const story = seededScript();
      const browser = await prepareExportRequest({
        story,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        sourceQualityExportTarget: "1080p",
        options: {
          exportSettings: {
            resolution: "1080x1920",
            format: "webm",
            quality: "standard",
            fileName: "sq",
          },
        },
        environment: CAPABLE_ENV,
      });
      const headless = await prepareExportRequest({
        story,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        sourceQualityExportTarget: "1080p",
        options: {
          exportSettings: {
            resolution: "1080x1920",
            format: "webm",
            quality: "standard",
            fileName: "sq",
          },
        },
        environment: CAPABLE_ENV,
      });
      assert.equal(browser.manifest.fingerprint, headless.manifest.fingerprint);
      assert.deepEqual(
        browser.preflight.warnings
          .filter((warning) => warning.code.startsWith("SOURCE_QUALITY_"))
          .map((warning) => warning.code),
        headless.preflight.warnings
          .filter((warning) => warning.code.startsWith("SOURCE_QUALITY_"))
          .map((warning) => warning.code),
      );
      // Applied pacing path still freezes ordinary windows only.
      const appliedPlan = suggestVisualBeatPlan(story, {
        sceneId: "scene-1",
        density: "balanced",
        generatedAtIso: "2026-08-01T12:00:00.000Z",
        visualBeatDensityEnabled: true,
      });
      assert.equal(appliedPlan.ok, true);
      if (!appliedPlan.ok) return;
      const applied = applyVisualBeatPlan(appliedPlan.script, {
        sceneId: "scene-1",
        selectedDensity: "balanced",
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      });
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const prepared = prepareStoryForExport(applied.script, {
        mixedMediaScenesEnabled: true,
      });
      const manifest = buildExportManifest({
        story: prepared.story,
        prepared,
        exportSettings: {
          fileName: "sq",
          format: "webm",
          quality: "standard",
          resolution: "1080x1920",
        },
        audioMode: "silent",
        includeBackgroundMusic: false,
        mixedMediaScenesEnabled: true,
        environment: CAPABLE_ENV,
      });
      assert.ok((manifest.scenes[0]?.mediaTimeline?.items.length ?? 0) >= 1);
    },
  );

  test("narration remains authoritative; music absent from source-quality path", () => {
    const adapter = readSrc(
      "src/features/source-quality/adapters/resolve-source-quality-export-guidance.ts",
    );
    assert.doesNotMatch(adapter, /backgroundMusic|musicUrl|voiceoverDuration/);
    assert.match(adapter, /assessSourceQuality/);
  });

  console.log(`\nSource quality voiceover refit: ${passed} PASS\n`);
}

void main();