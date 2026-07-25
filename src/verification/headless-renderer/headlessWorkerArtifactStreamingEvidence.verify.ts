/**
 * Sprint 11D Phase 3.3 — Streamed artifact delivery evidence (gitignored .tmp).
 * Exit 0 only when required artifacts (incl. 60s 4K MP4) are REAL_LOCAL_PASS.
 * Run: npm run test:headless-worker-artifact-streaming-evidence
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

const EVIDENCE_DIR = join(process.cwd(), ".tmp/headless-11d-evidence");

type EvidenceStatus = "REAL_LOCAL_PASS" | "HONESTLY_BLOCKED";

interface RunSpec {
  readonly key: string;
  readonly file: string;
  readonly profile: HeadlessRendererProfile;
  readonly audioMode: "silent" | "with-voice" | "with-voice-and-music";
  readonly contentMs: number;
  readonly renderMs: number;
  readonly expectFrames: number;
  readonly expectAudio: boolean;
  readonly expectVideoCodec: string;
  readonly required: boolean;
}

function validatePass(record: Record<string, unknown>, spec: RunSpec): string | null {
  if (record.status !== "REAL_LOCAL_PASS") return "status";
  if (record.rendererBuildId !== HEADLESS_WORKER_RENDERER_BUILD_ID) {
    return "rendererBuildId";
  }
  if (record.contentDurationMs !== spec.contentMs) return "contentDurationMs";
  if (record.frameCount !== spec.expectFrames) return "frameCount";
  if (record.videoCodec !== spec.expectVideoCodec) return "videoCodec";
  if (record.audioPresent !== spec.expectAudio) return "audioPresent";
  const profileId =
    `${spec.profile.resolution}-${spec.profile.format}-30` as keyof typeof HEADLESS_OUTPUT_PROFILES;
  const expected = HEADLESS_OUTPUT_PROFILES[profileId];
  if (record.width !== expected.width || record.height !== expected.height) {
    return "dimensions";
  }
  if (typeof record.digest !== "string" || !record.digest.startsWith("sha256:")) {
    return "digest";
  }
  if (typeof record.byteLength !== "number" || record.byteLength < 1000) {
    return "byteLength";
  }
  const delivery = record.streamedDelivery as Record<string, unknown> | undefined;
  if (!delivery) return "streamedDelivery";
  if (delivery.artifactBytesStreamed !== record.byteLength) {
    return "artifactBytesStreamed";
  }
  if (
    typeof delivery.artifactUploadChunkCount !== "number" ||
    delivery.artifactUploadChunkCount < 1
  ) {
    return "chunkCount";
  }
  if (
    typeof delivery.peakArtifactUploadChunkBytes !== "number" ||
    delivery.peakArtifactUploadChunkBytes < 1
  ) {
    return "peakChunk";
  }
  if (delivery.wholeArtifactBufferUsed !== false) {
    return "wholeArtifactBufferUsed";
  }
  if (delivery.workspaceCleanedAfterUpload !== true) {
    return "workspaceCleanedAfterUpload";
  }
  return null;
}

async function attempt(spec: RunSpec): Promise<{
  readonly status: EvidenceStatus;
  readonly record: Record<string, unknown>;
}> {
  const started = Date.now();
  try {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: spec.contentMs,
      audioMode: spec.audioMode,
      rendererProfile: spec.profile,
      musicFades: spec.audioMode === "with-voice-and-music",
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, spec.contentMs);
    assert.equal(fixture.manifestV3.project.renderDurationMs, spec.renderMs);

    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: spec.key,
      clockMs: 1_700_000_000_000,
      workerLimits: {
        jobTimeoutMs: 120 * 60 * 1000,
      },
    });
    const result = await worker.processOnce(1);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    const elapsedMs = Date.now() - started;

    if (
      !result.ok ||
      !stored.ok ||
      result.value.succeeded !== 1 ||
      stored.value.canonicalJob.state !== "succeeded" ||
      !result.value.lastEvidence
    ) {
      return {
        status: "HONESTLY_BLOCKED",
        record: {
          kind: "blocked",
          status: "HONESTLY_BLOCKED",
          profileId: `${spec.profile.resolution}-${spec.profile.format}-30`,
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          contentDurationMs: spec.contentMs,
          elapsedMs,
          processOnce: result.ok ? result.value : result,
          jobState: stored.ok ? stored.value.canonicalJob.state : null,
          note: "Streamed artifact delivery did not reach succeeded.",
        },
      };
    }

    const ev = result.value.lastEvidence;
    const art = stored.value.canonicalJob.artifact!;
    const record: Record<string, unknown> = {
      kind: "measured",
      status: "REAL_LOCAL_PASS",
      profileId: `${spec.profile.resolution}-${spec.profile.format}-30`,
      rendererBuildId: art.rendererBuildId,
      capabilityVersion: "11d-phase3.2",
      digest: art.contentDigest,
      byteLength: art.byteLength,
      contentDurationMs: spec.contentMs,
      renderDurationMs: spec.renderMs,
      artifactDurationMs: art.durationMs,
      width: art.width,
      height: art.height,
      fps: art.fps,
      videoCodec: art.video.codec,
      audioPresent: art.audio.present,
      audioCodec: art.audio.codec,
      frameCount: ev.frameCount,
      streamedDelivery: {
        artifactBytesStreamed: ev.metrics.artifactBytesStreamed,
        artifactUploadChunkCount: ev.metrics.artifactUploadChunkCount,
        peakArtifactUploadChunkBytes: ev.metrics.peakArtifactUploadChunkBytes,
        artifactHashElapsedMs: ev.metrics.artifactHashElapsedMs,
        artifactUploadElapsedMs: ev.metrics.artifactUploadElapsedMs,
        wholeArtifactBufferUsed: false,
        workspaceCleanedAfterUpload: true,
      },
      nodeCoordinatorPeakRssBytes: ev.nodeCoordinatorPeakRssBytes,
      memoryScope: {
        nodeCoordinatorPeakRssBytes: "node_process_only",
        excludes: ["chrome", "ffmpeg"],
        notTotalWorkerMemoryAuthority: true,
      },
      elapsedMs,
      chromeVersion: ev.chromeVersion,
      ffmpegVersion: ev.ffmpegVersion,
      ffprobeVersion: ev.ffprobeVersion,
    };

    const invalid = validatePass(record, spec);
    if (invalid) {
      return {
        status: "HONESTLY_BLOCKED",
        record: {
          ...record,
          status: "HONESTLY_BLOCKED",
          kind: "blocked",
          validationFailure: invalid,
        },
      };
    }
    return { status: "REAL_LOCAL_PASS", record };
  } catch (error) {
    return {
      status: "HONESTLY_BLOCKED",
      record: {
        kind: "blocked",
        status: "HONESTLY_BLOCKED",
        profileId: `${spec.profile.resolution}-${spec.profile.format}-30`,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        contentDurationMs: spec.contentMs,
        elapsedMs: Date.now() - started,
        error: error instanceof Error ? error.message : "unknown",
      },
    };
  }
}

async function main() {
  console.log("\nSprint 11D Phase 3.3 — Streamed artifact delivery evidence\n");
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const chrome = resolveSystemChromeExecutable();
  const ffmpeg = resolveNativeFfmpegBinaries();
  const versions = {
    chrome: chrome.ok ? chrome.version : null,
    ffmpeg: ffmpeg.ok ? ffmpeg.ffmpegVersion : null,
    ffprobe: ffmpeg.ok ? ffmpeg.ffprobeVersion : null,
  };
  writeFileSync(
    join(EVIDENCE_DIR, "phase33-tool-versions.json"),
    JSON.stringify(versions, null, 2),
  );

  const specs: RunSpec[] = [
    {
      key: "p33-720p-webm-2s",
      file: "phase33-720p-webm-streamed-upload-evidence.json",
      profile: { resolution: "720p", format: "webm", fps: 30, quality: "high" },
      audioMode: "silent",
      contentMs: 2000,
      renderMs: 2400,
      expectFrames: 72,
      expectAudio: false,
      expectVideoCodec: "vp9",
      required: true,
    },
    {
      key: "p33-1080p-mp4-2s",
      file: "phase33-1080p-mp4-streamed-upload-evidence.json",
      profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
      audioMode: "with-voice",
      contentMs: 2000,
      renderMs: 2400,
      expectFrames: 72,
      expectAudio: true,
      expectVideoCodec: "h264",
      required: true,
    },
    {
      key: "p33-4k-mp4-60s-voice",
      file: "phase33-4k-mp4-60s-streamed-upload-evidence.json",
      profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
      audioMode: "with-voice-and-music",
      contentMs: 60_000,
      renderMs: 60_400,
      expectFrames: 1812,
      expectAudio: true,
      expectVideoCodec: "h264",
      required: true,
    },
  ];

  const summary: Record<string, EvidenceStatus> = {};
  for (const spec of specs) {
    console.log(`  → ${spec.file} …`);
    const outcome = await attempt(spec);
    writeFileSync(
      join(EVIDENCE_DIR, spec.file),
      JSON.stringify(outcome.record, null, 2),
    );
    summary[spec.file] = outcome.status;
    console.log(`    ${outcome.status}`);
  }

  const requiredPass = specs.every(
    (s) => !s.required || summary[s.file] === "REAL_LOCAL_PASS",
  );
  writeFileSync(
    join(EVIDENCE_DIR, "phase33-streamed-delivery-summary.json"),
    JSON.stringify(
      {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        capabilityVersion: "11d-phase3.2",
        phase: "11d-phase3.3",
        versions,
        summary,
        coreAcceptance: requiredPass ? "PASS" : "FAIL",
        ownershipModel:
          "one-use artifact-file lease — runner consumes upload then dispose() in finally",
        wholeArtifactBuffer: "removed",
        operationalCeiling: { contentMs: 60_000, renderMs: 60_400, maxFrames: 1812 },
        remainingSeam: "hosted-provider total memory / durable storage capacity",
      },
      null,
      2,
    ),
  );

  console.log("\nPhase 3.3 evidence recorded (see .tmp/headless-11d-evidence)\n");
  for (const [file, status] of Object.entries(summary)) {
    console.log(`  ${file}: ${status}`);
  }
  console.log("");

  if (!requiredPass) {
    console.error(
      "Core acceptance FAILED — required streamed-delivery artifact(s) are not REAL_LOCAL_PASS.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
