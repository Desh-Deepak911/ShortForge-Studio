/**
 * Canonical six-scene mixed-media export QA fixture (4.2C-8C).
 */
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  buildAuditTimelineSlots,
  resolveAuditActiveSceneAtTime,
  resolveAuditProjectDurationMs,
  type AuditSceneFixture,
} from "@/features/export/utils/export-pipeline-audit.utils";
import {
  resolveTimelineFrameCount,
  resolveTimelineFrameSampleTimeMs,
} from "@/features/timeline-intelligence/timeline-playback.utils";

export const MIXED_MEDIA_QA_FIXTURE_ID = "mixed-media-qa-6scene";

export interface MixedMediaQaSceneSpec extends AuditSceneFixture {
  fitMode?: "fit" | "fill";
  hasMotion?: boolean;
  caption: string;
}

/** Semantic scene layout matching the failed manual QA project. */
export const MIXED_MEDIA_QA_SCENE_SPECS: MixedMediaQaSceneSpec[] = [
  {
    id: "img-landscape",
    mediaType: "image",
    sceneDurationMs: 3000,
    fitMode: "fill",
    caption: "Opening landscape still",
  },
  {
    id: "img-portrait-fit",
    mediaType: "image",
    sceneDurationMs: 3000,
    fitMode: "fit",
    caption: "Portrait fit framing",
  },
  {
    id: "vid-long-source",
    mediaType: "video",
    sceneDurationMs: 5000,
    sourceDurationMs: 16_000,
    caption: "First video clip five seconds",
  },
  {
    id: "img-motion",
    mediaType: "image",
    sceneDurationMs: 3000,
    fitMode: "fill",
    hasMotion: true,
    caption: "Motion after the first video",
  },
  {
    id: "vid-second",
    mediaType: "video",
    sceneDurationMs: 4000,
    sourceDurationMs: 12_000,
    caption: "Second independent video",
  },
  {
    id: "img-final-fit",
    mediaType: "image",
    sceneDurationMs: 3000,
    fitMode: "fit",
    caption: "Final fit image and closing caption",
  },
];

/** Content end without MasterTimeline end buffer. */
export const MIXED_MEDIA_QA_CONTENT_DURATION_MS = 21_000;

export function buildMixedMediaQaAuditSlots() {
  return buildAuditTimelineSlots(MIXED_MEDIA_QA_SCENE_SPECS);
}

export function resolveMixedMediaQaProjectDurationMs(): number {
  return resolveAuditProjectDurationMs(MIXED_MEDIA_QA_SCENE_SPECS);
}

function buildImageMedia(spec: MixedMediaQaSceneSpec): SceneMedia {
  return {
    type: "image",
    url: `https://example.com/${spec.id}.jpg`,
    source: "upload",
    fitMode: spec.fitMode === "fit" ? "contain" : "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...(spec.hasMotion
      ? {
          motion: {
            version: 1 as const,
            enabled: true,
            presetId: "slow-zoom-in",
            intensity: 1,
            easing: "ease-in-out" as const,
          },
        }
      : {}),
  };
}

function buildVideoMedia(spec: MixedMediaQaSceneSpec): SceneMedia {
  return {
    type: "video",
    url: `blob:${spec.id}`,
    source: "upload",
    durationMs: spec.sourceDurationMs ?? spec.sceneDurationMs,
    muted: true,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

/** Builds FootieScene[] for timeline/export semantic tests (no real binary assets). */
export function buildMixedMediaQaScenes(): FootieScene[] {
  let cursor = 0;
  return MIXED_MEDIA_QA_SCENE_SPECS.map((spec) => {
    const durationMs = spec.sceneDurationMs;
    const startMs = cursor;
    const endMs = cursor + durationMs;
    cursor = endMs;
    const media =
      spec.mediaType === "video" ? buildVideoMedia(spec) : buildImageMedia(spec);

    return {
      id: spec.id,
      start: startMs / 1000,
      end: endMs / 1000,
      duration: durationMs / 1000,
      startMs,
      endMs,
      durationMs,
      captionMode: "subtitles",
      subtitle: spec.caption,
      subtitleText: spec.caption,
      subtitleChunks: [spec.caption],
      narration: spec.caption,
      media,
      image:
        spec.mediaType === "image"
          ? {
              url: media.url!,
              scale: 1,
              x: 0,
              y: 0,
              rotation: 0,
              fitMode: spec.fitMode ?? "fill",
            }
          : undefined,
    };
  });
}

/** Minimal FootieScript wrapper for the fixture. */
export function buildMixedMediaQaScript(
  overrides: Partial<FootieScript> = {},
): FootieScript {
  const scenes = buildMixedMediaQaScenes();
  const totalSec = resolveMixedMediaQaProjectDurationMs() / 1000;
  return {
    title: "Mixed Media QA Fixture",
    narration: MIXED_MEDIA_QA_SCENE_SPECS.map((s) => s.caption).join(". "),
    scenes,
    totalDuration: totalSec,
    voiceoverUrl: "blob:voiceover-mixed-qa",
    voiceoverDurationMs: resolveMixedMediaQaProjectDurationMs(),
    ...overrides,
  };
}

export interface MixedMediaFrameWalkSample {
  frameIndex: number;
  exportTimestampMs: number;
  sceneId: string;
  mediaType: "image" | "video";
  sceneElapsedMs: number;
  isFirstFrameOfScene: boolean;
  isLastFrameOfScene: boolean;
}

/** Walks every semantic frame for the fixture at a given FPS. */
export function walkMixedMediaQaFrames(fps: number): MixedMediaFrameWalkSample[] {
  const slots = buildMixedMediaQaAuditSlots();
  const projectMs = resolveMixedMediaQaProjectDurationMs();
  const totalFrames = resolveTimelineFrameCount(projectMs, fps);
  const samples: MixedMediaFrameWalkSample[] = [];

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const exportTimestampMs = resolveTimelineFrameSampleTimeMs(frameIndex, fps);
    const active = resolveAuditActiveSceneAtTime(slots, exportTimestampMs)!;
    const prev = samples[samples.length - 1];
    samples.push({
      frameIndex,
      exportTimestampMs,
      sceneId: active.scene.id,
      mediaType: active.scene.mediaType,
      sceneElapsedMs: active.sceneElapsedMs,
      isFirstFrameOfScene: !prev || prev.sceneId !== active.scene.id,
      isLastFrameOfScene: false,
    });
  }

  for (let i = 0; i < samples.length; i++) {
    const next = samples[i + 1];
    samples[i]!.isLastFrameOfScene = !next || next.sceneId !== samples[i]!.sceneId;
  }

  return samples;
}

export function collectMixedMediaQaScenePresence(fps: number): {
  sceneIds: string[];
  firstFrameByScene: Record<string, number>;
  lastFrameByScene: Record<string, number>;
  finalSceneId: string;
  totalFrames: number;
  expectedDurationSec: number;
} {
  const walk = walkMixedMediaQaFrames(fps);
  const firstFrameByScene: Record<string, number> = {};
  const lastFrameByScene: Record<string, number> = {};
  for (const sample of walk) {
    if (!(sample.sceneId in firstFrameByScene)) {
      firstFrameByScene[sample.sceneId] = sample.frameIndex;
    }
    lastFrameByScene[sample.sceneId] = sample.frameIndex;
  }
  return {
    sceneIds: MIXED_MEDIA_QA_SCENE_SPECS.map((s) => s.id),
    firstFrameByScene,
    lastFrameByScene,
    finalSceneId: walk[walk.length - 1]?.sceneId ?? "",
    totalFrames: walk.length,
    expectedDurationSec: walk.length / fps,
  };
}
