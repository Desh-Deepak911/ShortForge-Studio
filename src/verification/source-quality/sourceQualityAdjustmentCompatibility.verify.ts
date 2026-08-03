/**
 * Source-quality adjustment compatibility / ExportManifest / render isolation.
 * Run via: npm run test:source-quality-adjustments
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { applySourceQualityAdjustmentRecommendation } from "@/features/source-quality/editor/source-quality-adjustment.commands";
import { recommendSafeVisualAdjustment } from "@/features/source-quality/domain/safe-visual-adjustment-recommendation";
import { normalizeSourceQualityAdjustmentProvenance } from "@/features/source-quality/domain/source-quality-adjustment-provenance";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  getSceneMedia,
  normalizeSceneMedia,
} from "@/features/story/utils/scene.utils";
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

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageMedia(
  width: number,
  height: number,
  options: { readonly scale?: number; readonly url?: string } = {},
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

function singleScene(media: SceneMedia): FootieScene {
  return {
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
      x: media.transform?.x ?? 0,
      y: media.transform?.y ?? 0,
      scale: media.transform?.scale ?? 1,
      rotation: media.transform?.rotation ?? 0,
    },
  };
}

function storyFor(scene: FootieScene): FootieScript {
  return syncFootieScript({
    title: "Source quality adjustments compat",
    narration: "Narration line.",
    totalDuration: 6,
    scenes: [scene],
    exportSettings: {
      fileName: "sq-adj-compat",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

function main(): void {
  console.log("\nSource quality adjustment compatibility\n");

  test("optional provenance JSON round-trip", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const json = JSON.stringify(applied.scene.media);
    const parsed = JSON.parse(json) as SceneMedia;
    const normalized = normalizeSceneMedia(parsed);
    assert.ok(normalized?.sourceQualityAdjustmentProvenance);
    assert.deepEqual(
      normalized!.sourceQualityAdjustmentProvenance,
      normalizeSourceQualityAdjustmentProvenance(
        applied.scene.media!.sourceQualityAdjustmentProvenance,
      ),
    );
  });

  test("malformed provenance does not break old projects", () => {
    const normalized = normalizeSceneMedia({
      type: "image",
      url: "https://example.com/old.jpg",
      sourceQualityAdjustmentProvenance: {
        version: "nope",
        recommendationFingerprint: 12,
      },
    });
    assert.ok(normalized);
    assert.equal(normalized!.sourceQualityAdjustmentProvenance, undefined);
    assert.equal(normalized!.url, "https://example.com/old.jpg");

    const missingMediaItemId = normalizeSourceQualityAdjustmentProvenance({
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
    });
    assert.equal(missingMediaItemId, undefined);
  });

  test("provenance excluded from ExportManifest; version/fingerprint stable", () => {
    const baseMedia = imageMedia(1080, 1920, { scale: 1 });
    const baseScene = singleScene(baseMedia);
    const media = imageMedia(1080, 1920, { scale: 1 });
    const scene = singleScene(media);
    // Attach provenance without changing framing fields that enter the manifest.
    scene.media = {
      ...scene.media!,
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
    };

    const manifestBase = buildExportManifest({
      story: storyFor(baseScene),
      environment: CAPABLE_ENV,
    });
    const manifestWith = buildExportManifest({
      story: storyFor(scene),
      environment: CAPABLE_ENV,
    });
    assert.equal(manifestBase.version, 4);
    assert.equal(manifestWith.version, 4);
    assert.equal(manifestBase.fingerprint, manifestWith.fingerprint);
    const mediaJson = JSON.stringify(manifestWith.scenes[0]!.media);
    assert.doesNotMatch(mediaJson, /sourceQualityAdjustmentProvenance|recommendationFingerprint/);
    const withMedia = manifestWith.scenes[0]!.media;
    const baseMediaManifest = manifestBase.scenes[0]!.media;
    assert.ok(withMedia.type === "image" || withMedia.type === "video");
    assert.ok(
      baseMediaManifest.type === "image" || baseMediaManifest.type === "video",
    );
    if (withMedia.type === "image" || withMedia.type === "video") {
      assert.equal(withMedia.zoom, 1);
    }
    if (baseMediaManifest.type === "image" || baseMediaManifest.type === "video") {
      assert.equal(baseMediaManifest.zoom, 1);
    }
  });

  test("Browser/Headless media windows unchanged by provenance alone", () => {
    const base = singleScene(imageMedia(1080, 1920));
    const withProv = singleScene(imageMedia(1080, 1920));
    withProv.media = {
      ...withProv.media!,
      sourceQualityAdjustmentProvenance: {
        version: 1,
        recommendationFingerprint: "x",
        mediaFingerprint: "y",
        recommendationCodes: ["USE_FIT_FRAMING"],
        previousFraming: {
          fitMode: "fill",
          positionX: 0,
          positionY: 0,
          zoom: 1,
          rotationDeg: 0,
        },
        appliedFraming: {
          fitMode: "fit",
          positionX: 0,
          positionY: 0,
          zoom: 1,
          rotationDeg: 0,
        },
        mediaItemId: null,
      },
    };
    // Framing intentionally still fill/zoom 1 — provenance must not alter windows.
    const a = buildExportManifest({
      story: storyFor(base),
      environment: CAPABLE_ENV,
    });
    const b = buildExportManifest({
      story: storyFor(withProv),
      environment: CAPABLE_ENV,
    });
    assert.deepEqual(
      a.scenes[0]!.mediaTimeline,
      b.scenes[0]!.mediaTimeline,
    );
    assert.equal(a.fingerprint, b.fingerprint);
  });

  test("preview/export ignore provenance; render uses ordinary framing only", () => {
    const exportManifest = readSrc(
      "src/features/export/domain/build-export-manifest.ts",
    );
    assert.doesNotMatch(exportManifest, /sourceQualityAdjustmentProvenance/);
    const previewSrcCandidates = [
      "src/features/preview/components/PreviewFrame.tsx",
      "src/features/media-framing/resolve-scene-media-framing.ts",
    ];
    for (const rel of previewSrcCandidates) {
      const src = readSrc(rel);
      assert.doesNotMatch(src, /sourceQualityAdjustmentProvenance/);
    }
    const framing = resolveSceneMediaFraming(
      singleScene({
        ...imageMedia(1080, 1920, { scale: 1.2 }),
        sourceQualityAdjustmentProvenance: {
          version: 1,
          recommendationFingerprint: "x",
          mediaFingerprint: "y",
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
      }),
    );
    assert.equal(framing.zoom, 1.2);
  });

  test("Visual pacing timing remains unchanged by adjustment domain", () => {
    const domainFiles = [
      "src/features/source-quality/domain/safe-visual-adjustment-recommendation.ts",
      "src/features/source-quality/domain/source-quality-adjustment-provenance.ts",
      "src/features/source-quality/domain/evaluate-source-quality-adjustment-staleness.ts",
      "src/features/source-quality/editor/source-quality-adjustment.commands.ts",
    ];
    for (const rel of domainFiles) {
      const src = readSrc(rel);
      assert.doesNotMatch(src, /visualBeatPlan|generateVisualBeatPlan/);
      assert.doesNotMatch(src, /startOffsetMs\s*=/);
    }
  });

  test("manual framing remains authoritative after provenance present", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const scene = singleScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: resolveSceneMediaFraming(scene),
    });
    const applied = applySourceQualityAdjustmentRecommendation({
      scene,
      recommendation,
      sourceQualityIntelligenceEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const manualMedia = {
      ...getSceneMedia(applied.scene)!,
      transform: {
        x: 12,
        y: -8,
        scale: 1.15,
        rotation: 3,
      },
    };
    const manualScene = singleScene(manualMedia);
    manualScene.media = {
      ...manualMedia,
      sourceQualityAdjustmentProvenance:
        getSceneMedia(applied.scene)!.sourceQualityAdjustmentProvenance,
    };
    manualScene.image = {
      url: manualMedia.url!,
      fitMode: "fill",
      x: 12,
      y: -8,
      scale: 1.15,
      rotation: 3,
    };
    const framing = resolveSceneMediaFraming(manualScene);
    assert.equal(framing.zoom, 1.15);
    assert.equal(framing.positionX, 12);
    assert.equal(framing.rotationDeg, 3);
  });

  test("no render-domain dependency/cycle from adjustment modules", () => {
    for (const rel of [
      "src/features/source-quality/domain/safe-visual-adjustment-recommendation.ts",
      "src/features/source-quality/domain/source-quality-adjustment-provenance.ts",
      "src/features/source-quality/domain/evaluate-source-quality-adjustment-staleness.ts",
    ]) {
      const src = readSrc(rel);
      assert.doesNotMatch(
        src,
        /@\/features\/export|@\/features\/preview|headless-renderer|visual-beat-density/,
      );
    }
    const commands = readSrc(
      "src/features/source-quality/editor/source-quality-adjustment.commands.ts",
    );
    assert.doesNotMatch(commands, /@\/features\/export|headless-renderer/);
  });

  test("responsibility-based filenames", () => {
    const names = [
      "safe-visual-adjustment-recommendation.ts",
      "source-quality-adjustment-provenance.ts",
      "evaluate-source-quality-adjustment-staleness.ts",
      "source-quality-adjustment.commands.ts",
      "safeVisualAdjustmentRecommendation.verify.ts",
      "sourceQualityAdjustmentCommands.verify.ts",
      "sourceQualityAdjustmentCompatibility.verify.ts",
    ];
    for (const name of names) {
      assert.doesNotMatch(name, /sprint|12[Dd]|slice|checkpoint|hardening|final/i);
    }
  });

  console.log(`\nSource quality adjustment compatibility: ${passed} PASS\n`);
}

void main();
