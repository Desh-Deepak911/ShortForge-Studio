/**
 * Deterministic in-memory story for the visual-motion QA harness.
 * Local public SVG only — no remote media, voiceover, music, or persistence.
 */

import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import { visualSequenceToMediaTimeline } from "@/features/mixed-media-scenes/adapters/visual-sequence-to-media-timeline";
import { normalizeVisualSequence } from "@/features/mixed-media-scenes/domain/normalize-visual-sequence";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

/** Existing repo-public SVG served by Next from `/public`. */
export const VISUAL_MOTION_QA_IMAGE_URL = "/file.svg" as const;

export const VISUAL_MOTION_QA_SCENE_1_ID = "vm-qa-scene-1" as const;
export const VISUAL_MOTION_QA_SCENE_2_ID = "vm-qa-scene-2" as const;

/** Stable responsibility-named media item ids for scene 1 (render order). */
export const VISUAL_MOTION_QA_SCENE_1_ITEM_IDS = [
  "vm-qa-portrait",
  "vm-qa-landscape",
  "vm-qa-low-resolution",
] as const;

export const VISUAL_MOTION_QA_SCENE_2_ITEM_ID = "vm-qa-scene-2-media" as const;

/** Narration-authoritative scene durations. */
export const VISUAL_MOTION_QA_SCENE_1_DURATION_MS = 12_000 as const;
export const VISUAL_MOTION_QA_SCENE_2_DURATION_MS = 7_000 as const;
export const VISUAL_MOTION_QA_WINDOW_DURATION_MS = 4_000 as const;

const SCENE_1_NARRATION =
  "The midfielder receives the ball under pressure. He turns quickly toward the far touchline. One sharp pass finds the runner in behind. The forward finishes low into the far corner.";

const SCENE_2_NARRATION =
  "The keeper claims the cross and resets play with a calm, early throw.";

const PROJECT_NARRATION = `${SCENE_1_NARRATION} ${SCENE_2_NARRATION}`;

function qaImageMedia(input: {
  readonly width: number;
  readonly height: number;
  readonly fitMode: "cover" | "contain";
}): SceneMedia {
  return {
    type: "image",
    url: VISUAL_MOTION_QA_IMAGE_URL,
    source: "upload",
    mimeType: "image/svg+xml",
    width: input.width,
    height: input.height,
    fitMode: input.fitMode,
    transform: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    },
  };
}

function buildScene1MediaItems(): readonly SceneMedia[] {
  return [
    qaImageMedia({ width: 1080, height: 1920, fitMode: "cover" }),
    qaImageMedia({ width: 1920, height: 1080, fitMode: "cover" }),
    qaImageMedia({ width: 360, height: 640, fitMode: "contain" }),
  ];
}

function assertNoEnhancements(media: SceneMedia): void {
  if (media.motion != null) {
    throw new Error("Visual-motion QA fixture must not seed motion.");
  }
  if (media.visualEffect != null) {
    throw new Error("Visual-motion QA fixture must not seed visualEffect.");
  }
  if (media.subjectFocus != null) {
    throw new Error("Visual-motion QA fixture must not seed subjectFocus.");
  }
  if (media.subjectAwareFramingProvenance != null) {
    throw new Error(
      "Visual-motion QA fixture must not seed subjectAwareFramingProvenance.",
    );
  }
  if (media.sourceQualityAdjustmentProvenance != null) {
    throw new Error(
      "Visual-motion QA fixture must not seed sourceQualityAdjustmentProvenance.",
    );
  }
}

function buildScene1(): FootieScene {
  const durationMs = VISUAL_MOTION_QA_SCENE_1_DURATION_MS;
  const windowMs = VISUAL_MOTION_QA_WINDOW_DURATION_MS;
  const mediaItems = buildScene1MediaItems();
  for (const media of mediaItems) {
    assertNoEnhancements(media);
  }
  const first = mediaItems[0]!;
  const base: FootieScene = {
    id: VISUAL_MOTION_QA_SCENE_1_ID,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Visual motion QA · scene 1",
    narration: SCENE_1_NARRATION,
    captionMode: "subtitles",
    media: first,
    image: {
      url: VISUAL_MOTION_QA_IMAGE_URL,
      fitMode: "fill",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };

  const normalized = normalizeVisualSequence(
    {
      version: 1,
      items: VISUAL_MOTION_QA_SCENE_1_ITEM_IDS.map((id, index) => ({
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
      "Visual-motion QA fixture failed to normalize scene 1 visual sequence.",
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

function buildScene2(): FootieScene {
  const durationMs = VISUAL_MOTION_QA_SCENE_2_DURATION_MS;
  const startMs = VISUAL_MOTION_QA_SCENE_1_DURATION_MS;
  const media = qaImageMedia({
    width: 1080,
    height: 1920,
    fitMode: "cover",
  });
  assertNoEnhancements(media);

  const base: FootieScene = {
    id: VISUAL_MOTION_QA_SCENE_2_ID,
    start: startMs / 1000,
    end: (startMs + durationMs) / 1000,
    duration: durationMs / 1000,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle: "Visual motion QA · scene 2",
    narration: SCENE_2_NARRATION,
    captionMode: "subtitles",
    media,
    image: {
      url: VISUAL_MOTION_QA_IMAGE_URL,
      fitMode: "fill",
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
          id: VISUAL_MOTION_QA_SCENE_2_ITEM_ID,
          media,
          startOffsetMs: 0,
          durationMs,
        },
      ],
    },
    durationMs,
  );
  if (!normalized.sequence || normalized.sequence.items.length !== 1) {
    throw new Error(
      "Visual-motion QA fixture failed to normalize scene 2 visual sequence.",
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

/** Fresh in-memory FootieScript for the local visual-motion QA harness. */
export function buildVisualMotionQaStory(): FootieScript {
  const scene1 = buildScene1();
  const scene2 = buildScene2();
  const story = syncFootieScript({
    title: "Visual Motion QA",
    narration: PROJECT_NARRATION,
    totalDuration:
      (VISUAL_MOTION_QA_SCENE_1_DURATION_MS +
        VISUAL_MOTION_QA_SCENE_2_DURATION_MS) /
      1000,
    scenes: [scene1, scene2],
    backgroundMusic: {
      enabled: false,
      source: "none",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  });

  if (story.voiceoverUrl != null) {
    throw new Error("Visual-motion QA story must not include a voiceover URL.");
  }
  if (story.backgroundMusic?.enabled) {
    throw new Error("Visual-motion QA story must keep background music disabled.");
  }
  if (story.visualRetentionExtensions != null) {
    throw new Error(
      "Visual-motion QA story must not seed visualRetentionExtensions.",
    );
  }

  return story;
}
