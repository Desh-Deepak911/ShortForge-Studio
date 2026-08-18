/**
 * Real Headless artifact certification for the frozen Prompt 2B story.
 * Uses the rebuilt current page-render bundle. Not an FFmpeg substitute.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildExportManifest, buildExportManifestFingerprint, isExportManifestV5 } from "@/features/export/domain";
import { applyHeadlessFormatToManifest } from "@/features/headless-renderer/worker/testing/apply-output-profile";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { HEADLESS_WORKER_RENDERER_BUILD_ID, HEADLESS_WORKER_PHASE3_SUPPORTED } from "@/features/headless-renderer/worker/runtime/worker-types";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildCurrentVisualFeatureBundleStory } from "@/features/preview/video-trim-preview/build-current-visual-feature-bundle-story";
import { ensurePerMediaVideoTrimFixture } from "@/features/preview/video-trim-preview/per-media-video-trim-fixture";
import { PER_MEDIA_VIDEO_TRIM_FIXTURE_URL } from "@/features/preview/video-trim-preview/per-media-video-trim-contract";
import {
  CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
  CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES,
} from "@/features/preview/video-trim-preview/current-visual-feature-bundle-contract";
import {
  captionBandLooksOpaqueBlack,
  classifyRgb,
  samplePngCaptionBandLuma,
  samplePngCenterRgb,
} from "./classify-timecode-section";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/current-visual-feature-bundle");
const PAGE_BUNDLE = join(process.cwd(), "dist/headless-worker/page-render.iife.js");

function classifyFailureStage(job: Record<string, unknown> | null): string {
  const reason = String(job?.reasonId ?? job?.terminalReason ?? "");
  const message = `${JSON.stringify(job ?? {})}`.toLowerCase();
  if (reason.includes("UNSUPPORTED_CAPABILITY") || message.includes("capability")) {
    return "manifest-compatibility";
  }
  if (message.includes("bootstrap") || message.includes("page")) return "page-load";
  if (message.includes("hydrat") || message.includes("preload") || message.includes("media")) {
    return "media-hydration";
  }
  if (message.includes("encode") || message.includes("ffmpeg")) return "encoding";
  if (message.includes("upload") || message.includes("finaliz")) return "upload/finalization";
  if (message.includes("render") || message.includes("frame")) return "rendering";
  if (message.includes("claim") || message.includes("lease")) return "claim/lease";
  if (message.includes("verify")) return "asset-verification";
  if (reason === "WORKER_FAILED") return "rendering";
  return reason || "unknown";
}

function isDarkNavy(rgb: { r: number; g: number; b: number } | null): boolean {
  if (!rgb) return false;
  const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luma < 70 && rgb.b >= rgb.r;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  process.env.HEADLESS_PAGE_BUNDLE_PATH = PAGE_BUNDLE;
  const findings: Record<string, unknown> = {
    recordedAt: new Date().toISOString(),
    pageBundlePath: PAGE_BUNDLE,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    supportedCapabilities: HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities,
  };
  if (existsSync(PAGE_BUNDLE)) {
    findings.pageBundleDigest = createHash("sha256")
      .update(readFileSync(PAGE_BUNDLE))
      .digest("hex");
  }

  const fixture = ensurePerMediaVideoTrimFixture();
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!fixture.ok || !ffmpeg.ok) {
    findings.ok = false;
    findings.blocker = !fixture.ok
      ? fixture.message
      : ffmpeg.ok
        ? "blocked"
        : ffmpeg.message;
    writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`VISUAL_BUNDLE_HEADLESS: blocked (${String(findings.blocker)})`);
    process.exitCode = 0;
    return;
  }

  const story = buildCurrentVisualFeatureBundleStory();
  const assetBytesByUrl = new Map<string, Uint8Array>();
  const assetMimeByUrl = new Map<string, string>();
  assetBytesByUrl.set(
    PER_MEDIA_VIDEO_TRIM_FIXTURE_URL,
    new Uint8Array(readFileSync(fixture.filePath)),
  );
  assetMimeByUrl.set(PER_MEDIA_VIDEO_TRIM_FIXTURE_URL, "video/mp4");

  const manifest = buildExportManifest({
    story,
    ...CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    exportSettings: {
      fileName: "current-visual-feature-bundle-headless",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
  });
  findings.manifestFingerprint = buildExportManifestFingerprint(manifest);
  findings.manifestVersion = manifest.version;
  findings.requestedCapabilities =
    isExportManifestV5(manifest) ? manifest.requiredCapabilities : [];
  findings.brandSting = isExportManifestV5(manifest) ? manifest.brandSting : null;
  findings.engagementOverlays = manifest.scenes[0] &&
    "engagementOverlays" in manifest.scenes[0]
    ? manifest.scenes[0].engagementOverlays
    : null;

  const profiled = applyHeadlessFormatToManifest(manifest, {
    resolution: "1080p",
    format: "webm",
    fps: 30,
    quality: "standard",
  });
  if (!profiled.ok) {
    findings.ok = false;
    findings.blocker = profiled.message;
    findings.failureStage = "manifest-compatibility";
    writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`VISUAL_BUNDLE_HEADLESS: blocked (${profiled.message})`);
    process.exitCode = 0;
    return;
  }

  const fixtureRef: HeadlessReferenceFixture = {
    manifestV3: profiled.manifest as HeadlessReferenceFixture["manifestV3"],
    manifestV2: profiled.manifest as unknown as HeadlessReferenceFixture["manifestV2"],
    rendererProfile: { resolution: "1080p", format: "webm", fps: 30, quality: "standard" },
    assetBytesByUrl,
    assetMimeByUrl,
    voiceBytes: null,
    musicBytes: null,
    urls: { a: "", b: "", c: "", voice: "", music: "" },
  };

  try {
    const { worker, jobId, ownerId, stack } = await seedAndCreateReferenceJob({
      fixture: fixtureRef,
      manifest: profiled.manifest,
      idempotencyKey: "current-visual-feature-bundle-1080",
    });
    findings.jobId = jobId;
    const started = Date.now();
    const result = await worker.processOnce(1);
    findings.elapsedMs = Date.now() - started;
    findings.processOk = result.ok;
    findings.processResult = result;
    const job = await stack.service.getJob({ requestContext: {}, jobId });
    findings.jobState = job.ok ? job.value.state : "unknown";
    findings.job = job.ok ? job.value : job;
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    findings.storedJob = stored.ok ? stored.value : stored;
    const dest = join(ARTIFACT_DIR, "headless-export.webm");
    if (job.ok && job.value.artifactAvailable && stored.ok && stored.value.canonicalJob?.artifact) {
      const artifact = stored.value.canonicalJob.artifact;
      findings.artifact = {
        width: artifact.width,
        height: artifact.height,
        fps: artifact.fps,
        mimeType: artifact.mimeType,
        durationMs: artifact.durationMs,
        byteLength: artifact.byteLength,
      };
      const binding =
        stored.value.stage === "canonical" ? stored.value.artifactObjectBinding : null;
      if (binding) {
        const opened = await stack.storage.openOwnedObject(binding.storageLocator, ownerId);
        if (opened.ok) writeFileSync(dest, opened.value.bytes);
      }
    }

    if (!existsSync(dest)) {
      const record = stored.ok
        ? ((stored.value.canonicalJob ?? stored.value) as unknown as Record<string, unknown>)
        : null;
      findings.ok = false;
      findings.failureStage = classifyFailureStage(record);
      findings.blocker = "Headless artifact missing";
      writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log(`VISUAL_BUNDLE_HEADLESS: failed (${findings.failureStage})`);
      process.exitCode = 0;
      return;
    }

    findings.artifactPath = dest;
    findings.fileSize = statSync(dest).size;
    const probe = spawnSync(
      ffmpeg.ffprobeExecutable,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size,format_name:stream=codec_name,width,height,r_frame_rate,pix_fmt",
        "-of",
        "json",
        dest,
      ],
      { encoding: "utf8" },
    );
    findings.probe = JSON.parse(probe.stdout || "{}");
    const decoded: Record<string, unknown>[] = [];
    for (const sample of CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES) {
      const out = join(ARTIFACT_DIR, `headless-${sample.id}.png`);
      spawnSync(ffmpeg.ffmpegExecutable, [
        "-y",
        "-ss",
        String(sample.timestampMs / 1000),
        "-i",
        dest,
        "-frames:v",
        "1",
        out,
      ]);
      const rgb = samplePngCenterRgb(ffmpeg.ffmpegExecutable, out);
      const classified = rgb ? classifyRgb(rgb.r, rgb.g, rgb.b) : null;
      const captionRgb = samplePngCaptionBandLuma(ffmpeg.ffmpegExecutable, out);
      decoded.push({
        id: sample.id,
        timestampMs: sample.timestampMs,
        expectedLabel: "expectedLabel" in sample ? sample.expectedLabel : null,
        classified,
        captionOpaqueBlack: captionRgb
          ? captionBandLooksOpaqueBlack(captionRgb)
          : null,
        darkNavyCenter: isDarkNavy(rgb),
        path: out,
      });
    }
    findings.decodedFrames = decoded;
    const trimOk = decoded
      .filter((frame) => frame.expectedLabel)
      .every(
        (frame) =>
          frame.classified &&
          (frame.classified as { label: string }).label === frame.expectedLabel,
      );
    const captionsOk = decoded.every((frame) => frame.captionOpaqueBlack !== true);
    const stingHold = decoded.find((frame) => frame.id === "brand-sting-hold");
    findings.ok = trimOk && captionsOk && stingHold?.darkNavyCenter === true;
  } catch (error) {
    findings.ok = false;
    findings.blocker = error instanceof Error ? error.message : String(error);
    findings.failureStage = "unknown";
  }

  writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`VISUAL_BUNDLE_HEADLESS: ${findings.ok ? "ok" : "failed"}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
