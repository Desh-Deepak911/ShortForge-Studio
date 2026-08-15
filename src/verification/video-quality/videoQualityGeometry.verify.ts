/**
 * Provider-free framing and effective-detail audit across varied source shapes.
 * Geometry authority is Source Quality domain (`measureSourceQualityTargetGeometry`).
 */

import assert from "node:assert/strict";

import { assessSourceQuality } from "@/features/source-quality/domain/assess-source-quality";
import type { SceneMedia } from "@/features/story/types";

import {
  buildVideoQualityAuditCorpus,
  measureVideoQualityGeometry,
  VIDEO_QUALITY_FRAMING_CORPUS,
  VIDEO_QUALITY_SOURCE_CORPUS,
  VIDEO_QUALITY_TARGET_CORPUS,
  type VideoQualityAuditCase,
} from "./videoQualityAuditCorpus";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function requireCase(
  corpus: readonly VideoQualityAuditCase[],
  sourceId: string,
  framingId: string,
  targetId: string,
): VideoQualityAuditCase {
  const hit = corpus.find(
    (entry) =>
      entry.source.id === sourceId &&
      entry.framing.id === framingId &&
      entry.target.id === targetId,
  );
  assert.ok(hit, `${sourceId}/${framingId}/${targetId}`);
  return hit!;
}

console.log("\nVideo quality geometry audit\n");

const corpus = buildVideoQualityAuditCorpus();

test("corpus covers every source × framing × vertical target combination", () => {
  assert.equal(
    corpus.length,
    VIDEO_QUALITY_SOURCE_CORPUS.length *
      VIDEO_QUALITY_FRAMING_CORPUS.length *
      VIDEO_QUALITY_TARGET_CORPUS.length,
  );
  assert.equal(new Set(corpus.map((entry) => entry.id)).size, corpus.length);
});

test("Fit and zoom-out explicitly measure uncovered frame area", () => {
  const landscapeFit = requireCase(
    corpus,
    "landscape_1080",
    "fit_native_zoom",
    "1080p",
  );
  const fit = measureVideoQualityGeometry(landscapeFit);
  assert.ok(fit.frameCoverageFraction < 0.32);

  const verticalZoomOut = requireCase(
    corpus,
    "vertical_1080",
    "fit_zoomed_out",
    "1080p",
  );
  const zoomedOut = measureVideoQualityGeometry(verticalZoomOut);
  assert.equal(zoomedOut.frameCoverageFraction, 0.75 ** 2);
});

test("Fill retains full frame coverage and quantifies crop loss", () => {
  for (const entry of corpus.filter((row) => row.framing.fitMode === "fill")) {
    const measurement = measureVideoQualityGeometry(entry);
    assert.equal(measurement.frameCoverageFraction, 1, entry.id);
    assert.ok(measurement.retainedSourceAreaFraction > 0, entry.id);
    assert.ok(measurement.retainedSourceAreaFraction <= 1, entry.id);
  }
});

test("aggressive zoom always retains less source area than native Fill", () => {
  for (const source of VIDEO_QUALITY_SOURCE_CORPUS) {
    for (const target of VIDEO_QUALITY_TARGET_CORPUS) {
      const native = requireCase(
        corpus,
        source.id,
        "fill_native_zoom",
        target.id,
      );
      const aggressive = requireCase(
        corpus,
        source.id,
        "fill_aggressive_zoom",
        target.id,
      );
      assert.ok(
        measureVideoQualityGeometry(aggressive).retainedSourceAreaFraction <
          measureVideoQualityGeometry(native).retainedSourceAreaFraction,
        `${source.id}/${target.id}`,
      );
    }
  }
});

test("effective-detail class follows actual post-framing scale", () => {
  const native1080 = requireCase(
    corpus,
    "vertical_1080",
    "fill_native_zoom",
    "1080p",
  );
  const lowRes4k = requireCase(
    corpus,
    "low_res_vertical",
    "fill_aggressive_zoom",
    "4k",
  );
  assert.equal(
    measureVideoQualityGeometry(native1080).detailClass,
    "native_or_downsampled",
  );
  assert.equal(measureVideoQualityGeometry(lowRes4k).detailClass, "severe_upscale");
});

test("existing source-quality upscale authority matches every corpus case", () => {
  for (const entry of corpus) {
    const media: SceneMedia = {
      type: "video",
      url: `https://fixture.local/${entry.source.id}.mp4`,
      mimeType: "video/mp4",
      width: entry.source.width,
      height: entry.source.height,
    };
    const assessment = assessSourceQuality({
      media,
      framing: {
        fitMode: entry.framing.fitMode,
        zoom: entry.framing.zoom,
        rotationDeg: 0,
      },
    });
    const target = assessment.targets.find(
      (row) => row.targetId === entry.target.id,
    );
    assert.ok(target, entry.id);
    const measured = measureVideoQualityGeometry(entry);
    assert.equal(assessment.authoredZoom, entry.framing.zoom, entry.id);
    assert.equal(target!.baseScale, measured.baseScale, entry.id);
    assert.equal(target!.activeScale, measured.activeScale, entry.id);
    assert.equal(
      target!.sourcePixelsPerOutputPixel,
      measured.sourcePixelsPerOutputPixel,
      entry.id,
    );
    assert.equal(
      target!.frameCoverageFraction,
      measured.frameCoverageFraction,
      entry.id,
    );
    assert.equal(
      target!.retainedSourceAreaFraction,
      measured.retainedSourceAreaFraction,
      entry.id,
    );
    assert.equal(target!.detailClass, measured.detailClass, entry.id);
    assert.equal(target!.softnessCause, measured.softnessCause, entry.id);
    assert.equal(
      target!.mayUpscale,
      measured.sourcePixelsPerOutputPixel < 1,
      entry.id,
    );
  }
});

test("Prompt 1 regressions: landscape 4K Fill into vertical 4K / 1080p", () => {
  const fill4kNative = measureVideoQualityGeometry(
    requireCase(corpus, "landscape_4k", "fill_native_zoom", "4k"),
  );
  // cover = 3840/2160 = 1.777… → material_upscale from aspect conversion
  assert.ok(Math.abs(fill4kNative.activeScale - 3840 / 2160) < 1e-9);
  assert.ok(Math.abs(fill4kNative.sourcePixelsPerOutputPixel - 2160 / 3840) < 1e-9);
  assert.equal(fill4kNative.detailClass, "material_upscale");
  assert.equal(fill4kNative.softnessCause, "aspect_conversion");
  assert.equal(fill4kNative.frameCoverageFraction, 1);
  assert.ok(fill4kNative.retainedSourceAreaFraction < 0.5);

  const fill4kZoom = measureVideoQualityGeometry(
    requireCase(corpus, "landscape_4k", "fill_moderate_zoom", "4k"),
  );
  assert.ok(Math.abs(fill4kZoom.activeScale - (3840 / 2160) * 1.25) < 1e-9);
  assert.equal(fill4kZoom.detailClass, "severe_upscale");
  assert.equal(fill4kZoom.softnessCause, "combined");
  assert.ok(
    fill4kZoom.retainedSourceAreaFraction < fill4kNative.retainedSourceAreaFraction,
  );

  const fill1080Native = measureVideoQualityGeometry(
    requireCase(corpus, "landscape_4k", "fill_native_zoom", "1080p"),
  );
  // cover = max(1080/3840, 1920/2160) = 1920/2160 ≈ 0.889 → downsampled
  assert.ok(Math.abs(fill1080Native.activeScale - 1920 / 2160) < 1e-9);
  assert.equal(fill1080Native.detailClass, "native_or_downsampled");
  assert.equal(fill1080Native.softnessCause, "none");
  assert.equal(fill1080Native.frameCoverageFraction, 1);
});

test("Prompt 1 regression: landscape 1080 Fill into vertical 1080", () => {
  const measured = measureVideoQualityGeometry(
    requireCase(corpus, "landscape_1080", "fill_native_zoom", "1080p"),
  );
  // cover = max(1080/1920, 1920/1080) = 1920/1080 ≈ 1.777 → material_upscale
  assert.ok(Math.abs(measured.activeScale - 1920 / 1080) < 1e-9);
  assert.equal(measured.detailClass, "material_upscale");
  assert.equal(measured.softnessCause, "aspect_conversion");
  assert.equal(measured.frameCoverageFraction, 1);
});

test("Prompt 1 regression: native vertical 1080 remains native at vertical 1080", () => {
  const measured = measureVideoQualityGeometry(
    requireCase(corpus, "vertical_1080", "fill_native_zoom", "1080p"),
  );
  assert.equal(measured.activeScale, 1);
  assert.equal(measured.sourcePixelsPerOutputPixel, 1);
  assert.equal(measured.detailClass, "native_or_downsampled");
  assert.equal(measured.softnessCause, "none");
  assert.equal(measured.frameCoverageFraction, 1);
  assert.equal(measured.retainedSourceAreaFraction, 1);
  assert.equal(measured.retainedSourceRegionWidth, 1080);
  assert.equal(measured.retainedSourceRegionHeight, 1920);
});

test("Prompt 1 regression: Fit leaves uncovered canvas for landscape", () => {
  const measured = measureVideoQualityGeometry(
    requireCase(corpus, "landscape_1080", "fit_native_zoom", "1080p"),
  );
  assert.ok(measured.frameCoverageFraction < 0.32);
  assert.equal(measured.retainedSourceAreaFraction, 1);
  assert.equal(measured.detailClass, "native_or_downsampled");
  assert.equal(measured.softnessCause, "none");
});

test("audit stays advisory and provider-free", () => {
  const severe = corpus.filter(
    (entry) => measureVideoQualityGeometry(entry).detailClass === "severe_upscale",
  );
  assert.ok(severe.length > 0);
  assert.equal(JSON.stringify(corpus).includes("error"), false);
  assert.equal(JSON.stringify(corpus).includes("provider"), false);
});

console.log(`\nVideo quality geometry audit: ${passed} PASS (${corpus.length} cases)\n`);
