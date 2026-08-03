/**
 * Deterministic in-memory story for the source-quality QA harness.
 * Uses a repository-local public SVG only — no remote media, voiceover, or music.
 */

import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import { visualSequenceToMediaTimeline } from "@/features/mixed-media-scenes/adapters/visual-sequence-to-media-timeline";
import { normalizeVisualSequence } from "@/features/mixed-media-scenes/domain/normalize-visual-sequence";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

/** Existing repo-public SVG served by Next from `/public`. */
export const SOURCE_QUALITY_QA_IMAGE_URL = "/file.svg" as const;

export const SOURCE_QUALITY_QA_SCENE_ID = "sq-qa-scene-1" as const;

/** Stable responsibility-named media item ids (order is render order). */
export const SOURCE_QUALITY_QA_ITEM_IDS = [
  "sq-qa-portrait",
  "sq-qa-landscape",
  "sq-qa-low-resolution",
] as const;

/** Narration-authoritative scene duration (12 seconds). */
export const SOURCE_QUALITY_QA_DURATION_MS = 12_000 as const;
export const SOURCE_QUALITY_QA_WINDOW_DURATION_MS = 4_000 as const;

const QA_NARRATION =
  "The midfielder receives the ball under pressure. He turns quickly toward the far touchline. One sharp pass finds the runner in behind. The forward finishes low into the far corner.";

function qaImageMedia(input: {
  readonly width: number;
  readonly height: number;
  readonly fitMode: "cover" | "contain";
  readonly scale: number;
}): SceneMedia {
  return {
    type: "image",
    url: SOURCE_QUALITY_QA_IMAGE_URL,
    source: "upload",
    mimeType: "image/svg+xml",
    width: input.width,
    height: input.height,
    fitMode: input.fitMode,
    transform: {
      x: 0,
      y: 0,
      scale: input.scale,
      rotation: 0,
    },
  };
}

function buildQaMediaItems(): readonly SceneMedia[] {
  return [
    // Fill + 1.4× zoom → safe zoom-reset recommendation.
    qaImageMedia({
      width: 1080,
      height: 1920,
      fitMode: "cover",
      scale: 1.4,
    }),
    // Landscape fill → aggressive crop guidance; Fit when recommended.
    qaImageMedia({
      width: 1920,
      height: 1080,
      fitMode: "cover",
      scale: 1,
    }),
    // Low-resolution Fit → higher-resolution guidance; no Apply.
    qaImageMedia({
      width: 360,
      height: 640,
      fitMode: "contain",
      scale: 1,
    }),
  ];
}

function buildQaScene(): FootieScene {
  const durationMs = SOURCE_QUALITY_QA_DURATION_MS;
  const windowMs = SOURCE_QUALITY_QA_WINDOW_DURATION_MS;
  const mediaItems = buildQaMediaItems();
  const first = mediaItems[0]!;
  const base: FootieScene = {
    id: SOURCE_QUALITY_QA_SCENE_ID,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Source quality QA",
    narration: QA_NARRATION,
    captionMode: "subtitles",
    media: first,
    image: {
      url: SOURCE_QUALITY_QA_IMAGE_URL,
      fitMode: "fill",
      scale: first.transform?.scale ?? 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };

  const normalized = normalizeVisualSequence(
    {
      version: 1,
      items: SOURCE_QUALITY_QA_ITEM_IDS.map((id, index) => ({
        id,
        media: mediaItems[index]!,
        startOffsetMs: index * windowMs,
        durationMs: windowMs,
      })),
    },
    durationMs,
  );
  if (!normalized.sequence || normalized.sequence.items.length !== 3) {
    throw new Error(
      "Source quality QA fixture failed to normalize its initial visual sequence.",
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
export function buildSourceQualityQaStory(): FootieScript {
  const scene = buildQaScene();
  return syncFootieScript({
    title: "Source Quality QA",
    narration: QA_NARRATION,
    totalDuration: SOURCE_QUALITY_QA_DURATION_MS / 1000,
    scenes: [scene],
    backgroundMusic: {
      enabled: false,
      source: "none",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  });
}
