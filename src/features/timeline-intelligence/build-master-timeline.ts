import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import { getStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import {
  normalizeCaptionMode,
  normalizeSubtitleEffect,
} from "@/features/story/utils/caption.utils";
import {
  getSceneTimingMap,
  getStoryTotalDuration,
} from "@/features/story/utils/scene.utils";
import {
  getSubtitleChunkDurationMs,
  getSubtitleDisplayChunks,
  SUBTITLE_ESTIMATED_CHARS_PER_LINE,
  SUBTITLE_MAX_VISIBLE_LINES,
} from "@/features/story/utils/subtitle.utils";
import {
  attachEvenVoiceoverTiming,
  attachVoiceoverTimingMs,
  recalculateSceneTimings,
} from "@/features/story/utils/timeline.utils";
import { getStoryVoiceSettings } from "@/features/story/utils/voice-settings.utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { resolveVoiceoverSpeed } from "@/lib/voiceoverOptions";
import { syncFootieScript } from "@/lib/voiceover";
import { estimateTypewriterRevealDurationMs } from "@/features/story/utils/subtitle-effect.utils";

import { authoritiesMayDiverge, resolveTimelineAuthority } from "./timeline-authority";
import { buildCaptionAnimationTrack } from "./build-caption-animation-track";
import { buildImageMotionTrackFromScenes } from "./build-image-motion-track";
import { buildTransitionTrackFromScenes } from "./build-transition-track";
import {
  computeTimelineDurationMs,
  createTimelineTrack,
  getTimelineContentEndMs,
  getTrackUnionDurationMs,
  normalizeTimelineEvent,
  validateMasterTimeline,
} from "./timeline-utils";
import type {
  AudioTimelineEvent,
  MasterTimeline,
  MasterTimelineBuildMode,
  MasterTimelineDiagnostics,
  SceneTimelineEvent,
  SubtitleTimelineEvent,
  TimelineEvent,
  TimelineEventSource,
  TimelineTrack,
} from "./timeline.types";
import { TIMELINE_INTELLIGENCE_SCHEMA_VERSION } from "./timeline.types";

/** Padding after the latest timed content — keeps subtitles and audio tails visible. */
export const TIMELINE_END_BUFFER_MS = 400;

/** Readable hold after the final subtitle completes (300–500ms target). */
export const TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS = 400;

/** Matches export preflight tolerance when comparing scene sum to voiceover. */
export const TIMELINE_VOICEOVER_SYNC_TOLERANCE_MS = 50;

export interface BuildMasterTimelineOptions {
  mode: MasterTimelineBuildMode;
  /** When true (or mode is export with voiceover), scenes are refitted to voiceover length. */
  useVoiceoverRefit?: boolean;
  endBufferMs?: number;
}

interface ResolvedVoiceover {
  url?: string;
  durationMs: number;
  hasValidVoiceover: boolean;
}

function resolveVoiceover(script: FootieScript): ResolvedVoiceover {
  const canonical = getCanonicalVoiceover(script);
  const url = canonical?.url;
  const durationMs =
    canonical?.durationMs != null && canonical.durationMs > 0
      ? Math.round(canonical.durationMs)
      : 0;

  return {
    url,
    durationMs,
    hasValidVoiceover: Boolean(url && durationMs > 0),
  };
}

function resolveExportSceneDurationWeightMs(scene: FootieScene): number | null {
  if (scene.durationMs != null && scene.durationMs > 0) {
    return scene.durationMs;
  }

  if (scene.duration != null && scene.duration > 0) {
    return Math.round(scene.duration * 1000);
  }

  return null;
}

/** Mirrors export preflight refit without mutating the input story. */
function refitScenesForTimelineBuild(
  scenes: FootieScene[],
  voiceoverDurationMs: number,
): FootieScene[] {
  if (scenes.length === 0) {
    return scenes;
  }

  const weights = scenes.map(resolveExportSceneDurationWeightMs);
  const hasInvalidDuration = weights.some((weight) => weight == null);

  const timedScenes = hasInvalidDuration
    ? attachEvenVoiceoverTiming(scenes, voiceoverDurationMs)
    : attachVoiceoverTimingMs(scenes, voiceoverDurationMs, weights as number[]);

  return recalculateSceneTimings(timedScenes);
}

function resolveSceneTimelineDurationMs(scenes: FootieScene[]): number {
  return Math.max(0, Math.round(getStoryTotalDuration(scenes) * 1000));
}

function shouldApplyVoiceoverRefit(
  options: BuildMasterTimelineOptions,
  voiceover: ResolvedVoiceover,
): boolean {
  if (!voiceover.hasValidVoiceover) {
    return false;
  }

  if (options.mode === "export") {
    return true;
  }

  return options.useVoiceoverRefit === true;
}

function sceneEventSource(refitApplied: boolean): TimelineEventSource {
  return refitApplied ? "export-refit-timing" : "editor-scene-timing";
}

function buildSceneEvents(
  scenes: FootieScene[],
  source: TimelineEventSource,
): SceneTimelineEvent[] {
  return getSceneTimingMap(scenes).map((slot) =>
    normalizeTimelineEvent({
      id: `scene-${slot.sceneId}`,
      type: "scene",
      startMs: slot.startMs,
      endMs: slot.endMs,
      durationMs: slot.durationMs,
      source,
      metadata: {
        sceneId: slot.sceneId,
        sceneIndex: slot.index,
        sceneType: scenes[slot.index]?.sceneType,
        durationSource: scenes[slot.index]?.durationSource,
      },
    }),
  );
}

function resolveSceneChunks(scene: FootieScene): string[] {
  const persisted = (scene as FootieScene & { subtitleChunks?: string[] }).subtitleChunks;
  if (persisted && persisted.length > 0) {
    return persisted;
  }

  return getSubtitleDisplayChunks(scene);
}

function buildSubtitleEvents(
  scenes: FootieScene[],
  sceneEvents: SceneTimelineEvent[],
): {
  subtitleEvents: SubtitleTimelineEvent[];
  lineCapOverflowRisk: boolean;
  subtitleExtendsBeyondScene: boolean;
} {
  const subtitleEvents: SubtitleTimelineEvent[] = [];
  let lineCapOverflowRisk = false;
  let subtitleExtendsBeyondScene = false;

  const sceneById = new Map(sceneEvents.map((event) => [event.metadata.sceneId, event]));

  for (const [index, scene] of scenes.entries()) {
    if (normalizeCaptionMode(scene.captionMode) !== "subtitles") {
      continue;
    }

    const sceneEvent = sceneById.get(scene.id);
    if (!sceneEvent) {
      continue;
    }

    const chunks = resolveSceneChunks(scene);
    if (chunks.length === 0) {
      continue;
    }

    const chunkCount = chunks.length;
    const chunkDurationMs = getSubtitleChunkDurationMs(sceneEvent.durationMs, chunkCount);

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const chunkStartMs = sceneEvent.startMs + chunkIndex * chunkDurationMs;
      const chunkEndMs =
        chunkIndex === chunkCount - 1
          ? sceneEvent.endMs
          : sceneEvent.startMs + (chunkIndex + 1) * chunkDurationMs;
      const text = chunks[chunkIndex] ?? "";

      if (text.trim()) {
        const estimatedLines = Math.max(
          1,
          Math.ceil(text.trim().length / SUBTITLE_ESTIMATED_CHARS_PER_LINE),
        );
        if (estimatedLines > SUBTITLE_MAX_VISIBLE_LINES) {
          lineCapOverflowRisk = true;
        }
      }

      if (chunkEndMs > sceneEvent.endMs) {
        subtitleExtendsBeyondScene = true;
      }

      const subtitleId = `subtitle-${scene.id}-${chunkIndex}`;

      subtitleEvents.push(
        normalizeTimelineEvent({
          id: subtitleId,
          type: "subtitle",
          startMs: chunkStartMs,
          endMs: chunkEndMs,
          durationMs: computeTimelineDurationMs(chunkStartMs, chunkEndMs),
          source: "derived-subtitle",
          metadata: {
            sceneId: scene.id,
            sceneIndex: index,
            chunkIndex,
            chunkCount,
            text,
            captionMode: "subtitles",
          },
        }),
      );
    }
  }

  return {
    subtitleEvents,
    lineCapOverflowRisk,
    subtitleExtendsBeyondScene,
  };
}

/** Extends the final subtitle window so typewriter copy can fully reveal. */
function extendFinalSubtitleForCompletion(
  subtitleEvents: SubtitleTimelineEvent[],
  scenes: FootieScene[],
  sceneEvents: SceneTimelineEvent[],
): boolean {
  if (subtitleEvents.length === 0) {
    return false;
  }

  const lastIndex = subtitleEvents.length - 1;
  const lastSubtitle = subtitleEvents[lastIndex]!;
  const scene = scenes.find((entry) => entry.id === lastSubtitle.metadata.sceneId);
  const effect = normalizeSubtitleEffect(scene?.subtitleEffect);
  const sceneEvent = sceneEvents.find(
    (entry) => entry.metadata.sceneId === lastSubtitle.metadata.sceneId,
  );

  let requiredEndMs = lastSubtitle.endMs;

  if (effect === "typewriter") {
    const text = lastSubtitle.metadata.text.trim();
    if (text) {
      requiredEndMs = Math.max(
        requiredEndMs,
        lastSubtitle.startMs + estimateTypewriterRevealDurationMs(text),
      );
    }
  }

  if (requiredEndMs > lastSubtitle.endMs) {
    lastSubtitle.endMs = requiredEndMs;
    lastSubtitle.durationMs = computeTimelineDurationMs(lastSubtitle.startMs, requiredEndMs);
  }

  return Boolean(sceneEvent && requiredEndMs > sceneEvent.endMs);
}

function buildAudioEvents(
  script: FootieScript,
  voiceover: ResolvedVoiceover,
  contentEndMs: number,
): AudioTimelineEvent[] {
  const events: AudioTimelineEvent[] = [];
  const voiceSettings = getStoryVoiceSettings(script);
  const playbackRate = resolveVoiceoverSpeed(voiceSettings.speed);
  const backgroundMusic = getStoryBackgroundMusic(script);

  if (voiceover.hasValidVoiceover) {
    events.push(
      normalizeTimelineEvent({
        id: "audio-voiceover",
        type: "audio",
        startMs: 0,
        endMs: voiceover.durationMs,
        durationMs: voiceover.durationMs,
        source: "derived-audio",
        metadata: {
          trackId: "voiceover",
          url: voiceover.url,
          playbackRate,
          volume: 1,
        },
      }),
    );
  }

  if (backgroundMusic.enabled && backgroundMusic.fileUrl) {
    events.push(
      normalizeTimelineEvent({
        id: "audio-background-music",
        type: "audio",
        startMs: 0,
        endMs: Math.max(contentEndMs, voiceover.durationMs),
        durationMs: Math.max(contentEndMs, voiceover.durationMs),
        source: "derived-audio",
        metadata: {
          trackId: "background-music",
          url: backgroundMusic.fileUrl,
          loop: true,
          volume: backgroundMusic.volume,
        },
      }),
    );
  }

  return events;
}

function detectTrackOverlaps(events: TimelineEvent[]): boolean {
  if (events.length < 2) {
    return false;
  }

  const sorted = [...events].sort((left, right) => left.startMs - right.startMs);
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.startMs < previous.endMs) {
      return true;
    }
  }

  return false;
}

function detectNegativeOrOverlappingEvents(tracks: TimelineTrack[]): boolean {
  for (const track of tracks) {
    for (const event of track.events) {
      if (event.startMs < 0 || event.endMs < event.startMs) {
        return true;
      }
    }

    if (detectTrackOverlaps(track.events)) {
      return true;
    }
  }

  return false;
}

function collectMissingTimings(
  script: FootieScript,
  scenes: FootieScene[],
  voiceover: ResolvedVoiceover,
): string[] {
  const missing: string[] = [];

  if (scenes.length === 0) {
    missing.push("story has no scenes");
  }

  for (const [index, scene] of scenes.entries()) {
    const hasMsTiming = scene.durationMs != null && scene.durationMs > 0;
    const hasSecTiming = scene.duration != null && scene.duration > 0;
    if (!hasMsTiming && !hasSecTiming) {
      missing.push(`scene ${index + 1} (${scene.id}) is missing duration`);
    }
  }

  if (voiceover.url && !voiceover.hasValidVoiceover) {
    missing.push("voiceover is present but duration metadata is missing");
  }

  if (script.totalDuration <= 0 && scenes.length > 0 && resolveSceneTimelineDurationMs(scenes) <= 0) {
    missing.push("story total duration is zero");
  }

  return missing;
}

function buildTimelineWarnings(input: {
  voiceover: ResolvedVoiceover;
  refitApplied: boolean;
  mode: MasterTimelineBuildMode;
  previewExportTimingMismatchRisk: boolean;
  audioShorterThanSubtitleTimeline: boolean;
  subtitleExtendsBeyondScene: boolean;
  sceneExtendsBeyondAudio: boolean;
  missingTimings: string[];
  negativeOrOverlappingEvents: boolean;
  lineCapOverflowRisk: boolean;
  captionTooShortForAnimationCount: number;
  captionAnimationScheduleWarnings: string[];
  transitionOverlapCollisionCount: number;
  transitionSceneVisibilityViolationCount: number;
  transitionOutOfBoundsCount: number;
  transitionScheduleWarnings: string[];
  finalSubtitleEndMs: number;
  renderEndBeforeBufferMs: number;
  editorSceneDurationMs: number;
  sceneTimingDeltaMs: number;
}): string[] {
  const warnings: string[] = [];

  if (input.missingTimings.length > 0) {
    warnings.push(`Missing timings: ${input.missingTimings.join("; ")}.`);
  }

  if (input.refitApplied) {
    warnings.push(
      `Voiceover refit applied (${input.mode} build) — scene windows scaled to ${input.voiceover.durationMs}ms.`,
    );
  }

  if (input.previewExportTimingMismatchRisk) {
    warnings.push(
      "Preview/export timing mismatch risk: editor scene total differs from voiceover refit total.",
    );
  }

  if (input.audioShorterThanSubtitleTimeline) {
    warnings.push("Audio is shorter than the subtitle timeline span.");
  }

  if (input.subtitleExtendsBeyondScene) {
    warnings.push("At least one subtitle chunk extends beyond its parent scene window.");
  }

  if (input.sceneExtendsBeyondAudio) {
    warnings.push("Scene timeline extends beyond voiceover audio duration.");
  }

  if (input.lineCapOverflowRisk) {
    warnings.push("Line-cap overflow risk: subtitle chunks may exceed visible line limits.");
  }

  if (input.captionTooShortForAnimationCount > 0) {
    warnings.push(
      `${input.captionTooShortForAnimationCount} subtitle window(s) too short for scheduled caption animation.`,
    );
  }

  for (const scheduleWarning of input.captionAnimationScheduleWarnings) {
    warnings.push(scheduleWarning);
  }

  if (input.transitionOverlapCollisionCount > 0) {
    warnings.push(
      `${input.transitionOverlapCollisionCount} transition overlap/collision(s) detected on the transition lane.`,
    );
  }

  if (input.transitionSceneVisibilityViolationCount > 0) {
    warnings.push(
      `${input.transitionSceneVisibilityViolationCount} transition window(s) would reduce outgoing scene visibility.`,
    );
  }

  if (input.transitionOutOfBoundsCount > 0) {
    warnings.push(
      `${input.transitionOutOfBoundsCount} transition window(s) extend outside the outgoing scene boundary.`,
    );
  }

  for (const scheduleWarning of input.transitionScheduleWarnings) {
    warnings.push(scheduleWarning);
  }

  if (input.negativeOrOverlappingEvents) {
    warnings.push("Timeline contains negative durations or overlapping events on a track.");
  }

  if (input.finalSubtitleEndMs > 0) {
    const gapMs = input.renderEndBeforeBufferMs - input.finalSubtitleEndMs;
    if (gapMs < 0) {
      warnings.push(
        `Final subtitle end (${input.finalSubtitleEndMs}ms) exceeds render end before buffer (${input.renderEndBeforeBufferMs}ms).`,
      );
    } else if (gapMs > TIMELINE_END_BUFFER_MS + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS + 100) {
      warnings.push(
        `Final subtitle ends ${gapMs}ms before render end — large tail gap may hide closing captions early.`,
      );
    }
  }

  if (
    input.voiceover.hasValidVoiceover &&
    input.sceneTimingDeltaMs > TIMELINE_VOICEOVER_SYNC_TOLERANCE_MS &&
    !input.refitApplied
  ) {
    warnings.push(
      `Scene timeline (${input.editorSceneDurationMs}ms) differs from voiceover (${input.voiceover.durationMs}ms) by ${input.sceneTimingDeltaMs}ms.`,
    );
  }

  return warnings;
}

/** Builds the canonical master timeline from a story without mutating it. */
export function buildMasterTimeline(
  script: FootieScript,
  options: BuildMasterTimelineOptions,
): MasterTimeline {
  const endBufferMs = options.endBufferMs ?? TIMELINE_END_BUFFER_MS;
  const synced = syncFootieScript(script);
  const voiceover = resolveVoiceover(synced);
  const refitApplied = shouldApplyVoiceoverRefit(options, voiceover);

  const editorScenes = recalculateSceneTimings(synced.scenes);
  const editorSceneDurationMs = resolveSceneTimelineDurationMs(editorScenes);

  const activeScenes = refitApplied
    ? refitScenesForTimelineBuild(synced.scenes, voiceover.durationMs)
    : editorScenes;

  const refitSceneDurationMs = voiceover.hasValidVoiceover
    ? voiceover.durationMs
    : editorSceneDurationMs;
  const sceneTimingDeltaMs = voiceover.hasValidVoiceover
    ? Math.abs(editorSceneDurationMs - voiceover.durationMs)
    : 0;

  const authority = resolveTimelineAuthority({
    requestedAuthority: refitApplied ? "export-refit-timing" : "editor-scene-timing",
    hasVoiceover: voiceover.hasValidVoiceover,
    preferExportRefit: refitApplied,
  }).mode;

  const sceneSource = sceneEventSource(refitApplied);
  const sceneEvents = buildSceneEvents(activeScenes, sceneSource);
  const { subtitleEvents, lineCapOverflowRisk, subtitleExtendsBeyondScene } = buildSubtitleEvents(
    activeScenes,
    sceneEvents,
  );

  const finalSubtitleExtendsBeyondScene =
    extendFinalSubtitleForCompletion(subtitleEvents, activeScenes, sceneEvents) ||
    subtitleExtendsBeyondScene;

  const captionAnimationBuild = buildCaptionAnimationTrack(
    { tracks: [createTimelineTrack("subtitle", subtitleEvents)] },
    activeScenes,
  );
  const animationEvents = captionAnimationBuild.events;
  const imageMotionBuild = buildImageMotionTrackFromScenes({
    scenes: activeScenes,
    sceneEvents,
  });
  const imageMotionEvents = imageMotionBuild.events;
  const transitionBuild = buildTransitionTrackFromScenes({
    scenes: activeScenes,
    sceneEvents,
    timelineItems: synced.timelineItems,
  });
  const transitionEvents = transitionBuild.events;

  const preliminaryTracks: TimelineTrack[] = [
    createTimelineTrack("scene", sceneEvents),
    createTimelineTrack("subtitle", subtitleEvents),
    createTimelineTrack("caption-animation", animationEvents),
    createTimelineTrack("image-motion", imageMotionEvents),
    createTimelineTrack("transition", transitionEvents),
    createTimelineTrack("audio", []),
  ];

  const sceneDurationMs = getTrackUnionDurationMs(preliminaryTracks, "scene");
  const subtitleDurationMs = getTrackUnionDurationMs(preliminaryTracks, "subtitle");
  const animationDurationMs = getTrackUnionDurationMs(preliminaryTracks, "caption-animation");
  const transitionDurationMs = getTrackUnionDurationMs(preliminaryTracks, "transition");

  const narrationDurationMs = voiceover.hasValidVoiceover ? voiceover.durationMs : 0;

  const contentEndMs = getTimelineContentEndMs({ tracks: preliminaryTracks });
  const audioEvents = buildAudioEvents(synced, voiceover, contentEndMs);
  const audioDurationMs = audioEvents.reduce(
    (maxEndMs, event) => Math.max(maxEndMs, event.endMs),
    0,
  );

  const tracks: TimelineTrack[] = [
    createTimelineTrack("scene", sceneEvents),
    createTimelineTrack("subtitle", subtitleEvents),
    createTimelineTrack("caption-animation", animationEvents),
    createTimelineTrack("image-motion", imageMotionEvents),
    createTimelineTrack("transition", transitionEvents),
    createTimelineTrack("audio", audioEvents),
  ];

  const finalSubtitleEndMs = subtitleEvents.reduce(
    (maxEndMs, event) => Math.max(maxEndMs, event.endMs),
    0,
  );

  const subtitleCompletionEndMs =
    finalSubtitleEndMs > 0
      ? finalSubtitleEndMs + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS
      : 0;

  const renderEndBeforeBufferMs = Math.max(
    audioDurationMs,
    narrationDurationMs,
    sceneDurationMs,
    subtitleDurationMs,
    animationDurationMs,
    transitionDurationMs,
    contentEndMs,
    subtitleCompletionEndMs,
  );
  const renderDurationMs = renderEndBeforeBufferMs + endBufferMs;

  const audioShorterThanSubtitleTimeline =
    narrationDurationMs > 0 && narrationDurationMs < subtitleDurationMs;
  const sceneExtendsBeyondAudio =
    narrationDurationMs > 0 && sceneDurationMs > narrationDurationMs;
  const previewExportTimingMismatchRisk =
    voiceover.hasValidVoiceover &&
    authoritiesMayDiverge({
      editorSceneDurationMs,
      voiceoverDurationMs: voiceover.durationMs,
      toleranceMs: TIMELINE_VOICEOVER_SYNC_TOLERANCE_MS,
    }) &&
    ((options.mode === "preview" && !refitApplied) ||
      (options.mode === "export" && refitApplied));

  const missingTimings = collectMissingTimings(synced, activeScenes, voiceover);
  const hasStructuralIssues = detectNegativeOrOverlappingEvents(tracks);
  const validation = validateMasterTimeline({
    id: "pending",
    authority,
    renderDurationMs,
    audioDurationMs,
    narrationDurationMs,
    sceneDurationMs,
    subtitleDurationMs,
    animationDurationMs,
    transitionDurationMs,
    tracks,
    warnings: [],
    diagnostics: {
      schemaVersion: TIMELINE_INTELLIGENCE_SCHEMA_VERSION,
      authority,
      builtAtIso: new Date().toISOString(),
      sceneCount: activeScenes.length,
      eventCount: 0,
    },
  });

  const negativeOrOverlappingEvents = hasStructuralIssues || !validation.valid;

  const builtAtIso = new Date().toISOString();
  const eventCount = tracks.reduce((count, track) => count + track.events.length, 0);
  const finalSubtitleEndGapMs = renderEndBeforeBufferMs - finalSubtitleEndMs;

  const diagnostics: MasterTimelineDiagnostics = {
    schemaVersion: TIMELINE_INTELLIGENCE_SCHEMA_VERSION,
    authority,
    builtAtIso,
    sceneCount: activeScenes.length,
    eventCount,
    editorSceneDurationMs,
    refitSceneDurationMs: voiceover.hasValidVoiceover ? refitSceneDurationMs : undefined,
    voiceoverDurationMs: voiceover.hasValidVoiceover ? voiceover.durationMs : undefined,
    sceneTimingDeltaMs: voiceover.hasValidVoiceover ? sceneTimingDeltaMs : undefined,
    buildMode: options.mode,
    endBufferMs,
    exportRefitApplied: refitApplied,
    previewExportTimingMismatchRisk,
    audioShorterThanSubtitleTimeline,
    subtitleExtendsBeyondScene: finalSubtitleExtendsBeyondScene,
    sceneExtendsBeyondAudio,
    missingTimings,
    negativeOrOverlappingEvents: negativeOrOverlappingEvents,
    lineCapOverflowRisk,
    captionTooShortForAnimationCount: captionAnimationBuild.diagnostics.captionTooShortCount,
    transitionsScheduled: transitionBuild.diagnostics.eventsScheduled,
    transitionOverlapCollisionCount: transitionBuild.diagnostics.overlapCollisionCount,
    transitionSceneVisibilityViolationCount:
      transitionBuild.diagnostics.sceneVisibilityViolationCount,
    transitionOutOfBoundsCount: transitionBuild.diagnostics.outOfBoundsCount,
    finalSubtitleEndMs,
    contentEndMs,
    renderEndBeforeBufferMs,
    finalSubtitleEndGapMs,
  };

  const warnings = buildTimelineWarnings({
    voiceover,
    refitApplied,
    mode: options.mode,
    previewExportTimingMismatchRisk,
    audioShorterThanSubtitleTimeline,
    subtitleExtendsBeyondScene: finalSubtitleExtendsBeyondScene,
    sceneExtendsBeyondAudio,
    missingTimings,
    negativeOrOverlappingEvents: diagnostics.negativeOrOverlappingEvents ?? false,
    lineCapOverflowRisk,
    captionTooShortForAnimationCount: captionAnimationBuild.diagnostics.captionTooShortCount,
    captionAnimationScheduleWarnings: captionAnimationBuild.warnings,
    transitionOverlapCollisionCount: transitionBuild.diagnostics.overlapCollisionCount,
    transitionSceneVisibilityViolationCount:
      transitionBuild.diagnostics.sceneVisibilityViolationCount,
    transitionOutOfBoundsCount: transitionBuild.diagnostics.outOfBoundsCount,
    transitionScheduleWarnings: transitionBuild.warnings,
    finalSubtitleEndMs,
    renderEndBeforeBufferMs,
    editorSceneDurationMs,
    sceneTimingDeltaMs,
  });

  return {
    id: `timeline-${options.mode}-${authority}-${builtAtIso}`,
    authority,
    renderDurationMs,
    audioDurationMs,
    narrationDurationMs,
    sceneDurationMs,
    subtitleDurationMs,
    animationDurationMs,
    transitionDurationMs,
    tracks,
    warnings,
    diagnostics,
  };
}
