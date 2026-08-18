/**
 * Frozen Prompt 2B visual-bundle contract.
 * Client-safe — no Node fixture imports.
 */

import {
  PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
  PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS,
  PER_MEDIA_VIDEO_TRIM_SCENE_ID,
} from "./per-media-video-trim-contract";

export const CURRENT_VISUAL_FEATURE_BUNDLE_STORY_ID =
  "current-visual-feature-bundle" as const;

export const CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID =
  PER_MEDIA_VIDEO_TRIM_SCENE_ID;

export const CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_A_ID =
  PER_MEDIA_VIDEO_TRIM_ITEM_A_ID;

export const CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID =
  PER_MEDIA_VIDEO_TRIM_ITEM_B_ID;

export const CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY = {
  mixedMediaScenesEnabled: true,
  engagementOverlaysEnabled: true,
  shortForgeBrandStingEnabled: true,
} as const;

/** Item A keeps a real trim while remaining long enough for a fade. */
export const CURRENT_VISUAL_FEATURE_BUNDLE_A = {
  trimStartMs: 0,
  trimEndMs: 4_500,
} as const;

export const CURRENT_VISUAL_FEATURE_BUNDLE_B = {
  trimStartMs: 2_000,
  trimEndMs: 5_000,
} as const;

export const CURRENT_VISUAL_FEATURE_BUNDLE_TRANSITION_MS = 500;

export const CURRENT_VISUAL_FEATURE_BUNDLE_CTA = {
  kind: "combined" as const,
  position: "bottom-center" as const,
  size: "medium" as const,
  scale: 1,
  startOffsetMs: 1_200,
  durationMs: 3_600,
};

export const CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS = 2_500;

export const CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS =
  PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS;

/** CTA phase math matches resolveEngagementOverlayFrame. */
const CTA_ENTRANCE_MS = Math.min(
  220,
  Math.max(120, Math.round(CURRENT_VISUAL_FEATURE_BUNDLE_CTA.durationMs * 0.16)),
);
const CTA_EXIT_MS = CTA_ENTRANCE_MS;
const CTA_HOLD_MS =
  CURRENT_VISUAL_FEATURE_BUNDLE_CTA.durationMs - CTA_ENTRANCE_MS - CTA_EXIT_MS;
const CTA_BEAT_MS = CTA_HOLD_MS / 3;

export const CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES = [
  {
    id: "item-a-early",
    timestampMs: 200,
    expectedLabel: "SOURCE 0",
  },
  {
    id: "cta-entrance",
    timestampMs: CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs + 80,
    expectedCtaPhase: "entrance",
  },
  {
    id: "cta-like",
    timestampMs:
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs +
      CTA_ENTRANCE_MS +
      Math.round(CTA_BEAT_MS * 0.45),
    expectedCtaActiveLabel: "Like",
  },
  {
    id: "cta-share",
    timestampMs:
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs +
      CTA_ENTRANCE_MS +
      Math.round(CTA_BEAT_MS * 1.45),
    expectedCtaActiveLabel: "Share",
  },
  {
    id: "item-b-start",
    timestampMs: 4_000,
    expectedLabel: "SOURCE 2",
  },
  {
    id: "cta-subscribe-confirmation",
    timestampMs:
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs +
      CTA_ENTRANCE_MS +
      Math.round(CTA_BEAT_MS * 2.45),
    expectedCtaActiveLabel: "Subscribe",
    expectedSubscribeConfirmation: true,
  },
  {
    id: "transition-mid",
    timestampMs: 4_000,
    expectedTransitionActive: true,
  },
  {
    id: "item-b-mid",
    timestampMs: 5_500,
    expectedLabel: "SOURCE 3",
  },
  {
    id: "item-b-hold",
    timestampMs: 7_500,
    expectedLabel: "SOURCE 4",
  },
  {
    id: "brand-sting-entrance",
    timestampMs: CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS + 200,
    expectedBrandStingPhase: "entrance",
  },
  {
    id: "brand-sting-hold",
    timestampMs: CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS + 1_000,
    expectedBrandStingPhase: "hold",
  },
  {
    id: "brand-sting-exit",
    timestampMs: CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS + 2_100,
    expectedBrandStingPhase: "exit",
  },
] as const;

export type CurrentVisualFeatureBundleSampleId =
  (typeof CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES)[number]["id"];
