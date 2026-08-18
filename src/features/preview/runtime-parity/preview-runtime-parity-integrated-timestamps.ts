/**
 * Deterministic matched-timestamp matrix.
 * Media samples stay on canonical story milliseconds. Brand Sting / terminal
 * samples are resolved from export + Brand Sting bounds — not hardcoded 33600.
 */

import { resolvePreviewRuntimeParityCertificationTimeline } from "./resolve-preview-runtime-parity-certification-timeline";

export const PREVIEW_RUNTIME_PARITY_INTEGRATED_MEDIA_TIMESTAMPS = [
  { id: "first-media", ms: 800, expectedMediaId: "parity-video-a", phase: "stable-media" },
  { id: "second-media", ms: 3800, expectedMediaId: "parity-video-b", phase: "stable-media" },
  { id: "third-media", ms: 7000, expectedMediaId: "parity-video-c", phase: "stable-media" },
  { id: "intra-before", ms: 2700, expectedMediaId: "parity-video-a", phase: "pre-intra-transition" },
  { id: "intra-mid", ms: 3250, expectedMediaId: "parity-video-a", phase: "intra-transition" },
  { id: "intra-after", ms: 3600, expectedMediaId: "parity-video-b", phase: "post-intra-transition" },
  { id: "inter-mid", ms: 8750, expectedMediaId: "parity-video-b", phase: "inter-transition" },
  { id: "fit-background", ms: 23_400, expectedMediaId: "parity-video-c-fit-bg", phase: "fit-with-background" },
  { id: "zoomed-fill", ms: 21_000, expectedMediaId: "parity-video-a-zoom", phase: "zoomed-fill" },
  { id: "caption-center-short", ms: 26_200, expectedMediaId: "parity-image-q", phase: "caption-center-short" },
  { id: "caption-long", ms: 1200, expectedMediaId: "parity-video-a", phase: "caption-long-center" },
  { id: "caption-non-center", ms: 18_200, expectedMediaId: "parity-image-p-fill", phase: "caption-non-center" },
  { id: "typewriter-early", ms: 500, expectedMediaId: "parity-video-a", phase: "typewriter-early" },
  { id: "typewriter-mid", ms: 1400, expectedMediaId: "parity-video-a", phase: "typewriter-mid" },
  { id: "typewriter-final", ms: 2400, expectedMediaId: "parity-video-a", phase: "typewriter-final" },
  { id: "cta-entrance-mid", ms: 510, expectedMediaId: "parity-video-a", phase: "cta-entrance" },
  { id: "cta-like", ms: 900, expectedMediaId: "parity-video-a", phase: "cta-like" },
  { id: "cta-share", ms: 1600, expectedMediaId: "parity-video-a", phase: "cta-share" },
  { id: "cta-subscribe", ms: 2300, expectedMediaId: "parity-video-a", phase: "cta-subscribe" },
  { id: "cta-confirm", ms: 2500, expectedMediaId: "parity-video-a", phase: "cta-subscribe-confirm" },
  { id: "cta-exit-mid", ms: 2790, expectedMediaId: "parity-video-a", phase: "cta-exit" },
  { id: "cta-collision", ms: 1200, expectedMediaId: "parity-video-a", phase: "cta-collision" },
  { id: "post-title", ms: 200, expectedMediaId: "parity-video-a", phase: "post-title" },
] as const;

export function resolvePreviewRuntimeParityIntegratedTimestamps(
  timeline = resolvePreviewRuntimeParityCertificationTimeline(),
) {
  return [
    ...PREVIEW_RUNTIME_PARITY_INTEGRATED_MEDIA_TIMESTAMPS,
    {
      id: "brand-sting-mid" as const,
      ms: timeline.brandStingMidMs,
      expectedMediaId: null,
      phase: "brand-sting" as const,
    },
    {
      id: "terminal-or-last-sting" as const,
      ms: timeline.lastDecodableFrameMs,
      expectedMediaId: null,
      phase: timeline.lastDecodableFrameClassification,
    },
  ];
}

export const PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS =
  resolvePreviewRuntimeParityIntegratedTimestamps();

export type PreviewRuntimeParityIntegratedTimestampId =
  (typeof PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS)[number]["id"];
