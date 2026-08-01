/**
 * Deterministic in-memory story for the Visual pacing QA harness.
 * Uses a repository-local public SVG only — no remote media, voiceover, or music.
 */

import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import { visualSequenceToMediaTimeline } from "@/features/mixed-media-scenes/adapters/visual-sequence-to-media-timeline";
import { normalizeVisualSequence } from "@/features/mixed-media-scenes/domain/normalize-visual-sequence";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

/** Existing repo-public SVG served by Next from `/public`. */
export const VISUAL_PACING_QA_IMAGE_URL = "/file.svg" as const;

export const VISUAL_PACING_QA_SCENE_ID = "vp-qa-scene-1" as const;
export const VISUAL_PACING_QA_ITEM_IDS = [
  "vp-qa-item-1",
  "vp-qa-item-2",
  "vp-qa-item-3",
] as const;

/** Narration-authoritative scene duration (12 seconds). */
export const VISUAL_PACING_QA_DURATION_MS = 12_000 as const;
export const VISUAL_PACING_QA_WINDOW_DURATION_MS = 4_000 as const;

const QA_NARRATION =
  "The midfielder receives the ball under pressure. He turns quickly toward the far touchline. One sharp pass finds the runner in behind. The forward finishes low into the far corner.";

function qaImageMedia(): SceneMedia {
  return {
    type: "image",
    url: VISUAL_PACING_QA_IMAGE_URL,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function buildQaScene(): FootieScene {
  const durationMs = VISUAL_PACING_QA_DURATION_MS;
  const windowMs = VISUAL_PACING_QA_WINDOW_DURATION_MS;
  const media = qaImageMedia();
  const base: FootieScene = {
    id: VISUAL_PACING_QA_SCENE_ID,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Visual pacing QA",
    narration: QA_NARRATION,
    captionMode: "subtitles",
    media,
    image: {
      url: VISUAL_PACING_QA_IMAGE_URL,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };

  const normalized = normalizeVisualSequence(
    {
      version: 1,
      items: VISUAL_PACING_QA_ITEM_IDS.map((id, index) => ({
        id,
        media: qaImageMedia(),
        startOffsetMs: index * windowMs,
        durationMs: windowMs,
      })),
    },
    durationMs,
  );
  if (!normalized.sequence || normalized.sequence.items.length !== 3) {
    throw new Error(
      "Visual pacing QA fixture failed to normalize its initial visual sequence.",
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
export function buildVisualPacingQaStory(): FootieScript {
  const scene = buildQaScene();
  return syncFootieScript({
    title: "Visual Pacing QA",
    narration: QA_NARRATION,
    totalDuration: VISUAL_PACING_QA_DURATION_MS / 1000,
    scenes: [scene],
  });
}
