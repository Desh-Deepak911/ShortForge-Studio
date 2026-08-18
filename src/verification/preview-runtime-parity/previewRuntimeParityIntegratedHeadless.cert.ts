/**
 * Prompt 6 Headless encoded-artifact certification for the frozen story.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildExportManifest, buildExportManifestFingerprint } from "@/features/export/domain";
import { applyHeadlessFormatToManifest } from "@/features/headless-renderer/worker/testing/apply-output-profile";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildPreviewRuntimeParityIntegratedCertificationStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-integrated-certification-story";
import { PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS } from "@/features/preview/runtime-parity/preview-runtime-parity-integrated-timestamps";
import { nearestCertificationFrameTimeMs } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-timeline";
import {
  ensurePreviewRuntimeParityEncodedFixtures,
  previewRuntimeParityEncodedFilePath,
  type PreviewRuntimeParityEncodedFixtureId,
} from "@/features/preview/runtime-parity/ensure-preview-runtime-parity-encoded-fixtures";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/preview-runtime-parity");

function collectStoryUrls(story: ReturnType<typeof buildPreviewRuntimeParityIntegratedCertificationStory>["story"]): string[] {
  const urls = new Set<string>();
  for (const scene of story.scenes) {
    if (scene.media?.url) urls.add(scene.media.url);
    for (const item of scene.mediaTimeline?.items ?? []) {
      if (item.media.url) urls.add(item.media.url);
    }
  }
  return [...urls];
}

function fixtureIdFromUrl(url: string): PreviewRuntimeParityEncodedFixtureId | null {
  const match = /preview-runtime-parity-encoded\/([^/?#]+)/.exec(url);
  if (!match?.[1]) return null;
  return match[1] as PreviewRuntimeParityEncodedFixtureId;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const fixtures = ensurePreviewRuntimeParityEncodedFixtures();
  const frozen = buildPreviewRuntimeParityIntegratedCertificationStory();
  const ffmpeg = resolveNativeFfmpegBinaries();
  const findings: Record<string, unknown> = {
    fixtures: fixtures.message,
    contentDurationMs: frozen.contentDurationMs,
    fourK: {
      skipped: true,
      reason:
        "Full frozen story is 31s. A 2160×3840 encode of that duration exceeds the local time/memory budget for this certification pass. 1080p is the required visual artifact.",
    },
  };

  if (!fixtures.ok || !ffmpeg.ok) {
    findings.ok = false;
    findings.blocker = fixtures.ok
      ? (ffmpeg.ok ? "blocked" : ffmpeg.message)
      : fixtures.message;
    writeFileSync(join(ARTIFACT_DIR, "prompt6b-headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`HEADLESS_CERT: blocked (${String(findings.blocker)})`);
    process.exitCode = 0;
    return;
  }

  const assetBytesByUrl = new Map<string, Uint8Array>();
  const assetMimeByUrl = new Map<string, string>();
  for (const url of collectStoryUrls(frozen.story)) {
    const id = fixtureIdFromUrl(url);
    if (!id) continue;
    const path = previewRuntimeParityEncodedFilePath(id);
    assetBytesByUrl.set(url, new Uint8Array(readFileSync(path)));
    assetMimeByUrl.set(url, id.startsWith("image") ? "image/png" : "video/mp4");
  }

  const manifest = buildExportManifest({
    story: frozen.story,
    exportSettings: {
      fileName: "prompt6-headless-1080",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
    mixedMediaScenesEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    keyframedVisualEffectsEnabled: true,
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
    writeFileSync(join(ARTIFACT_DIR, "prompt6b-headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`HEADLESS_CERT: blocked (${profiled.message})`);
    process.exitCode = 0;
    return;
  }

  const fixture: HeadlessReferenceFixture = {
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
  findings.requiredCapabilities = profiled.manifest.capabilities;

  try {
    const { worker, jobId, ownerId, stack } = await seedAndCreateReferenceJob({
      fixture,
      manifest: profiled.manifest,
      idempotencyKey: "prompt6b-integrated-1080",
    });
    const started = Date.now();
    const result = await worker.processOnce(1);
    findings.elapsedMs = Date.now() - started;
    findings.processOk = result.ok;
    if (!result.ok) {
      findings.issues = result.issues;
      findings.ok = false;
      writeFileSync(join(ARTIFACT_DIR, "prompt6b-headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log("HEADLESS_CERT: processOnce failed");
      process.exitCode = 0;
      return;
    }
    const job = await stack.service.getJob({ requestContext: {}, jobId });
    findings.jobState = job.ok ? job.value.state : "unknown";
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
          rendererBuildId: artifact.rendererBuildId,
        };
        const dest = join(ARTIFACT_DIR, "prompt6b-headless-1080.webm");
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
          } else {
            findings.storageOpen = opened;
          }
        }
        if (existsSync(dest)) {
          findings.artifactPath = dest;
          findings.fileSize = statSync(dest).size;
          const probe = spawnSync(
            ffmpeg.ffprobeExecutable,
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration,size,format_name:stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt",
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
          const decoded: string[] = [];
          for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
            const out = join(ARTIFACT_DIR, `prompt6b-headless-${sample.id}.png`);
            spawnSync(ffmpeg.ffmpegExecutable, [
              "-y",
              "-i",
              dest,
              "-ss",
              String(nearestCertificationFrameTimeMs(sample.ms) / 1000),
              "-frames:v",
              "1",
              out,
            ]);
            if (existsSync(out)) decoded.push(out);
          }
          findings.decodedFrames = decoded;
        }
        findings.ok = true;
      }
    }
  } catch (error) {
    findings.ok = false;
    findings.blocker = error instanceof Error ? error.message : String(error);
  }

    writeFileSync(join(ARTIFACT_DIR, "prompt6b-headless.json"), `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`HEADLESS_CERT: ${findings.ok ? "ok" : "failed"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
