/**
 * Creator-facing Source Quality guidance presentation.
 * Run: npm run test:source-quality-guidance
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { assessSourceQuality } from "@/features/source-quality/domain/assess-source-quality";
import {
  presentSourceQualityGuidance,
  resolveSourceQualityTargetFromExportResolution,
} from "@/features/source-quality/domain/present-source-quality-guidance";
import type { SceneMedia } from "@/features/story/types";

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

function media(
  width: number | undefined,
  height: number | undefined,
): SceneMedia {
  return {
    type: "video",
    url: "https://example.com/clip.mp4",
    mimeType: "video/mp4",
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
  };
}

function guide(
  width: number | undefined,
  height: number | undefined,
  options: {
    readonly fitMode?: "fit" | "fill";
    readonly zoom?: number;
    readonly exportTarget?: "720p" | "1080p" | "4k";
  } = {},
) {
  const assessment = assessSourceQuality({
    media: media(width, height),
    framing: framing({
      fitMode: options.fitMode,
      zoom: options.zoom,
    }),
  });
  return presentSourceQualityGuidance({
    assessment,
    exportTarget: options.exportTarget ?? "1080p",
  });
}

function main(): void {
  console.log("\nSource quality creator guidance\n");

  test("1. Excellent native vertical 1080p at 1080p", () => {
    const g = guide(1080, 1920, { exportTarget: "1080p" });
    assert.equal(g.rating, "excellent");
    assert.equal(g.ratingLabel, "Excellent for 1080p");
    assert.match(g.explanation, /remain sharp at 1080p/i);
    assert.equal(g.blocksExport, false);
  });

  test("2. Landscape 4K Fill at vertical 1080p stays excellent with crop note", () => {
    const g = guide(3840, 2160, { fitMode: "fill", exportTarget: "1080p" });
    assert.equal(g.rating, "excellent");
    assert.equal(g.ratingLabel, "Excellent for 1080p");
    assert.match(g.explanation, /remain sharp at 1080p/i);
    assert.match(g.explanation, /retains approximately \d+% of the source/i);
    assert.ok(g.suggestionCodes.includes("switch_to_fit"));
  });

  test("3. Landscape 4K Fill at vertical 4K may look soft", () => {
    const g = guide(3840, 2160, { fitMode: "fill", exportTarget: "4k" });
    assert.equal(g.rating, "may_look_soft");
    assert.equal(g.ratingLabel, "May look soft at 4K");
    assert.match(g.explanation, /requires enlargement/i);
    assert.ok(g.suggestionCodes.includes("choose_1080p_instead_of_4k"));
    assert.ok(g.suggestionCodes.includes("switch_to_fit"));
  });

  test("4. Landscape 4K Fill 1.25× at 4K is significant enlargement", () => {
    const g = guide(3840, 2160, {
      fitMode: "fill",
      zoom: 1.25,
      exportTarget: "4k",
    });
    assert.equal(g.rating, "significant_enlargement");
    assert.equal(g.ratingLabel, "Significant enlargement at 4K");
    assert.match(g.explanation, /zoom may look soft at 4K|Aspect conversion and zoom/i);
    assert.ok(g.suggestionCodes.includes("reduce_zoom"));
    assert.ok(g.suggestionCodes.includes("reposition_instead_of_zoom"));
  });

  test("5. Landscape 1080p Fill at vertical 1080p may look soft", () => {
    const g = guide(1920, 1080, { fitMode: "fill", exportTarget: "1080p" });
    assert.equal(g.rating, "may_look_soft");
    assert.equal(g.ratingLabel, "May look soft at 1080p");
    assert.match(g.explanation, /requires enlargement/i);
  });

  test("6. Landscape Fit with uncovered canvas", () => {
    const g = guide(1920, 1080, { fitMode: "fit", exportTarget: "1080p" });
    assert.equal(g.rating, "excellent");
    assert.match(
      g.explanation,
      /Fit preserves the complete video but leaves part of the vertical canvas uncovered/i,
    );
    assert.ok(g.suggestionCodes.includes("use_fit_with_background"));
    assert.match(g.suggestions.join(" "), /Use Fit with background/i);
  });

  test("7. Unknown source dimensions", () => {
    const g = guide(undefined, undefined, { exportTarget: "1080p" });
    assert.equal(g.rating, "cannot_estimate");
    assert.equal(g.ratingLabel, "Quality cannot be estimated for 1080p");
    assert.match(
      g.explanation,
      /Source dimensions are unavailable[\s\S]*Export is still available/i,
    );
    assert.equal(g.blocksExport, false);
    assert.equal(g.suggestions.length, 0);
  });

  test("8. Switching export target updates guidance", () => {
    const assessment = assessSourceQuality({
      media: media(3840, 2160),
      framing: framing({ fitMode: "fill" }),
    });
    const at1080 = presentSourceQualityGuidance({
      assessment,
      exportTarget: "1080p",
    });
    const at4k = presentSourceQualityGuidance({
      assessment,
      exportTarget: "4k",
    });
    assert.equal(at1080.rating, "excellent");
    assert.equal(at4k.rating, "may_look_soft");
    assert.notEqual(at1080.ratingLabel, at4k.ratingLabel);
    assert.notEqual(at1080.explanation, at4k.explanation);
  });

  test("9. Changing Fit/Fill updates guidance", () => {
    const fill = guide(1920, 1080, { fitMode: "fill", exportTarget: "1080p" });
    const fit = guide(1920, 1080, { fitMode: "fit", exportTarget: "1080p" });
    assert.equal(fill.rating, "may_look_soft");
    assert.equal(fit.rating, "excellent");
    assert.match(fit.explanation, /uncovered/i);
    assert.doesNotMatch(fit.explanation, /requires enlargement/i);
  });

  test("10. Changing zoom updates guidance", () => {
    const native = guide(1080, 1920, { zoom: 1, exportTarget: "1080p" });
    const zoomed = guide(1080, 1920, { zoom: 2, exportTarget: "1080p" });
    assert.equal(native.rating, "excellent");
    assert.ok(
      zoomed.rating === "may_look_soft" ||
        zoomed.rating === "significant_enlargement",
    );
    assert.ok(zoomed.suggestionCodes.includes("reduce_zoom"));
  });

  test("11. Guidance never creates a terminal export failure", () => {
    const cases = [
      guide(640, 360, { exportTarget: "4k", zoom: 2 }),
      guide(undefined, undefined),
      guide(3840, 2160, { zoom: 1.75, exportTarget: "4k" }),
    ];
    for (const g of cases) {
      assert.equal(g.blocksExport, false);
      assert.doesNotMatch(g.ratingLabel, /cannot export|blocked|failed/i);
      assert.doesNotMatch(g.explanation, /cannot export|blocked|failed/i);
    }
  });

  test("12. Suggestions are deduplicated and never auto-applied", () => {
    const g = guide(3840, 2160, {
      fitMode: "fill",
      zoom: 1.25,
      exportTarget: "4k",
    });
    assert.equal(g.suggestions.length, new Set(g.suggestions).size);
    assert.equal(g.suggestionCodes.length, new Set(g.suggestionCodes).size);
    const src = readSrc(
      "src/features/source-quality/domain/present-source-quality-guidance.ts",
    );
    assert.doesNotMatch(src, /onScriptChange|applySourceQuality|mutate/);
  });

  test("13. Numeric jargon stays in optional details", () => {
    const g = guide(3840, 2160, { fitMode: "fill", exportTarget: "4k" });
    assert.doesNotMatch(g.explanation, /sourcePixelsPerOutputPixel|activeScale|detailClass/i);
    assert.ok(g.details.some((d) => /Source pixels per output pixel/i.test(d.label)));
    assert.ok(g.details.some((d) => /Source area retained/i.test(d.label)));
  });

  test("14. retainedSourceAreaFraction Fit=1 does not warn as crop", () => {
    const assessment = assessSourceQuality({
      media: media(1920, 1080),
      framing: framing({ fitMode: "fit" }),
    });
    const fit1080 = assessment.targets.find((t) => t.targetId === "1080p");
    assert.equal(fit1080?.retainedSourceAreaFraction, 1);
    assert.ok(!assessment.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"));
    const g = presentSourceQualityGuidance({
      assessment,
      exportTarget: "1080p",
    });
    assert.doesNotMatch(g.explanation, /retains approximately/i);
    assert.match(g.explanation, /uncovered/i);
  });

  test("15. Export resolution helper maps 720/1080 only", () => {
    assert.equal(
      resolveSourceQualityTargetFromExportResolution("720x1280"),
      "720p",
    );
    assert.equal(
      resolveSourceQualityTargetFromExportResolution("1080x1920"),
      "1080p",
    );
    assert.equal(resolveSourceQualityTargetFromExportResolution(undefined), "1080p");
  });

  test("presentation module stays pure", () => {
    const src = readSrc(
      "src/features/source-quality/domain/present-source-quality-guidance.ts",
    );
    assert.doesNotMatch(src, /\bDate\.now\b|\bMath\.random\b|\bfetch\b/);
    assert.doesNotMatch(src, /from\s+["'][^"']*(export|preview|headless|music)/i);
  });

  console.log(`\nSource quality creator guidance: ${passed} PASS\n`);
}

main();
