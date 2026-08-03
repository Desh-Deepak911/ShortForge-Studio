/**
 * Source-quality Browser/Headless render-compatibility verification.
 * Authoring capability must not become a renderer requirement.
 * Run: npm run test:source-quality-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
  prepareExportRequest,
  runExportCapabilityPreflight,
} from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

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
  options: { readonly url?: string; readonly scale?: number } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width,
    height,
    fitMode: "cover",
    transform: {
      x: 0,
      y: 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function scriptWithMedia(media: SceneMedia): FootieScript {
  const scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Narration line.",
    media,
    image: {
      url: media.url!,
      fitMode: "fill",
      x: 0,
      y: 0,
      scale: media.transform?.scale ?? 1,
      rotation: 0,
    },
  };
  return syncFootieScript({
    title: "SQ render compatibility",
    narration: "Story",
    totalDuration: 6,
    scenes: [scene],
    exportSettings: {
      fileName: "sq-compat",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

async function main(): Promise<void> {
  console.log("\nSource quality render compatibility\n");

  test("ExportManifest remains version 4 and excludes provenance/guidance", () => {
    assert.equal(EXPORT_MANIFEST_VERSION, 4);
    const types = readSrc("src/features/export/domain/export-manifest.types.ts");
    assert.doesNotMatch(types, /SOURCE_QUALITY_|sourceQualityAdjustmentProvenance/);
    const build = readSrc("src/features/export/domain/build-export-manifest.ts");
    assert.doesNotMatch(build, /resolveSourceQualityExportGuidance|SOURCE_QUALITY_/);
  });

  await testAsync(
    "media-window parity remains unchanged with source-quality guidance on",
    async () => {
      let scene: FootieScene = {
        id: "scene-1",
        start: 0,
        end: 6,
        duration: 6,
        startMs: 0,
        endMs: 6_000,
        durationMs: 6_000,
        subtitle: "Fallback",
        narration: "Narration line.",
      };
      scene = appendMixedMediaSequenceItem(
        scene,
        imageMedia(1080, 1920, { url: "https://example.com/a.jpg" }),
        { mixedMediaScenesEnabled: true, generateId: () => "a" },
      ).scene;
      scene = appendMixedMediaSequenceItem(
        scene,
        imageMedia(900, 1600, { url: "https://example.com/b.jpg" }),
        { mixedMediaScenesEnabled: true, generateId: () => "b" },
      ).scene;
      const story = syncFootieScript({
        title: "Windows parity",
        narration: "Story",
        totalDuration: 6,
        scenes: [scene],
      });
      const prepared = prepareStoryForExport(story, {
        mixedMediaScenesEnabled: true,
      });
      const off = await prepareExportRequest({
        story,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        sourceQualityIntelligenceEnabled: false,
        environment: CAPABLE_ENV,
      });
      const on = await prepareExportRequest({
        story,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        sourceQualityExportTarget: "1080p",
        environment: CAPABLE_ENV,
      });
      assert.equal(off.manifest.fingerprint, on.manifest.fingerprint);
      assert.deepEqual(
        off.manifest.scenes.map((entry) => entry.mediaTimeline?.items?.length),
        on.manifest.scenes.map((entry) => entry.mediaTimeline?.items?.length),
      );
      assert.equal(prepared.story.scenes[0]!.visualSequence?.items.length, 2);
    },
  );

  test("provenance-only changes do not alter ExportManifest version/fingerprint/windows", () => {
    const story = scriptWithMedia(imageMedia(1080, 1920, { scale: 1 }));
    const withProvenance: FootieScript = {
      ...story,
      scenes: [
        {
          ...story.scenes[0]!,
          media: {
            ...story.scenes[0]!.media!,
            sourceQualityAdjustmentProvenance: {
              version: 1,
              recommendationFingerprint: "abc",
              mediaFingerprint: "def",
              recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
              previousFraming: {
                fitMode: "fill",
                positionX: 0,
                positionY: 0,
                zoom: 1.4,
                rotationDeg: 0,
              },
              appliedFraming: {
                fitMode: "fill",
                positionX: 0,
                positionY: 0,
                zoom: 1,
                rotationDeg: 0,
              },
              mediaItemId: null,
            },
          },
        },
      ],
    };
    const preparedBase = prepareStoryForExport(story);
    const preparedProv = prepareStoryForExport(withProvenance);
    const manifestBase = buildExportManifest({
      story: preparedBase.story,
      prepared: preparedBase,
      exportSettings: {
        fileName: "sq",
        format: "webm",
        quality: "standard",
        resolution: "1080x1920",
      },
      audioMode: "silent",
      includeBackgroundMusic: false,
      environment: CAPABLE_ENV,
    });
    const manifestProv = buildExportManifest({
      story: preparedProv.story,
      prepared: preparedProv,
      exportSettings: {
        fileName: "sq",
        format: "webm",
        quality: "standard",
        resolution: "1080x1920",
      },
      audioMode: "silent",
      includeBackgroundMusic: false,
      environment: CAPABLE_ENV,
    });
    assert.equal(manifestBase.version, 4);
    assert.equal(manifestProv.version, 4);
    assert.equal(manifestBase.fingerprint, manifestProv.fingerprint);
    assert.doesNotMatch(
      JSON.stringify(manifestProv.scenes[0]!.media),
      /sourceQualityAdjustmentProvenance/,
    );
  });

  test("all export modes remain visible/available in UI contracts", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /720x1280|1080x1920/);
    assert.match(exportPanel, /sourceQualityIntelligenceEnabled/);
    const headless = readSrc(
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    );
    assert.match(headless, /\["720p"/);
    assert.match(headless, /\["1080p"/);
    assert.match(headless, /\["4k"/);
    assert.match(headless, /sourceQualityExportTarget:\s*resolution/);
    assert.match(headless, /Browser Export|browser/i);
  });

  test("no new required renderer capability", () => {
    const preflight = readSrc(
      "src/features/export/domain/run-export-capability-preflight.ts",
    );
    assert.doesNotMatch(preflight, /SOURCE_QUALITY_|source-quality-intelligence/);
    const capabilities = readSrc(
      "src/features/visual-retention/domain/source-quality-intelligence-capability.ts",
    );
    assert.match(capabilities, /source-quality-intelligence/);
    const result = runExportCapabilityPreflight(
      buildExportManifest({
        story: prepareStoryForExport(scriptWithMedia(imageMedia(1080, 1920)))
          .story,
        prepared: prepareStoryForExport(scriptWithMedia(imageMedia(1080, 1920))),
        exportSettings: {
          fileName: "sq",
          format: "webm",
          quality: "standard",
          resolution: "1080x1920",
        },
        audioMode: "silent",
        includeBackgroundMusic: false,
        environment: CAPABLE_ENV,
      }),
    );
    assert.equal(
      result.blockers.some((blocker) =>
        String(blocker.capability ?? "").includes("source-quality"),
      ),
      false,
    );
  });

  test("responsibility-based filenames", () => {
    for (const rel of [
      "src/features/source-quality/adapters/resolve-source-quality-export-guidance.ts",
      "src/verification/source-quality/sourceQualityRenderCompatibility.verify.ts",
    ]) {
      assert.doesNotMatch(rel, /sprint|slice|checkpoint|hardening|final/i);
      assert.ok(readSrc(rel).length > 0);
    }
  });

  console.log(`\nSource quality render compatibility: ${passed} PASS\n`);
}

void main();
