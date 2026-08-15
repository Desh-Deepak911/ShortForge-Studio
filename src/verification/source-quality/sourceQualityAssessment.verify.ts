/**
 * Deterministic source-quality assessment verification.
 * Run: npm run test:source-quality
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  resolveInspectorSceneMediaProjection,
  resolveNearestInspectorMediaItemId,
} from "@/features/mixed-media-scenes/adapters/inspector-scene-media-projection";
import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { resolveSourceQualityMedia } from "@/features/source-quality/adapters/resolve-source-quality-media";
import { assessSourceQuality } from "@/features/source-quality/domain/assess-source-quality";
import {
  normalizeSourceQualityRotationDeg,
  normalizeSourceQualityZoom,
  resolveSourceQualityEffectiveDimensions,
} from "@/features/source-quality/domain/source-quality-effective-geometry";
import {
  SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD,
  SOURCE_QUALITY_TARGET_1080P,
  SOURCE_QUALITY_TARGET_4K,
  SOURCE_QUALITY_TARGET_720P,
} from "@/features/source-quality/domain/source-quality-thresholds";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";
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

function framing(partial: {
  readonly fitMode?: "fit" | "fill";
  readonly zoom?: number;
  readonly rotationDeg?: number;
} = {}) {
  return {
    fitMode: partial.fitMode ?? ("fill" as const),
    zoom: partial.zoom ?? 1,
    rotationDeg: partial.rotationDeg ?? 0,
  };
}

function imageMedia(
  width: number | undefined,
  height: number | undefined,
  options: {
    readonly fitMode?: "cover" | "contain";
    readonly url?: string;
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    fitMode: options.fitMode ?? "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
  };
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
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
    ...overrides,
  };
}

function main(): void {
  console.log("\nSource quality assessment\n");

  test("no media yields no_media summary without warnings", () => {
    const assessment = assessSourceQuality({
      media: null,
      framing: framing(),
    });
    assert.equal(assessment.hasMedia, false);
    assert.equal(assessment.status, "unknown");
    assert.equal(assessment.summaryKey, "no_media");
    assert.deepEqual(assessment.warningCodes, []);
    assert.deepEqual(assessment.targets, []);
  });

  test("unknown dimensions stay non-blocking", () => {
    const assessment = assessSourceQuality({
      media: imageMedia(undefined, undefined),
      framing: framing(),
    });
    assert.equal(assessment.status, "unknown");
    assert.equal(assessment.summaryKey, "unknown");
    assert.deepEqual(assessment.warningCodes, ["SOURCE_DIMENSIONS_UNKNOWN"]);
    assert.equal(assessment.suitableFor1080p, false);
    assert.equal(assessment.targets.length, 3);
    assert.ok(assessment.targets.every((target) => target.mayUpscale === false));
    assert.ok(assessment.targets.every((target) => target.activeScale == null));
  });

  test("exact 720p / 1080p / 4K boundaries under fill", () => {
    const exact720 = assessSourceQuality({
      media: imageMedia(
        SOURCE_QUALITY_TARGET_720P.width,
        SOURCE_QUALITY_TARGET_720P.height,
      ),
      framing: framing(),
    });
    assert.equal(exact720.status, "warning");
    assert.equal(exact720.suitableFor1080p, false);
    assert.ok(
      exact720.targets.some(
        (target) =>
          target.targetId === "720p" &&
          target.mayUpscale === false &&
          target.activeScale === 1,
      ),
    );
    assert.ok(exact720.warningCodes.includes("SOURCE_MAY_UPSCALE_AT_1080P"));

    const exact1080 = assessSourceQuality({
      media: imageMedia(
        SOURCE_QUALITY_TARGET_1080P.width,
        SOURCE_QUALITY_TARGET_1080P.height,
      ),
      framing: framing(),
    });
    assert.equal(exact1080.status, "suitable");
    assert.equal(exact1080.summaryKey, "suitable_1080p");
    assert.equal(exact1080.suitableFor1080p, true);
    assert.equal(exact1080.suitableFor4k, false);
    assert.deepEqual(exact1080.warningCodes, ["SOURCE_MAY_UPSCALE_AT_4K"]);

    const exact4k = assessSourceQuality({
      media: imageMedia(
        SOURCE_QUALITY_TARGET_4K.width,
        SOURCE_QUALITY_TARGET_4K.height,
      ),
      framing: framing(),
    });
    assert.equal(exact4k.status, "suitable");
    assert.equal(exact4k.suitableFor1080p, true);
    assert.equal(exact4k.suitableFor4k, true);
    assert.deepEqual(exact4k.warningCodes, []);
  });

  test("below-boundary sources warn for upscale", () => {
    const soft = assessSourceQuality({
      media: imageMedia(900, 1600),
      framing: framing(),
    });
    assert.equal(soft.status, "warning");
    assert.ok(soft.warningCodes.includes("SOURCE_MAY_UPSCALE_AT_1080P"));
    assert.equal(soft.suitableFor1080p, false);
  });

  test("zoom multiplies active scale and can introduce upscale warnings", () => {
    const native = assessSourceQuality({
      media: imageMedia(1080, 1920),
      framing: framing({ zoom: 1 }),
    });
    assert.equal(native.suitableFor1080p, true);

    const zoomed = assessSourceQuality({
      media: imageMedia(1080, 1920),
      framing: framing({ zoom: 2 }),
    });
    assert.equal(zoomed.status, "warning");
    assert.ok(zoomed.warningCodes.includes("SOURCE_MAY_UPSCALE_AT_1080P"));
    const target = zoomed.targets.find((entry) => entry.targetId === "1080p");
    assert.ok(target);
    assert.equal(target!.activeScale, 2);
    assert.equal(target!.mayUpscale, true);
  });

  test("non-positive zoom normalizes to 1", () => {
    assert.equal(normalizeSourceQualityZoom(0), 1);
    assert.equal(normalizeSourceQualityZoom(-2), 1);
    assert.equal(normalizeSourceQualityZoom(Number.NaN), 1);
    assert.equal(normalizeSourceQualityZoom(Number.POSITIVE_INFINITY), 1);
    const assessment = assessSourceQuality({
      media: imageMedia(1080, 1920),
      framing: framing({ zoom: 0 }),
    });
    assert.equal(assessment.suitableFor1080p, true);
  });

  test("fit versus fill calculations differ for letterboxed sources", () => {
    const landscape = imageMedia(1920, 1080);
    const fill = assessSourceQuality({
      media: landscape,
      framing: framing({ fitMode: "fill" }),
    });
    const fit = assessSourceQuality({
      media: landscape,
      framing: framing({ fitMode: "fit" }),
    });

    assert.ok(fill.warningCodes.includes("SOURCE_ASPECT_RATIO_MISMATCH"));
    assert.ok(fill.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"));
    assert.ok(fit.warningCodes.includes("SOURCE_ASPECT_RATIO_MISMATCH"));
    assert.ok(!fit.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"));

    const fill1080 = fill.targets.find((entry) => entry.targetId === "1080p");
    const fit1080 = fit.targets.find((entry) => entry.targetId === "1080p");
    assert.ok(fill1080);
    assert.ok(fit1080);
    assert.equal(fill1080!.mayUpscale, true);
    assert.equal(fit1080!.mayUpscale, false);
    assert.ok(
      (fill1080!.retainedSourceAreaFraction ?? 1) <
        SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD,
    );
    // Fit preserves the full source (letterboxes); retained area is 1, coverage < 1.
    assert.equal(fit1080!.retainedSourceAreaFraction, 1);
    assert.ok((fit1080!.frameCoverageFraction ?? 1) < 0.32);
    assert.equal(fit1080!.detailClass, "native_or_downsampled");
    assert.equal(fill1080!.detailClass, "material_upscale");
    assert.equal(fill1080!.softnessCause, "aspect_conversion");
    assert.equal(fit.authoredZoom, 1);
    assert.equal(fill.authoredZoom, 1);
  });

  test("fill retained area accounts for zoom and stays clamped", () => {
    const base = assessSourceQuality({
      media: imageMedia(1920, 1080),
      framing: framing({ fitMode: "fill", zoom: 1 }),
    });
    const zoomed = assessSourceQuality({
      media: imageMedia(1920, 1080),
      framing: framing({ fitMode: "fill", zoom: 2 }),
    });
    const baseRetained =
      base.targets.find((entry) => entry.targetId === "1080p")
        ?.retainedSourceAreaFraction ?? 1;
    const zoomedRetained =
      zoomed.targets.find((entry) => entry.targetId === "1080p")
        ?.retainedSourceAreaFraction ?? 1;
    assert.ok(zoomedRetained < baseRetained);
    assert.ok(zoomedRetained >= 0 && zoomedRetained <= 1);
    assert.ok(baseRetained >= 0 && baseRetained <= 1);
  });

  test("landscape-to-vertical crop warning is stable", () => {
    const assessment = assessSourceQuality({
      media: imageMedia(3840, 2160),
      framing: framing(),
    });
    assert.ok(assessment.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"));
    assert.ok(assessment.warningCodes.includes("SOURCE_ASPECT_RATIO_MISMATCH"));
    assert.equal(assessment.status, "warning");
  });

  test("rotation geometry: portrait 0°, landscape 90°, portrait 90°, 180°, arbitrary, invalid", () => {
    const portrait = resolveSourceQualityEffectiveDimensions(1080, 1920, 0);
    assert.equal(portrait.effectiveWidth, 1080);
    assert.equal(portrait.effectiveHeight, 1920);
    assert.equal(portrait.sourceWidth, 1080);
    assert.equal(portrait.sourceHeight, 1920);

    const landscape90 = resolveSourceQualityEffectiveDimensions(1920, 1080, 90);
    assert.ok(Math.abs(landscape90.effectiveWidth - 1080) < 1e-9);
    assert.ok(Math.abs(landscape90.effectiveHeight - 1920) < 1e-9);

    const portrait90 = resolveSourceQualityEffectiveDimensions(1080, 1920, 90);
    assert.ok(Math.abs(portrait90.effectiveWidth - 1920) < 1e-9);
    assert.ok(Math.abs(portrait90.effectiveHeight - 1080) < 1e-9);

    const at180 = resolveSourceQualityEffectiveDimensions(1080, 1920, 180);
    assert.ok(Math.abs(at180.effectiveWidth - 1080) < 1e-9);
    assert.ok(Math.abs(at180.effectiveHeight - 1920) < 1e-9);

    const arbitrary = resolveSourceQualityEffectiveDimensions(1080, 1920, 33.3);
    assert.ok(Number.isFinite(arbitrary.effectiveWidth));
    assert.ok(Number.isFinite(arbitrary.effectiveHeight));
    assert.ok(arbitrary.effectiveWidth > 1080);
    assert.ok(arbitrary.effectiveHeight > 1080);

    assert.equal(normalizeSourceQualityRotationDeg(Number.NaN), 0);
    assert.equal(normalizeSourceQualityRotationDeg(Number.POSITIVE_INFINITY), 0);
    assert.equal(normalizeSourceQualityRotationDeg(540), 180);
    assert.equal(normalizeSourceQualityRotationDeg(-90), -90);

    const portraitBecomesLandscape = assessSourceQuality({
      media: imageMedia(1080, 1920),
      framing: framing({ rotationDeg: 90 }),
    });
    assert.ok(
      portraitBecomesLandscape.warningCodes.includes(
        "SOURCE_ASPECT_RATIO_MISMATCH",
      ),
    );
  });

  test("renderer-parity: landscape 90° keeps unrotated base scale", () => {
    const unrotated = assessSourceQuality({
      media: imageMedia(1920, 1080),
      framing: framing({ rotationDeg: 0 }),
    });
    const rotated = assessSourceQuality({
      media: imageMedia(1920, 1080),
      framing: framing({ rotationDeg: 90 }),
    });
    const u1080 = unrotated.targets.find((entry) => entry.targetId === "1080p")!;
    const r1080 = rotated.targets.find((entry) => entry.targetId === "1080p")!;
    // Renderer sizes cover/contain from unrotated bitmap; rotation must not
    // convert an upscaled landscape render into “ready without upscale”.
    assert.equal(u1080.coverScale, r1080.coverScale);
    assert.equal(u1080.activeScale, r1080.activeScale);
    assert.equal(u1080.mayUpscale, true);
    assert.equal(r1080.mayUpscale, true);
    assert.equal(rotated.suitableFor1080p, false);
    assert.ok(rotated.warningCodes.includes("SOURCE_MAY_UPSCALE_AT_1080P"));

    const zoomed = assessSourceQuality({
      media: imageMedia(1920, 1080),
      framing: framing({ rotationDeg: 90, zoom: 1.5 }),
    });
    const z1080 = zoomed.targets.find((entry) => entry.targetId === "1080p")!;
    assert.ok(Math.abs(z1080.activeScale! - u1080.activeScale! * 1.5) < 1e-9);
  });

  test("assessment-only legacy adapter enriches without mutating getSceneMedia", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/legacy.jpg",
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fill",
        ...({ width: 1080, height: 1920 } as object),
      },
    });
    assert.equal(scene.media, undefined);
    const canonical = getSceneMedia(scene);
    assert.ok(canonical);
    assert.equal(canonical!.width, undefined);
    assert.equal(canonical!.height, undefined);

    const sceneBefore = JSON.stringify(scene);
    const enriched = resolveSourceQualityMedia({ scene });
    assert.ok(enriched);
    assert.equal(enriched!.width, 1080);
    assert.equal(enriched!.height, 1920);
    assert.notEqual(enriched, canonical);
    assert.equal(canonical!.width, undefined);
    assert.equal(JSON.stringify(scene), sceneBefore);

    const assessment = assessSourceQuality({
      media: enriched,
      framing: resolveSceneMediaFraming(scene, { media: enriched }),
    });
    assert.equal(assessment.summaryKey, "suitable_1080p");

    // Explicit selected media wins; legacy hints must not overwrite it.
    const selected = imageMedia(900, 1600, { url: "https://example.com/item.jpg" });
    const selectedResolved = resolveSourceQualityMedia({
      scene,
      media: selected,
    });
    assert.equal(selectedResolved, selected);
    assert.equal(selectedResolved!.width, 900);
  });

  test("winning-item projection: selected mixed-media beats scene.media", () => {
    const ignoredUrl = "https://example.com/ignored.jpg";
    let scene = baseScene();

    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(1080, 1920, { url: "https://example.com/a.jpg" }),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => "item-a",
      },
    ).scene;
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(900, 1600, { url: "https://example.com/b.jpg" }),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => "item-b",
      },
    ).scene;
    // Ignored scene.media slot that must not win over projected selection.
    scene = {
      ...scene,
      media: imageMedia(640, 480, { url: ignoredUrl }),
    };

    const projection = resolveInspectorSceneMediaProjection(scene, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(projection.windows.length, 2);
    assert.ok(
      projection.windows.every((window) => window.media.url !== ignoredUrl),
    );

    const winA = projection.windows.find((window) => window.itemId === "item-a");
    const winB = projection.windows.find((window) => window.itemId === "item-b");
    assert.ok(winA?.media);
    assert.ok(winB?.media);

    const assessA = assessSourceQuality({
      media: winA!.media,
      framing: resolveSceneMediaFraming(
        { media: winA!.media },
        { media: winA!.media },
      ),
    });
    const assessB = assessSourceQuality({
      media: winB!.media,
      framing: resolveSceneMediaFraming(
        { media: winB!.media },
        { media: winB!.media },
      ),
    });
    assert.equal(assessA.summaryKey, "suitable_1080p");
    assert.equal(assessB.status, "warning");
    assert.notEqual(assessA.summaryKey, assessB.summaryKey);

    const staleId = "missing-item";
    const nearestId = resolveNearestInspectorMediaItemId(
      projection.windows,
      staleId,
      0,
    );
    assert.ok(nearestId);
    const nearest = projection.windows.find(
      (window) => window.itemId === nearestId,
    );
    assert.ok(nearest?.media);
    assert.notEqual(nearest!.media.url, ignoredUrl);
  });

  test("single scene.media path assesses canonical media", () => {
    const scene = baseScene({ media: imageMedia(1080, 1920) });
    const media = getSceneMedia(scene);
    const assessment = assessSourceQuality({
      media: media ?? null,
      framing: resolveSceneMediaFraming(scene, { media }),
    });
    assert.equal(assessment.summaryKey, "suitable_1080p");
  });

  test("assessment does not mutate media or framing input", () => {
    const media = imageMedia(1080, 1920);
    const framingInput = framing({ zoom: 1.25, rotationDeg: 15 });
    const mediaJson = JSON.stringify(media);
    const framingJson = JSON.stringify(framingInput);
    assessSourceQuality({ media, framing: framingInput });
    assert.equal(JSON.stringify(media), mediaJson);
    assert.equal(JSON.stringify(framingInput), framingJson);
  });

  test("domain module stays pure (no clock/random/network/provider/music)", () => {
    const assessSrc = readSrc(
      "src/features/source-quality/domain/assess-source-quality.ts",
    );
    const thresholdsSrc = readSrc(
      "src/features/source-quality/domain/source-quality-thresholds.ts",
    );
    const geometrySrc = readSrc(
      "src/features/source-quality/domain/source-quality-effective-geometry.ts",
    );
    for (const src of [assessSrc, thresholdsSrc, geometrySrc]) {
      assert.doesNotMatch(src, /\bDate\.now\b|\bMath\.random\b|\bfetch\b|\bXMLHttpRequest\b/);
      assert.doesNotMatch(src, /\bmusic\b|\bprovider\b|\bpreview\b|\bheadless\b|\bblob\b|localStorage/i);
      assert.doesNotMatch(src, /from\s+["'][^"']*(export|preview|headless|music)/i);
      assert.doesNotMatch(src, /prepareStoryForExport/);
    }
  });

  test("warnings never introduce terminal export failure codes", () => {
    const soft = assessSourceQuality({
      media: imageMedia(640, 480),
      framing: framing(),
    });
    assert.equal(soft.status, "warning");
    assert.ok(soft.warningCodes.length > 0);
  });

  test("4K-only upscale does not demote suitable 1080p status", () => {
    const assessment = assessSourceQuality({
      media: imageMedia(1080, 1920),
      framing: framing(),
    });
    assert.equal(assessment.status, "suitable");
    assert.equal(assessment.summaryKey, "suitable_1080p");
    assert.ok(assessment.warningCodes.includes("SOURCE_MAY_UPSCALE_AT_4K"));
  });

  test("vertical targets and crop threshold stay documented constants", () => {
    assert.deepEqual(
      [
        SOURCE_QUALITY_TARGET_720P.width,
        SOURCE_QUALITY_TARGET_720P.height,
      ],
      [720, 1280],
    );
    assert.deepEqual(
      [
        SOURCE_QUALITY_TARGET_1080P.width,
        SOURCE_QUALITY_TARGET_1080P.height,
      ],
      [1080, 1920],
    );
    assert.deepEqual(
      [SOURCE_QUALITY_TARGET_4K.width, SOURCE_QUALITY_TARGET_4K.height],
      [2160, 3840],
    );
    assert.equal(SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD, 0.5);
  });

  test("compatibility: getSceneMedia unchanged; ExportManifest fingerprint stable; no render imports", () => {
    const legacyUrl = "https://example.com/legacy-compat.jpg";
    const withoutHints = baseScene({
      image: {
        url: legacyUrl,
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fill",
      },
    });
    const withHints = baseScene({
      image: {
        url: legacyUrl,
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fill",
        ...({ width: 1080, height: 1920 } as object),
      },
    });

    const canonicalWithout = getSceneMedia(withoutHints);
    const canonicalWith = getSceneMedia(withHints);
    assert.ok(canonicalWithout);
    assert.ok(canonicalWith);
    assert.equal(canonicalWith!.width, undefined);
    assert.equal(canonicalWith!.height, undefined);
    assert.deepEqual(canonicalWithout, canonicalWith);

    const enriched = resolveSourceQualityMedia({ scene: withHints });
    assert.equal(enriched!.width, 1080);
    assert.equal(getSceneMedia(withHints)!.width, undefined);

    const storyFor = (scene: FootieScene): FootieScript =>
      syncFootieScript({
        title: "Source quality compat",
        narration: "Narration line.",
        totalDuration: 6,
        scenes: [scene],
        exportSettings: {
          fileName: "sq-compat",
          format: "webm",
          quality: "standard",
          resolution: "1080x1920",
        },
      });

    const manifestA = buildExportManifest({
      story: storyFor(withoutHints),
      environment: CAPABLE_ENV,
    });
    const manifestB = buildExportManifest({
      story: storyFor(withHints),
      environment: CAPABLE_ENV,
    });
    assert.equal(manifestA.fingerprint, manifestB.fingerprint);

    const adapterImport = /resolve-source-quality-media|resolveSourceQualityMedia/;
    for (const rel of [
      "src/features/export/domain/build-export-manifest.ts",
      "src/features/preview/components/VideoPreview.tsx",
      "src/features/export/utils/export-scene-media-renderer.ts",
      "src/features/editor/preview/motion/previewMotionAdapter.ts",
      "src/features/editor/export/motion/exportMotionAdapter.ts",
    ]) {
      assert.doesNotMatch(readSrc(rel), adapterImport);
    }
  });

  console.log(`\nSource quality assessment: ${passed} PASS\n`);
}

main();
