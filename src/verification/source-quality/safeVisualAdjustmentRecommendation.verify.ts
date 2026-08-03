/**
 * Safe visual-adjustment recommendation verification.
 * Run via: npm run test:source-quality-adjustments
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import {
  recommendSafeVisualAdjustment,
  fingerprintSourceQualityMedia,
} from "@/features/source-quality/domain/safe-visual-adjustment-recommendation";
import type { FootieScene, SceneMedia } from "@/features/story/types";

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
  readonly positionX?: number;
  readonly positionY?: number;
  readonly zoom?: number;
  readonly rotationDeg?: number;
} = {}) {
  return {
    fitMode: partial.fitMode ?? ("fill" as const),
    positionX: partial.positionX ?? 0,
    positionY: partial.positionY ?? 0,
    zoom: partial.zoom ?? 1,
    rotationDeg: partial.rotationDeg ?? 0,
  };
}

function imageMedia(
  width: number,
  height: number,
  options: {
    readonly url?: string;
    readonly fitMode?: "cover" | "contain";
    readonly scale?: number;
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width,
    height,
    fitMode: options.fitMode ?? "cover",
    transform: {
      x: 0,
      y: 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function baseScene(media: SceneMedia): FootieScene {
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
    image:
      media.type === "image" && media.url
        ? {
            url: media.url,
            fitMode: media.fitMode === "contain" ? "fit" : "fill",
            x: media.transform?.x ?? 0,
            y: media.transform?.y ?? 0,
            scale: media.transform?.scale ?? 1,
            rotation: media.transform?.rotation ?? 0,
          }
        : undefined,
  };
}

function assertNoUnsupportedFields(
  patch: Record<string, unknown>,
): void {
  const allowed = new Set(["fitMode", "zoom"]);
  for (const key of Object.keys(patch)) {
    assert.ok(allowed.has(key), `unsupported patch field: ${key}`);
  }
  assert.equal("brightness" in patch, false);
  assert.equal("contrast" in patch, false);
  assert.equal("saturation" in patch, false);
  assert.equal("shadow" in patch, false);
  assert.equal("positionX" in patch, false);
  assert.equal("positionY" in patch, false);
  assert.equal("rotationDeg" in patch, false);
}

function main(): void {
  console.log("\nSafe visual adjustment recommendation\n");

  test("deterministic recommendation fingerprint", () => {
    const media = imageMedia(1080, 1920, { scale: 1.25 });
    const input = framing({ zoom: 1.25 });
    const a = recommendSafeVisualAdjustment({ media, framing: input });
    const b = recommendSafeVisualAdjustment({ media, framing: input });
    assert.equal(a.recommendationFingerprint, b.recommendationFingerprint);
    assert.equal(a.mediaFingerprint, fingerprintSourceQualityMedia(media));
    assert.equal(a.version, 1);
  });

  test("no recommendation for suitable media", () => {
    const media = imageMedia(1080, 1920);
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing(),
    });
    assert.equal(result.applicable, false);
    assert.deepEqual(result.recommendationCodes, []);
    assert.deepEqual(result.proposedFramingPatch, {});
  });

  test("no applicable patch for low-resolution-only warning", () => {
    const media = imageMedia(640, 360, { fitMode: "contain" });
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing({ fitMode: "fit", zoom: 1 }),
    });
    assert.equal(result.applicable, false);
    assert.ok(
      result.recommendationCodes.includes("USE_HIGHER_RESOLUTION_SOURCE"),
    );
    assert.deepEqual(result.proposedFramingPatch, {});
    assertNoUnsupportedFields(result.proposedFramingPatch as unknown as Record<string, unknown>);
  });

  test("zoom-only recommendation", () => {
    const media = imageMedia(1080, 1920, { scale: 1.4 });
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing({ zoom: 1.4 }),
    });
    assert.equal(result.applicable, true);
    assert.deepEqual(result.recommendationCodes, ["RESET_EXCESSIVE_ZOOM"]);
    assert.deepEqual(result.proposedFramingPatch, { zoom: 1 });
    assert.ok(result.currentWarningCodes.includes("SOURCE_MAY_UPSCALE_AT_1080P"));
    assert.equal(
      result.projectedWarningCodes.includes("SOURCE_MAY_UPSCALE_AT_1080P"),
      false,
    );
    assertNoUnsupportedFields(result.proposedFramingPatch as unknown as Record<string, unknown>);
  });

  test("fit-only recommendation", () => {
    const media = imageMedia(1920, 1080);
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing({ fitMode: "fill", zoom: 1 }),
    });
    assert.equal(result.applicable, true);
    assert.deepEqual(result.recommendationCodes, ["USE_FIT_FRAMING"]);
    assert.deepEqual(result.proposedFramingPatch, { fitMode: "fit" });
    assert.ok(
      result.currentWarningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"),
    );
    assert.equal(
      result.projectedWarningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"),
      false,
    );
    assert.ok(
      result.reasons.some((reason) => /letterbox/i.test(reason.message)),
    );
  });

  test("combined recommendation", () => {
    // cover≈0.95 at 1080p: zoom 1.5 introduces upscale + aggressive crop;
    // zoom=1 clears upscale; fit clears crop — both individually help.
    const media = imageMedia(1137, 2021, { scale: 1.5 });
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing({ fitMode: "fill", zoom: 1.5 }),
    });
    assert.equal(result.applicable, true);
    assert.ok(result.recommendationCodes.includes("COMBINED_FIT_AND_RESET_ZOOM"));
    assert.ok(result.recommendationCodes.includes("USE_FIT_FRAMING"));
    assert.ok(result.recommendationCodes.includes("RESET_EXCESSIVE_ZOOM"));
    assert.deepEqual(result.proposedFramingPatch, {
      fitMode: "fit",
      zoom: 1,
    });
    assertNoUnsupportedFields(
      result.proposedFramingPatch as unknown as unknown as Record<string, unknown>,
    );
  });

  test("projected assessment improvement", () => {
    const media = imageMedia(1080, 1920, { scale: 1.5 });
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing({ zoom: 1.5 }),
    });
    assert.equal(result.applicable, true);
    assert.ok(result.currentWarningCodes.length > result.projectedWarningCodes.length);
    assert.equal(result.currentAssessmentSummaryKey, "warning");
  });

  test("no unsupported adjustment fields", () => {
    const media = imageMedia(1920, 1080, { scale: 1.2 });
    const result = recommendSafeVisualAdjustment({
      media,
      framing: framing({ fitMode: "fill", zoom: 1.2 }),
    });
    assertNoUnsupportedFields(result.proposedFramingPatch as unknown as Record<string, unknown>);
    const src = readSrc(
      "src/features/source-quality/domain/safe-visual-adjustment-recommendation.ts",
    );
    assert.doesNotMatch(
      src,
      /brightness\s*:|contrast\s*:|saturation\s*:|shadowBlur\s*:|visualAdjustments/,
    );
  });

  test("read-only UI suggestion uses production recommendation object", () => {
    const media = imageMedia(1080, 1920, { scale: 1.35 });
    const scene = baseScene(media);
    const recommendation = recommendSafeVisualAdjustment({
      media,
      framing: framing({ zoom: 1.35 }),
    });
    const html = renderToStaticMarkup(
      createElement(SourceQualitySummary, {
        scene,
        media,
        framing: framing({ zoom: 1.35 }),
        readiness: { ready: true, enabled: true },
      }),
    );
    // Details closed by default — open via source; assert suggestion wiring in component.
    const summarySrc = readSrc(
      "src/features/source-quality/editor/SourceQualitySummary.tsx",
    );
    assert.match(summarySrc, /recommendSafeVisualAdjustment/);
    assert.match(summarySrc, /Suggested adjustment/);
    assert.match(summarySrc, /No changes are applied automatically/);
    assert.match(summarySrc, /SourceQualityAdjustmentControls/);
    assert.match(summarySrc, /data-source-quality-suggestion/);
    assert.equal(recommendation.applicable, true);
    // Without script/onScriptChange the summary does not mount action controls.
    assert.ok(!html.includes("Apply suggested adjustment"));
  });

  test("responsibility-based filenames", () => {
    for (const rel of [
      "src/features/source-quality/domain/safe-visual-adjustment-recommendation.ts",
      "src/features/source-quality/domain/source-quality-adjustment-provenance.ts",
      "src/features/source-quality/domain/evaluate-source-quality-adjustment-staleness.ts",
      "src/features/source-quality/editor/source-quality-adjustment.commands.ts",
    ]) {
      assert.doesNotMatch(rel, /sprint|12[Dd]|slice|checkpoint|hardening|final/i);
      assert.ok(readSrc(rel).length > 0);
    }
  });

  test("no render-domain dependency", () => {
    const src = readSrc(
      "src/features/source-quality/domain/safe-visual-adjustment-recommendation.ts",
    );
    assert.doesNotMatch(
      src,
      /@\/features\/export|@\/features\/preview|headless|visual-beat-density/,
    );
  });

  console.log(`\nSafe visual adjustment recommendation: ${passed} PASS\n`);
}

void main();
