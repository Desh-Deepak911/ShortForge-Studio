/**
 * Sprint 11D Phase 3.2 — recursively immutable canonical output-profile registry.
 * Content vs render duration ceilings are explicit. Arbitrary dimensions/codecs/FPS
 * /FFmpeg argv are never accepted.
 */

import { TIMELINE_END_BUFFER_MS } from "@/features/timeline-intelligence/timeline-end-buffer";

import { deepFreezeInPlace } from "../../domain/headless-deep-freeze";
import {
  HEADLESS_RESOLUTION_PIXELS,
  type HeadlessRendererProfile,
} from "../../domain";
import { HEADLESS_PHASE3_RENDERER_BUILD_ID } from "./renderer-build-id";

export {
  HEADLESS_PHASE3_LEGACY_BUILD_ID,
  HEADLESS_PHASE3_LEGACY_BUILD_ID_3_1,
  HEADLESS_PHASE3_RENDERER_BUILD_ID,
} from "./renderer-build-id";

export type HeadlessOutputProfileId =
  | "720p-webm-30"
  | "720p-mp4-30"
  | "1080p-webm-30"
  | "1080p-mp4-30"
  | "4k-webm-30"
  | "4k-mp4-30";

export type HeadlessVideoCodecName = "vp9" | "h264";
export type HeadlessAudioCodecName = "opus" | "aac";
export type HeadlessContainerName = "webm" | "mp4";

/**
 * Accepted ExportManifest end-buffer bound (frozen timeline semantics).
 * Not an unlimited pad — forged oversized buffers fail closed.
 */
export const HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS = TIMELINE_END_BUFFER_MS;

export interface HeadlessOutputProfile {
  readonly profileId: HeadlessOutputProfileId;
  readonly format: HeadlessContainerName;
  readonly resolution: HeadlessRendererProfile["resolution"];
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
  readonly videoCodec: HeadlessVideoCodecName;
  /** Codec required when audio is present; silent omits the stream. */
  readonly audioCodec: HeadlessAudioCodecName;
  readonly pixelFormat: "yuv420p";
  readonly videoEncoder: string;
  readonly audioEncoder: string;
  readonly container: HeadlessContainerName;
  readonly mimeType: "video/webm" | "video/mp4";
  readonly extension: ".webm" | ".mp4";
  /** Proven content duration (manifest.project.contentDurationMs). */
  readonly testedMaxContentDurationMs: number;
  /** Proven render duration (manifest.project.renderDurationMs). */
  readonly testedMaxRenderDurationMs: number;
  /** Advertised content ceiling (profile policy — not a pipeline hard-code). */
  readonly operationalMaxContentDurationMs: number;
  /** Advertised render ceiling — content + accepted end buffer. */
  readonly operationalMaxRenderDurationMs: number;
  readonly architecturalMaxContentDurationMs: number;
  readonly architecturalMaxRenderDurationMs: number;
  /** Derived from operationalMaxRenderDurationMs @ 30fps. */
  readonly maxFrames: number;
  readonly maxSingleFrameBytes: number;
  /**
   * Logical max total streamed PNG bytes (image2pipe). Not duration-proportional
   * disk-resident PNG aggregate — streaming releases each frame after write.
   */
  readonly maxAggregateFrameBytes: number;
  readonly maxWorkspaceBytes: number;
  readonly maxArtifactBytes: number;
  readonly videoBitrate: string;
  readonly audioBitrate: string;
  readonly rendererBuildId: string;
  readonly capabilityVersion: "11d-phase3.2";
  /** Accepted ffprobe format_name tokens (comma-split). */
  readonly probeContainers: readonly string[];
  /** Accepted ffprobe video codec_name values. */
  readonly probeVideoCodecs: readonly string[];
  /** Accepted ffprobe audio codec_name values when audio required. */
  readonly probeAudioCodecs: readonly string[];
}

/**
 * Overflow-safe frame ceiling from operational render duration @ 30fps.
 * Matches export frame-count model: ceil(renderMs * fps / 1000).
 */
export function headlessMaxFramesForRenderDurationMs(
  renderDurationMs: number,
): number {
  if (!Number.isSafeInteger(renderDurationMs) || renderDurationMs < 1) {
    return 0;
  }
  if (renderDurationMs > Math.floor(Number.MAX_SAFE_INTEGER / 30)) {
    return 0;
  }
  return Math.ceil((renderDurationMs * 30) / 1000);
}

function freezeProfile(
  partial: Omit<
    HeadlessOutputProfile,
    "capabilityVersion" | "rendererBuildId" | "pixelFormat" | "fps" | "maxFrames"
  >,
): HeadlessOutputProfile {
  const maxFrames = headlessMaxFramesForRenderDurationMs(
    partial.operationalMaxRenderDurationMs,
  );
  if (maxFrames < 1) {
    throw new Error("Invalid operationalMaxRenderDurationMs for profile.");
  }
  return deepFreezeInPlace({
    ...partial,
    fps: 30 as const,
    pixelFormat: "yuv420p" as const,
    maxFrames,
    rendererBuildId: HEADLESS_PHASE3_RENDERER_BUILD_ID,
    capabilityVersion: "11d-phase3.2" as const,
    probeContainers: Object.freeze([...partial.probeContainers]),
    probeVideoCodecs: Object.freeze([...partial.probeVideoCodecs]),
    probeAudioCodecs: Object.freeze([...partial.probeAudioCodecs]),
  });
}

const P720 = HEADLESS_RESOLUTION_PIXELS["720p"];
const P1080 = HEADLESS_RESOLUTION_PIXELS["1080p"];
const P4K = HEADLESS_RESOLUTION_PIXELS["4k"];

/** Phase 3.2 initial operational contract — all resolutions share 60s content. */
const OP_CONTENT_MS = 60_000;
const OP_RENDER_MS = OP_CONTENT_MS + HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS;
/** Architectural headroom so the stream path is not redesigned to raise ceilings. */
const ARCH_CONTENT_MS = 180_000;
const ARCH_RENDER_MS = ARCH_CONTENT_MS + HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS;

/**
 * Canonical matrix. Duration ceilings require representative evidence
 * (see docs/HEADLESS_11D_PHASE3_OUTPUT_PROFILES.md).
 */
export const HEADLESS_OUTPUT_PROFILES: Readonly<
  Record<HeadlessOutputProfileId, HeadlessOutputProfile>
> = deepFreezeInPlace({
  "720p-webm-30": freezeProfile({
    profileId: "720p-webm-30",
    format: "webm",
    resolution: "720p",
    width: P720.width,
    height: P720.height,
    videoCodec: "vp9",
    audioCodec: "opus",
    videoEncoder: "libvpx-vp9",
    audioEncoder: "libopus",
    container: "webm",
    mimeType: "video/webm",
    extension: ".webm",
    testedMaxContentDurationMs: OP_CONTENT_MS,
    testedMaxRenderDurationMs: OP_RENDER_MS,
    operationalMaxContentDurationMs: OP_CONTENT_MS,
    operationalMaxRenderDurationMs: OP_RENDER_MS,
    architecturalMaxContentDurationMs: ARCH_CONTENT_MS,
    architecturalMaxRenderDurationMs: ARCH_RENDER_MS,
    maxSingleFrameBytes: 8 * 1024 * 1024,
    // Logical streamed PNG volume ceiling (not disk-resident sequence).
    maxAggregateFrameBytes: 8 * 1024 * 1024 * 1024,
    // Assets + one transient frame + artifact (no PNG sequence on disk).
    maxWorkspaceBytes: 768 * 1024 * 1024,
    maxArtifactBytes: 256 * 1024 * 1024,
    videoBitrate: "4M",
    audioBitrate: "96k",
    probeContainers: ["webm", "matroska", "matroska,webm"],
    probeVideoCodecs: ["vp9"],
    probeAudioCodecs: ["opus"],
  }),
  "720p-mp4-30": freezeProfile({
    profileId: "720p-mp4-30",
    format: "mp4",
    resolution: "720p",
    width: P720.width,
    height: P720.height,
    videoCodec: "h264",
    audioCodec: "aac",
    videoEncoder: "libx264",
    audioEncoder: "aac",
    container: "mp4",
    mimeType: "video/mp4",
    extension: ".mp4",
    testedMaxContentDurationMs: OP_CONTENT_MS,
    testedMaxRenderDurationMs: OP_RENDER_MS,
    operationalMaxContentDurationMs: OP_CONTENT_MS,
    operationalMaxRenderDurationMs: OP_RENDER_MS,
    architecturalMaxContentDurationMs: ARCH_CONTENT_MS,
    architecturalMaxRenderDurationMs: ARCH_RENDER_MS,
    maxSingleFrameBytes: 8 * 1024 * 1024,
    maxAggregateFrameBytes: 8 * 1024 * 1024 * 1024,
    maxWorkspaceBytes: 768 * 1024 * 1024,
    maxArtifactBytes: 256 * 1024 * 1024,
    videoBitrate: "4M",
    audioBitrate: "96k",
    probeContainers: ["mp4", "mov,mp4,m4a,3gp,3g2,mj2", "isom"],
    probeVideoCodecs: ["h264"],
    probeAudioCodecs: ["aac"],
  }),
  "1080p-webm-30": freezeProfile({
    profileId: "1080p-webm-30",
    format: "webm",
    resolution: "1080p",
    width: P1080.width,
    height: P1080.height,
    videoCodec: "vp9",
    audioCodec: "opus",
    videoEncoder: "libvpx-vp9",
    audioEncoder: "libopus",
    container: "webm",
    mimeType: "video/webm",
    extension: ".webm",
    testedMaxContentDurationMs: OP_CONTENT_MS,
    testedMaxRenderDurationMs: OP_RENDER_MS,
    operationalMaxContentDurationMs: OP_CONTENT_MS,
    operationalMaxRenderDurationMs: OP_RENDER_MS,
    architecturalMaxContentDurationMs: ARCH_CONTENT_MS,
    architecturalMaxRenderDurationMs: ARCH_RENDER_MS,
    maxSingleFrameBytes: 12 * 1024 * 1024,
    maxAggregateFrameBytes: 16 * 1024 * 1024 * 1024,
    maxWorkspaceBytes: 768 * 1024 * 1024,
    maxArtifactBytes: 512 * 1024 * 1024,
    videoBitrate: "8M",
    audioBitrate: "96k",
    probeContainers: ["webm", "matroska", "matroska,webm"],
    probeVideoCodecs: ["vp9"],
    probeAudioCodecs: ["opus"],
  }),
  "1080p-mp4-30": freezeProfile({
    profileId: "1080p-mp4-30",
    format: "mp4",
    resolution: "1080p",
    width: P1080.width,
    height: P1080.height,
    videoCodec: "h264",
    audioCodec: "aac",
    videoEncoder: "libx264",
    audioEncoder: "aac",
    container: "mp4",
    mimeType: "video/mp4",
    extension: ".mp4",
    testedMaxContentDurationMs: OP_CONTENT_MS,
    testedMaxRenderDurationMs: OP_RENDER_MS,
    operationalMaxContentDurationMs: OP_CONTENT_MS,
    operationalMaxRenderDurationMs: OP_RENDER_MS,
    architecturalMaxContentDurationMs: ARCH_CONTENT_MS,
    architecturalMaxRenderDurationMs: ARCH_RENDER_MS,
    maxSingleFrameBytes: 12 * 1024 * 1024,
    maxAggregateFrameBytes: 16 * 1024 * 1024 * 1024,
    maxWorkspaceBytes: 768 * 1024 * 1024,
    maxArtifactBytes: 512 * 1024 * 1024,
    videoBitrate: "8M",
    audioBitrate: "96k",
    probeContainers: ["mp4", "mov,mp4,m4a,3gp,3g2,mj2", "isom"],
    probeVideoCodecs: ["h264"],
    probeAudioCodecs: ["aac"],
  }),
  "4k-webm-30": freezeProfile({
    profileId: "4k-webm-30",
    format: "webm",
    resolution: "4k",
    width: P4K.width,
    height: P4K.height,
    videoCodec: "vp9",
    audioCodec: "opus",
    videoEncoder: "libvpx-vp9",
    audioEncoder: "libopus",
    container: "webm",
    mimeType: "video/webm",
    extension: ".webm",
    testedMaxContentDurationMs: OP_CONTENT_MS,
    testedMaxRenderDurationMs: OP_RENDER_MS,
    operationalMaxContentDurationMs: OP_CONTENT_MS,
    operationalMaxRenderDurationMs: OP_RENDER_MS,
    architecturalMaxContentDurationMs: ARCH_CONTENT_MS,
    architecturalMaxRenderDurationMs: ARCH_RENDER_MS,
    maxSingleFrameBytes: 24 * 1024 * 1024,
    // Worst-case single-frame ceiling × 1812 operational frames (logical only).
    maxAggregateFrameBytes: 48 * 1024 * 1024 * 1024,
    maxWorkspaceBytes: 1536 * 1024 * 1024,
    maxArtifactBytes: 768 * 1024 * 1024,
    videoBitrate: "20M",
    audioBitrate: "96k",
    probeContainers: ["webm", "matroska", "matroska,webm"],
    probeVideoCodecs: ["vp9"],
    probeAudioCodecs: ["opus"],
  }),
  "4k-mp4-30": freezeProfile({
    profileId: "4k-mp4-30",
    format: "mp4",
    resolution: "4k",
    width: P4K.width,
    height: P4K.height,
    videoCodec: "h264",
    audioCodec: "aac",
    videoEncoder: "libx264",
    audioEncoder: "aac",
    container: "mp4",
    mimeType: "video/mp4",
    extension: ".mp4",
    testedMaxContentDurationMs: OP_CONTENT_MS,
    testedMaxRenderDurationMs: OP_RENDER_MS,
    operationalMaxContentDurationMs: OP_CONTENT_MS,
    operationalMaxRenderDurationMs: OP_RENDER_MS,
    architecturalMaxContentDurationMs: ARCH_CONTENT_MS,
    architecturalMaxRenderDurationMs: ARCH_RENDER_MS,
    maxSingleFrameBytes: 24 * 1024 * 1024,
    maxAggregateFrameBytes: 48 * 1024 * 1024 * 1024,
    maxWorkspaceBytes: 1536 * 1024 * 1024,
    maxArtifactBytes: 768 * 1024 * 1024,
    videoBitrate: "20M",
    audioBitrate: "96k",
    probeContainers: ["mp4", "mov,mp4,m4a,3gp,3g2,mj2", "isom"],
    probeVideoCodecs: ["h264"],
    probeAudioCodecs: ["aac"],
  }),
});

export function headlessOutputProfileId(
  profile: Pick<HeadlessRendererProfile, "resolution" | "format" | "fps"> | null | undefined,
): HeadlessOutputProfileId | null {
  if (
    profile == null ||
    typeof profile !== "object" ||
    profile.fps !== 30 ||
    typeof profile.resolution !== "string" ||
    typeof profile.format !== "string"
  ) {
    return null;
  }
  const id = `${profile.resolution}-${profile.format}-30` as HeadlessOutputProfileId;
  return Object.prototype.hasOwnProperty.call(HEADLESS_OUTPUT_PROFILES, id)
    ? id
    : null;
}

export function resolveHeadlessOutputProfile(
  profile: Pick<HeadlessRendererProfile, "resolution" | "format" | "fps">,
):
  | { readonly ok: true; readonly profile: HeadlessOutputProfile }
  | { readonly ok: false; readonly message: string } {
  const id = headlessOutputProfileId(profile);
  if (!id) {
    return { ok: false, message: "Unknown or unsupported output profile." };
  }
  return { ok: true, profile: HEADLESS_OUTPUT_PROFILES[id] };
}

export function isAcceptedProbeContainer(
  formatName: string | null,
  profile: HeadlessOutputProfile,
): boolean {
  if (!formatName) return false;
  const parts = formatName
    .toLowerCase()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return profile.probeContainers.some((allowed) => {
    const allowedParts = allowed
      .toLowerCase()
      .split(",")
      .map((p) => p.trim());
    return parts.some(
      (p) => allowedParts.includes(p) || allowed.toLowerCase() === p,
    );
  });
}
