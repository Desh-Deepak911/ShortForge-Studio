/**
 * Frozen two-item same-URL story for per-media video trim certification.
 */

import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import { setSceneMediaTransitionBoundary } from "@/features/scene-media-transitions";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  PER_MEDIA_VIDEO_TRIM_A,
  PER_MEDIA_VIDEO_TRIM_B,
  PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
  PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS,
  PER_MEDIA_VIDEO_TRIM_SCENE_ID,
  PER_MEDIA_VIDEO_TRIM_FIXTURE_URL,
  PER_MEDIA_VIDEO_TRIM_SOURCE_DURATION_MS,
} from "./per-media-video-trim-contract";

export {
  PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
  PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  PER_MEDIA_VIDEO_TRIM_SCENE_ID,
} from "./per-media-video-trim-contract";

export function buildPerMediaVideoTrimSourceMedia(
  extras: Partial<SceneMedia> = {},
): SceneMedia {
  return {
    type: "video",
    url: PER_MEDIA_VIDEO_TRIM_FIXTURE_URL,
    source: "upload",
    mimeType: "video/mp4",
    durationMs: PER_MEDIA_VIDEO_TRIM_SOURCE_DURATION_MS,
    trimStartMs: 0,
    trimEndMs: PER_MEDIA_VIDEO_TRIM_SOURCE_DURATION_MS,
    muted: true,
    width: 1080,
    height: 1920,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...extras,
  };
}

export function buildPerMediaVideoTrimScene(input?: {
  readonly withTransition?: boolean;
}): FootieScene {
  const mediaA = buildPerMediaVideoTrimSourceMedia(
    input?.withTransition === true
      ? { trimStartMs: 0, trimEndMs: PER_MEDIA_VIDEO_TRIM_SOURCE_DURATION_MS }
      : { ...PER_MEDIA_VIDEO_TRIM_A },
  );
  const mediaB = buildPerMediaVideoTrimSourceMedia({
    ...PER_MEDIA_VIDEO_TRIM_B,
  });
  const durationSec = PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS / 1000;
  const scene = applyBuiltMediaTimelineToScene(
    {
      id: PER_MEDIA_VIDEO_TRIM_SCENE_ID,
      start: 0,
      end: durationSec,
      duration: durationSec,
      startMs: 0,
      endMs: PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS,
      durationMs: PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS,
      subtitle: "Transparent caption check",
      narration: "Transparent caption check",
      captionMode: "generated",
      captionStyle: {
        backgroundEnabled: false,
        backgroundOpacity: 45,
        backgroundColor: "#000000",
      },
      captionLayout: {
        version: 2,
        anchor: "bottom_center",
        textAlign: "center",
        safeAreaEnabled: true,
        maxWidthPercent: 90,
      },
      media: mediaA,
    } as FootieScene,
    {
      items: [
        {
          id: PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
          media: mediaA,
          durationWeight: 1,
        },
        {
          id: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
          media: mediaB,
          durationWeight: 1,
        },
      ],
    },
  );

  if (input?.withTransition !== true) {
    return scene;
  }
  return setSceneMediaTransitionBoundary(
    scene,
    PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
    PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    "fade",
    500,
  ).scene;
}

export function buildPerMediaVideoTrimStory(input?: {
  readonly withTransition?: boolean;
}): FootieScript {
  const scene = buildPerMediaVideoTrimScene(input);
  const durationSec = PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS / 1000;
  return syncFootieScript({
    title: "Per-media video trim",
    narration: "Transparent caption check",
    totalDuration: durationSec,
    scenes: [scene],
  } as FootieScript);
}
