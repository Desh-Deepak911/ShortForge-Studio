/**
 * Deterministic in-memory story for the mixed-media scenes QA harness.
 * Uses a repository-local public SVG only — no remote media, voiceover, or music.
 */

import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import { visualSequenceToMediaTimeline } from "../adapters/visual-sequence-to-media-timeline";
import { normalizeVisualSequence } from "../domain/normalize-visual-sequence";

/** Existing repo-public SVG served by Next from `/public`. */
export const MIXED_MEDIA_SCENES_QA_IMAGE_URL = "/file.svg" as const;

export const MIXED_MEDIA_SCENES_QA_SCENE_ID = "mm-qa-scene-1" as const;
export const MIXED_MEDIA_SCENES_QA_ITEM_ID = "mm-qa-item-1" as const;
/** Narration-authoritative scene duration (~10 seconds). */
export const MIXED_MEDIA_SCENES_QA_DURATION_MS = 10_000 as const;

const QA_NARRATION =
  "Local mixed-media scenes QA narration lasting about ten seconds for timing authority.";

function qaImageMedia(): SceneMedia {
  return {
    type: "image",
    url: MIXED_MEDIA_SCENES_QA_IMAGE_URL,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function buildQaScene(): FootieScene {
  const durationMs = MIXED_MEDIA_SCENES_QA_DURATION_MS;
  const media = qaImageMedia();
  const base: FootieScene = {
    id: MIXED_MEDIA_SCENES_QA_SCENE_ID,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Mixed-media QA",
    narration: QA_NARRATION,
    captionMode: "subtitles",
    media,
    image: {
      url: MIXED_MEDIA_SCENES_QA_IMAGE_URL,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };

  const normalized = normalizeVisualSequence(
    {
      version: 1,
      items: [
        {
          id: MIXED_MEDIA_SCENES_QA_ITEM_ID,
          media,
          startOffsetMs: 0,
          durationMs,
        },
      ],
    },
    durationMs,
  );
  if (!normalized.sequence) {
    throw new Error(
      "Mixed-media QA fixture failed to normalize its initial visual sequence.",
    );
  }

  const timeline = visualSequenceToMediaTimeline(normalized.sequence);
  const withTimeline = applyBuiltMediaTimelineToScene(base, {
    items: timeline.items,
  });
  return {
    ...withTimeline,
    visualSequence: normalized.sequence,
  };
}

/** Fresh in-memory FootieScript for the local QA harness (no persistence). */
export function buildMixedMediaScenesQaStory(): FootieScript {
  const scene = buildQaScene();
  return syncFootieScript({
    title: "Mixed-Media Scenes QA",
    narration: QA_NARRATION,
    totalDuration: MIXED_MEDIA_SCENES_QA_DURATION_MS / 1000,
    scenes: [scene],
  });
}
