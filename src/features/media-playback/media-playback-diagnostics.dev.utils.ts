import { resolveSceneMediaPlaybackDiagnostics } from "./media-playback.engine";
import type { MediaPlaybackDiagnostics, MediaPlaybackResolveInput } from "./media-playback.types";

export type MediaPlaybackDebugSummary = MediaPlaybackDiagnostics & {
  mediaType: MediaPlaybackDiagnostics["mediaType"];
};

/** Dev-only media playback diagnostics — no production logging. */
export function buildMediaPlaybackDebugSummary(
  input: MediaPlaybackResolveInput,
): MediaPlaybackDebugSummary {
  return resolveSceneMediaPlaybackDiagnostics(input);
}

export function logMediaPlaybackDebugSummary(
  input: MediaPlaybackResolveInput,
  label = "media-playback-debug",
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(label, buildMediaPlaybackDebugSummary(input));
}
