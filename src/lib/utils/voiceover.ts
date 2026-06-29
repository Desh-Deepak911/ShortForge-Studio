import { revokeBlobUrl } from "./blobUrl";
import {
  coerceLegacyStoryFields,
  resolveStoryDurationSec,
  resolveVoiceoverDurationMs,
} from "@/features/story/utils";
import {
  finalizeSubtitleTextAfterModeSwitch,
  mergeSubtitleTextOnSubtitlesModeSwitch,
  scenesNeedNarrationExcerptSync,
  syncScenesSubtitlesNarration,
} from "@/features/story/utils";
import {
  resetSceneImageSettings,
  updateSceneImageSettings,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import {
  ensureTimelineItems,
  mergeManualDurationUpdates,
  normalizeSceneIds,
  recalculateSceneTimings,
  refitScenesToVoiceoverDuration,
  scenesStructurallyEqual,
  syncTimelineItemsWithScenes,
  syncTimelineSceneRefs,
  updateSceneInScenes,
  updateTransitionInTimeline,
  type SceneTimelineUpdates,
  type TransitionTimelineUpdates,
} from "@/features/story/utils";
import { getStoryTotalDuration } from "@/features/story/utils";
import type { FootieScene, FootieScript, SceneImage, StoryVoiceSettings } from "@/features/story/types";
import {
  resolveVoiceoverSpeed,
  resolveVoiceoverVoice,
} from "./voiceoverOptions";
import { normalizeStoryVoiceSettings } from "@/features/story/utils";

export interface VoiceoverAttachment {
  voiceoverUrl: string;
  voiceoverDurationMs?: number;
  voiceSettings?: Partial<StoryVoiceSettings>;
}

/** Creates an object URL from a base64-encoded audio payload. */
export function createAudioBlobUrl(
  audioBase64: string,
  mimeType = "audio/mpeg",
): string {
  const binary = atob(audioBase64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/** Creates an object URL from a base64-encoded MP3 payload. */
export function createVoiceoverBlobUrl(audioBase64: string): string {
  return createAudioBlobUrl(audioBase64, "audio/mpeg");
}

/** Resolves narration duration from an audio blob, with word-count fallback. */
export async function resolveVoiceoverDurationFromBlob(
  blob: Blob,
  narration: string,
): Promise<number> {
  const buffer = await blob.arrayBuffer();
  return resolveVoiceoverDurationMs(buffer, narration).durationMs;
}

/** Returns the best available voiceover duration for preview/export (seconds). */
export function getStoryVoiceoverDurationSec(script: FootieScript | null | undefined): number {
  return resolveStoryDurationSec(script);
}

function mergeVoiceSettings(
  script: FootieScript,
  patch?: Partial<StoryVoiceSettings>,
): StoryVoiceSettings {
  const current = normalizeStoryVoiceSettings(script);
  if (!patch) {
    return current;
  }

  return normalizeStoryVoiceSettings({
    voiceSettings: {
      ...current,
      ...patch,
      ...(patch.speed != null ? { speed: resolveVoiceoverSpeed(patch.speed) } : {}),
      ...(patch.voice != null ? { voice: resolveVoiceoverVoice(patch.voice) } : {}),
    },
  });
}

function resolveVoiceoverNarrationSnapshot(script: FootieScript): string {
  return script.narration.trim();
}

function buildVoiceoverAttachmentFields(
  script: FootieScript,
  attachment: VoiceoverAttachment,
): Pick<FootieScript, "voiceoverUrl" | "voiceoverDurationMs" | "voiceoverNarration" | "voiceSettings"> {
  const voiceSettings = mergeVoiceSettings(script, attachment.voiceSettings);

  return {
    voiceoverUrl: attachment.voiceoverUrl,
    voiceoverNarration: resolveVoiceoverNarrationSnapshot(script),
    ...(attachment.voiceoverDurationMs != null && attachment.voiceoverDurationMs > 0
      ? { voiceoverDurationMs: Math.round(attachment.voiceoverDurationMs) }
      : {}),
    voiceSettings,
  };
}

/** Updates story-level voice settings without regenerating narration or scenes. */
export function applyStoryVoiceSettings(
  script: FootieScript,
  patch: Partial<StoryVoiceSettings>,
): FootieScript {
  return syncFootieScript(
    {
      ...script,
      voiceSettings: mergeVoiceSettings(script, patch),
    },
    script,
  );
}

/** Attaches generated narration audio metadata to a synced story. */
export function attachVoiceoverToScript(
  script: FootieScript,
  attachment: VoiceoverAttachment,
): FootieScript {
  return syncFootieScript(
    {
      ...script,
      ...buildVoiceoverAttachmentFields(script, attachment),
    },
    script,
  );
}

/**
 * Regenerates voiceover audio and metadata without refitting scenes, transitions,
 * captions, or images. Preview and export read the updated canonical voiceover URL.
 */
export function applyVoiceoverRegeneration(
  script: FootieScript,
  attachment: VoiceoverAttachment,
): FootieScript {
  return syncFootieScript(
    {
      ...script,
      ...buildVoiceoverAttachmentFields(script, attachment),
    },
    script,
  );
}

/**
 * Apply Changes flow: replaces voiceover audio and duration, then refits scene
 * timings proportionally. Preserves scene content, captions, media, and transitions.
 */
export function applyVoiceoverChanges(
  script: FootieScript,
  attachment: VoiceoverAttachment,
): FootieScript {
  if (script.voiceoverUrl && script.voiceoverUrl !== attachment.voiceoverUrl) {
    revokeBlobUrl(script.voiceoverUrl);
  }

  const voiceSettings = mergeVoiceSettings(script, attachment.voiceSettings);
  const voiceoverDurationMs = attachment.voiceoverDurationMs;

  if (!voiceoverDurationMs || voiceoverDurationMs <= 0) {
    return syncFootieScript(
      {
        ...script,
        voiceoverUrl: attachment.voiceoverUrl,
        voiceoverNarration: resolveVoiceoverNarrationSnapshot(script),
        voiceSettings,
      },
      script,
    );
  }

  const scenes = refitScenesToVoiceoverDuration(script.scenes, voiceoverDurationMs);

  return syncFootieScript(
    {
      ...script,
      voiceoverUrl: attachment.voiceoverUrl,
      voiceoverDurationMs: Math.round(voiceoverDurationMs),
      voiceoverNarration: resolveVoiceoverNarrationSnapshot(script),
      voiceSettings,
      scenes,
    },
    script,
  );
}

/**
 * Narration only needs to be recreated when the narration TEXT changes.
 * Scene additions, removals, reorderings, and duration edits do not affect
 * the audio — the FFmpeg mux trims/pads to match the final video duration.
 */
function narrationNeedsRefresh(prev: FootieScript, next: FootieScript): boolean {
  return prev.narration !== next.narration;
}

/**
 * Applies a story update, revoking and clearing any stale narration blob URL
 * when the narration text has changed.
 */
export function applyStoryUpdate(prev: FootieScript, next: FootieScript): FootieScript {
  const synced = syncFootieScript(next, prev);

  if (!prev.voiceoverUrl || !narrationNeedsRefresh(prev, synced)) {
    return synced;
  }

  revokeBlobUrl(prev.voiceoverUrl);
  return {
    ...synced,
    voiceoverUrl: undefined,
    voiceoverDurationMs: undefined,
    voiceoverNarration: undefined,
  };
}

/**
 * Patches a scene in the story and keeps the timeline in sync.
 * Does not modify narration text or trigger AI generation.
 */
export function applySceneUpdate(
  script: FootieScript,
  sceneId: string,
  updates: SceneTimelineUpdates,
): FootieScript {
  const currentScene = script.scenes.find((scene) => scene.id === sceneId);
  const mergedUpdates = currentScene
    ? mergeSubtitleTextOnSubtitlesModeSwitch(currentScene, updates)
    : updates;
  const resolvedUpdates = mergeManualDurationUpdates(mergedUpdates);

  return syncFootieScript(
    {
      ...script,
      scenes: recalculateSceneTimings(
        updateSceneInScenes(script.scenes, sceneId, resolvedUpdates),
      ),
    },
    script,
  );
}

/**
 * Patches scene image transform metadata (pan/zoom/rotation/fit).
 * Does not change the image URL or trigger AI generation.
 */
export function applySceneImageSettings(
  script: FootieScript,
  sceneId: string,
  updates: SceneImageTransformPatch | SceneImage,
): FootieScript {
  return syncFootieScript(
    {
      ...script,
      scenes: recalculateSceneTimings(
        updateSceneImageSettings(script.scenes, sceneId, updates),
      ),
    },
    script,
  );
}

/** Resets pan, zoom, and rotation for one scene image by id. */
export function applyResetSceneImageSettings(
  script: FootieScript,
  sceneId: string,
): FootieScript {
  return syncFootieScript(
    {
      ...script,
      scenes: recalculateSceneTimings(resetSceneImageSettings(script.scenes, sceneId)),
    },
    script,
  );
}

/**
 * Patches scene image transform metadata (pan/zoom/rotation/fit).
 * Does not change the image URL or trigger AI generation.
 */
export function applySceneImageTransform(
  script: FootieScript,
  sceneId: string,
  transformPatch: SceneImageTransformPatch,
): FootieScript {
  return applySceneImageSettings(script, sceneId, transformPatch);
}

/**
 * Replaces the full scene list and rebuilds timeline items.
 * Does not modify narration text or trigger AI generation.
 */
export function applyScenesUpdate(script: FootieScript, scenes: FootieScene[]): FootieScript {
  return syncFootieScript(
    {
      ...script,
      scenes: recalculateSceneTimings(scenes),
    },
    script,
  );
}

/**
 * Patches a transition item in the timeline. Does not modify scenes, narration,
 * captions, or voiceover — and never triggers AI generation.
 */
export function applyTransitionUpdate(
  script: FootieScript,
  transitionId: string,
  updates: TransitionTimelineUpdates,
): FootieScript {
  const timelineItems = updateTransitionInTimeline(
    ensureTimelineItems(script.scenes, script.timelineItems),
    transitionId,
    updates,
  );

  return syncFootieScript({ ...script, timelineItems }, script);
}

/**
 * Normalizes scenes and timeline items for legacy stories missing timelineItems,
 * captionMode, or subtitleEffect. Recomputes totalDuration and keeps timeline
 * items in sync with scenes.
 *
 * Legacy defaults: captionMode → "generated", subtitleEffect → "fade-up".
 */
export function syncFootieScript(script: FootieScript, previous?: FootieScript): FootieScript {
  const coerced = coerceLegacyStoryFields(script);
  const normalizedScenes = normalizeSceneIds(coerced.scenes ?? []);
  const fullNarration = coerced.narration ?? "";
  const syncedNarrationScenes =
    previous &&
    !scenesNeedNarrationExcerptSync(previous.scenes, normalizedScenes, fullNarration, previous.narration)
      ? normalizedScenes
      : syncScenesSubtitlesNarration(normalizedScenes, fullNarration);
  const scenes = previous
    ? finalizeSubtitleTextAfterModeSwitch(previous.scenes, syncedNarrationScenes)
    : syncedNarrationScenes;
  const totalDuration = getStoryTotalDuration(scenes);
  const scenesChanged = !previous || !scenesStructurallyEqual(previous.scenes, scenes);

  const sourceTimeline = coerced.timelineItems?.length
    ? coerced.timelineItems
    : previous?.timelineItems;

  let timelineItems;

  if (scenesChanged) {
    timelineItems = syncTimelineItemsWithScenes(scenes, sourceTimeline);
  } else if (coerced.timelineItems?.length) {
    // Transition-only edits — preserve the provided timeline, refresh scene refs.
    timelineItems = syncTimelineSceneRefs(scenes, coerced.timelineItems);
  } else {
    timelineItems = syncTimelineSceneRefs(scenes, ensureTimelineItems(scenes, sourceTimeline));
  }

  return { ...coerced, scenes, totalDuration, timelineItems };
}
