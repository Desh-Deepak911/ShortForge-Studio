/**
 * Preview runtime-parity contract (Prompt 1).
 * Names the invariants Preview must share with Browser and Headless export.
 * Does not implement production Preview behavior and does not invent a second
 * media-timing, caption-layout, framing, overlay, or transition engine.
 */

export const PREVIEW_RUNTIME_PARITY_OUTPUT_WIDTH = 1080 as const;
export const PREVIEW_RUNTIME_PARITY_OUTPUT_HEIGHT = 1920 as const;

/** CSS phone widths the corpus must cover. */
export const PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX = [220, 260, 360] as const;

export const PREVIEW_RUNTIME_PARITY_DEFECT_IDS = [
  "stale-removed-visible-video",
  "idle-selection-ignored",
  "stale-clock-after-play",
  "centered-caption-shifts-on-playback",
  "caption-geometry-idle-vs-playback",
  "cta-preview-larger-than-export",
  "preview-must-match-canonical-export",
] as const;

export type PreviewRuntimeParityDefectId =
  (typeof PREVIEW_RUNTIME_PARITY_DEFECT_IDS)[number];

export const PREVIEW_RUNTIME_PARITY_INVARIANT_IDS = [
  "canonical-playback-follows-shared-timeline",
  "idle-selection-independent-of-persisted-timing",
  "removed-media-never-authoritative",
  "removed-url-never-attached-to-mounted-layer",
  "selection-never-mutates-export-timing-or-order",
  "playback-exits-inspection-and-resumes-timeline",
  "stop-replay-scene-switch-story-complete-clocks-are-deterministic",
  "caption-anchor-geometry-stable-as-text-width-changes",
  "caption-animation-transforms-content-inside-placement-box",
  "preview-and-export-share-output-space-proportions",
  "cta-size-compared-via-normalized-bounds",
  "preview-never-mutates-export-manifests-or-renderer-capabilities",
] as const;

export type PreviewRuntimeParityInvariantId =
  (typeof PREVIEW_RUNTIME_PARITY_INVARIANT_IDS)[number];

export type PreviewRuntimeParityDefectClass =
  | "confirmed-production-defect"
  | "intentional-but-inadequate-current-behavior"
  | "probable-lifecycle-defect-awaiting-prompt-2"
  | "structurally-addressed-awaiting-browser-certification";

export interface PreviewRuntimeParityInvariant {
  readonly id: PreviewRuntimeParityInvariantId;
  readonly statement: string;
}

export const PREVIEW_RUNTIME_PARITY_INVARIANTS: readonly PreviewRuntimeParityInvariant[] =
  [
    {
      id: "canonical-playback-follows-shared-timeline",
      statement:
        "Canonical playback always follows the shared scene-media windows and master timeline.",
    },
    {
      id: "idle-selection-independent-of-persisted-timing",
      statement:
        "Idle selection of a valid media item can be represented independently from playback without changing persisted timing.",
    },
    {
      id: "removed-media-never-authoritative",
      statement:
        "Removed media can never remain an authoritative Preview layer.",
    },
    {
      id: "removed-url-never-attached-to-mounted-layer",
      statement:
        "A removed media URL cannot remain attached to a mounted Preview video or background-paint loop.",
    },
    {
      id: "selection-never-mutates-export-timing-or-order",
      statement:
        "Selecting an item never changes export timing or persisted media order.",
    },
    {
      id: "playback-exits-inspection-and-resumes-timeline",
      statement:
        "Starting playback exits inspection presentation and resumes canonical timeline authority.",
    },
    {
      id: "stop-replay-scene-switch-story-complete-clocks-are-deterministic",
      statement:
        "Stopping, replaying, switching scenes, and returning after story completion have deterministic clock behavior.",
    },
    {
      id: "caption-anchor-geometry-stable-as-text-width-changes",
      statement:
        "Caption anchor geometry remains stable as active text width changes.",
    },
    {
      id: "caption-animation-transforms-content-inside-placement-box",
      statement:
        "Caption animation transforms content inside its placement box; it does not move the placement box.",
    },
    {
      id: "preview-and-export-share-output-space-proportions",
      statement:
        "Preview and export use equivalent output-space proportions at 1080×1920.",
    },
    {
      id: "cta-size-compared-via-normalized-bounds",
      statement:
        "CTA size is compared using normalized bounds, not literal CSS pixels.",
    },
    {
      id: "preview-never-mutates-export-manifests-or-renderer-capabilities",
      statement:
        "Preview must never mutate export manifests or renderer capabilities.",
    },
  ];

export const PREVIEW_RUNTIME_PARITY_PROMPT2_PRODUCTION_FILES = [
  "src/features/preview/components/PreviewFrame.tsx",
  "src/features/preview/components/VideoPreview.tsx",
  "src/features/preview/components/SubtitleOverlay.tsx",
  "src/features/preview/hooks/usePreviewPlayback.ts",
  "src/features/preview/utils/preview-scene-playback.utils.ts",
  "src/features/caption-engine/caption-layout.utils.ts",
  "src/features/editor/components/SceneFrameMedia.tsx",
  "src/features/editor/components/SceneFrameVideo.tsx",
  "src/features/editor/preview/video-background-paint-loop.ts",
  "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
  "src/features/editor/selection/EditorSelectionProvider.tsx",
] as const;
