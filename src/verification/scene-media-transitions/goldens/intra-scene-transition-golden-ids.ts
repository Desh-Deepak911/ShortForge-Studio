/**
 * Sprint 9D — Intra-scene transition golden registry IDs.
 */

export const INTRA_SCENE_TRANSITION_GOLDEN_IDS = [
  "ist-hard-cut-absence",
  "ist-hard-cut-explicit-removal",
  "ist-fade",
  "ist-slide-left",
  "ist-slide-right",
  "ist-zoom-in",
  "ist-zoom-out",
  "ist-blur",
  "ist-multi-boundary-abc",
  "ist-image-to-image",
  "ist-image-to-video",
  "ist-video-to-image",
  "ist-video-to-video",
  "ist-duration-under-clamp",
  "ist-duration-clamped-40pct",
  "ist-placeholder-fallback",
  "ist-legacy-single-media",
  "ist-scene-to-scene-priority",
  "ist-captions-during-overlay",
  "ist-v2-hard-cut-compat",
  "ist-fingerprint-tamper-reject",
  "ist-malformed-boundary-reject",
] as const;

export type IntraSceneTransitionGoldenId =
  (typeof INTRA_SCENE_TRANSITION_GOLDEN_IDS)[number];

export type IntraSceneTransitionEvidenceClass =
  | "automated-semantic"
  | "mocked-integration"
  | "local-browser-preview"
  | "local-export-artifact"
  | "manual-editor-review"
  | "untested-device";

export type IntraSceneTransitionExpectedManifest =
  | { readonly kind: "v3"; readonly hasBoundaries: boolean }
  | { readonly kind: "v2-hard-cut" }
  | { readonly kind: "reject-v3" };

export interface IntraSceneTransitionGoldenDescriptor {
  readonly id: IntraSceneTransitionGoldenId;
  readonly title: string;
  readonly description: string;
  readonly evidenceClass: IntraSceneTransitionEvidenceClass;
  readonly expectedPreview:
    | "hard-cut"
    | "active-overlay"
    | "multi-overlay"
    | "scene-to-scene-wins"
    | "legacy-ordinary"
    | "n/a-reject";
  readonly expectedExport:
    | "hard-cut-v3-empty"
    | "active-overlay-v3"
    | "multi-overlay-v3"
    | "scene-to-scene-priority"
    | "v2-hard-cut"
    | "reject-integrity"
    | "legacy-ordinary";
  readonly expectedManifest: IntraSceneTransitionExpectedManifest;
}
