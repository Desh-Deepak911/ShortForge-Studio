/**
 * Real Headless decoded-pixel audit for representative vertical export cases.
 * Uses local synthetic MP4s and native FFmpeg only; no provider is involved.
 */

import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildHeadlessVideoMotionReferenceFixture } from "@/features/headless-renderer/worker/testing/build-video-motion-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";

import { measureVideoQualityGeometry } from "./videoQualityAuditCorpus";

type DecodedAuditCase = {
  readonly id: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly fitMode: "fit" | "fill";
  readonly zoom: number;
  readonly profile: HeadlessRendererProfile;
  readonly minimumStructuralEdgeSsim: number;
};

const CASES: readonly DecodedAuditCase[] = [
  {
    id: "native_vertical_1080p",
    sourceWidth: 1080,
    sourceHeight: 1920,
    fitMode: "fill",
    zoom: 1,
    profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
    minimumStructuralEdgeSsim: 0.94,
  },
  {
    id: "landscape_fill_720p",
    sourceWidth: 1280,
    sourceHeight: 720,
    fitMode: "fill",
    zoom: 1,
    profile: { resolution: "720p", format: "mp4", fps: 30, quality: "high" },
    minimumStructuralEdgeSsim: 0.9,
  },
  {
    id: "landscape_fill_zoom_4k",
    sourceWidth: 3840,
    sourceHeight: 2160,
    fitMode: "fill",
    zoom: 1.25,
    profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
    minimumStructuralEdgeSsim: 0.88,
  },
];

const TARGETS = {
  "720p": { width: 720, height: 1280 },
  "1080p": { width: 1080, height: 1920 },
  "4k": { width: 2160, height: 3840 },
} as const;

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command}\n${result.stderr || result.stdout}`,
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function buildReferenceFrame(input: {
  readonly ffmpeg: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly fitMode: "fit" | "fill";
  readonly zoom: number;
}): void {
  const contain = Math.min(
    input.targetWidth / input.sourceWidth,
    input.targetHeight / input.sourceHeight,
  );
  const cover = Math.max(
    input.targetWidth / input.sourceWidth,
    input.targetHeight / input.sourceHeight,
  );
  const activeScale = (input.fitMode === "fit" ? contain : cover) * input.zoom;
  const scaledWidth = Math.max(1, Math.round(input.sourceWidth * activeScale));
  const scaledHeight = Math.max(1, Math.round(input.sourceHeight * activeScale));
  const filter = [
    `color=c=black:s=${input.targetWidth}x${input.targetHeight}:r=30[base]`,
    `[0:v]setpts=PTS-STARTPTS,scale=${scaledWidth}:${scaledHeight}:flags=bicubic[scaled]`,
    `[base][scaled]overlay=(W-w)/2:(H-h)/2:shortest=1`,
  ].join(";");
  run(input.ffmpeg, [
    "-y",
    "-ss",
    "0.25",
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
  readonly structuralEdges: boolean;
}): number {
  const comparison = input.structuralEdges
    ? "[0:v]crop=iw:ih*3/4:0:ih/4,edgedetect=low=0.05:high=0.2[actual];[1:v]crop=iw:ih*3/4:0:ih/4,edgedetect=low=0.05:high=0.2[reference];[actual][reference]ssim"
    : "[0:v]crop=iw:ih*3/4:0:ih/4[actual];[1:v]crop=iw:ih*3/4:0:ih/4[reference];[actual][reference]ssim";
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

async function renderAndMeasure(auditCase: DecodedAuditCase): Promise<{
  readonly structuralEdgeSsim: number;
  readonly sourceAppearanceSsim: number;
  readonly artifactByteLength: number;
  readonly videoCodec: string;
  readonly width: number;
  readonly height: number;
}> {
  const binaries = resolveNativeFfmpegBinaries();
  assert.equal(binaries.ok, true);
  if (!binaries.ok) throw new Error(binaries.message);

  const fixture = buildHeadlessVideoMotionReferenceFixture({
    contentDurationMs: 600,
    rendererProfile: auditCase.profile,
    sourceWidth: auditCase.sourceWidth,
    sourceHeight: auditCase.sourceHeight,
    sourceDurationSec: 1,
    trimStartMs: 0,
    sourcePattern: "smptehdbars",
    fitMode: auditCase.fitMode,
    zoom: auditCase.zoom,
  });
  const seeded = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: `video-quality-${auditCase.id}`,
  });
  const result = await seeded.worker.processOnce(1);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("Headless worker failed.");
  assert.equal(result.value.succeeded, 1);

  const stored = await seeded.stack.jobStore.getByJobIdAndOwner(
    seeded.jobId,
    seeded.ownerId,
  );
  assert.equal(stored.ok, true);
  if (!stored.ok) throw new Error("Rendered job was not stored.");
  assert.equal(stored.value.stage, "canonical");
  if (stored.value.stage !== "canonical") throw new Error("Expected canonical job.");
  const binding = stored.value.artifactObjectBinding;
  assert.ok(binding);
  const artifact = stored.value.canonicalJob.artifact;
  assert.ok(artifact);
  if (!binding || !artifact) throw new Error("Rendered artifact binding is missing.");

  const opened = await seeded.stack.storage.openOwnedObject(
    binding.storageLocator,
    seeded.ownerId,
  );
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("Rendered artifact bytes are unavailable.");

  const directory = mkdtempSync(join(tmpdir(), `video-quality-${auditCase.id}-`));
  try {
    const sourcePath = join(directory, "source.mp4");
    const artifactPath = join(directory, "artifact.mp4");
    const actualFramePath = join(directory, "actual.png");
    const referenceFramePath = join(directory, "reference.png");
    writeFileSync(sourcePath, fixture.assetBytesByUrl.get(fixture.urls.a)!);
    writeFileSync(artifactPath, opened.value.bytes);

    run(binaries.ffmpegExecutable, [
      "-y",
      "-ss",
      "0.25",
      "-i",
      artifactPath,
      "-frames:v",
      "1",
      actualFramePath,
    ]);
    const target = TARGETS[auditCase.profile.resolution];
    buildReferenceFrame({
      ffmpeg: binaries.ffmpegExecutable,
      sourcePath,
      outputPath: referenceFramePath,
      sourceWidth: auditCase.sourceWidth,
      sourceHeight: auditCase.sourceHeight,
      targetWidth: target.width,
      targetHeight: target.height,
      fitMode: auditCase.fitMode,
      zoom: auditCase.zoom,
    });
    const structuralEdgeSsim = measureFrameSsim({
      ffmpeg: binaries.ffmpegExecutable,
      actualPath: actualFramePath,
      referencePath: referenceFramePath,
      structuralEdges: true,
    });
    const sourceAppearanceSsim = measureFrameSsim({
      ffmpeg: binaries.ffmpegExecutable,
      actualPath: actualFramePath,
      referencePath: referenceFramePath,
      structuralEdges: false,
    });

    const evidenceDir = join(process.cwd(), ".tmp/video-quality-audit");
    mkdirSync(evidenceDir, { recursive: true });
    copyFileSync(actualFramePath, join(evidenceDir, `${auditCase.id}-actual.png`));
    copyFileSync(referenceFramePath, join(evidenceDir, `${auditCase.id}-reference.png`));

    assert.equal(artifact.width, target.width);
    assert.equal(artifact.height, target.height);
    assert.equal(artifact.format, "mp4");
    assert.equal(artifact.video.codec, "h264");
    assert.ok(
      structuralEdgeSsim >= auditCase.minimumStructuralEdgeSsim,
      `${auditCase.id}: structural edge SSIM ${structuralEdgeSsim}`,
    );
    assert.ok(sourceAppearanceSsim > 0 && sourceAppearanceSsim <= 1);

    const geometry = measureVideoQualityGeometry({
      id: auditCase.id,
      source: {
        id: auditCase.id,
        width: auditCase.sourceWidth,
        height: auditCase.sourceHeight,
        description: auditCase.id,
      },
      framing: {
        id: `${auditCase.fitMode}_${auditCase.zoom}`,
        fitMode: auditCase.fitMode,
        zoom: auditCase.zoom,
      },
      target: {
        id: auditCase.profile.resolution,
        width: target.width,
        height: target.height,
      },
    });

    writeFileSync(
      join(evidenceDir, `${auditCase.id}.json`),
      JSON.stringify(
        {
          kind: "measured",
          caseId: auditCase.id,
          source: { width: auditCase.sourceWidth, height: auditCase.sourceHeight },
          framing: { fitMode: auditCase.fitMode, zoom: auditCase.zoom },
          output: {
            width: artifact.width,
            height: artifact.height,
            format: artifact.format,
            videoCodec: artifact.video.codec,
            byteLength: artifact.byteLength,
          },
          geometry: {
            sourcePixelsPerOutputPixel: geometry.sourcePixelsPerOutputPixel,
            retainedSourceAreaFraction: geometry.retainedSourceAreaFraction,
            frameCoverageFraction: geometry.frameCoverageFraction,
            detailClass: geometry.detailClass,
          },
          decodedFrameStructuralEdgeSsim: structuralEdgeSsim,
          decodedFrameSourceAppearanceSsim: sourceAppearanceSsim,
          minimumStructuralEdgeSsim: auditCase.minimumStructuralEdgeSsim,
        },
        null,
        2,
      ),
    );
    return {
      structuralEdgeSsim,
      sourceAppearanceSsim,
      artifactByteLength: artifact.byteLength,
      videoCodec: artifact.video.codec,
      width: artifact.width,
      height: artifact.height,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nHeadless decoded video quality audit\n");
  let passed = 0;
  for (const auditCase of CASES) {
    const measured = await renderAndMeasure(auditCase);
    passed += 1;
    console.log(
      `  ✓ ${auditCase.id}: ${measured.width}x${measured.height}, ${measured.videoCodec}, edge SSIM ${measured.structuralEdgeSsim.toFixed(4)}, appearance SSIM ${measured.sourceAppearanceSsim.toFixed(4)}`,
    );
  }
  console.log(`\nHeadless decoded video quality audit: ${passed} PASS\n`);
}

void main();
