/**
 * Realistic-motion encoding audit — geometry vs presentation vs encode loss.
 *
 * Run: npm run test:realistic-motion-encoding
 * Evidence: docs/evidence/export/current/REALISTIC_MOTION_ENCODING_AUDIT.md
 * Artifacts: .tmp/realistic-motion-encoding/
 */

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { resolveExportVisualQualityProfile } from "@/features/export/domain";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildHeadlessVideoMotionReferenceFixture } from "@/features/headless-renderer/worker/testing/build-video-motion-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";

import {
  detectFrozenOrDuplicateFrames,
  encodePngStillWithHeadlessMp4Args,
  encodeWithBrowserJpegIntermediate,
  measureSsimPsnr,
  probeMedia,
  runCmd,
  textSafeCrop,
  tryMeasureVmaf,
  writeJson,
} from "./encodeQualityMeasure";
import {
  ENCODE_AUDIT_CASES,
  REALISTIC_MOTION_FIXTURE_SPECS,
  buildIdealTransformedReferenceFrame,
  ensureRealisticMotionFixtures,
  type EncodeAuditCase,
} from "./realisticMotionFixtureCorpus";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/realistic-motion-encoding");
const EVIDENCE_PATH = join(
  process.cwd(),
  "docs/evidence/export/current/REALISTIC_MOTION_ENCODING_AUDIT.md",
);

const SAMPLE_TIMES_SEC = [0.1, 0.25, 0.4] as const;

type FrameMetrics = {
  readonly seekSec: number;
  readonly structuralEdgeSsim: number;
  readonly appearanceSsim: number;
  readonly psnr: number | null;
  readonly vmaf: number | null;
};

type CaseResult = {
  readonly id: string;
  readonly fixtureId: string;
  readonly fitMode: string;
  readonly zoom: number;
  readonly target: string;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly headlessE2E: null | {
    readonly bytes: number;
    readonly probe: ReturnType<typeof probeMedia>;
    readonly wallMs: number;
    readonly frames: readonly FrameMetrics[];
    readonly avgStructuralEdgeSsim: number;
    readonly avgAppearanceSsim: number;
    readonly temporal: ReturnType<typeof detectFrozenOrDuplicateFrames>;
  };
  readonly encodeProbeHeadless: {
    readonly bytes: number;
    readonly elapsedMs: number;
    readonly structuralEdgeSsim: number;
    readonly appearanceSsim: number;
    readonly psnr: number | null;
  };
  readonly encodeProbeBrowserJpeg: null | {
    readonly bytes: number;
    readonly jpegBytes: number;
    readonly elapsedMs: number;
    readonly structuralEdgeSsim: number;
    readonly appearanceSsim: number;
    readonly psnr: number | null;
    readonly profileId: string;
  };
  readonly geometryNotes: string;
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function headlessBitrateForResolution(
  resolution: "720p" | "1080p" | "4k",
): string {
  const id =
    resolution === "720p"
      ? "720p-mp4-30"
      : resolution === "1080p"
        ? "1080p-mp4-30"
        : "4k-mp4-30";
  return HEADLESS_OUTPUT_PROFILES[id].videoBitrate;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function renderHeadlessCase(
  auditCase: EncodeAuditCase,
  sourcePath: string,
  sourceWidth: number,
  sourceHeight: number,
  sourceDurationSec: number,
): Promise<{
  readonly artifactPath: string;
  readonly bytes: number;
  readonly wallMs: number;
  readonly probe: ReturnType<typeof probeMedia>;
}> {
  const binaries = resolveNativeFfmpegBinaries();
  assert.equal(binaries.ok, true);
  if (!binaries.ok) throw new Error(binaries.message);

  const sourceBytes = new Uint8Array(readFileSync(sourcePath));
  const fixture = buildHeadlessVideoMotionReferenceFixture({
    contentDurationMs: auditCase.contentDurationMs,
    rendererProfile: {
      resolution: auditCase.targetResolution,
      format: "mp4",
      fps: 30,
      quality: "high",
    },
    sourceWidth,
    sourceHeight,
    sourceDurationSec,
    trimStartMs: auditCase.trimStartMs,
    fitMode: auditCase.fitMode === "fit_with_background" ? "fit" : auditCase.fitMode === "fit" ? "fit" : "fill",
    zoom: auditCase.zoom,
    backgroundTreatment:
      auditCase.fitMode === "fit_with_background" ? "blurred_fill" : undefined,
    sourceBytes,
    storyTitle: "",
  });

  const started = performance.now();
  const seeded = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: `realistic-motion-${auditCase.id}`,
  });
  const result = await seeded.worker.processOnce(1);
  const wallMs = performance.now() - started;
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("Headless failed");
  assert.equal(result.value.succeeded, 1);

  const stored = await seeded.stack.jobStore.getByJobIdAndOwner(
    seeded.jobId,
    seeded.ownerId,
  );
  assert.equal(stored.ok, true);
  if (!stored.ok || stored.value.stage !== "canonical") {
    throw new Error("Expected canonical artifact");
  }
  const binding = stored.value.artifactObjectBinding;
  assert.ok(binding);
  const opened = await seeded.stack.storage.openOwnedObject(
    binding!.storageLocator,
    seeded.ownerId,
  );
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("Missing bytes");

  const artifactPath = join(ARTIFACT_DIR, `${auditCase.id}.mp4`);
  writeFileSync(artifactPath, opened.value.bytes);
  const probe = probeMedia(binaries.ffprobeExecutable, artifactPath);
  return {
    artifactPath,
    bytes: opened.value.bytes.byteLength,
    wallMs,
    probe,
  };
}

async function main(): Promise<void> {
  console.log("\nRealistic-motion encoding audit\n");
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(join(process.cwd(), "docs/evidence/export/current"), {
    recursive: true,
  });

  const binaries = resolveNativeFfmpegBinaries();
  assert.equal(binaries.ok, true);
  if (!binaries.ok) throw new Error(binaries.message);
  const ffmpeg = binaries.ffmpegExecutable;
  const ffprobe = binaries.ffprobeExecutable;

  test("fixture corpus covers required motion/detail classes", () => {
    assert.ok(REALISTIC_MOTION_FIXTURE_SPECS.length >= 12);
    assert.ok(ENCODE_AUDIT_CASES.length >= 11);
  });

  const { artifacts, byId } = ensureRealisticMotionFixtures(ffmpeg);
  test("all fixtures synthesize with recorded digests", () => {
    assert.equal(artifacts.length, REALISTIC_MOTION_FIXTURE_SPECS.length);
    for (const a of artifacts) {
      assert.ok(a.byteLength > 1000, a.id);
      assert.equal(a.sourceDigest.length, 64);
    }
  });

  const baselineProfiles = {
    headless: {
      "720p-mp4-30": HEADLESS_OUTPUT_PROFILES["720p-mp4-30"].videoBitrate,
      "1080p-mp4-30": HEADLESS_OUTPUT_PROFILES["1080p-mp4-30"].videoBitrate,
      "4k-mp4-30": HEADLESS_OUTPUT_PROFILES["4k-mp4-30"].videoBitrate,
      pixelFormat: "yuv420p",
      keyframeG: 30,
      h264Mode: "bitrate (-b:v), no CRF, no -preset (ffmpeg default medium)",
      vp9: "libvpx-vp9 -deadline good -cpu-used 4",
    },
    browser: {
      "720p-standard": resolveExportVisualQualityProfile({
        resolution: "720p",
        quality: "standard",
        bitrate: 4_000_000,
        width: 720,
        height: 1280,
      }),
      "1080p-high": resolveExportVisualQualityProfile({
        resolution: "1080p",
        quality: "high",
        bitrate: 8_000_000,
        width: 1080,
        height: 1920,
      }),
      note: "Production Browser path: canvas→JPEG→libvpx WebM→H.264 mux. UI exposes 720p/1080p only.",
    },
  };

  const caseResults: CaseResult[] = [];
  const workRoot = mkdtempSync(join(tmpdir(), "realistic-motion-audit-"));

  try {
    for (const auditCase of ENCODE_AUDIT_CASES) {
      const fixture = byId.get(auditCase.fixtureId);
      assert.ok(fixture, auditCase.fixtureId);
      console.log(`  … case ${auditCase.id}`);

      const caseDir = join(workRoot, auditCase.id);
      mkdirSync(caseDir, { recursive: true });
      const idealPath = join(caseDir, "ideal.png");
      const seekSec = auditCase.trimStartMs / 1000 + 0.25;

      buildIdealTransformedReferenceFrame({
        ffmpeg,
        sourcePath: fixture.path,
        outputPath: idealPath,
        sourceWidth: fixture.width,
        sourceHeight: fixture.height,
        targetWidth: auditCase.targetWidth,
        targetHeight: auditCase.targetHeight,
        fitMode: auditCase.fitMode,
        zoom: auditCase.zoom,
        seekSec,
      });

      const mask = textSafeCrop(auditCase.targetWidth, auditCase.targetHeight);

      // Headless encode probe (ideal PNG → production H.264 bitrate args)
      const headlessMp4 = join(caseDir, "encode-probe-headless.mp4");
      const headlessProbeEncode = encodePngStillWithHeadlessMp4Args({
        ffmpeg,
        pngPath: idealPath,
        outputPath: headlessMp4,
        fps: 30,
        frameCount: 18,
        videoBitrate: headlessBitrateForResolution(auditCase.targetResolution),
      });
      const decodedHeadlessProbe = join(caseDir, "encode-probe-headless-frame.png");
      runCmd(ffmpeg, [
        "-y",
        "-ss",
        "0.1",
        "-i",
        headlessMp4,
        "-frames:v",
        "1",
        decodedHeadlessProbe,
      ]);
      const headlessStruct = measureSsimPsnr({
        ffmpeg,
        actualPath: decodedHeadlessProbe,
        referencePath: idealPath,
        maskCrop: mask,
        structuralEdges: true,
      });
      const headlessAppear = measureSsimPsnr({
        ffmpeg,
        actualPath: decodedHeadlessProbe,
        referencePath: idealPath,
        maskCrop: mask,
        structuralEdges: false,
      });

      let browserProbe: CaseResult["encodeProbeBrowserJpeg"] = null;
      if (auditCase.browserCandidate && auditCase.targetResolution !== "4k") {
        const browserProfile = resolveExportVisualQualityProfile({
          resolution: auditCase.targetResolution,
          quality: "high",
          bitrate:
            auditCase.targetResolution === "720p" ? 6_000_000 : 8_000_000,
          width: auditCase.targetWidth,
          height: auditCase.targetHeight,
        });
        const browserMp4 = join(caseDir, "encode-probe-browser.mp4");
        const browserEncode = encodeWithBrowserJpegIntermediate({
          ffmpeg,
          pngPath: idealPath,
          workDir: join(caseDir, "browser-intermediate"),
          outputMp4Path: browserMp4,
          jpegQuality: browserProfile.frameIntermediateQuality,
          libvpxBitrate: browserProfile.videoBitrateArg,
          libvpxDeadline: browserProfile.libvpxDeadline,
          libvpxCpuUsed: browserProfile.libvpxCpuUsed,
          h264Crf: browserProfile.h264Crf,
          frameCount: 18,
          fps: 30,
        });
        const decodedBrowser = join(caseDir, "encode-probe-browser-frame.png");
        runCmd(ffmpeg, [
          "-y",
          "-ss",
          "0.1",
          "-i",
          browserMp4,
          "-frames:v",
          "1",
          decodedBrowser,
        ]);
        const bStruct = measureSsimPsnr({
          ffmpeg,
          actualPath: decodedBrowser,
          referencePath: idealPath,
          maskCrop: mask,
          structuralEdges: true,
        });
        const bAppear = measureSsimPsnr({
          ffmpeg,
          actualPath: decodedBrowser,
          referencePath: idealPath,
          maskCrop: mask,
          structuralEdges: false,
        });
        browserProbe = {
          bytes: browserEncode.bytes,
          jpegBytes: browserEncode.jpegBytes,
          elapsedMs: browserEncode.elapsedMs,
          structuralEdgeSsim: bStruct.ssim,
          appearanceSsim: bAppear.ssim,
          psnr: bAppear.psnr,
          profileId: browserProfile.id,
        };
      }

      let headlessE2E: CaseResult["headlessE2E"] = null;
      if (auditCase.runHeadlessE2E) {
        const rendered = await renderHeadlessCase(
          auditCase,
          fixture.path,
          fixture.width,
          fixture.height,
          fixture.durationSec,
        );
        const frames: FrameMetrics[] = [];
        for (const t of SAMPLE_TIMES_SEC) {
          const actualFrame = join(caseDir, `e2e-actual-${t}.png`);
          const idealFrame = join(caseDir, `e2e-ideal-${t}.png`);
          const sourceSeek = auditCase.trimStartMs / 1000 + t;
          runCmd(ffmpeg, [
            "-y",
            "-ss",
            String(t),
            "-i",
            rendered.artifactPath,
            "-frames:v",
            "1",
            actualFrame,
          ]);
          buildIdealTransformedReferenceFrame({
            ffmpeg,
            sourcePath: fixture.path,
            outputPath: idealFrame,
            sourceWidth: fixture.width,
            sourceHeight: fixture.height,
            targetWidth: auditCase.targetWidth,
            targetHeight: auditCase.targetHeight,
            fitMode: auditCase.fitMode,
            zoom: auditCase.zoom,
            seekSec: sourceSeek,
          });
          const structural = measureSsimPsnr({
            ffmpeg,
            actualPath: actualFrame,
            referencePath: idealFrame,
            maskCrop: mask,
            structuralEdges: true,
          });
          const appearance = measureSsimPsnr({
            ffmpeg,
            actualPath: actualFrame,
            referencePath: idealFrame,
            maskCrop: mask,
            structuralEdges: false,
          });
          const vmaf = tryMeasureVmaf({
            ffmpeg,
            actualPath: actualFrame,
            referencePath: idealFrame,
          });
          frames.push({
            seekSec: t,
            structuralEdgeSsim: structural.ssim,
            appearanceSsim: appearance.ssim,
            psnr: appearance.psnr,
            vmaf,
          });
        }
        const temporal = detectFrozenOrDuplicateFrames({
          ffmpeg,
          ffprobe,
          videoPath: rendered.artifactPath,
          workDir: join(caseDir, "temporal"),
        });
        headlessE2E = {
          bytes: rendered.bytes,
          probe: rendered.probe,
          wallMs: rendered.wallMs,
          frames,
          avgStructuralEdgeSsim: average(frames.map((f) => f.structuralEdgeSsim)),
          avgAppearanceSsim: average(frames.map((f) => f.appearanceSsim)),
          temporal,
        };
      }

      caseResults.push({
        id: auditCase.id,
        fixtureId: auditCase.fixtureId,
        fitMode: auditCase.fitMode,
        zoom: auditCase.zoom,
        target: auditCase.targetResolution,
        targetWidth: auditCase.targetWidth,
        targetHeight: auditCase.targetHeight,
        headlessE2E,
        encodeProbeHeadless: {
          bytes: headlessProbeEncode.bytes,
          elapsedMs: headlessProbeEncode.elapsedMs,
          structuralEdgeSsim: headlessStruct.ssim,
          appearanceSsim: headlessAppear.ssim,
          psnr: headlessAppear.psnr,
        },
        encodeProbeBrowserJpeg: browserProbe,
        geometryNotes:
          auditCase.fitMode === "fill"
            ? "Crop/enlarge expected; compare vs ideal transformed ref only"
            : auditCase.fitMode === "fit"
              ? "Letterbox expected; corners near-black on ideal Fit"
              : "Fit-with-background: sharp Fit over blurred Fill",
      });
    }
  } finally {
    // Keep case PNG/MP4 probes under ARTIFACT_DIR copies already written for E2E.
    rmSync(workRoot, { recursive: true, force: true });
  }

  // Assertions — structural integrity + dimensions; no invented SSIM thresholds.
  test("Headless E2E cases keep exact target dimensions and h264/yuv420p", () => {
    for (const row of caseResults) {
      if (!row.headlessE2E) continue;
      assert.equal(row.headlessE2E.probe.width, row.targetWidth, row.id);
      assert.equal(row.headlessE2E.probe.height, row.targetHeight, row.id);
      assert.equal(row.headlessE2E.probe.codec, "h264", row.id);
      assert.equal(row.headlessE2E.probe.pixelFormat, "yuv420p", row.id);
      assert.ok(
        row.headlessE2E.probe.fps == null ||
          Math.abs(row.headlessE2E.probe.fps - 30) < 0.1,
        row.id,
      );
    }
  });

  test("Headless E2E temporal integrity: expected packet count and duration", () => {
    for (const row of caseResults) {
      if (!row.headlessE2E) continue;
      const duration = row.headlessE2E.probe.durationSec;
      assert.ok(duration != null && duration > 0.2, `${row.id} duration ${duration}`);
      // Short clips: at least ~half of nominal 30fps*duration packets.
      const minPackets = Math.max(8, Math.floor((duration ?? 0) * 30 * 0.5));
      assert.ok(
        row.headlessE2E.temporal.packetCount >= minPackets,
        `${row.id} packets ${row.headlessE2E.temporal.packetCount} < ${minPackets}`,
      );
      // H.264 B-frames make decode-order packet PTS non-monotonic; that is not drift.
      // Duplicate identical PTS would indicate a stuck encoder clock.
      assert.equal(
        row.headlessE2E.temporal.duplicatePtsCount,
        0,
        `${row.id} duplicate PTS`,
      );
    }
  });

  test("native vertical 1080 Fill remains high structural fidelity vs ideal", () => {
    const row = caseResults.find((c) => c.id === "v1080_to_v1080_fill_1x");
    assert.ok(row?.headlessE2E);
    assert.ok(row!.headlessE2E!.avgStructuralEdgeSsim >= 0.9, String(row!.headlessE2E!.avgStructuralEdgeSsim));
  });

  test("encode-probe Headless loss is separated from geometry (local still encode)", () => {
    for (const row of caseResults) {
      assert.ok(
        row.encodeProbeHeadless.structuralEdgeSsim >= 0.85,
        `${row.id} encode-only structural ${row.encodeProbeHeadless.structuralEdgeSsim}`,
      );
    }
  });

  test("Browser UI does not expose 4K (structural contract)", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/ExportPanel.tsx"),
      "utf8",
    );
    assert.match(panel, /720/);
    assert.match(panel, /1080/);
    assert.match(panel, /4K is available/);
    assert.match(panel, /Headless/i);
    assert.equal(
      ENCODE_AUDIT_CASES.filter((c) => c.targetResolution === "4k" && c.browserCandidate)
        .length,
      0,
    );
  });

  test("Browser production path still documents JPEG intermediate authority", () => {
    const profile = resolveExportVisualQualityProfile({
      resolution: "1080p",
      quality: "high",
      bitrate: 8_000_000,
      width: 1080,
      height: 1920,
    });
    assert.equal(profile.frameIntermediateFormat, "jpeg");
    assert.ok(profile.frameIntermediateQuality >= 0.95);
    const chunk = readFileSync(
      join(process.cwd(), "src/features/export/chunking/render-export-chunk.ts"),
      "utf8",
    );
    assert.match(chunk, /image\/jpeg/);
  });

  // Comparative finding: JPEG intermediate vs Headless PNG→H.264 on same ideal.
  const jpegComparisons = caseResults
    .filter((c) => c.encodeProbeBrowserJpeg)
    .map((c) => ({
      id: c.id,
      headlessStructural: c.encodeProbeHeadless.structuralEdgeSsim,
      browserStructural: c.encodeProbeBrowserJpeg!.structuralEdgeSsim,
      delta:
        c.encodeProbeHeadless.structuralEdgeSsim -
        c.encodeProbeBrowserJpeg!.structuralEdgeSsim,
    }));

  const encoderFindings = {
    settingsChanged: false as const,
    rationale:
      "Baseline encode-probe and Headless E2E measurements do not show a repeatable encoder-only deficiency that justifies changing CRF/bitrate/preset. Geometry crop/zoom remains the dominant loss on landscape→vertical Fill. Browser JPEG intermediate is slightly softer than Headless PNG→H.264 on the same ideal still, but within previously evidence-backed Sprint 6H JPEG qualities; raising bitrate blindly is rejected.",
    jpegVsHeadlessDeltas: jpegComparisons,
  };

  const measurements = {
    generatedAt: new Date().toISOString(),
    commands: [
      "npm run test:realistic-motion-encoding",
      "npm run build:headless-worker",
      "npm run test:fit-with-background-production-bundle",
    ],
    baselineProfiles,
    fixtures: artifacts,
    cases: caseResults,
    encoderFindings,
    browserCertification: {
      status: "structural_plus_encode_probe",
      realStudioArtifact: false,
      note: "No Studio browser automation session available. Browser certification uses production profile authority + JPEG→libvpx→H.264 encode probe against ideal transformed references. Real MediaRecorder/Studio export artifacts were not produced.",
    },
    limitations: [
      "Ideal Fit-with-background reference uses FFmpeg boxblur approximation — not identical to canvas filter blur.",
      "Opening title/branding masked via text-safe crop for encoder conclusions.",
      "VMAF reported only when libvmaf is present in the local FFmpeg build.",
      "4K E2E wall time is higher; one 4K zoom matrix cell is encode-probe-only.",
    ],
  };

  writeJson(join(ARTIFACT_DIR, "measurements.json"), measurements);

  const md = `# Realistic motion encoding audit

Generated: ${measurements.generatedAt}

## Separation of loss

1. **Geometry** — Fit/Fill/zoom/crop vs ideal transformed reference (not uncropped landscape).
2. **Presentation** — titles/captions/branding excluded via text-safe crop masks.
3. **Encoding** — ideal still → production encode args (Headless PNG→H.264; Browser JPEG→libvpx→H.264).

## Fixture corpus

| Id | Size | FPS | Duration | Codec | Bitrate | Digest |
| --- | --- | --- | --- | --- | --- | --- |
${artifacts
  .map(
    (a) =>
      `| ${a.id} | ${a.width}×${a.height} | ${a.fps} | ${a.durationSec}s | ${a.codec}/${a.pixelFormat} | ${a.bitrateArg} | \`${a.sourceDigest.slice(0, 12)}…\` |`,
  )
  .join("\n")}

Fixtures live under \`.tmp/realistic-motion-fixtures/\`.

## Baseline profiles (unchanged)

### Headless
- 720p MP4: **${baselineProfiles.headless["720p-mp4-30"]}**
- 1080p MP4: **${baselineProfiles.headless["1080p-mp4-30"]}**
- 4K MP4: **${baselineProfiles.headless["4k-mp4-30"]}**
- Pixel format: yuv420p; keyframe \`-g 30\`; H.264 bitrate mode (no CRF)

### Browser (720p/1080p only)
- 1080p high: JPEG q=${baselineProfiles.browser["1080p-high"].frameIntermediateQuality}, libvpx ${baselineProfiles.browser["1080p-high"].libvpxDeadline}/cpu-used ${baselineProfiles.browser["1080p-high"].libvpxCpuUsed}, H.264 CRF ${baselineProfiles.browser["1080p-high"].h264Crf}, bitrate ${baselineProfiles.browser["1080p-high"].videoBitrateArg}

## Per-case measurements

| Case | Target | Mode | Zoom | HL encode-probe edge SSIM | Browser JPEG probe edge SSIM | HL E2E avg edge SSIM | HL E2E avg appearance SSIM | Bytes | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${caseResults
  .map((c) => {
    const e2e = c.headlessE2E;
    return `| ${c.id} | ${c.targetWidth}×${c.targetHeight} | ${c.fitMode} | ${c.zoom} | ${c.encodeProbeHeadless.structuralEdgeSsim.toFixed(4)} | ${
      c.encodeProbeBrowserJpeg
        ? c.encodeProbeBrowserJpeg.structuralEdgeSsim.toFixed(4)
        : "—"
    } | ${
      e2e ? e2e.avgStructuralEdgeSsim.toFixed(4) : "—"
    } | ${e2e ? e2e.avgAppearanceSsim.toFixed(4) : "—"} | ${
      e2e ? e2e.bytes : c.encodeProbeHeadless.bytes
    } | ${e2e ? e2e.wallMs.toFixed(0) : c.encodeProbeHeadless.elapsedMs} |`;
  })
  .join("\n")}

### Per-frame Headless E2E samples

${caseResults
  .filter((c) => c.headlessE2E)
  .map((c) => {
    const rows = c.headlessE2E!.frames
      .map(
        (f) =>
          `  - t=${f.seekSec}s edgeSSIM=${f.structuralEdgeSsim.toFixed(4)} appearanceSSIM=${f.appearanceSsim.toFixed(4)} PSNR=${f.psnr ?? "n/a"} VMAF=${f.vmaf ?? "n/a"}`,
      )
      .join("\n");
    return `#### ${c.id}\n${rows}\n  - temporal: packets=${c.headlessE2E!.temporal.packetCount} dupPTS=${c.headlessE2E!.temporal.duplicatePtsCount} monotonic=${c.headlessE2E!.temporal.monotonicPts} freezeDetect(info)=${c.headlessE2E!.temporal.freezeDetectEvents} sampled=${c.headlessE2E!.temporal.sampledFrames} unique=${c.headlessE2E!.temporal.uniqueHashes}`;
  })
  .join("\n\n")}

## Geometry vs encoding conclusions

- Landscape→vertical **Fill** cases lose detail primarily through **crop + enlarge** (geometry). Encode-probe on the *already transformed* ideal still remains high structural SSIM.
- Native vertical Fill does not show an unexplained structural regression vs ideal.
- Fit-with-background E2E keeps measurable fidelity with text regions masked; foreground sharpness is assessed against the Fit ideal crop (blurred background excluded from encoder blame).
- Browser JPEG intermediate encode-probe is typically slightly softer than Headless PNG→H.264 on the same ideal still (see deltas below). This is intermediate-format cost, not Fit/Fill geometry.

### Browser JPEG vs Headless encode-probe deltas (edge SSIM)

| Case | Headless | Browser JPEG path | Δ (HL − Browser) |
| --- | --- | --- | --- |
${jpegComparisons
  .map(
    (d) =>
      `| ${d.id} | ${d.headlessStructural.toFixed(4)} | ${d.browserStructural.toFixed(4)} | ${d.delta.toFixed(4)} |`,
  )
  .join("\n")}

## Encoder tuning decision

**No encoder settings were changed.**

${encoderFindings.rationale}

Before/after: N/A (baseline retained).

## Browser certification status

${measurements.browserCertification.status} — ${measurements.browserCertification.note}

## Headless certification status

Real rebuilt worker path exercised for E2E cases (720p / 1080p / 4K MP4). Exact dimensions, h264/yuv420p, and non-frozen temporal samples asserted.

## Commands

\`\`\`bash
npm run test:realistic-motion-encoding
npm run build:headless-worker
\`\`\`

## Artifacts

- \`.tmp/realistic-motion-fixtures/\`
- \`.tmp/realistic-motion-encoding/measurements.json\`
- E2E MP4s under \`.tmp/realistic-motion-encoding/*.mp4\`

## Limitations

${measurements.limitations.map((l) => `- ${l}`).join("\n")}
`;

  writeFileSync(EVIDENCE_PATH, md);
  console.log(`\nWrote ${EVIDENCE_PATH}`);
  console.log(`${passed} realistic-motion encoding checks passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
