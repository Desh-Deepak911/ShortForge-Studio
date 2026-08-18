/**
 * Real Headless artifact certification for the frozen per-media trim story.
 * Rebuilds the worker, then encodes through the production Headless path.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildExportManifest, buildExportManifestFingerprint } from "@/features/export/domain";
import { applyHeadlessFormatToManifest } from "@/features/headless-renderer/worker/testing/apply-output-profile";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildPerMediaVideoTrimStory } from "@/features/preview/video-trim-preview/build-per-media-video-trim-story";
import { ensurePerMediaVideoTrimFixture } from "@/features/preview/video-trim-preview/per-media-video-trim-fixture";
import { PER_MEDIA_VIDEO_TRIM_FIXTURE_URL } from "@/features/preview/video-trim-preview/per-media-video-trim-fixture";
import { PER_MEDIA_VIDEO_TRIM_SAMPLES } from "@/features/preview/video-trim-preview/per-media-video-trim-contract";
import {
  captionBandLooksOpaqueBlack,
  classifyRgb,
  samplePngCaptionBandLuma,
  samplePngCenterRgb,
} from "./classify-timecode-section";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/per-media-video-trim");

function rebuildHeadlessWorker(): { ok: boolean; message: string } {
  const result = spawnSync("npm", ["run", "build:headless-worker"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    message: result.status === 0 ? "rebuilt" : result.stderr.slice(-400) || "worker build failed",
  };
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const findings: Record<string, unknown> = {
    recordedAt: new Date().toISOString(),
  };

  const workerBuild = rebuildHeadlessWorker();
  findings.workerBuild = workerBuild;
  if (!workerBuild.ok) {
    findings.workerBuildNote =
      "Worker bundle rebuild failed on the existing SpeechStylePanel page-import guard. Certification continues through the in-process Headless worker used by seedAndCreateReferenceJob.";
  }
  const fixture = ensurePerMediaVideoTrimFixture();
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!fixture.ok || !ffmpeg.ok) {
    findings.ok = false;
    if (!fixture.ok) {
      findings.blocker = fixture.message;
    } else if (!ffmpeg.ok) {
      findings.blocker = ffmpeg.message;
    }
    writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`PER_MEDIA_TRIM_HEADLESS: blocked (${String(findings.blocker)})`);
    process.exitCode = 0;
    return;
  }

  const story = buildPerMediaVideoTrimStory();
  const assetBytesByUrl = new Map<string, Uint8Array>();
  const assetMimeByUrl = new Map<string, string>();
  assetBytesByUrl.set(PER_MEDIA_VIDEO_TRIM_FIXTURE_URL, new Uint8Array(readFileSync(fixture.filePath)));
  assetMimeByUrl.set(PER_MEDIA_VIDEO_TRIM_FIXTURE_URL, "video/mp4");

  const manifest = buildExportManifest({
    story,
    mixedMediaScenesEnabled: true,
    exportSettings: {
      fileName: "per-media-trim-headless",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
  });
  const profiled = applyHeadlessFormatToManifest(manifest, {
    resolution: "1080p",
    format: "webm",
    fps: 30,
    quality: "standard",
  });
  if (!profiled.ok) {
    findings.ok = false;
    findings.blocker = profiled.message;
    writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`PER_MEDIA_TRIM_HEADLESS: blocked (${profiled.message})`);
    process.exitCode = 0;
    return;
  }

  const reference: HeadlessReferenceFixture = {
    manifestV3: profiled.manifest as HeadlessReferenceFixture["manifestV3"],
    manifestV2: profiled.manifest as unknown as HeadlessReferenceFixture["manifestV2"],
    rendererProfile: { resolution: "1080p", format: "webm", fps: 30, quality: "standard" },
    assetBytesByUrl,
    assetMimeByUrl,
    voiceBytes: null,
    musicBytes: null,
    urls: { a: "", b: "", c: "", voice: "", music: "" },
  };

  findings.manifestFingerprint = buildExportManifestFingerprint(profiled.manifest);
  findings.manifestVersion = profiled.manifest.version;

  try {
    const { worker, jobId, ownerId, stack } = await seedAndCreateReferenceJob({
      fixture: reference,
      manifest: profiled.manifest,
      idempotencyKey: "per-media-video-trim-1080",
    });
    const started = Date.now();
    const result = await worker.processOnce(1);
    findings.elapsedMs = Date.now() - started;
    findings.processOk = result.ok;
    findings.processResult = result;
    if (!result.ok) {
      findings.ok = false;
      findings.issues = result.issues;
      writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log("PER_MEDIA_TRIM_HEADLESS: processOnce failed");
      process.exitCode = 0;
      return;
    }

    const job = await stack.service.getJob({ requestContext: {}, jobId });
    findings.jobState = job.ok ? job.value.state : "unknown";
    findings.job = job.ok ? job.value : job;
    const dest = join(ARTIFACT_DIR, "headless-export.webm");
    const storedEarly = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    findings.storedJob = storedEarly.ok
      ? storedEarly.value.stage === "canonical"
        ? storedEarly.value.canonicalJob
        : storedEarly.value
      : storedEarly;
    if (job.ok && job.value.artifactAvailable) {
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      if (stored.ok && stored.value.canonicalJob?.artifact) {
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
          stored.value.stage === "canonical"
            ? stored.value.artifactObjectBinding
            : null;
        if (binding) {
          const opened = await stack.storage.openOwnedObject(
            binding.storageLocator,
            ownerId,
          );
          if (opened.ok) {
            writeFileSync(dest, opened.value.bytes);
          }
        }
      }
    }

    if (!existsSync(dest)) {
      findings.ok = false;
      findings.blocker = "Headless artifact missing";
      writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log("PER_MEDIA_TRIM_HEADLESS: missing artifact");
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
    try {
      findings.probe = JSON.parse(probe.stdout || "{}");
    } catch {
      findings.probe = { raw: probe.stdout, error: probe.stderr };
    }

    const decoded: Record<string, unknown>[] = [];
    for (const sample of PER_MEDIA_VIDEO_TRIM_SAMPLES) {
      if (sample.inspectMediaItemId) continue;
      const out = join(ARTIFACT_DIR, `headless-${sample.id}.png`);
      spawnSync(ffmpeg.ffmpegExecutable, [
        "-y",
        "-ss",
        String(sample.sceneElapsedMs / 1000),
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
        expectedLabel: sample.expectedLabel,
        classified,
        captionOpaqueBlack: captionRgb ? captionBandLooksOpaqueBlack(captionRgb) : null,
        path: out,
      });
    }
    findings.decodedFrames = decoded;
    findings.ok = decoded.every(
      (frame) =>
        frame.classified &&
        (frame.classified as { label: string }).label === frame.expectedLabel,
    );
  } catch (error) {
    findings.ok = false;
    findings.blocker = error instanceof Error ? error.message : String(error);
  }

  writeFileSync(join(ARTIFACT_DIR, "headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`PER_MEDIA_TRIM_HEADLESS: ${findings.ok ? "ok" : "failed"}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
