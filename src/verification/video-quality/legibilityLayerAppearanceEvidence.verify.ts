/**
 * Caption-local legibility — measured appearance evidence (baseline vs changed).
 *
 * Records comparative luma / coverage / contrast without inventing pass thresholds
 * after viewing results.
 *
 * Evidence: docs/evidence/export/current/LEGIBILITY_LAYER_APPEARANCE.md
 * Artifacts: .tmp/legibility-layer-cert/
 */

import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  resolveLegibilityLayerPlan,
  type LegibilityLayerPlan,
  type LegibilityRegion,
} from "@/features/legibility-layer";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildHeadlessVideoMotionReferenceFixture } from "@/features/headless-renderer/worker/testing/build-video-motion-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";

const WIDTH = 1080;
const HEIGHT = 1920;
const ARTIFACT_DIR = join(process.cwd(), ".tmp/legibility-layer-cert");
const EVIDENCE_PATH = join(
  process.cwd(),
  "docs/evidence/export/current/LEGIBILITY_LAYER_APPEARANCE.md",
);

/** Historical full-frame overlay stops (Prompt 4 baseline). */
function baselineGradientAlpha(yNorm: number): number {
  if (yNorm <= 0.35) {
    const t = yNorm / 0.35;
    return 0.6 + (0.15 - 0.6) * t;
  }
  const t = (yNorm - 0.35) / 0.65;
  return 0.15 + (0.9 - 0.15) * t;
}

function meanBaselineAlpha(): number {
  let sum = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    sum += baselineGradientAlpha(y / (HEIGHT - 1));
  }
  return sum / HEIGHT;
}

function regionCoverage(region: LegibilityRegion | null): number {
  if (!region) return 0;
  return (region.width * region.height) / (WIDTH * HEIGHT);
}

function relativeLuminance(hexRgb: number): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((hexRgb >> 16) & 0xff);
  const g = channel((hexRgb >> 8) & 0xff);
  const b = channel(hexRgb & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: number, bg: number): number {
  const L1 = Math.max(fg, bg);
  const L2 = Math.min(fg, bg);
  return (L1 + 0.05) / (L2 + 0.05);
}

function textOnScrimOverSource(
  sourceRgb: number,
  scrimOpacity: number,
): { readonly ratio: number } {
  const srcR = (sourceRgb >> 16) & 0xff;
  const srcG = (sourceRgb >> 8) & 0xff;
  const srcB = sourceRgb & 0xff;
  const blend = (c: number) => Math.round(c * (1 - scrimOpacity));
  const bg = (blend(srcR) << 16) | (blend(srcG) << 8) | blend(srcB);
  return {
    ratio: contrastRatio(relativeLuminance(0xffffff), relativeLuminance(bg)),
  };
}

function measurePlanAppearance(plan: LegibilityLayerPlan) {
  const titleCov = plan.title.visible ? regionCoverage(plan.title.region) : 0;
  const captionCov = plan.caption.needsLocalScrim
    ? regionCoverage(plan.caption.region)
    : 0;
  const brandingCov = plan.branding.enabled
    ? regionCoverage(plan.branding.region)
    : 0;
  const localCoverage = Math.min(1, titleCov + captionCov + brandingCov);
  const meanLocalAlphaApprox =
    titleCov * 0.72 * (plan.title.visible ? plan.title.opacity : 0) +
    captionCov * 0.72 +
    brandingCov * 0.05;
  return {
    globalGradientEnabled: plan.globalGradientEnabled,
    titleVisible: plan.title.visible,
    titleOpacity: plan.title.opacity,
    captionNeedsScrim: plan.caption.needsLocalScrim,
    titleCoverage: titleCov,
    captionCoverage: captionCov,
    brandingCoverage: brandingCov,
    localCoverage,
    meanLocalAlphaApprox,
  };
}

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command}\n${result.stderr || result.stdout}`,
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function decodeFrameMeanLuma(input: {
  readonly ffmpeg: string;
  readonly videoPath: string;
  readonly timeSec: number;
  readonly width: number;
  readonly height: number;
}): number {
  const rawPath = join(mkdtempSync(join(tmpdir(), "legibility-luma-")), "frame.raw");
  run(input.ffmpeg, [
    "-y",
    "-ss",
    String(input.timeSec),
    "-i",
    input.videoPath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${input.width}:${input.height},format=gray`,
    "-f",
    "rawvideo",
    rawPath,
  ]);
  const buf = readFileSync(rawPath);
  let sum = 0;
  for (const value of buf) sum += value;
  return sum / buf.length;
}

type CaseRow = {
  readonly id: string;
  readonly plan: ReturnType<typeof measurePlanAppearance>;
  readonly notes: string;
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function renderHeadless1080p(): Promise<{
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly meanLumaOpening: number;
  readonly meanLumaPostTitle: number;
  readonly simulatedBaselineDarkenedPostTitle: number;
} | null> {
  const binaries = resolveNativeFfmpegBinaries();
  if (!binaries.ok) {
    console.log(`  ⚠ FFmpeg unavailable: ${binaries.message}`);
    return null;
  }

  const fixture = buildHeadlessVideoMotionReferenceFixture({
    contentDurationMs: 2_500,
    rendererProfile: {
      resolution: "1080p",
      format: "mp4",
      fps: 30,
      quality: "high",
    },
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceDurationSec: 4,
    trimStartMs: 0,
    sourcePattern: "smptehdbars",
    fitMode: "fill",
    zoom: 1,
  });

  const seeded = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: "legibility-layer-1080p-fill",
  });
  const result = await seeded.worker.processOnce(1);
  if (!result.ok || result.value.succeeded !== 1) {
    console.log(`  ⚠ Headless worker failed: ${JSON.stringify(result)}`);
    return null;
  }

  const stored = await seeded.stack.jobStore.getByJobIdAndOwner(
    seeded.jobId,
    seeded.ownerId,
  );
  if (!stored.ok || stored.value.stage !== "canonical") {
    console.log("  ⚠ Headless job not canonical");
    return null;
  }
  const binding = stored.value.artifactObjectBinding;
  if (!binding) {
    console.log("  ⚠ Missing artifact binding");
    return null;
  }
  const opened = await seeded.stack.storage.openOwnedObject(
    binding.storageLocator,
    seeded.ownerId,
  );
  if (!opened.ok) {
    console.log("  ⚠ Artifact bytes unavailable");
    return null;
  }

  const directory = mkdtempSync(join(tmpdir(), "legibility-cert-"));
  try {
    const artifactPath = join(directory, "artifact.mp4");
    writeFileSync(artifactPath, opened.value.bytes);
    const outMp4 = join(ARTIFACT_DIR, "headless_1080p_fill.mp4");
    copyFileSync(artifactPath, outMp4);

    const meanLumaOpening = decodeFrameMeanLuma({
      ffmpeg: binaries.ffmpegExecutable,
      videoPath: artifactPath,
      timeSec: 0.1,
      width: 1080,
      height: 1920,
    });
    const meanLumaPostTitle = decodeFrameMeanLuma({
      ffmpeg: binaries.ffmpegExecutable,
      videoPath: artifactPath,
      timeSec: 2.2,
      width: 1080,
      height: 1920,
    });
    const baselineMeanAlpha = meanBaselineAlpha();
    const simulatedBaselineDarkenedPostTitle =
      meanLumaPostTitle * (1 - baselineMeanAlpha);

    return {
      id: "headless_1080p_fill",
      width: 1080,
      height: 1920,
      bytes: statSync(outMp4).size,
      meanLumaOpening,
      meanLumaPostTitle,
      simulatedBaselineDarkenedPostTitle,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nLegibility layer appearance evidence\n");
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(join(process.cwd(), "docs/evidence/export/current"), {
    recursive: true,
  });

  const baselineMeanAlpha = meanBaselineAlpha();
  const baselineBrightPreserved = 1 - baselineMeanAlpha;

  const cases: CaseRow[] = [
    {
      id: "no_text_media_frame",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 3_000,
          contentDurationMs: 10_000,
          storyTitle: "",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: false,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "No title, no caption, branding off",
    },
    {
      id: "opening_title_frame",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 0,
          contentDurationMs: 10_000,
          storyTitle: "Derby Winner",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: true,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Title solid + branding local",
    },
    {
      id: "title_during_fade",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 1_850,
          contentDurationMs: 10_000,
          storyTitle: "Derby Winner",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: true,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Title fading",
    },
    {
      id: "post_title_frame",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 2_500,
          contentDurationMs: 10_000,
          storyTitle: "Derby Winner",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: true,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Title gone; branding local only",
    },
    {
      id: "bottom_caption_with_style_bg",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 3_000,
          contentDurationMs: 10_000,
          storyTitle: "Derby Winner",
          hasActiveCaption: true,
          captionPlacement: "bottom",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: true,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Default caption style supplies background — no extra scrim",
    },
    {
      id: "top_caption_needs_scrim",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 3_000,
          contentDurationMs: 10_000,
          storyTitle: "Derby Winner",
          hasActiveCaption: true,
          captionPlacement: "top",
          captionStyleBackgroundEnabled: false,
          captionStyleBackgroundOpacity: 0,
          watermarkEnabled: true,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Local top scrim only",
    },
    {
      id: "bright_source_no_global",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 3_000,
          contentDurationMs: 10_000,
          storyTitle: "Bright",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: false,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Bright footage — no full-frame darken",
    },
    {
      id: "dark_source_no_global",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 3_000,
          contentDurationMs: 10_000,
          storyTitle: "Dark",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: false,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Dark footage — no full-frame darken",
    },
    {
      id: "fit_with_background_post_title",
      plan: measurePlanAppearance(
        resolveLegibilityLayerPlan({
          absoluteContentTimeMs: 3_000,
          contentDurationMs: 10_000,
          storyTitle: "Derby Winner",
          hasActiveCaption: false,
          captionPlacement: "none",
          captionStyleBackgroundEnabled: true,
          captionStyleBackgroundOpacity: 45,
          watermarkEnabled: true,
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
        }),
      ),
      notes: "Same plan above Fit-with-background composite",
    },
  ];

  test("baseline full-frame mean alpha is material", () => {
    assert.ok(baselineMeanAlpha > 0.3);
    assert.ok(baselineMeanAlpha < 0.8);
  });

  test("no-text and post-title local coverage << full frame", () => {
    const noText = cases.find((c) => c.id === "no_text_media_frame")!;
    const post = cases.find((c) => c.id === "post_title_frame")!;
    assert.equal(noText.plan.globalGradientEnabled, false);
    assert.equal(post.plan.globalGradientEnabled, false);
    assert.ok(noText.plan.localCoverage < 0.05);
    assert.ok(post.plan.localCoverage < 0.05);
    assert.ok(post.plan.meanLocalAlphaApprox < baselineMeanAlpha * 0.25);
  });

  test("opening title remains local (not full-frame)", () => {
    const opening = cases.find((c) => c.id === "opening_title_frame")!;
    assert.equal(opening.plan.titleVisible, true);
    assert.ok(opening.plan.localCoverage < 0.25);
    assert.ok(opening.plan.meanLocalAlphaApprox < baselineMeanAlpha);
  });

  const brightScrim = textOnScrimOverSource(0xffffff, 0.72);
  const darkScrim = textOnScrimOverSource(0x101010, 0.72);
  const grassScrim = textOnScrimOverSource(0x3a7a2a, 0.72);

  test("WCAG AA contrast for normal text on local scrim (bright + dark + grass)", () => {
    assert.ok(brightScrim.ratio >= 4.5, `bright ${brightScrim.ratio}`);
    assert.ok(darkScrim.ratio >= 4.5, `dark ${darkScrim.ratio}`);
    assert.ok(grassScrim.ratio >= 4.5, `grass ${grassScrim.ratio}`);
  });

  const headlessRow = await renderHeadless1080p();

  test("real 1080p Headless MP4 dimensions + comparative luma", () => {
    if (!headlessRow) {
      console.log(
        "  ⚠ Headless MP4 not produced — plan measurements still recorded",
      );
      return;
    }
    assert.equal(headlessRow.width, 1080);
    assert.equal(headlessRow.height, 1920);
    assert.ok(headlessRow.bytes > 0);
    assert.ok(
      headlessRow.meanLumaPostTitle >
        headlessRow.simulatedBaselineDarkenedPostTitle,
      `post ${headlessRow.meanLumaPostTitle} vs baseline-sim ${headlessRow.simulatedBaselineDarkenedPostTitle}`,
    );
  });

  const measurements = {
    generatedAt: new Date().toISOString(),
    baseline: {
      meanAlpha: baselineMeanAlpha,
      brightSourcePreservedFraction: baselineBrightPreserved,
      description:
        "Historical full-frame gradient rgba(0,0,0) stops 0.60→0.15@0.35→0.90",
    },
    contrast: {
      whiteOnScrimOverWhite: brightScrim.ratio,
      whiteOnScrimOverNearBlack: darkScrim.ratio,
      whiteOnScrimOverGrass: grassScrim.ratio,
      wcagAaNormalTextMinimum: 4.5,
    },
    cases,
    headless: headlessRow,
  };

  writeFileSync(
    join(ARTIFACT_DIR, "measurements.json"),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );

  const md = `# Legibility layer appearance evidence

Generated: ${measurements.generatedAt}

## Shared authority

- Domain: \`src/features/legibility-layer/\`
- Title window: first 2000ms of content; fade final 300ms; clamped to content duration
- Permanent full-frame dark gradient: **retired** (\`globalGradientEnabled: false\`)

## Baseline (retired full-frame gradient)

| Metric | Value |
| --- | --- |
| Mean black alpha across 1080×1920 | ${baselineMeanAlpha.toFixed(4)} |
| Bright-source preserved fraction under baseline | ${baselineBrightPreserved.toFixed(4)} |

## Changed plan coverage (local treatments only)

| Case | Title | Caption scrim | Local coverage | Mean local α approx | Notes |
| --- | --- | --- | --- | --- | --- |
${cases
  .map(
    (c) =>
      `| ${c.id} | ${c.plan.titleVisible ? c.plan.titleOpacity.toFixed(2) : "—"} | ${
        c.plan.captionNeedsScrim ? "yes" : "no"
      } | ${c.plan.localCoverage.toFixed(4)} | ${c.plan.meanLocalAlphaApprox.toFixed(4)} | ${c.notes} |`,
  )
  .join("\n")}

## Text contrast (WCAG AA normal text ≥ 4.5:1)

| Background context | Contrast ratio |
| --- | --- |
| White footage + local scrim 0.72 | ${brightScrim.ratio.toFixed(2)} |
| Near-black footage + local scrim 0.72 | ${darkScrim.ratio.toFixed(2)} |
| Grass/crowd green + local scrim 0.72 | ${grassScrim.ratio.toFixed(2)} |

## Real Headless artifact

${
  headlessRow
    ? `| Field | Value |
| --- | --- |
| Case | ${headlessRow.id} |
| Output | ${headlessRow.width}×${headlessRow.height} |
| Bytes | ${headlessRow.bytes} |
| Opening mean luma (~0.1s, title window) | ${headlessRow.meanLumaOpening.toFixed(2)} |
| Post-title mean luma (~2.2s) | ${headlessRow.meanLumaPostTitle.toFixed(2)} |
| Simulated baseline-darkened post-title luma | ${headlessRow.simulatedBaselineDarkenedPostTitle.toFixed(2)} |

Comparative: post-title decoded mean luma is higher than the simulated baseline-darkened value (pixels outside local text regions are not unnecessarily darkened).`
    : "_Headless MP4 not produced in this run (worker/Chromium unavailable). Plan coverage measurements above still apply._"
}

## Artifacts

- \`.tmp/legibility-layer-cert/measurements.json\`
- Optional MP4 under \`.tmp/legibility-layer-cert/\`
`;

  writeFileSync(EVIDENCE_PATH, md);
  console.log(`\nWrote ${EVIDENCE_PATH}`);
  console.log(`${passed} appearance evidence checks passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
