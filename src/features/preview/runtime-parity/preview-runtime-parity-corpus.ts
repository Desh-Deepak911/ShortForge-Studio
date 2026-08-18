/**
 * Deterministic Preview runtime-parity corpus catalog.
 * Cases are generic across media identities — never special-cased to fixture colors.
 */

import type { CaptionAnchor, CaptionTextAlign } from "@/features/caption-layout/caption-layout.types";
import type { CaptionAnimationPreset } from "@/features/caption-animation/caption-animation.types";
import type { EngagementOverlaySize } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import { PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX } from "./preview-runtime-parity-contract";

export const PREVIEW_RUNTIME_PARITY_CORPUS_CASE_IDS = [
  "three-videos-equal-windows",
  "three-videos-unequal-windows",
  "three-videos-intra-scene-transition",
  "mixed-image-video-unequal",
  "framing-fit-fill-zoom-fit-background",
  "captions-anchors-alignments-effects",
  "cta-combined-size-scale-matrix",
  "preview-phone-widths",
  "clock-lifecycle-two-scenes",
] as const;

export type PreviewRuntimeParityCorpusCaseId =
  (typeof PREVIEW_RUNTIME_PARITY_CORPUS_CASE_IDS)[number];

export interface PreviewRuntimeParityCorpusCase {
  readonly id: PreviewRuntimeParityCorpusCaseId;
  readonly title: string;
  readonly covers: readonly string[];
}

export const PREVIEW_RUNTIME_PARITY_CAPTION_ANCHORS: readonly CaptionAnchor[] = [
  "top_center",
  "center",
  "bottom_center",
];

export const PREVIEW_RUNTIME_PARITY_CAPTION_ALIGNS: readonly CaptionTextAlign[] = [
  "left",
  "center",
  "right",
];

export const PREVIEW_RUNTIME_PARITY_CAPTION_EFFECTS: readonly CaptionAnimationPreset[] = [
  "none",
  "fade",
  "typewriter",
  "highlight",
];

export const PREVIEW_RUNTIME_PARITY_CTA_SIZES: readonly EngagementOverlaySize[] = [
  "small",
  "medium",
  "large",
];

export const PREVIEW_RUNTIME_PARITY_CORPUS: readonly PreviewRuntimeParityCorpusCase[] = [
  {
    id: "three-videos-equal-windows",
    title: "One scene with three videos and equal windows",
    covers: ["three-videos", "equal-windows", "remove-visible", "idle-select"],
  },
  {
    id: "three-videos-unequal-windows",
    title: "One scene with three videos and unequal windows",
    covers: ["three-videos", "unequal-windows", "completed-scene-clock"],
  },
  {
    id: "three-videos-intra-scene-transition",
    title: "Three videos with an intra-scene transition",
    covers: ["intra-scene-transition", "outgoing-media", "remove-at-boundary"],
  },
  {
    id: "mixed-image-video-unequal",
    title: "Mixed image and video scene",
    covers: ["mixed-media", "unequal-windows"],
  },
  {
    id: "framing-fit-fill-zoom-fit-background",
    title: "Fit, Fill, zoom, and Fit-with-background",
    covers: ["fit", "fill", "zoom", "fit-with-background"],
  },
  {
    id: "captions-anchors-alignments-effects",
    title: "Caption anchors, alignments, and effects",
    covers: ["caption-geometry", "static", "fade-up", "typewriter", "highlight"],
  },
  {
    id: "cta-combined-size-scale-matrix",
    title: "Combined Like / Share / Subscribe size and fine-scale matrix",
    covers: ["cta-normalized-bounds", "small", "medium", "large", "min-scale", "max-scale"],
  },
  {
    id: "preview-phone-widths",
    title: "Preview phone widths",
    covers: PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX.map((width) => `${width}css-px`),
  },
  {
    id: "clock-lifecycle-two-scenes",
    title: "Completed scene and story clocks across two scenes",
    covers: ["completed-scene-clock", "completed-story-clock", "replay", "return"],
  },
];
