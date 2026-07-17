/**
 * Sprint 8E golden fixture IDs — deterministic multi-image QA registry.
 */

export const SCENE_MEDIA_GOLDEN_IDS = [
  "sm-legacy-single-image",
  "sm-two-equal-images",
  "sm-three-unequal-images",
  "sm-image-to-video-trim",
  "sm-video-to-image",
  "sm-multi-video-independent-trims",
  "sm-per-item-framing-motion",
  "sm-transition-multi-item-peers",
  "sm-placeholder-missing-media",
  "sm-malformed-export-manifest-v2",
  "sm-draft-reload-duplicate",
  "sm-legacy-explicit-edit-conversion",
] as const;

export type SceneMediaGoldenId = (typeof SCENE_MEDIA_GOLDEN_IDS)[number];

export interface SceneMediaGoldenDescriptor {
  readonly id: SceneMediaGoldenId;
  readonly title: string;
  readonly evidenceFocus:
    | "legacy-compat"
    | "timeline-windows"
    | "mixed-media"
    | "inspector"
    | "preview-export-parity"
    | "transitions"
    | "failure"
    | "persistence";
}
