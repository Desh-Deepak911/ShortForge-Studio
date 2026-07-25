/**
 * Sprint 11D Phase 3.1A — HeadlessRenderTarget authority.
 * Derived only from the canonical output-profile registry.
 * Frozen ExportManifest keeps 720p/1080p semantics; 4K elevates pixels only.
 * Content vs render duration ceilings are validated separately.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";

import { HEADLESS_RESOLUTION_PIXELS } from "../../domain";
import type { HeadlessRendererProfile } from "../../domain";
import {
  HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
  resolveHeadlessOutputProfile,
  type HeadlessOutputProfile,
  type HeadlessOutputProfileId,
} from "./output-profiles";

export interface HeadlessRenderTarget {
  readonly profileId: HeadlessOutputProfileId;
  readonly profile: HeadlessOutputProfile;
  readonly width: number;
  readonly height: number;
  readonly format: HeadlessOutputProfile["format"];
  readonly fps: 30;
  readonly videoCodec: HeadlessOutputProfile["videoCodec"];
  readonly audioCodec: HeadlessOutputProfile["audioCodec"];
  readonly pixelFormat: "yuv420p";
  readonly rendererBuildId: string;
  readonly testedMaxContentDurationMs: number;
  readonly testedMaxRenderDurationMs: number;
  readonly operationalMaxContentDurationMs: number;
  readonly operationalMaxRenderDurationMs: number;
  readonly architecturalMaxContentDurationMs: number;
  readonly architecturalMaxRenderDurationMs: number;
}

export function assertHeadlessDurationAuthority(input: {
  manifest: ExportManifest;
  profile: HeadlessOutputProfile;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string } {
  const content = input.manifest.project.contentDurationMs;
  const render = input.manifest.project.renderDurationMs;
  const endBuffer = input.manifest.project.endBufferMs;
  const profile = input.profile;

  if (!Number.isSafeInteger(content) || content < 1) {
    return { ok: false, message: "Invalid content duration." };
  }
  if (content > profile.operationalMaxContentDurationMs) {
    return {
      ok: false,
      message: "Content duration exceeds operational profile ceiling.",
    };
  }

  if (!Number.isSafeInteger(render) || render < 1) {
    return { ok: false, message: "Invalid render duration." };
  }
  if (render > profile.operationalMaxRenderDurationMs) {
    return {
      ok: false,
      message: "Render duration exceeds operational profile ceiling.",
    };
  }

  if (!Number.isSafeInteger(endBuffer) || endBuffer < 0) {
    return { ok: false, message: "Invalid end buffer." };
  }
  if (endBuffer > HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS) {
    return {
      ok: false,
      message: "End buffer exceeds accepted export timeline bound.",
    };
  }

  if (content > Number.MAX_SAFE_INTEGER - endBuffer) {
    return { ok: false, message: "Duration overflow." };
  }
  if (content + endBuffer !== render) {
    return {
      ok: false,
      message: "Render duration must equal content duration plus end buffer.",
    };
  }

  return { ok: true };
}

function freezeTarget(profile: HeadlessOutputProfile): HeadlessRenderTarget {
  return Object.freeze({
    profileId: profile.profileId,
    profile,
    width: profile.width,
    height: profile.height,
    format: profile.format,
    fps: 30 as const,
    videoCodec: profile.videoCodec,
    audioCodec: profile.audioCodec,
    pixelFormat: "yuv420p" as const,
    rendererBuildId: profile.rendererBuildId,
    testedMaxContentDurationMs: profile.testedMaxContentDurationMs,
    testedMaxRenderDurationMs: profile.testedMaxRenderDurationMs,
    operationalMaxContentDurationMs: profile.operationalMaxContentDurationMs,
    operationalMaxRenderDurationMs: profile.operationalMaxRenderDurationMs,
    architecturalMaxContentDurationMs: profile.architecturalMaxContentDurationMs,
    architecturalMaxRenderDurationMs: profile.architecturalMaxRenderDurationMs,
  });
}

/**
 * Compatibility between frozen ExportManifest.output and a headless profile.
 * - 720p/1080p: exact resolution + pixel agreement
 * - 4k: manifest remains a valid 1080p snapshot; only pixel target elevates
 */
export function assertHeadlessManifestTargetCompatibility(input: {
  manifest: ExportManifest;
  rendererProfile: HeadlessRendererProfile;
}):
  | { readonly ok: true; readonly target: HeadlessRenderTarget }
  | { readonly ok: false; readonly message: string } {
  const resolved = resolveHeadlessOutputProfile(input.rendererProfile);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }
  const profile = resolved.profile;
  const output = input.manifest.output;

  if (
    input.rendererProfile.format !== output.format ||
    input.rendererProfile.fps !== output.fps ||
    input.rendererProfile.quality !== output.quality ||
    profile.format !== output.format ||
    profile.fps !== output.fps
  ) {
    return {
      ok: false,
      message: "Headless profile format/fps/quality must match frozen manifest.",
    };
  }

  if (input.rendererProfile.resolution === "4k") {
    if (
      output.resolution !== "1080p" ||
      output.width !== HEADLESS_RESOLUTION_PIXELS["1080p"].width ||
      output.height !== HEADLESS_RESOLUTION_PIXELS["1080p"].height
    ) {
      return {
        ok: false,
        message:
          "4K headless target requires a frozen valid 1080p ExportManifest snapshot.",
      };
    }
  } else {
    if (input.rendererProfile.resolution !== output.resolution) {
      return {
        ok: false,
        message: "Headless resolution must match frozen manifest resolution.",
      };
    }
    const expected = HEADLESS_RESOLUTION_PIXELS[input.rendererProfile.resolution];
    if (output.width !== expected.width || output.height !== expected.height) {
      return {
        ok: false,
        message: "Manifest pixels do not match frozen resolution label.",
      };
    }
  }

  const duration = assertHeadlessDurationAuthority({
    manifest: input.manifest,
    profile,
  });
  if (!duration.ok) {
    return duration;
  }

  return {
    ok: true,
    target: freezeTarget(profile),
  };
}

export function resolveHeadlessRenderTarget(
  rendererProfile: HeadlessRendererProfile,
):
  | { readonly ok: true; readonly target: HeadlessRenderTarget }
  | { readonly ok: false; readonly message: string } {
  const resolved = resolveHeadlessOutputProfile(rendererProfile);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    target: freezeTarget(resolved.profile),
  };
}
