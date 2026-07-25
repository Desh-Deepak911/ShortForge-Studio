/**
 * Sprint 11E Phase 2E.2D.8K — frozen canonical 4K production profile audit.
 * Local authority only — no provider contact.
 */

import {
  HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
  HEADLESS_OUTPUT_PROFILES,
  type HeadlessOutputProfileId,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import { HEADLESS_RESOLUTION_PIXELS } from "@/features/headless-renderer/domain/headless-render-constants";

export const CAPACITY_4K_PROFILE_IDS = Object.freeze([
  "4k-webm-30",
  "4k-mp4-30",
] as const satisfies readonly HeadlessOutputProfileId[]);

export type Capacity4kProfileId = (typeof CAPACITY_4K_PROFILE_IDS)[number];

export const CAPACITY_4K_NATIVE_TARGET = Object.freeze({
  width: HEADLESS_RESOLUTION_PIXELS["4k"].width,
  height: HEADLESS_RESOLUTION_PIXELS["4k"].height,
  fps: 30 as const,
});

export const CAPACITY_4K_OPERATIONAL_CONTENT_MS = 60_000 as const;
export const CAPACITY_4K_OPERATIONAL_RENDER_MS =
  CAPACITY_4K_OPERATIONAL_CONTENT_MS + HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS;
export const CAPACITY_4K_OPERATIONAL_MAX_FRAMES = 1812 as const;

export const CAPACITY_4K_ARCHITECTURAL_CONTENT_MS = 180_000 as const;
export const CAPACITY_4K_ARCHITECTURAL_RENDER_MS =
  CAPACITY_4K_ARCHITECTURAL_CONTENT_MS + HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS;

export type Capacity4kProfileAuditRecord = {
  readonly profileId: Capacity4kProfileId;
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly container: string;
  readonly mimeType: string;
  readonly operationalMaxContentDurationMs: number;
  readonly operationalMaxRenderDurationMs: number;
  readonly architecturalMaxContentDurationMs: number;
  readonly architecturalMaxRenderDurationMs: number;
  readonly maxFrames: number;
  readonly maxSingleFrameBytes: number;
  readonly maxAggregateFrameBytes: number;
  readonly maxWorkspaceBytes: number;
  readonly maxArtifactBytes: number;
};

export function auditCapacity4kProductionProfiles(): readonly Capacity4kProfileAuditRecord[] {
  return Object.freeze(
    CAPACITY_4K_PROFILE_IDS.map((profileId) => {
      const p = HEADLESS_OUTPUT_PROFILES[profileId];
      return Object.freeze({
        profileId,
        width: p.width,
        height: p.height,
        fps: 30 as const,
        videoCodec: p.videoCodec,
        audioCodec: p.audioCodec,
        container: p.container,
        mimeType: p.mimeType,
        operationalMaxContentDurationMs: p.operationalMaxContentDurationMs,
        operationalMaxRenderDurationMs: p.operationalMaxRenderDurationMs,
        architecturalMaxContentDurationMs: p.architecturalMaxContentDurationMs,
        architecturalMaxRenderDurationMs: p.architecturalMaxRenderDurationMs,
        maxFrames: p.maxFrames,
        maxSingleFrameBytes: p.maxSingleFrameBytes,
        maxAggregateFrameBytes: p.maxAggregateFrameBytes,
        maxWorkspaceBytes: p.maxWorkspaceBytes,
        maxArtifactBytes: p.maxArtifactBytes,
      });
    }),
  );
}

export function assertCapacity4kProfileAuditFrozen(): {
  readonly ok: true;
} | { readonly ok: false; readonly failClass: string } {
  const records = auditCapacity4kProductionProfiles();
  if (records.length !== 2) {
    return { ok: false, failClass: "profile_count_not_two" };
  }
  for (const rec of records) {
    if (rec.width !== 2160 || rec.height !== 3840) {
      return { ok: false, failClass: "native_target_not_2160x3840" };
    }
    if (rec.fps !== 30) return { ok: false, failClass: "fps_not_30" };
    if (rec.operationalMaxContentDurationMs !== CAPACITY_4K_OPERATIONAL_CONTENT_MS) {
      return { ok: false, failClass: "operational_content_mismatch" };
    }
    if (rec.operationalMaxRenderDurationMs !== CAPACITY_4K_OPERATIONAL_RENDER_MS) {
      return { ok: false, failClass: "operational_render_mismatch" };
    }
    if (rec.maxFrames !== CAPACITY_4K_OPERATIONAL_MAX_FRAMES) {
      return { ok: false, failClass: "operational_max_frames_mismatch" };
    }
    if (rec.profileId === "4k-webm-30") {
      if (rec.videoCodec !== "vp9" || rec.audioCodec !== "opus") {
        return { ok: false, failClass: "webm_codec_mismatch" };
      }
    }
    if (rec.profileId === "4k-mp4-30") {
      if (rec.videoCodec !== "h264" || rec.audioCodec !== "aac") {
        return { ok: false, failClass: "mp4_codec_mismatch" };
      }
    }
  }
  return { ok: true };
}
