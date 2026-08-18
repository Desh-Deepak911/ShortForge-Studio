/**
 * Shared per-media trim contract samples for verification and certification.
 * Item-local elapsed, not scene-local, drives source time.
 */

export const PER_MEDIA_VIDEO_TRIM_FIXTURE_URL =
  "/api/dev/per-media-video-trim-fixture";

export const PER_MEDIA_VIDEO_TRIM_ITEM_A_ID = "trim-item-a";
export const PER_MEDIA_VIDEO_TRIM_ITEM_B_ID = "trim-item-b";
export const PER_MEDIA_VIDEO_TRIM_SCENE_ID = "trim-scene-two-videos";

export const PER_MEDIA_VIDEO_TRIM_SOURCE_DURATION_MS = 6_000;
export const PER_MEDIA_VIDEO_TRIM_SCENE_DURATION_MS = 8_000;
export const PER_MEDIA_VIDEO_TRIM_ITEM_WINDOW_MS = 4_000;

export const PER_MEDIA_VIDEO_TRIM_A = {
  trimStartMs: 0,
  trimEndMs: 3_000,
} as const;

export const PER_MEDIA_VIDEO_TRIM_B = {
  trimStartMs: 2_000,
  trimEndMs: 5_000,
} as const;

/** One-frame tolerance used by visual certification. */
export const PER_MEDIA_VIDEO_TRIM_FRAME_TOLERANCE_MS = 33;

export const PER_MEDIA_VIDEO_TRIM_SECTIONS = [
  { sourceMs: 0, label: "SOURCE 0", color: "#c41e3a" },
  { sourceMs: 1_000, label: "SOURCE 1", color: "#d97706" },
  { sourceMs: 2_000, label: "SOURCE 2", color: "#1b8a4a" },
  { sourceMs: 3_000, label: "SOURCE 3", color: "#1e4fc4" },
  { sourceMs: 4_000, label: "SOURCE 4", color: "#7c3aed" },
  { sourceMs: 5_000, label: "SOURCE 5", color: "#f8fafc" },
] as const;

export type PerMediaVideoTrimSampleId =
  | "item-a-early"
  | "item-b-local-zero"
  | "item-b-mid"
  | "item-b-hold"
  | "inspect-item-b"
  | "playback-after-inspect";

export interface PerMediaVideoTrimSample {
  readonly id: PerMediaVideoTrimSampleId;
  readonly sceneElapsedMs: number;
  readonly expectedMediaItemId: string;
  readonly expectedItemElapsedMs: number;
  readonly expectedSourceTimeMs: number;
  readonly expectedLabel: string;
  readonly inspectMediaItemId?: string;
  readonly isPlaying?: boolean;
}

/**
 * Frozen-story samples. Item windows are 4000ms each.
 * A: source = 0 + clamp(itemElapsed, 0..3000)
 * B: source = 2000 + clamp(itemElapsed, 0..3000)
 */
export const PER_MEDIA_VIDEO_TRIM_SAMPLES: readonly PerMediaVideoTrimSample[] = [
  {
    id: "item-a-early",
    sceneElapsedMs: 200,
    expectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
    expectedItemElapsedMs: 200,
    expectedSourceTimeMs: 200,
    expectedLabel: "SOURCE 0",
  },
  {
    id: "item-b-local-zero",
    sceneElapsedMs: 4_000,
    expectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    expectedItemElapsedMs: 0,
    expectedSourceTimeMs: 2_000,
    expectedLabel: "SOURCE 2",
  },
  {
    id: "item-b-mid",
    sceneElapsedMs: 5_500,
    expectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    expectedItemElapsedMs: 1_500,
    expectedSourceTimeMs: 3_500,
    expectedLabel: "SOURCE 3",
  },
  {
    id: "item-b-hold",
    sceneElapsedMs: 7_500,
    expectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    expectedItemElapsedMs: 3_500,
    expectedSourceTimeMs: 5_000,
    expectedLabel: "SOURCE 4",
  },
  {
    id: "inspect-item-b",
    sceneElapsedMs: 200,
    expectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    expectedItemElapsedMs: 0,
    expectedSourceTimeMs: 2_000,
    expectedLabel: "SOURCE 2",
    inspectMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  },
  {
    id: "playback-after-inspect",
    sceneElapsedMs: 4_200,
    expectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    expectedItemElapsedMs: 200,
    expectedSourceTimeMs: 2_200,
    expectedLabel: "SOURCE 2",
    isPlaying: true,
  },
];

export function labelForSourceTimeMs(sourceTimeMs: number): string {
  const index = Math.min(
    PER_MEDIA_VIDEO_TRIM_SECTIONS.length - 1,
    Math.max(0, Math.floor(sourceTimeMs / 1_000)),
  );
  return PER_MEDIA_VIDEO_TRIM_SECTIONS[index]!.label;
}
