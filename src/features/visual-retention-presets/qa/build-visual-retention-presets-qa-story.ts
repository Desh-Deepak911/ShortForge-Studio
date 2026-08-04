/**
 * Deterministic in-memory story for the Visual Retention Presets QA harness.
 * Local public SVG only — no remote media, voiceover, music, or persistence.
 */

import { applyBuiltMediaTimelineToScene } from "@/features/scene-media-timeline";
import { visualSequenceToMediaTimeline } from "@/features/mixed-media-scenes/adapters/visual-sequence-to-media-timeline";
import { normalizeVisualSequence } from "@/features/mixed-media-scenes/domain/normalize-visual-sequence";
import type {
  FootieScene,
  FootieScript,
  MediaMotionKeyframe,
  SceneMedia,
} from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

/** Existing repo-public SVG served by Next from `/public`. */
export const VISUAL_RETENTION_PRESETS_QA_IMAGE_URL = "/file.svg" as const;

export const VISUAL_RETENTION_PRESETS_QA_SCENE_1_ID = "vrp-qa-scene-1" as const;
export const VISUAL_RETENTION_PRESETS_QA_SCENE_2_ID = "vrp-qa-scene-2" as const;
export const VISUAL_RETENTION_PRESETS_QA_SCENE_3_ID = "vrp-qa-scene-3" as const;

export const VISUAL_RETENTION_PRESETS_QA_SCENE_1_ITEM_IDS = [
  "vrp-qa-scene-1-item-1",
  "vrp-qa-scene-1-item-2",
  "vrp-qa-scene-1-item-3",
] as const;

export const VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_IDS = [
  "vrp-qa-scene-2-item-1",
  "vrp-qa-scene-2-item-2",
] as const;

export const VISUAL_RETENTION_PRESETS_QA_SCENE_3_ITEM_ID =
  "vrp-qa-scene-3-item-1" as const;

export const VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS = 12_000 as const;
export const VISUAL_RETENTION_PRESETS_QA_SCENE_2_DURATION_MS = 8_000 as const;
export const VISUAL_RETENTION_PRESETS_QA_SCENE_3_DURATION_MS = 6_000 as const;
export const VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS = 4_000 as const;

/** Non-identity freeform adjustment seeded on Scene 2 item 2. */
export const VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS = 110 as const;

const SCENE_1_NARRATION =
  "The midfielder receives under pressure near the halfway line. He turns quickly toward the far touchline. One sharp pass finds the runner in behind. The forward finishes low into the far corner.";

const SCENE_2_NARRATION =
  "The keeper claims the cross cleanly and resets play with a calm, early throw toward the right back.";

const SCENE_3_NARRATION =
  "The final whistle arrives after a late clearance. The home side holds on for the points.";

const PROJECT_NARRATION = `${SCENE_1_NARRATION} ${SCENE_2_NARRATION} ${SCENE_3_NARRATION}`;

function qaImageMedia(input: {
  readonly width: number;
  readonly height: number;
  readonly fitMode: "cover" | "contain";
  readonly motion?: SceneMedia["motion"];
  readonly visualAdjustments?: SceneMedia["visualAdjustments"];
}): SceneMedia {
  return {
    type: "image",
    url: VISUAL_RETENTION_PRESETS_QA_IMAGE_URL,
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
    ...(input.motion ? { motion: input.motion } : {}),
    ...(input.visualAdjustments
      ? { visualAdjustments: input.visualAdjustments }
      : {}),
  };
}

function buildManualCustomKeyframes(
  windowDurationMs: number,
): readonly MediaMotionKeyframe[] {
  return [
    {
      offsetMs: 0,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      easing: "linear",
    },
    {
      offsetMs: Math.min(2_000, Math.max(1, windowDurationMs - 1)),
      x: 24,
      y: 0,
      scale: 1.12,
      rotation: 0,
      opacity: 1,
      easing: "ease-in-out",
    },
  ];
}

function assertLocalMedia(media: SceneMedia, label: string): void {
  const url = media.url ?? "";
  if (url !== VISUAL_RETENTION_PRESETS_QA_IMAGE_URL) {
    throw new Error(`${label}: expected local ${VISUAL_RETENTION_PRESETS_QA_IMAGE_URL}.`);
  }
  if (/^https?:\/\//i.test(url) || /^blob:/i.test(url)) {
    throw new Error(`${label}: remote/blob media is forbidden.`);
  }
  if (typeof media.width !== "number" || typeof media.height !== "number") {
    throw new Error(`${label}: intrinsic dimensions are required.`);
  }
}

function assertCleanBaselineMedia(media: SceneMedia, label: string): void {
  assertLocalMedia(media, label);
  if (media.visualEffect != null) {
    throw new Error(`${label}: must not seed visualEffect look presets.`);
  }
  if (media.subjectFocus != null) {
    throw new Error(`${label}: must not seed subjectFocus.`);
  }
  if (media.subjectAwareFramingProvenance != null) {
    throw new Error(`${label}: must not seed subjectAwareFramingProvenance.`);
  }
  if (media.sourceQualityAdjustmentProvenance != null) {
    throw new Error(
      `${label}: must not seed sourceQualityAdjustmentProvenance.`,
    );
  }
}

function assertSequenceTimelineParity(
  scene: FootieScene,
  expectedIds: readonly string[],
  expectedWindows: ReadonlyArray<{
    readonly startOffsetMs: number;
    readonly durationMs: number;
  }>,
): void {
  const sequence = scene.visualSequence?.items;
  const timeline = scene.mediaTimeline?.items;
  if (!sequence || !timeline) {
    throw new Error(`${scene.id}: visualSequence and mediaTimeline are required.`);
  }
  if (sequence.length !== expectedIds.length || timeline.length !== expectedIds.length) {
    throw new Error(`${scene.id}: unexpected media item count.`);
  }
  for (let index = 0; index < expectedIds.length; index += 1) {
    const seq = sequence[index]!;
    const tl = timeline[index]!;
    const expected = expectedWindows[index]!;
    if (seq.id !== expectedIds[index] || tl.id !== expectedIds[index]) {
      throw new Error(`${scene.id}: media IDs/order mismatch at index ${index}.`);
    }
    if (
      seq.startOffsetMs !== expected.startOffsetMs ||
      seq.durationMs !== expected.durationMs
    ) {
      throw new Error(`${scene.id}: sequence windows differ at ${seq.id}.`);
    }
    // mediaTimeline stores proportional durationWeight (ms for equal windows).
    if (Math.round(tl.durationWeight) !== Math.round(expected.durationMs)) {
      throw new Error(
        `${scene.id}: sequence/timeline duration parity failed at ${seq.id}.`,
      );
    }
  }
}

function buildSceneFromItems(input: {
  readonly id: string;
  readonly durationMs: number;
  readonly startMs: number;
  readonly narration: string;
  readonly subtitle: string;
  readonly itemIds: readonly string[];
  readonly mediaItems: readonly SceneMedia[];
  readonly windowDurationMs: number;
}): FootieScene {
  const { id, durationMs, startMs, narration, subtitle, itemIds, mediaItems } =
    input;
  if (itemIds.length !== mediaItems.length) {
    throw new Error(`${id}: itemIds/mediaItems length mismatch.`);
  }
  for (let index = 0; index < mediaItems.length; index += 1) {
    assertCleanBaselineMedia(mediaItems[index]!, `${id}/${itemIds[index]}`);
  }

  const first = mediaItems[0]!;
  const base: FootieScene = {
    id,
    start: startMs / 1000,
    end: (startMs + durationMs) / 1000,
    duration: durationMs / 1000,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle,
    narration,
    captionMode: "subtitles",
    media: first,
    image: {
      url: VISUAL_RETENTION_PRESETS_QA_IMAGE_URL,
      fitMode: first.fitMode === "contain" ? "fit" : "fill",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };

  const expectedWindows = itemIds.map((_, index) => ({
    startOffsetMs: index * input.windowDurationMs,
    durationMs:
      index === itemIds.length - 1
        ? durationMs - index * input.windowDurationMs
        : input.windowDurationMs,
  }));

  const normalized = normalizeVisualSequence(
    {
      version: 1,
      items: itemIds.map((itemId, index) => ({
        id: itemId,
        media: mediaItems[index]!,
        startOffsetMs: expectedWindows[index]!.startOffsetMs,
        durationMs: expectedWindows[index]!.durationMs,
      })),
    },
    durationMs,
  );
  if (!normalized.sequence || normalized.sequence.items.length !== itemIds.length) {
    throw new Error(`${id}: failed to normalize visual sequence.`);
  }

  const timeline = visualSequenceToMediaTimeline(normalized.sequence);
  const withTimeline = applyBuiltMediaTimelineToScene(base, {
    items: timeline.items,
  });
  const scene: FootieScene = {
    ...withTimeline,
    visualSequence: normalized.sequence,
  };
  assertSequenceTimelineParity(scene, itemIds, expectedWindows);
  if (scene.visualBeatPlan != null) {
    throw new Error(`${id}: must not seed visualBeatPlan.`);
  }
  return scene;
}

function buildScene1(): FootieScene {
  return buildSceneFromItems({
    id: VISUAL_RETENTION_PRESETS_QA_SCENE_1_ID,
    durationMs: VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS,
    startMs: 0,
    narration: SCENE_1_NARRATION,
    subtitle: "Visual Retention Presets QA · scene 1",
    itemIds: VISUAL_RETENTION_PRESETS_QA_SCENE_1_ITEM_IDS,
    windowDurationMs: VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS,
    mediaItems: [
      qaImageMedia({ width: 1080, height: 1920, fitMode: "cover" }),
      qaImageMedia({ width: 1920, height: 1080, fitMode: "cover" }),
      qaImageMedia({ width: 360, height: 640, fitMode: "contain" }),
    ],
  });
}

function buildScene2(): FootieScene {
  const windowMs = VISUAL_RETENTION_PRESETS_QA_WINDOW_DURATION_MS;
  const keyframes = buildManualCustomKeyframes(windowMs);
  if (keyframes.length < 2) {
    throw new Error("Scene 2 item 1 must seed at least two custom keyframes.");
  }

  const item1 = qaImageMedia({
    width: 1080,
    height: 1920,
    fitMode: "cover",
    motion: {
      version: 1,
      enabled: true,
      presetId: "custom",
      intensity: 1,
      keyframes: keyframes.map((frame) => ({ ...frame })),
    },
  });
  const item2 = qaImageMedia({
    width: 1920,
    height: 1080,
    fitMode: "cover",
    visualAdjustments: {
      version: 1,
      brightness: VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS,
      contrast: 100,
      saturation: 100,
    },
  });

  if (item1.motion?.presetId !== "custom" || !item1.motion.keyframes) {
    throw new Error("Scene 2 item 1 must seed valid manual custom keyframes.");
  }
  if (
    item2.visualAdjustments?.brightness !==
    VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS
  ) {
    throw new Error("Scene 2 item 2 must seed a non-identity freeform adjustment.");
  }
  if (item1.visualEffect != null || item2.visualEffect != null) {
    throw new Error("Scene 2 must not seed media look presets.");
  }

  const scene = buildSceneFromItems({
    id: VISUAL_RETENTION_PRESETS_QA_SCENE_2_ID,
    durationMs: VISUAL_RETENTION_PRESETS_QA_SCENE_2_DURATION_MS,
    startMs: VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS,
    narration: SCENE_2_NARRATION,
    subtitle: "Visual Retention Presets QA · scene 2",
    itemIds: VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_IDS,
    windowDurationMs: windowMs,
    mediaItems: [item1, item2],
  });

  const seq1 = scene.visualSequence!.items[0]!.media;
  const seq2 = scene.visualSequence!.items[1]!.media;
  if (seq1.motion?.presetId !== "custom" || (seq1.motion.keyframes?.length ?? 0) < 2) {
    throw new Error("Scene 2 item 1 keyframes were lost during normalization.");
  }
  if (
    seq2.visualAdjustments?.brightness !==
    VISUAL_RETENTION_PRESETS_QA_SCENE_2_ITEM_2_BRIGHTNESS
  ) {
    throw new Error("Scene 2 item 2 adjustments were lost during normalization.");
  }
  return scene;
}

function buildScene3(): FootieScene {
  return buildSceneFromItems({
    id: VISUAL_RETENTION_PRESETS_QA_SCENE_3_ID,
    durationMs: VISUAL_RETENTION_PRESETS_QA_SCENE_3_DURATION_MS,
    startMs:
      VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS +
      VISUAL_RETENTION_PRESETS_QA_SCENE_2_DURATION_MS,
    narration: SCENE_3_NARRATION,
    subtitle: "Visual Retention Presets QA · scene 3",
    itemIds: [VISUAL_RETENTION_PRESETS_QA_SCENE_3_ITEM_ID],
    windowDurationMs: VISUAL_RETENTION_PRESETS_QA_SCENE_3_DURATION_MS,
    mediaItems: [
      qaImageMedia({ width: 1080, height: 1920, fitMode: "cover" }),
    ],
  });
}

/** Fresh in-memory FootieScript for the local Visual Retention Presets QA harness. */
export function buildVisualRetentionPresetsQaStory(): FootieScript {
  const scene1 = buildScene1();
  const scene2 = buildScene2();
  const scene3 = buildScene3();
  const story = syncFootieScript({
    title: "Visual Retention Presets QA",
    narration: PROJECT_NARRATION,
    totalDuration:
      (VISUAL_RETENTION_PRESETS_QA_SCENE_1_DURATION_MS +
        VISUAL_RETENTION_PRESETS_QA_SCENE_2_DURATION_MS +
        VISUAL_RETENTION_PRESETS_QA_SCENE_3_DURATION_MS) /
      1000,
    scenes: [scene1, scene2, scene3],
    backgroundMusic: {
      enabled: false,
      source: "none",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  });

  if (story.voiceoverUrl != null || story.voiceoverDurationMs != null) {
    throw new Error("Presets QA story must not include voiceover.");
  }
  if (story.backgroundMusic?.enabled) {
    throw new Error("Presets QA story must keep background music disabled.");
  }
  if (story.visualRetentionExtensions != null) {
    throw new Error("Presets QA story must not seed visualRetentionExtensions.");
  }
  if (story.visualRetentionPresetProvenance != null) {
    throw new Error("Presets QA story must not seed preset provenance.");
  }
  for (const scene of story.scenes) {
    if (scene.visualBeatPlan != null) {
      throw new Error(`${scene.id}: must not seed visualBeatPlan.`);
    }
  }
  if (story.scenes.length !== 3) {
    throw new Error("Presets QA story must contain exactly three scenes.");
  }

  return story;
}
