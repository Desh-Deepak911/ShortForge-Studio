/**
 * Decodable probe asset bytes shared by live draft seeding and staging payloads.
 * Synthetic non-media bytes break Chromium media preload at page bootstrap.
 */

import type { HeadlessRequiredSourceSlot } from "@/features/headless-renderer/domain";

/** 1×1 PNG — decodable in headless Chromium. */
export const FLY_RENDER_PROBE_MINIMAL_PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/** Minimal PCM WAV — decodable for voiceover/music slots. */
export const FLY_RENDER_PROBE_MINIMAL_WAV_BYTES = Uint8Array.from(
  Buffer.from(
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    "base64",
  ),
);

export function buildFlyRenderLiveProbeAssetBytes(input: {
  readonly slot: HeadlessRequiredSourceSlot;
  readonly index: number;
}): { readonly bytes: Uint8Array; readonly mime: string } {
  if (input.slot.expectedMediaKind === "audio") {
    return {
      bytes: FLY_RENDER_PROBE_MINIMAL_WAV_BYTES,
      mime: "audio/wav",
    };
  }
  if (input.slot.expectedMediaKind === "video") {
    return {
      bytes: FLY_RENDER_PROBE_MINIMAL_PNG_BYTES,
      mime: "video/mp4",
    };
  }
  return {
    bytes: FLY_RENDER_PROBE_MINIMAL_PNG_BYTES,
    mime: "image/jpeg",
  };
}
