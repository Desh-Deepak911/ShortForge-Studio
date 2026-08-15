/**
 * Fit-with-background framing layer plan + persistence verification.
 * Run: npm run test:fit-with-background
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMediaFramingPatch,
  isFitWithBlurredBackgroundActive,
  resolveMediaFramingLayerPlan,
  resolveSceneMediaFraming,
  scaleFitBackgroundBlurPx,
  FIT_BACKGROUND_BLUR_PX_AT_1080,
} from "@/features/media-framing";
import { resolveVideoBackgroundPaintMode } from "@/features/editor/preview/video-background-paint-loop";
import { buildExportManifest } from "@/features/export/domain/build-export-manifest";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain";
import { assessSourceQuality } from "@/features/source-quality/domain/assess-source-quality";
import { presentSourceQualityGuidance } from "@/features/source-quality/domain/present-source-quality-guidance";
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

function media(
  width: number,
  height: number,
  fitMode: "cover" | "contain" = "contain",
): SceneMedia {
  return {
    type: "video",
    url: "https://example.com/clip.mp4",
    mimeType: "video/mp4",
    width,
    height,
    fitMode,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function sceneWith(mediaValue: SceneMedia): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4_000,
    durationMs: 4_000,
    subtitle: "Line",
    narration: "Narration.",
    media: mediaValue,
  };
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
};

function main(): void {
  console.log("\nFit with background framing\n");

  test("layer plan inactive for legacy Fit and Fill", () => {
    assert.equal(
      resolveMediaFramingLayerPlan({
        fitMode: "fit",
        backgroundTreatment: "none",
      }).mode,
      "single",
    );
    assert.equal(
      resolveMediaFramingLayerPlan({
        fitMode: "fill",
        backgroundTreatment: "blurred_fill",
      }).mode,
      "single",
    );
  });

  test("layer plan active only for Fit + blurred_fill", () => {
    const plan = resolveMediaFramingLayerPlan({
      fitMode: "fit",
      backgroundTreatment: "blurred_fill",
    });
    assert.equal(plan.mode, "fit_with_blurred_background");
    assert.equal(plan.foregroundFitMode, "fit");
    assert.equal(plan.backgroundFitMode, "fill");
  });

  test("blur scales linearly across 720p / 1080p / 4K", () => {
    const at1080 = scaleFitBackgroundBlurPx(1080);
    assert.equal(at1080, FIT_BACKGROUND_BLUR_PX_AT_1080);
    assert.ok(Math.abs(scaleFitBackgroundBlurPx(720) - at1080 * (720 / 1080)) < 1e-9);
    assert.ok(Math.abs(scaleFitBackgroundBlurPx(2160) - at1080 * 2) < 1e-9);
  });

  test("patch persists treatment without changing zoom/pan", () => {
    const scene = sceneWith({
      ...media(3840, 2160, "contain"),
      transform: { x: 40, y: -20, scale: 1.25, rotation: 5 },
    });
    const result = buildMediaFramingPatch(scene, {
      fitMode: "fit",
      backgroundTreatment: "blurred_fill",
    });
    assert.ok(result);
    assert.equal(result!.framing.backgroundTreatment, "blurred_fill");
    assert.equal(result!.framing.zoom, 1.25);
    assert.equal(result!.framing.positionX, 40);
    assert.equal(result!.media?.backgroundTreatment, "blurred_fill");
    assert.equal(result!.media?.transform?.scale, 1.25);
  });

  test("legacy Fit stories are not reinterpreted as Fit with background", () => {
    const framing = resolveSceneMediaFraming(
      sceneWith(media(1920, 1080, "contain")),
    );
    assert.equal(framing.fitMode, "fit");
    assert.equal(framing.backgroundTreatment, "none");
    assert.equal(isFitWithBlurredBackgroundActive(framing), false);
  });

  test("switching to Fill clears treatment", () => {
    const withBg = sceneWith({
      ...media(1920, 1080, "contain"),
      backgroundTreatment: "blurred_fill",
    });
    const result = buildMediaFramingPatch(withBg, { fitMode: "fill" });
    assert.ok(result);
    assert.equal(result!.framing.fitMode, "fill");
    assert.equal(result!.framing.backgroundTreatment, "none");
    assert.equal(result!.media?.backgroundTreatment, undefined);
  });

  test("Source Quality assesses Fit geometry and suggests Fit with background", () => {
    const assessment = assessSourceQuality({
      media: media(3840, 2160, "contain"),
      framing: {
        fitMode: "fit",
        zoom: 1,
        rotationDeg: 0,
        backgroundTreatment: "none",
      },
    });
    const guidance = presentSourceQualityGuidance({
      assessment,
      exportTarget: "1080p",
    });
    assert.equal(assessment.framingFitMode, "fit");
    assert.ok(guidance.suggestionCodes.includes("use_fit_with_background"));

    const active = assessSourceQuality({
      media: media(3840, 2160, "contain"),
      framing: {
        fitMode: "fit",
        zoom: 1,
        rotationDeg: 0,
        backgroundTreatment: "blurred_fill",
      },
    });
    const activeGuidance = presentSourceQualityGuidance({
      assessment: active,
      exportTarget: "1080p",
    });
    assert.equal(active.backgroundTreatment, "blurred_fill");
    assert.ok(!activeGuidance.suggestionCodes.includes("use_fit_with_background"));
    assert.match(activeGuidance.explanation, /Fit with background/i);
  });

  test("ExportManifest freezes backgroundTreatment and changes fingerprint", () => {
    const baseMedia = media(1920, 1080, "contain");
    const story = (treatment?: "blurred_fill"): FootieScript =>
      syncFootieScript({
        title: "Fit bg",
        narration: "Narration.",
        totalDuration: 4,
        scenes: [
          sceneWith(
            treatment
              ? { ...baseMedia, backgroundTreatment: treatment }
              : baseMedia,
          ),
        ],
        exportSettings: {
          fileName: "fit-bg",
          format: "webm",
          quality: "standard",
          resolution: "1080x1920",
        },
      });

    const without = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
    });
    const withBg = buildExportManifest({
      story: story("blurred_fill"),
      environment: CAPABLE_ENV,
    });
    const mediaWithout = without.scenes[0]?.media;
    const mediaWith = withBg.scenes[0]?.media;
    assert.ok(mediaWithout && mediaWithout.type !== "placeholder");
    assert.ok(mediaWith && mediaWith.type !== "placeholder");
    if (mediaWithout!.type !== "placeholder" && mediaWith!.type !== "placeholder") {
      assert.equal(mediaWithout!.backgroundTreatment, undefined);
      assert.equal(mediaWith!.backgroundTreatment, "blurred_fill");
      assert.equal(mediaWith!.fitMode, "fit");
    }
    assert.equal(without.version, 4);
    assert.equal(withBg.version, 5);
    assert.ok(
      withBg.version === 5 &&
        withBg.requiredCapabilities.includes(
          "media-background-treatment-blurred-fill-v1",
        ),
    );
    assert.notEqual(without.fingerprint, withBg.fingerprint);
  });

  test("Fit-with-background requires renderer capability (no silent ignore)", () => {
    const types = readSrc("src/features/export/domain/export-manifest.types.ts");
    assert.match(types, /media-background-treatment-blurred-fill-v1/);
    const workerTypes = readSrc(
      "src/features/headless-renderer/worker/runtime/worker-types.ts",
    );
    assert.match(workerTypes, /media-background-treatment-blurred-fill-v1/);
    const prepare = readSrc(
      "src/features/export/runtime/prepare-export-from-manifest.ts",
    );
    assert.match(prepare, /fitWithBlurredBackgroundEnabled/);
    const v4 = readSrc(
      "src/features/export/domain/assert-export-manifest-v4-scene-media.ts",
    );
    assert.match(v4, /UNSUPPORTED_MEDIA_BACKGROUND_TREATMENT/);
  });

  test("draw path and inspector wire Fit with background", () => {
    const renderer = readSrc(
      "src/features/export/utils/export-scene-media-renderer.ts",
    );
    assert.match(renderer, /drawFitWithBlurredBackgroundLayers/);
    assert.match(renderer, /FIT_BACKGROUND_OFFSCREEN_MAX_WIDTH/);
    assert.match(renderer, /fit-with-background: blur unavailable/);
    const controls = readSrc(
      "src/features/editor/components/MediaFramingInspectorControls.tsx",
    );
    assert.match(controls, /fit_with_background/);
    assert.match(controls, /Keeps the full video visible/);
    const previewImage = readSrc(
      "src/features/editor/components/SceneFrameImage.tsx",
    );
    const previewVideo = readSrc(
      "src/features/editor/components/SceneFrameVideo.tsx",
    );
    assert.match(previewImage, /data-fit-with-background/);
    assert.match(previewVideo, /paintVideoBackground/);
    assert.match(previewVideo, /data-scene-frame-layer="background"/);
    assert.match(previewVideo, /resolveVideoBackgroundPaintMode/);
    assert.match(previewVideo, /visibilitychange/);
  });

  test("Preview video background paint-loop lifecycle policy", () => {
    assert.equal(
      resolveVideoBackgroundPaintMode({
        fitWithBackground: true,
        isActive: true,
        shouldPlay: true,
        documentHidden: false,
      }),
      "continuous",
    );
    assert.equal(
      resolveVideoBackgroundPaintMode({
        fitWithBackground: true,
        isActive: true,
        shouldPlay: false,
        documentHidden: false,
      }),
      "once",
    );
    assert.equal(
      resolveVideoBackgroundPaintMode({
        fitWithBackground: true,
        isActive: false,
        shouldPlay: true,
        documentHidden: false,
      }),
      "stop",
    );
    assert.equal(
      resolveVideoBackgroundPaintMode({
        fitWithBackground: true,
        isActive: true,
        shouldPlay: true,
        documentHidden: true,
      }),
      "stop",
    );
    assert.equal(
      resolveVideoBackgroundPaintMode({
        fitWithBackground: false,
        isActive: true,
        shouldPlay: true,
        documentHidden: false,
      }),
      "stop",
    );
  });

  test("existing Fit/Fill enums remain binary", () => {
    const assertSrc = readSrc(
      "src/features/export/domain/assert-export-manifest-v2-scene-media.ts",
    );
    assert.match(assertSrc, /fitMode must be "fit" or "fill"/);
    assert.match(assertSrc, /backgroundTreatment/);
  });

  console.log(`\nFit with background framing: ${passed} PASS\n`);
}

main();
