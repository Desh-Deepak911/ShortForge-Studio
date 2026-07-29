/**
 * Immutable bounds and registries for Sprint 11B headless contracts.
 */

import type {
  HeadlessActiveJobState,
  HeadlessJobState,
  HeadlessTerminalJobState,
} from "./headless-render.types";

export const HEADLESS_MAX_ASSETS = 64;
export const HEADLESS_MAX_ASSET_BYTES = 512 * 1024 * 1024; // 512 MiB per asset
export const HEADLESS_MAX_TOTAL_ASSET_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
export const HEADLESS_MAX_ID_LENGTH = 128;
/** Canonical R2 object keys may exceed bounded id length (see r2-object-key-authority). */
export const HEADLESS_MAX_OBJECT_KEY_LENGTH = 1024;
export const HEADLESS_MAX_MIME_LENGTH = 128;
export const HEADLESS_MAX_STRUCTURE_DEPTH = 32;
export const HEADLESS_MAX_STRUCTURE_NODES = 4000;
export const HEADLESS_MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
export const HEADLESS_MIN_ATTEMPT = 1;
export const HEADLESS_MAX_ATTEMPT = 1000;
/** Artifact duration must match manifest.project.renderDurationMs within this window. */
export const HEADLESS_ARTIFACT_DURATION_TOLERANCE_MS = 50;
/**
 * Worker claim lease. Expired claims fail closed with CLAIM_LEASE_EXPIRED;
 * recovery creates a new attempt with fresh delivery authority.
 */
export const HEADLESS_CLAIM_LEASE_MS = 10 * 60 * 1000;
export const HEADLESS_MAX_PROGRESS_STAGE_LENGTH = 32;
export const HEADLESS_MAX_CODEC_LENGTH = 32;

/** Advisory worker progress boundaries — frozen for website polling coherence. */
export const HEADLESS_RENDERING_PROGRESS_FLOOR = 35 as const;
export const HEADLESS_RENDERING_PROGRESS_CEILING = 59 as const;
/** Upper bound for advisory totalFrames on public progress DTOs. */
export const HEADLESS_MAX_ADVISORY_FRAME_COUNT = 1812 as const;
export const HEADLESS_ENCODING_PROGRESS_PERCENT = 60 as const;
export const HEADLESS_VALIDATING_PROGRESS_PERCENT = 80 as const;
export const HEADLESS_UPLOADING_PROGRESS_PERCENT = 90 as const;

export const HEADLESS_RESOLUTION_PIXELS = Object.freeze({
  "720p": Object.freeze({ width: 720, height: 1280 }),
  "1080p": Object.freeze({ width: 1080, height: 1920 }),
  "4k": Object.freeze({ width: 2160, height: 3840 }),
} as const);

export const HEADLESS_PROGRESS_STAGE_IDS = Object.freeze([
  "materializing",
  "verifying",
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading",
] as const);

/** Advisory progress stages allowed on provisional stored records. */
export const HEADLESS_PROVISIONAL_PROGRESS_STAGE_IDS = Object.freeze([
  "materializing",
  "uploading",
  "verifying",
] as const);

export const HEADLESS_ALLOWED_IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const);

export const HEADLESS_ALLOWED_VIDEO_MIME_TYPES = Object.freeze([
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const);

export const HEADLESS_ALLOWED_AUDIO_MIME_TYPES = Object.freeze([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/x-wav",
] as const);

export const HEADLESS_ALLOWED_ARTIFACT_MIME_TYPES = Object.freeze([
  "video/webm",
  "video/mp4",
] as const);

export const HEADLESS_ACTIVE_STATES = Object.freeze([
  "created",
  "materializing",
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading",
] as const satisfies readonly HeadlessActiveJobState[]);

export const HEADLESS_TERMINAL_STATES = Object.freeze([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const satisfies readonly HeadlessTerminalJobState[]);

export const HEADLESS_ALL_STATES = Object.freeze([
  ...HEADLESS_ACTIVE_STATES,
  ...HEADLESS_TERMINAL_STATES,
] as const satisfies readonly HeadlessJobState[]);

/**
 * Legal transitions. Terminal states have no outbound edges.
 * Cancel/fail/expire may be reached from any active state.
 */
export const HEADLESS_LEGAL_TRANSITIONS: Readonly<
  Record<HeadlessJobState, readonly HeadlessJobState[]>
> = {
  created: ["materializing", "queued", "failed", "cancelled", "expired"],
  materializing: ["queued", "failed", "cancelled", "expired"],
  queued: ["rendering", "failed", "cancelled", "expired"],
  rendering: ["encoding", "failed", "cancelled", "expired"],
  encoding: ["validating", "failed", "cancelled", "expired"],
  validating: ["uploading", "failed", "cancelled", "expired"],
  uploading: ["succeeded", "failed", "cancelled", "expired"],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function isHeadlessTerminalState(
  state: HeadlessJobState,
): state is HeadlessTerminalJobState {
  return (HEADLESS_TERMINAL_STATES as readonly string[]).includes(state);
}

export function isHeadlessActiveState(
  state: HeadlessJobState,
): state is HeadlessActiveJobState {
  return (HEADLESS_ACTIVE_STATES as readonly string[]).includes(state);
}
