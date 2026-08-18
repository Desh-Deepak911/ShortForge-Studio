/**
 * In-memory Preview runtime-parity stories.
 * Local public fixtures only — no drafts, providers, or network media.
 */

import { ENGAGEMENT_OVERLAY_PRESET_ID } from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import { setSceneMediaTransitionBoundary } from "@/features/scene-media-transitions";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
  SceneMediaFitMode,
} from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { CaptionAnchor, CaptionTextAlign } from "@/features/caption-layout/caption-layout.types";
import type { CaptionAnimationPreset } from "@/features/caption-animation/caption-animation.types";
import type { EngagementOverlaySize } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import type { PreviewRuntimeParityCorpusCaseId } from "./preview-runtime-parity-corpus";
import {
  PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES,
  PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES,
  previewRuntimeParityPublicUrl,
} from "./preview-runtime-parity-fixture-identities";

export const PREVIEW_RUNTIME_PARITY_STORY_TITLE = "Preview runtime parity QA" as const;

const VIDEO_A = PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES[0];
const VIDEO_B = PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES[1];
const VIDEO_C = PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES[2];
const IMAGE_P = PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES[0];
const IMAGE_Q = PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES[1];

function videoMedia(
  identity: (typeof PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES)[number],
  extras: Partial<SceneMedia> = {},
): SceneMedia {
  return {
    type: "video",
    url: previewRuntimeParityPublicUrl(identity.fileName),
    source: "upload",
    mimeType: "image/svg+xml",
    durationMs: 6_000,
    trimStartMs: 0,
    trimEndMs: 6_000,
    muted: true,
    width: 1080,
    height: 1920,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...extras,
  };
}

function imageMedia(
  identity: (typeof PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES)[number],
  extras: Partial<SceneMedia> = {},
): SceneMedia {
  return {
    type: "image",
    url: previewRuntimeParityPublicUrl(identity.fileName),
    source: "upload",
    mimeType: "image/svg+xml",
    width: 1080,
    height: 1920,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...extras,
  };
}

function baseScene(input: {
  readonly id: string;
  readonly durationMs: number;
  readonly subtitle: string;
  readonly narration: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly media: SceneMedia;
    readonly durationWeight?: number;
  }>;
  readonly captionAnchor?: CaptionAnchor;
  readonly captionAlign?: CaptionTextAlign;
  readonly captionPreset?: CaptionAnimationPreset;
}): FootieScene {
  const durationSec = input.durationMs / 1000;
  const first = input.items[0];
  if (!first) {
    throw new Error("Preview runtime-parity scene requires at least one media item.");
  }
  const captionPreset = input.captionPreset ?? "none";
  const subtitleEffect =
    captionPreset === "typewriter" || captionPreset === "highlight"
      ? captionPreset
      : "fade-up";
  const scene: FootieScene = {
    id: input.id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    startMs: 0,
    endMs: input.durationMs,
    durationMs: input.durationMs,
    subtitle: input.subtitle,
    narration: input.narration,
    captionMode: "subtitles",
    subtitleEffect,
    captionLayout: {
      version: 2,
      anchor: input.captionAnchor ?? "bottom_center",
      textAlign: input.captionAlign ?? "center",
      safeAreaEnabled: true,
      maxWidthPercent: 90,
    },
    captionAnimation: {
      preset: captionPreset,
    },
    media: first.media,
  };
  return applyBuiltMediaTimelineToScene(scene, {
    items: input.items.map((item) => ({
      id: item.id,
      media: item.media,
      durationWeight: item.durationWeight ?? 1,
    })),
  });
}

function threeVideoItems(weights: readonly [number, number, number]) {
  return [
    { id: VIDEO_A.id, media: videoMedia(VIDEO_A), durationWeight: weights[0] },
    { id: VIDEO_B.id, media: videoMedia(VIDEO_B), durationWeight: weights[1] },
    { id: VIDEO_C.id, media: videoMedia(VIDEO_C), durationWeight: weights[2] },
  ];
}

export function buildThreeVideoEqualWindowScene(): FootieScene {
  return baseScene({
    id: "parity-scene-three-equal",
    durationMs: 9_000,
    subtitle: "Three equal video windows keep identity markers visible.",
    narration: "Three equal video windows keep identity markers visible across the scene.",
    items: threeVideoItems([1, 1, 1]),
    captionAnchor: "center",
    captionAlign: "center",
    captionPreset: "typewriter",
  });
}

export function buildThreeVideoUnequalWindowScene(): FootieScene {
  return baseScene({
    id: "parity-scene-three-unequal",
    durationMs: 9_000,
    subtitle: "Unequal windows change how long each video stays active.",
    narration: "Unequal windows change how long each video stays active on the timeline.",
    items: threeVideoItems([2, 3, 4]),
    captionAnchor: "bottom_center",
    captionAlign: "left",
    captionPreset: "highlight",
  });
}

export function buildThreeVideoIntraSceneTransitionScene(): FootieScene {
  const scene = baseScene({
    id: "parity-scene-three-transition",
    durationMs: 9_000,
    subtitle: "An intra-scene fade crosses the first video boundary.",
    narration: "An intra-scene fade crosses the first video boundary without a second engine.",
    items: threeVideoItems([1, 1, 1]),
    captionAnchor: "top_center",
    captionAlign: "right",
    captionPreset: "fade",
  });
  return setSceneMediaTransitionBoundary(scene, VIDEO_A.id, VIDEO_B.id, "fade", 500).scene;
}

export function buildMixedImageVideoScene(): FootieScene {
  return baseScene({
    id: "parity-scene-mixed",
    durationMs: 8_000,
    subtitle: "A mixed image and video scene uses unequal windows.",
    narration: "A mixed image and video scene uses unequal windows and local fixtures only.",
    items: [
      { id: IMAGE_P.id, media: imageMedia(IMAGE_P), durationWeight: 3 },
      { id: VIDEO_B.id, media: videoMedia(VIDEO_B), durationWeight: 5 },
    ],
    captionAnchor: "bottom_center",
    captionAlign: "center",
    captionPreset: "none",
  });
}

export function buildFramingCoverageScene(): FootieScene {
  return baseScene({
    id: "parity-scene-framing",
    durationMs: 8_000,
    subtitle: "Fit, fill, zoom, and fit with background stay on the shared framing plan.",
    narration: "Fit, fill, zoom, and fit with background stay on the shared framing plan.",
    items: [
      {
        id: `${IMAGE_P.id}-fill`,
        media: imageMedia(IMAGE_P, { fitMode: "cover" satisfies SceneMediaFitMode }),
        durationWeight: 1,
      },
      {
        id: `${IMAGE_Q.id}-fit`,
        media: imageMedia(IMAGE_Q, { fitMode: "contain" }),
        durationWeight: 1,
      },
      {
        id: `${VIDEO_A.id}-zoom`,
        media: videoMedia(VIDEO_A, {
          fitMode: "cover",
          transform: { x: 0, y: 0, scale: 1.35, rotation: 0 },
        }),
        durationWeight: 1,
      },
      {
        id: `${VIDEO_C.id}-fit-bg`,
        media: videoMedia(VIDEO_C, {
          fitMode: "contain",
          backgroundTreatment: "blurred_fill",
        }),
        durationWeight: 1,
      },
    ],
    captionAnchor: "top_center",
    captionAlign: "left",
    captionPreset: "none",
  });
}

export function buildClockLifecycleSecondScene(): FootieScene {
  return baseScene({
    id: "parity-scene-clock-return",
    durationMs: 6_000,
    subtitle: "Returning after story completion must not keep the completed clock.",
    narration: "Returning after story completion must not keep the completed clock.",
    items: [{ id: IMAGE_Q.id, media: imageMedia(IMAGE_Q), durationWeight: 1 }],
    captionAnchor: "center",
    captionAlign: "center",
    captionPreset: "none",
  });
}

function scriptFromScenes(narration: string, scenes: FootieScene[]): FootieScript {
  const totalDuration = scenes.reduce((sum, scene) => sum + getSceneDurationMs(scene), 0) / 1000;
  return syncFootieScript({
    title: PREVIEW_RUNTIME_PARITY_STORY_TITLE,
    narration,
    totalDuration,
    scenes,
  });
}

function withCombinedCta(
  script: FootieScript,
  sceneId: string,
  size: EngagementOverlaySize,
  scale: number,
): FootieScript {
  return {
    ...script,
    visualRetentionExtensions: {
      version: 1,
      engagementOverlaysBySceneId: {
        ...(script.visualRetentionExtensions?.engagementOverlaysBySceneId ?? {}),
        [sceneId]: [
          {
            version: 1,
            id: `parity-cta-${sceneId}`,
            kind: "combined",
            startOffsetMs: 400,
            durationMs: 2_500,
            position: "top-right",
            size,
            scale,
            presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
          },
        ],
      },
    },
  };
}

export function buildPreviewRuntimeParityStory(
  caseId: PreviewRuntimeParityCorpusCaseId = "three-videos-equal-windows",
): FootieScript {
  switch (caseId) {
    case "three-videos-equal-windows":
      return withCombinedCta(
        scriptFromScenes(
          "Three equal video windows keep identity markers visible across the scene.",
          [buildThreeVideoEqualWindowScene()],
        ),
        "parity-scene-three-equal",
        "medium",
        1,
      );
    case "three-videos-unequal-windows":
      return scriptFromScenes(
        "Unequal windows change how long each video stays active on the timeline.",
        [buildThreeVideoUnequalWindowScene()],
      );
    case "three-videos-intra-scene-transition":
      return scriptFromScenes(
        "An intra-scene fade crosses the first video boundary without a second engine.",
        [buildThreeVideoIntraSceneTransitionScene()],
      );
    case "mixed-image-video-unequal":
      return scriptFromScenes(
        "A mixed image and video scene uses unequal windows and local fixtures only.",
        [buildMixedImageVideoScene()],
      );
    case "framing-fit-fill-zoom-fit-background":
      return scriptFromScenes(
        "Fit, fill, zoom, and fit with background stay on the shared framing plan.",
        [buildFramingCoverageScene()],
      );
    case "captions-anchors-alignments-effects":
      return scriptFromScenes(
        "Caption anchors alignments and effects stay on the shared layout engine.",
        [
          buildThreeVideoEqualWindowScene(),
          {
            ...buildMixedImageVideoScene(),
            id: "parity-scene-caption-top",
            captionLayout: {
              version: 2,
              anchor: "top_center",
              textAlign: "left",
              safeAreaEnabled: true,
            },
            captionAnimation: { preset: "highlight" },
            subtitleEffect: "highlight",
          },
        ],
      );
    case "cta-combined-size-scale-matrix":
      return withCombinedCta(
        scriptFromScenes(
          "Combined like share subscribe size is compared in normalized bounds.",
          [buildThreeVideoEqualWindowScene()],
        ),
        "parity-scene-three-equal",
        "large",
        1.15,
      );
    case "preview-phone-widths":
      return buildPreviewRuntimeParityStory("three-videos-equal-windows");
    case "clock-lifecycle-two-scenes":
      return scriptFromScenes(
        "Three equal video windows keep identity markers visible across the scene. Returning after story completion must not keep the completed clock.",
        [buildThreeVideoEqualWindowScene(), buildClockLifecycleSecondScene()],
      );
    default: {
      const _exhaustive: never = caseId;
      return _exhaustive;
    }
  }
}

export function buildPreviewRuntimeParityHarnessStory(): FootieScript {
  return withCombinedCta(
    scriptFromScenes(
      "Three equal video windows keep identity markers visible across the scene. A mixed image and video scene uses unequal windows and local fixtures only. Returning after story completion must not keep the completed clock.",
      [
        buildThreeVideoIntraSceneTransitionScene(),
        buildMixedImageVideoScene(),
        buildFramingCoverageScene(),
        buildClockLifecycleSecondScene(),
      ],
    ),
    "parity-scene-three-transition",
    "medium",
    1,
  );
}
