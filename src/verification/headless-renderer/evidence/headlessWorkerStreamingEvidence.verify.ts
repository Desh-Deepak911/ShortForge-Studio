/**
 * Sprint 11D Phase 3.2A — Core 60s streamed artifacts (gitignored .tmp evidence).
 * Exit 0 only when every required Core artifact is REAL_LOCAL_PASS.
 * Writes diagnostics before failing when any artifact is HONESTLY_BLOCKED.
 * Run: npm run test:headless-worker-streaming-evidence
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
const CONTENT_MS = 60_000;
const RENDER_MS = 60_400;
const EXPECTED_FRAMES = 1812;

type EvidenceStatus = "REAL_LOCAL_PASS" | "HONESTLY_BLOCKED";

interface RunSpec {
  readonly key: string;
  readonly file: string;
  readonly profile: HeadlessRendererProfile;
  readonly audioMode: "silent" | "with-voice" | "with-voice-and-music";
  readonly expectAudio: boolean;
  readonly expectVideoCodec: string;
}

function validatePassRecord(
  record: Record<string, unknown>,
  spec: RunSpec,
): string | null {
  if (record.status !== "REAL_LOCAL_PASS") return "status";
  if (record.rendererBuildId !== HEADLESS_WORKER_RENDERER_BUILD_ID) {
    return "rendererBuildId";
  }
  if (record.contentDurationMs !== CONTENT_MS) return "contentDurationMs";
  if (record.renderDurationMs !== RENDER_MS) return "renderDurationMs";
  if (record.frameCount !== EXPECTED_FRAMES) return "frameCount";
  if (record.fps !== 30) return "fps";
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
  const streaming = record.streaming as Record<string, unknown> | undefined;
  if (!streaming) return "streaming";
  if (streaming.totalFramesAccepted !== EXPECTED_FRAMES) {
    return "totalFramesAccepted";
  }
  if (
    typeof streaming.totalFrameBytesStreamed !== "number" ||
    streaming.totalFrameBytesStreamed < 1
  ) {
    return "totalFrameBytesStreamed";
  }
  if (
    typeof streaming.peakWritableBufferedBytes !== "number" ||
    streaming.peakWritableBufferedBytes < 0
  ) {
    return "peakWritableBufferedBytes";
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
      durationMs: CONTENT_MS,
      audioMode: spec.audioMode,
      rendererProfile: spec.profile,
      musicFades: spec.audioMode === "with-voice-and-music",
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, CONTENT_MS);
    assert.equal(fixture.manifestV3.project.renderDurationMs, RENDER_MS);

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
      stored.value.canonicalJob!.state !== "succeeded" ||
      !result.value.lastEvidence
    ) {
      return {
        status: "HONESTLY_BLOCKED",
        record: {
          kind: "blocked",
          status: "HONESTLY_BLOCKED",
          profileId: `${spec.profile.resolution}-${spec.profile.format}-30`,
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          contentDurationMs: CONTENT_MS,
          renderDurationMs: RENDER_MS,
          elapsedMs,
          processOnce: result.ok ? result.value : result,
          jobState: stored.ok ? stored.value.canonicalJob!.state : null,
          terminalReason: stored.ok ? stored.value.canonicalJob!.terminalReason : null,
          note: "Local resources/time could not complete 60s streamed artifact.",
        },
      };
    }

    const ev = result.value.lastEvidence;
    const art = stored.value.canonicalJob!.artifact!;
    const profileId =
      `${spec.profile.resolution}-${spec.profile.format}-30` as keyof typeof HEADLESS_OUTPUT_PROFILES;
    const expected = HEADLESS_OUTPUT_PROFILES[profileId];
    assert.equal(art.width, expected.width);
    assert.equal(art.height, expected.height);
    assert.equal(art.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);
    assert.equal(ev.metrics.totalFramesAccepted, ev.metrics.frameCount);

    const record: Record<string, unknown> = {
      kind: "measured",
      status: "REAL_LOCAL_PASS",
      profileId: expected.profileId,
      rendererBuildId: art.rendererBuildId,
      capabilityVersion: expected.capabilityVersion,
      digest: art.contentDigest,
      byteLength: art.byteLength,
      contentDurationMs: CONTENT_MS,
      renderDurationMs: RENDER_MS,
      artifactDurationMs: art.durationMs,
      width: art.width,
      height: art.height,
      fps: art.fps,
      videoCodec: art.video.codec,
      audioPresent: art.audio.present,
      audioCodec: art.audio.codec,
      frameCount: ev.metrics.frameCount,
      streaming: {
        totalFramesProduced: ev.metrics.totalFramesProduced,
        totalFramesAccepted: ev.metrics.totalFramesAccepted,
        totalFrameBytesStreamed: ev.metrics.totalFrameBytesStreamed,
        peakSingleFrameBytes: ev.metrics.peakFrameBytes,
        peakWritableBufferedBytes: ev.metrics.peakWritableBufferedBytes,
        chromiumRenderElapsedMs: ev.metrics.chromiumRenderElapsedMs,
        ffmpegEncodeElapsedMs: ev.metrics.ffmpegEncodeElapsedMs,
        overlappedRenderEncodeElapsedMs:
          ev.metrics.overlappedRenderEncodeElapsedMs,
      },
      workspacePeakBytes: ev.metrics.peakWorkspaceCommittedBytes,
      nodeCoordinatorPeakRssBytes: ev.metrics.nodeCoordinatorPeakRssBytes,
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

    const invalid = validatePassRecord(record, spec);
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
        contentDurationMs: CONTENT_MS,
        renderDurationMs: RENDER_MS,
        elapsedMs: Date.now() - started,
        error: error instanceof Error ? error.message : "unknown",
      },
    };
  }
}

async function main() {
  console.log("\nSprint 11D Phase 3.2A — Core 60s streaming evidence\n");
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const chrome = resolveSystemChromeExecutable();
  const ffmpeg = resolveNativeFfmpegBinaries();
  const versions = {
    chrome: chrome.ok ? chrome.version : null,
    ffmpeg: ffmpeg.ok ? ffmpeg.ffmpegVersion : null,
    ffprobe: ffmpeg.ok ? ffmpeg.ffprobeVersion : null,
  };
  writeFileSync(
    join(EVIDENCE_DIR, "phase32-tool-versions.json"),
    JSON.stringify(versions, null, 2),
  );

  const specs: RunSpec[] = [
    {
      key: "p32a-4k-mp4-60s-voice",
      file: "phase32a-4k-mp4-60s-evidence.json",
      profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
      audioMode: "with-voice-and-music",
      expectAudio: true,
      expectVideoCodec: "h264",
    },
    {
      key: "p32a-4k-webm-60s-silent",
      file: "phase32a-4k-webm-60s-evidence.json",
      profile: { resolution: "4k", format: "webm", fps: 30, quality: "high" },
      audioMode: "silent",
      expectAudio: false,
      expectVideoCodec: "vp9",
    },
    {
      key: "p32a-1080-mp4-60s-voice",
      file: "phase32a-1080p-mp4-60s-evidence.json",
      profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
      audioMode: "with-voice",
      expectAudio: true,
      expectVideoCodec: "h264",
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

  const allPass = Object.values(summary).every((s) => s === "REAL_LOCAL_PASS");
  writeFileSync(
    join(EVIDENCE_DIR, "phase32a-60s-evidence-summary.json"),
    JSON.stringify(
      {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        capabilityVersion: "11d-phase3.2",
        versions,
        summary,
        coreAcceptance: allPass ? "PASS" : "FAIL",
        frameStorage: "duration_independent_image2pipe",
        operationalContract: {
          contentMs: CONTENT_MS,
          renderMs: RENDER_MS,
          maxFrames: EXPECTED_FRAMES,
        },
        remainingSeam:
          "whole-artifact readFileSync/Uint8Array upload — not yet file/stream based",
      },
      null,
      2,
    ),
  );

  console.log("\n60s Core evidence recorded (see .tmp/headless-11d-evidence)\n");
  for (const [file, status] of Object.entries(summary)) {
    console.log(`  ${file}: ${status}`);
  }
  console.log("");

  if (!allPass) {
    console.error(
      "Core acceptance FAILED — one or more required 60s artifacts are not REAL_LOCAL_PASS.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
