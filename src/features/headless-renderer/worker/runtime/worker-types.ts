/**
 * Sprint 11D Phase 1A — Local isolated worker types (provider-neutral).
 */

import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/ports/job-store.port";
import {
  HEADLESS_CLAIM_LEASE_MS,
  deepFreezeInPlace,
  type HeadlessReasonId,
  type HeadlessRenderArtifactV1,
} from "../../domain";

import type { HeadlessArtifactFileLease } from "../artifact/artifact-file-lease";
import { HEADLESS_PHASE3_RENDERER_BUILD_ID } from "./renderer-build-id";

export const HEADLESS_WORKER_RENDERER_BUILD_ID =
  HEADLESS_PHASE3_RENDERER_BUILD_ID;

/**
 * Phase 3 supported surface — canonical registry combinations only.
 * Frozen ExportAudioModeManifest values plus mux combinations (music-only is
 * encode-fixture only; freeze never emits a music-only mode).
 * Recursively frozen — nested allowlists are not runtime-mutable.
 */
export const HEADLESS_WORKER_PHASE3_SUPPORTED = deepFreezeInPlace({
  resolutions: Object.freeze(["720p", "1080p", "4k"] as const),
  formats: Object.freeze(["webm", "mp4"] as const),
  fps: Object.freeze([30] as const),
  audioModes: Object.freeze([
    "silent",
    "voice",
    "voice-with-music",
  ] as const),
  audioCombinations: Object.freeze([
    "silent",
    "voiceover",
    "music",
    "voiceover+music",
  ] as const),
  videoCodecs: Object.freeze(["vp9", "h264"] as const),
  audioCodecs: Object.freeze(["opus", "aac"] as const),
  rendererCapabilities: Object.freeze([
    "keyframed-visual-effects-v1",
  ] as const),
  containers: Object.freeze([
    "webm",
    "matroska,webm",
    "matroska",
    "mp4",
    "mov,mp4,m4a,3gp,3g2,mj2",
    "isom",
  ] as const),
});

/** @deprecated Prefer HEADLESS_WORKER_PHASE3_SUPPORTED */
export const HEADLESS_WORKER_PHASE2_SUPPORTED = HEADLESS_WORKER_PHASE3_SUPPORTED;

/** @deprecated Prefer HEADLESS_WORKER_PHASE3_SUPPORTED */
export const HEADLESS_WORKER_PHASE1_SUPPORTED = HEADLESS_WORKER_PHASE3_SUPPORTED;

export interface HeadlessWorkerBinaries {
  readonly chromeExecutable: string;
  readonly chromeVersion: string;
  readonly ffmpegExecutable: string;
  readonly ffmpegVersion: string;
  readonly ffprobeExecutable: string;
  readonly ffprobeVersion: string;
}

export interface HeadlessWorkerLimits {
  readonly maxTotalAssetBytes: number;
  /** Max frames — from profile ∩ provider (not a fake 10-minute ceiling). */
  readonly maxFrames: number;
  readonly jobTimeoutMs: number;
  readonly maxStderrBytes: number;
  readonly claimLeaseMs: number;
  readonly maxSingleFrameBytes: number;
  /** Logical streamed PNG byte ceiling (not disk-resident aggregate). */
  readonly maxAggregateFrameBytes: number;
  readonly maxWorkspaceBytes: number;
  readonly maxArtifactBytes: number;
  readonly maxGeneratedBundleBytes: number;
  readonly maxSingleAudioAssetBytes: number;
  readonly maxAggregateAudioBytes: number;
  /** Reserved ceiling for optional intermediate audio (Phase 2 uses single-pass). */
  readonly maxIntermediateAudioBytes: number;
  readonly processGraceMs: number;
  readonly evaluateTimeoutMs: number;
}

/**
 * Provider-capacity defaults — large enough to host every canonical local
 * profile (60s 720p/1080p/4K streamed). Explicit operator overrides merge onto
 * these, then intersect with the selected profile (min). Profiles never widen
 * capacity.
 *
 * Profile-bounded: maxFrames, maxSingleFrameBytes, maxAggregateFrameBytes,
 * maxWorkspaceBytes, maxArtifactBytes.
 * Provider-owned: timeouts, claim/evaluate/grace, asset/audio/bundle limits.
 */
export const DEFAULT_HEADLESS_WORKER_LIMITS: HeadlessWorkerLimits = Object.freeze({
  maxTotalAssetBytes: 256 * 1024 * 1024,
  maxFrames: 1812,
  jobTimeoutMs: 90 * 60 * 1000,
  maxStderrBytes: 64 * 1024,
  claimLeaseMs: HEADLESS_CLAIM_LEASE_MS,
  maxSingleFrameBytes: 24 * 1024 * 1024,
  maxAggregateFrameBytes: 48 * 1024 * 1024 * 1024,
  maxWorkspaceBytes: 1536 * 1024 * 1024,
  maxArtifactBytes: 768 * 1024 * 1024,
  maxGeneratedBundleBytes: 32 * 1024 * 1024,
  maxSingleAudioAssetBytes: 64 * 1024 * 1024,
  maxAggregateAudioBytes: 128 * 1024 * 1024,
  maxIntermediateAudioBytes: 64 * 1024 * 1024,
  processGraceMs: 1_500,
  evaluateTimeoutMs: 30_000,
});

export interface HeadlessWorkerRunInput {
  readonly record: HeadlessCanonicalStoredJobRecord;
  readonly claimToken: string;
  readonly ownerId: string;
  readonly signal?: AbortSignal;
  readonly nowMs: number;
}

/**
 * Worker-owned run metrics — never part of job/artifact identity.
 * Unavailable values are null with a safe reason (never invented).
 */
export interface HeadlessWorkerRunMetrics {
  readonly renderStageMs: number | null;
  readonly encodeStageMs: number | null;
  readonly probeStageMs: number | null;
  readonly uploadStageMs: number | null;
  readonly totalElapsedMs: number | null;
  readonly peakWorkspaceCommittedBytes: number | null;
  readonly peakFrameBytes: number | null;
  /**
   * Streaming path: total PNG bytes accepted into image2pipe (not disk-resident).
   * Legacy PNG-sequence tests may still report committed disk aggregate.
   */
  readonly aggregateFrameBytes: number | null;
  readonly artifactBytes: number | null;
  /**
   * Peak RSS of the Node coordinator process only (`process.memoryUsage().rss`).
   * Excludes Chrome/FFmpeg children. Not total worker/container memory authority.
   */
  readonly nodeCoordinatorPeakRssBytes: number | null;
  readonly frameCount: number | null;
  readonly totalFramesProduced: number | null;
  readonly totalFramesAccepted: number | null;
  readonly totalFrameBytesStreamed: number | null;
  readonly peakWritableBufferedBytes: number | null;
  readonly chromiumRenderElapsedMs: number | null;
  readonly ffmpegEncodeElapsedMs: number | null;
  readonly overlappedRenderEncodeElapsedMs: number | null;
  /** Bytes streamed during artifact upload (must match artifact length). */
  readonly artifactBytesStreamed: number | null;
  readonly artifactUploadChunkCount: number | null;
  readonly peakArtifactUploadChunkBytes: number | null;
  readonly artifactHashElapsedMs: number | null;
  readonly artifactUploadElapsedMs: number | null;
  readonly unavailableReasons: Readonly<Record<string, string>>;
}

export interface HeadlessWorkerArtifactEvidence {
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationMs: number;
  readonly videoCodec: string;
  readonly audioPresent: boolean;
  readonly audioCodec: string | null;
  readonly audioChannels: number | null;
  readonly audioSampleRateHz: number | null;
  readonly rendererBuildId: string;
  readonly chromeVersion: string;
  readonly ffmpegVersion: string;
  readonly ffprobeVersion: string;
  readonly elapsedRenderMs: number;
  readonly frameCount: number;
  /** @see HeadlessWorkerRunMetrics.nodeCoordinatorPeakRssBytes */
  readonly nodeCoordinatorPeakRssBytes: number | null;
  readonly metrics: HeadlessWorkerRunMetrics;
  readonly profileId: string;
}

export type HeadlessWorkerFailureReasonId = Extract<
  HeadlessReasonId,
  | "WORKER_FAILED"
  | "ENCODE_FAILED"
  | "ARTIFACT_PROBE_MISMATCH"
  | "CANCELLED_BY_USER"
  | "EXPIRED"
  | "INVALID_JOB"
  | "STALE_ATTEMPT"
  | "TERMINAL_STATE_IMMUTABLE"
  | "WORKER_TIMEOUT"
  | "UNSUPPORTED_CAPABILITY"
  | "WORKSPACE_QUOTA_EXCEEDED"
  | "CLAIM_LEASE_EXPIRED"
  | "ARTIFACT_CLEANUP_UNCONFIRMED"
>;

export interface HeadlessWorkerRunSuccess {
  readonly ok: true;
  readonly artifact: HeadlessRenderArtifactV1;
  /**
   * One-use workspace artifact lease — runner streams upload then dispose()s.
   * Never contains paths in serializable evidence; path is worker-internal.
   */
  readonly artifactLease: HeadlessArtifactFileLease;
  readonly evidence: HeadlessWorkerArtifactEvidence;
  readonly sourceBindingAttribution?: import("./source-binding-resolution").SourceBindingAttributionSnapshot;
}

export interface HeadlessWorkerRunFailure {
  readonly ok: false;
  readonly reasonId: HeadlessWorkerFailureReasonId;
  readonly message: string;
  readonly retryable: boolean;
  /** Sprint 11E 2E.2D.8F — bounded execution substage when render pipeline fails. */
  readonly executionSubstage?: import("./claimed-render-execution-attribution").ClaimedRenderExecutionSubstageId;
  readonly pageFailureReason?: import("./claimed-render-execution-attribution").ClaimedRenderExecutionReasonId;
  readonly pageResponseClass?: import("../chromium/page-execution-attribution").PageResponseClassification;
  readonly pageWorkspaceAttribution?: import("../chromium/page-workspace-attribution").PageWorkspaceAttribution;
  readonly sourceBindingAttribution?: import("./source-binding-resolution").SourceBindingAttributionSnapshot;
}

export type HeadlessWorkerRunResult =
  | HeadlessWorkerRunSuccess
  | HeadlessWorkerRunFailure;
