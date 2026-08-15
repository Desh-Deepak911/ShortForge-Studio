/**
 * Fit-with-background Headless decoded certification + 4K cost measurement.
 * Run: npm run test:fit-with-background-certification
 *
 * Evidence: docs/evidence/export/current/FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md
 * Measured artifacts: .tmp/fit-with-background-cert/
 */

import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildHeadlessVideoMotionReferenceFixture } from "@/features/headless-renderer/worker/testing/build-video-motion-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";
import { isExportManifestV5 } from "@/features/export/domain";

type CertCase = {
  readonly id: string;
  readonly responsibility: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly fitMode: "fit" | "fill";
  readonly backgroundTreatment?: "blurred_fill";
  readonly zoom: number;
  readonly profile: HeadlessRendererProfile;
  readonly sourceDurationSec: number;
  readonly trimStartMs: number;
  readonly contentDurationMs: number;
  readonly sourcePattern: "testsrc" | "smptehdbars";
  /** When set, compare structural SSIM of Fit region against a sharp Fit reference. */
  readonly expectSharpForeground: boolean;
  /** When set, corner luminance must exceed near-black (blurred fill covers canvas). */
  readonly expectCoveredBackground: boolean;
};

const TARGETS = {
  "720p": { width: 720, height: 1280 },
  "1080p": { width: 1080, height: 1920 },
  "4k": { width: 2160, height: 3840 },
} as const;

const CASES: readonly CertCase[] = [
  {
    id: "landscape_4k_to_1080_fit_with_background",
    responsibility: "decoded-1080p-fit-with-background",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fit",
    backgroundTreatment: "blurred_fill",
    zoom: 1,
    profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: true,
    expectCoveredBackground: true,
  },
  {
    id: "landscape_4k_to_4k_fit_with_background",
    responsibility: "decoded-4k-fit-with-background",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fit",
    backgroundTreatment: "blurred_fill",
    zoom: 1,
    profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: true,
    expectCoveredBackground: true,
  },
  {
    id: "trimmed_moving_landscape_1080_fit_with_background",
    responsibility: "decoded-trimmed-motion-fit-with-background",
    sourceWidth: 1920,
    sourceHeight: 1080,
    fitMode: "fit",
    backgroundTreatment: "blurred_fill",
    zoom: 1,
    profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 4,
    trimStartMs: 1000,
    contentDurationMs: 600,
    sourcePattern: "testsrc",
    expectSharpForeground: true,
    expectCoveredBackground: true,
  },
  {
    id: "legacy_fit_control_1080",
    responsibility: "decoded-legacy-fit-control",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fit",
    zoom: 1,
    profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: true,
    expectCoveredBackground: false,
  },
  {
    id: "fill_control_1080",
    responsibility: "decoded-fill-control",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fill",
    zoom: 1,
    profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: true,
    expectCoveredBackground: true,
  },
];

/** Equivalent short 4K renders for cost comparison. */
const PERF_CASES: readonly CertCase[] = [
  {
    id: "perf_4k_legacy_fit",
    responsibility: "perf-4k-legacy-fit",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fit",
    zoom: 1,
    profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: false,
    expectCoveredBackground: false,
  },
  {
    id: "perf_4k_fit_with_background",
    responsibility: "perf-4k-fit-with-background",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fit",
    backgroundTreatment: "blurred_fill",
    zoom: 1,
    profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: false,
    expectCoveredBackground: false,
  },
  {
    id: "perf_4k_fill",
    responsibility: "perf-4k-fill",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fill",
    zoom: 1,
    profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
    sourceDurationSec: 1,
    trimStartMs: 0,
    contentDurationMs: 600,
    sourcePattern: "smptehdbars",
    expectSharpForeground: false,
    expectCoveredBackground: false,
  },
];

type Measured = {
  readonly id: string;
  readonly responsibility: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly artifactByteLength: number;
  readonly renderDurationMs: number;
  readonly chromiumRenderElapsedMs: number | null;
  readonly nodeCoordinatorPeakRssBytes: number | null;
  readonly peakFrameBytes: number | null;
  readonly cornerMeanLuma: number;
  readonly foregroundStructuralSsim: number | null;
  readonly controlAppearanceSsim: number | null;
  readonly diagnostics: string[];
};

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command}\n${result.stderr || result.stdout}`,
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function fitGeometry(input: {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly zoom: number;
}): { scaledWidth: number; scaledHeight: number; offsetX: number; offsetY: number } {
  const contain = Math.min(
    input.targetWidth / input.sourceWidth,
    input.targetHeight / input.sourceHeight,
  );
  const activeScale = contain * input.zoom;
  const scaledWidth = Math.max(1, Math.round(input.sourceWidth * activeScale));
  const scaledHeight = Math.max(1, Math.round(input.sourceHeight * activeScale));
  return {
    scaledWidth,
    scaledHeight,
    offsetX: Math.round((input.targetWidth - scaledWidth) / 2),
    offsetY: Math.round((input.targetHeight - scaledHeight) / 2),
  };
}

function buildSharpFitReference(input: {
  readonly ffmpeg: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly zoom: number;
  readonly seekSec: number;
}): void {
  const geometry = fitGeometry(input);
  const filter = [
    `color=c=black:s=${input.targetWidth}x${input.targetHeight}:r=30[base]`,
    `[0:v]setpts=PTS-STARTPTS,scale=${geometry.scaledWidth}:${geometry.scaledHeight}:flags=bicubic[scaled]`,
    `[base][scaled]overlay=${geometry.offsetX}:${geometry.offsetY}:shortest=1`,
  ].join(";");
  run(input.ffmpeg, [
    "-y",
    "-ss",
    String(input.seekSec),
    "-i",
    input.sourcePath,
    "-filter_complex",
    filter,
    "-frames:v",
    "1",
    input.outputPath,
  ]);
}

function measureFrameSsim(input: {
  readonly ffmpeg: string;
  readonly actualPath: string;
  readonly referencePath: string;
  readonly crop?: string;
  readonly structuralEdges: boolean;
}): number {
  const crop = input.crop ? `${input.crop},` : "";
  const comparison = input.structuralEdges
    ? `[0:v]${crop}edgedetect=low=0.05:high=0.2[actual];[1:v]${crop}edgedetect=low=0.05:high=0.2[reference];[actual][reference]ssim`
    : `[0:v]${crop}null[actual];[1:v]${crop}null[reference];[actual][reference]ssim`;
  const output = run(input.ffmpeg, [
    "-i",
    input.actualPath,
    "-i",
    input.referencePath,
    "-lavfi",
    comparison,
    "-f",
    "null",
    "-",
  ]);
  const match = output.match(/All:([0-9.]+)/g)?.at(-1)?.match(/All:([0-9.]+)/);
  if (!match) throw new Error(`Unable to parse SSIM output:\n${output}`);
  return Number(match[1]);
}

function measureCornerMeanLuma(input: {
  readonly ffmpeg: string;
  readonly framePath: string;
  readonly width: number;
  readonly height: number;
}): number {
  const cropW = Math.min(48, Math.max(8, Math.floor(input.width / 40)));
  const cropH = Math.min(48, Math.max(8, Math.floor(input.height / 40)));
  const rawPath = `${input.framePath}.corner.raw`;
  run(input.ffmpeg, [
    "-y",
    "-i",
    input.framePath,
    "-vf",
    `crop=${cropW}:${cropH}:0:0,format=gray`,
    "-f",
    "rawvideo",
    rawPath,
  ]);
  const bytes = readFileSync(rawPath);
  assert.ok(bytes.length > 0, "corner sample empty");
  let sum = 0;
  for (const value of bytes) sum += value;
  return sum / bytes.length;
}

async function renderCase(certCase: CertCase): Promise<Measured> {
  const binaries = resolveNativeFfmpegBinaries();
  assert.equal(binaries.ok, true);
  if (!binaries.ok) throw new Error(binaries.message);

  const fixture = buildHeadlessVideoMotionReferenceFixture({
    contentDurationMs: certCase.contentDurationMs,
    rendererProfile: certCase.profile,
    sourceWidth: certCase.sourceWidth,
    sourceHeight: certCase.sourceHeight,
    sourceDurationSec: certCase.sourceDurationSec,
    trimStartMs: certCase.trimStartMs,
    sourcePattern: certCase.sourcePattern,
    fitMode: certCase.fitMode,
    zoom: certCase.zoom,
    backgroundTreatment: certCase.backgroundTreatment,
  });

  if (certCase.backgroundTreatment === "blurred_fill") {
    assert.ok(isExportManifestV5(fixture.manifestV3));
    assert.ok(
      fixture.manifestV3.requiredCapabilities.includes(
        "media-background-treatment-blurred-fill-v1",
      ),
    );
  }

  const started = performance.now();
  const seeded = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: `fit-bg-cert-${certCase.id}`,
  });
  const result = await seeded.worker.processOnce(1);
  const renderDurationMs = performance.now() - started;
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("Headless worker failed.");
  assert.equal(result.value.succeeded, 1, JSON.stringify(result));
  const evidence = result.value.lastEvidence;

  const stored = await seeded.stack.jobStore.getByJobIdAndOwner(
    seeded.jobId,
    seeded.ownerId,
  );
  assert.equal(stored.ok, true);
  if (!stored.ok) throw new Error("Rendered job was not stored.");
  assert.equal(stored.value.stage, "canonical");
  if (stored.value.stage !== "canonical") throw new Error("Expected canonical job.");
  const binding = stored.value.artifactObjectBinding;
  const artifact = stored.value.canonicalJob.artifact;
  assert.ok(binding && artifact);
  if (!binding || !artifact) throw new Error("Rendered artifact binding is missing.");

  const opened = await seeded.stack.storage.openOwnedObject(
    binding.storageLocator,
    seeded.ownerId,
  );
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("Rendered artifact bytes are unavailable.");

  const target = TARGETS[certCase.profile.resolution];
  assert.equal(artifact.width, target.width);
  assert.equal(artifact.height, target.height);
  assert.equal(artifact.format, "mp4");
  assert.equal(artifact.video.codec, "h264");

  const directory = mkdtempSync(join(tmpdir(), `fit-bg-cert-${certCase.id}-`));
  const diagnostics: string[] = [];
  try {
    const sourcePath = join(directory, "source.mp4");
    const artifactPath = join(directory, "artifact.mp4");
    const actualFramePath = join(directory, "actual.png");
    const fitReferencePath = join(directory, "fit-reference.png");
    writeFileSync(sourcePath, fixture.assetBytesByUrl.get(fixture.urls.a)!);
    writeFileSync(artifactPath, opened.value.bytes);

    const seekSec = 0.25;
    run(binaries.ffmpegExecutable, [
      "-y",
      "-ss",
      String(seekSec),
      "-i",
      artifactPath,
      "-frames:v",
      "1",
      actualFramePath,
    ]);

    const cornerMeanLuma = measureCornerMeanLuma({
      ffmpeg: binaries.ffmpegExecutable,
      framePath: actualFramePath,
      width: target.width,
      height: target.height,
    });

    let foregroundStructuralSsim: number | null = null;
    if (certCase.expectSharpForeground && certCase.fitMode === "fit") {
      buildSharpFitReference({
        ffmpeg: binaries.ffmpegExecutable,
        sourcePath,
        outputPath: fitReferencePath,
        sourceWidth: certCase.sourceWidth,
        sourceHeight: certCase.sourceHeight,
        targetWidth: target.width,
        targetHeight: target.height,
        zoom: certCase.zoom,
        seekSec: certCase.trimStartMs / 1000 + seekSec,
      });
      const geometry = fitGeometry({
        sourceWidth: certCase.sourceWidth,
        sourceHeight: certCase.sourceHeight,
        targetWidth: target.width,
        targetHeight: target.height,
        zoom: certCase.zoom,
      });
      const inset = Math.max(4, Math.round(Math.min(geometry.scaledWidth, geometry.scaledHeight) * 0.08));
      const cropW = Math.max(16, geometry.scaledWidth - inset * 2);
      const cropH = Math.max(16, geometry.scaledHeight - inset * 2);
      const cropX = geometry.offsetX + inset;
      const cropY = geometry.offsetY + inset;
      foregroundStructuralSsim = measureFrameSsim({
        ffmpeg: binaries.ffmpegExecutable,
        actualPath: actualFramePath,
        referencePath: fitReferencePath,
        crop: `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
        structuralEdges: true,
      });
      assert.ok(
        foregroundStructuralSsim >= 0.82,
        `${certCase.id}: foreground structural SSIM ${foregroundStructuralSsim}`,
      );
    }

    if (certCase.expectCoveredBackground) {
      assert.ok(
        cornerMeanLuma >= 18,
        `${certCase.id}: corner mean luma ${cornerMeanLuma} suggests uncovered/black edges`,
      );
    }
    if (certCase.id === "legacy_fit_control_1080") {
      assert.ok(
        cornerMeanLuma < 12,
        `${certCase.id}: legacy Fit control should keep near-black letterbox (luma ${cornerMeanLuma})`,
      );
    }

    const evidenceDir = join(process.cwd(), ".tmp/fit-with-background-cert");
    mkdirSync(evidenceDir, { recursive: true });
    copyFileSync(actualFramePath, join(evidenceDir, `${certCase.id}-actual.png`));
    writeFileSync(join(evidenceDir, `${certCase.id}.mp4`), opened.value.bytes);

    const measured: Measured = {
      id: certCase.id,
      responsibility: certCase.responsibility,
      width: artifact.width,
      height: artifact.height,
      frameCount: Math.max(1, Math.round((artifact.durationMs / 1000) * artifact.fps)),
      artifactByteLength: artifact.byteLength,
      renderDurationMs,
      chromiumRenderElapsedMs: evidence?.metrics?.chromiumRenderElapsedMs ?? null,
      nodeCoordinatorPeakRssBytes: evidence?.nodeCoordinatorPeakRssBytes ?? null,
      peakFrameBytes: evidence?.metrics?.peakFrameBytes ?? null,
      cornerMeanLuma,
      foregroundStructuralSsim,
      controlAppearanceSsim: null,
      diagnostics,
    };
    writeFileSync(
      join(evidenceDir, `${certCase.id}.json`),
      JSON.stringify({ kind: "measured", ...measured }, null, 2),
    );
    return measured;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeEvidenceReport(input: {
  readonly certification: readonly Measured[];
  readonly performance: readonly Measured[];
}): void {
  const evidenceDir = join(
    process.cwd(),
    "docs/evidence/export/current",
  );
  mkdirSync(evidenceDir, { recursive: true });
  const perfById = new Map(input.performance.map((row) => [row.id, row]));
  const legacy = perfById.get("perf_4k_legacy_fit");
  const fitBg = perfById.get("perf_4k_fit_with_background");
  const fill = perfById.get("perf_4k_fill");
  const overheadVsFit =
    legacy && fitBg
      ? ((fitBg.renderDurationMs - legacy.renderDurationMs) / legacy.renderDurationMs) * 100
      : null;
  const overheadVsFill =
    fill && fitBg
      ? ((fitBg.renderDurationMs - fill.renderDurationMs) / fill.renderDurationMs) * 100
      : null;

  const lines = [
    "# Fit-with-background Headless certification",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Renderer compatibility",
    "",
    "- `backgroundTreatment: blurred_fill` escalates ExportManifest to **v5** with required capability `media-background-treatment-blurred-fill-v1`.",
    "- Browser and Headless advertise the capability; older renderers without it reject the job (no silent legacy Fit).",
    "- Draw hydration is gated on the capability; blur filter failure remains non-terminal (dimmed Fill + sharp Fit).",
    "",
    "## Decoded cases",
    "",
    "| Case | Output | Frames | Bytes | Corner luma | Foreground edge SSIM | Wall ms | Chromium ms | Peak RSS | Peak frame B |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...input.certification.map((row) => {
      const ssim =
        row.foregroundStructuralSsim == null
          ? "n/a"
          : row.foregroundStructuralSsim.toFixed(4);
      return `| ${row.id} | ${row.width}×${row.height} | ${row.frameCount} | ${row.artifactByteLength} | ${row.cornerMeanLuma.toFixed(1)} | ${ssim} | ${row.renderDurationMs.toFixed(0)} | ${row.chromiumRenderElapsedMs ?? "n/a"} | ${row.nodeCoordinatorPeakRssBytes ?? "n/a"} | ${row.peakFrameBytes ?? "n/a"} |`;
    }),
    "",
    "## 4K cost comparison (equivalent short renders)",
    "",
    "| Case | Frames | Bytes | Wall ms | Chromium ms | Peak RSS | Peak frame B |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...input.performance.map(
      (row) =>
        `| ${row.id} | ${row.frameCount} | ${row.artifactByteLength} | ${row.renderDurationMs.toFixed(0)} | ${row.chromiumRenderElapsedMs ?? "n/a"} | ${row.nodeCoordinatorPeakRssBytes ?? "n/a"} | ${row.peakFrameBytes ?? "n/a"} |`,
    ),
    "",
    overheadVsFit == null
      ? "- Relative overhead vs legacy Fit: n/a"
      : `- Relative overhead Fit-with-background vs legacy Fit: **${overheadVsFit.toFixed(1)}%**`,
    overheadVsFill == null
      ? "- Relative overhead vs Fill: n/a"
      : `- Relative overhead Fit-with-background vs Fill: **${overheadVsFill.toFixed(1)}%**`,
    "",
    "## Objective checks",
    "",
    "- Exact output dimensions matched Headless target ladder.",
    "- Fit-with-background corners are not near-black (background covers canvas).",
    "- Legacy Fit control retains near-black letterbox.",
    "- Foreground Fit crop retains high structural-edge SSIM vs sharp Fit reference (not blurred).",
    "- Trimmed motion case uses trimStartMs=1000 with moving `testsrc` source.",
    "",
    "## Artifacts",
    "",
    "- Measured JSON + PNG + MP4 under `.tmp/fit-with-background-cert/`.",
    "",
  ];
  writeFileSync(
    join(evidenceDir, "FIT_WITH_BACKGROUND_HEADLESS_CERTIFICATION.md"),
    `${lines.join("\n")}\n`,
  );
}

async function main(): Promise<void> {
  console.log("\nFit-with-background Headless certification\n");
  const certification: Measured[] = [];
  for (const certCase of CASES) {
    const measured = await renderCase(certCase);
    certification.push(measured);
    console.log(
      `  ✓ ${certCase.id}: ${measured.width}x${measured.height}, frames=${measured.frameCount}, luma=${measured.cornerMeanLuma.toFixed(1)}, fgSSIM=${measured.foregroundStructuralSsim?.toFixed(4) ?? "n/a"}, ${measured.renderDurationMs.toFixed(0)}ms`,
    );
  }

  console.log("\n4K cost comparison\n");
  const performanceRows: Measured[] = [];
  for (const certCase of PERF_CASES) {
    const measured = await renderCase(certCase);
    performanceRows.push(measured);
    console.log(
      `  ✓ ${certCase.id}: ${measured.renderDurationMs.toFixed(0)}ms, ${measured.artifactByteLength} bytes, frames=${measured.frameCount}`,
    );
  }

  writeEvidenceReport({
    certification,
    performance: performanceRows,
  });
  console.log(
    "\nFit-with-background Headless certification: PASS (evidence written)\n",
  );
}

void main();
