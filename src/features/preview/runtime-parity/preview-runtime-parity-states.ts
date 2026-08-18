/**
 * Explicit Preview presentation states for the runtime-parity contract.
 * Inspection may differ from playback; this module only names the distinction.
 */

export const PREVIEW_RUNTIME_PARITY_STATE_IDS = [
  "playback-active-media",
  "idle-timeline-media",
  "selected-media-item-for-inspection",
  "outgoing-transition-media",
  "removed-or-no-longer-authoritative-media",
  "paused-clock",
  "completed-scene-clock",
  "completed-story-clock",
  "trim-scrub-override",
  "caption-edit-mode",
  "framing-edit-mode",
] as const;

export type PreviewRuntimeParityStateId =
  (typeof PREVIEW_RUNTIME_PARITY_STATE_IDS)[number];

export type PreviewPlaybackAuthorityKind =
  | "canonical-timeline"
  | "inspection"
  | "trim-scrub"
  | "none";

export type PreviewClockKind =
  | "idle"
  | "playing"
  | "paused"
  | "completed-scene"
  | "completed-story"
  | "trim-scrub";

export interface PreviewRuntimeParityClockState {
  readonly kind: PreviewClockKind;
  readonly timelineMs: number;
  readonly sceneElapsedMs: number;
  readonly sceneId: string | null;
  readonly holdingFinalFrame: boolean;
}

export interface PreviewRuntimeParityMediaIdentity {
  readonly mediaItemId: string | null;
  readonly mediaType: "video" | "image" | "placeholder" | "none";
  readonly mediaUrl: string | null;
  readonly itemIndex: number;
}

export interface PreviewRuntimeParityPresentationState {
  readonly playbackAuthority: PreviewPlaybackAuthorityKind;
  readonly clock: PreviewRuntimeParityClockState;
  readonly playbackMedia: PreviewRuntimeParityMediaIdentity;
  readonly inspectionMedia: PreviewRuntimeParityMediaIdentity;
  readonly outgoingTransitionMedia: PreviewRuntimeParityMediaIdentity | null;
  readonly removedMediaIds: readonly string[];
  readonly removedMediaUrls: readonly string[];
  readonly captionEditMode: boolean;
  readonly framingEditMode: boolean;
  readonly trimScrubActive: boolean;
}
