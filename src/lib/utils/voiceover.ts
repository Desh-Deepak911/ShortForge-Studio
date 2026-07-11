import {
  inferVoiceoverMimeTypeFromBytes,
  materializePlayableVoiceoverFromBase64,
} from "@/features/audio/utils/playable-voiceover-src.utils";
import { revokeBlobUrl } from "./blobUrl";
import {
  coerceLegacyStoryFields,
  resolveStoryDurationSec,
  resolveVoiceoverDurationMs,
} from "@/features/story/utils";
import {
  finalizeSubtitleTextAfterModeSwitch,
  mergeSubtitleTextOnSubtitlesModeSwitch,
  normalizeSceneCaptionSettings,
  scenesNeedNarrationExcerptSync,
  syncScenesSubtitlesNarration,
} from "@/features/story/utils";
import {
  resetSceneImageSettings,
  updateSceneImageSettings,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import {
  buildMediaFramingPatch,
  buildResetMediaFramingPatch,
  type SceneMediaFramingPatch,
} from "@/features/media-framing";
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
import type {
  CaptionMode,
  FootieScene,
  FootieScript,
  SceneImage,
  StoryVoiceSettings,
} from "@/features/story/types";
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

/** Editor commit intent — presentation edits skip story-data sync side effects. */
export type StoryScriptChangeIntent = "story" | "presentation" | "narration_rebuild" | "media";

export interface StoryScriptChangeOptions {
  intent?: StoryScriptChangeIntent;
}

/** Scene fields that affect caption display only — never spoken story data. */
export type ScenePresentationPatch = Partial<
  Pick<
    FootieScene,
    | "captionMode"
    | "captionPreset"
    | "subtitleEffect"
    | "captionLayout"
    | "captionStyle"
    | "captionAnimation"
  >
>;

export type StoryPresentationPatch = Partial<
  Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle" | "defaultCaptionAnimation">
>;

/** Creates an object URL from a base64-encoded audio payload. */
export function createAudioBlobUrl(
  audioBase64: string,
  mimeType = "audio/mpeg",
): string {
  const trimmed = audioBase64.trim();

  if (trimmed.startsWith("data:")) {
    const materialized = materializePlayableVoiceoverFromBase64(trimmed, { preferObjectUrl: true });
    if (materialized) {
      return materialized.src;
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeVoiceoverBase64Payload(trimmed);
  } catch {
    const binary = atob(trimmed);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  const resolvedMime =
    mimeType !== "audio/mpeg" ? mimeType : inferVoiceoverMimeTypeFromBytes(bytes);

  return URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: resolvedMime }));
}

function decodeVoiceoverBase64Payload(payload: string): Uint8Array {
  const trimmed = payload.trim();
  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:[^,]*;base64,([\s\S]+)$/);
    if (!match?.[1]) {
      throw new Error("Invalid voiceover data URL");
    }
    const binary = atob(match[1].trim());
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  const binary = atob(trimmed);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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
): Pick<
  FootieScript,
  "voiceoverUrl" | "voiceoverDurationMs" | "voiceoverNarration" | "voiceoverVoiceSettings" | "voiceSettings"
> {
  const voiceSettings = mergeVoiceSettings(script, attachment.voiceSettings);

  return {
    voiceoverUrl: attachment.voiceoverUrl,
    voiceoverNarration: resolveVoiceoverNarrationSnapshot(script),
    voiceoverVoiceSettings: voiceSettings,
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
        voiceoverVoiceSettings: voiceSettings,
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
      voiceoverVoiceSettings: voiceSettings,
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
 * Editor sync boundary: normalizes `next` against `prev` once, then revokes
 * stale narration blob URLs when narration text changed.
 * Patch helpers (`applySceneUpdate`, etc.) intentionally do not sync.
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
    voiceoverVoiceSettings: undefined,
  };
}

/**
 * Patches a scene in the story (scene timings only).
 * Does not modify narration text or trigger AI generation.
 * Callers that commit into the editor must pass the result through
 * `applyStoryUpdate` / the editor sync boundary so timelineItems stay consistent.
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

  return {
    ...script,
    scenes: recalculateSceneTimings(
      updateSceneInScenes(script.scenes, sceneId, resolvedUpdates),
    ),
  };
}

/**
 * Presentation-only scene patch — caption display/config fields only.
 * Does not recalculate timings, seed subtitleText, or sync narration excerpts.
 */
export function applyPresentationSceneUpdate(
  script: FootieScript,
  sceneId: string,
  patch: ScenePresentationPatch,
): FootieScript {
  const sceneIndex = script.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0 || Object.keys(patch).length === 0) {
    return script;
  }

  const scenes = script.scenes.map((scene, index) =>
    index === sceneIndex ? normalizeSceneCaptionSettings({ ...scene, ...patch }) : scene,
  );

  const timelineItems = syncTimelineSceneRefs(
    scenes,
    ensureTimelineItems(scenes, script.timelineItems),
  );

  return { ...script, scenes, timelineItems };
}

/**
 * Project-level presentation patch (e.g. default caption layout).
 */
export function applyPresentationScriptUpdate(
  script: FootieScript,
  patch: StoryPresentationPatch,
): FootieScript {
  if (Object.keys(patch).length === 0) {
    return script;
  }

  return { ...script, ...patch };
}

/**
 * Editor sync boundary for Update Narration commits.
 * Preserves user-authored subtitleText and written captions — does not re-split
 * global narration back into per-scene excerpts.
 */
export function applyNarrationRebuildStoryUpdate(
  prev: FootieScript,
  next: FootieScript,
): FootieScript {
  void prev;
  const coerced = coerceLegacyStoryFields(next);
  const scenes = normalizeSceneIds(coerced.scenes ?? []).map(normalizeSceneCaptionSettings);
  const totalDuration = getStoryTotalDuration(scenes);
  const timelineItems = syncTimelineSceneRefs(
    scenes,
    ensureTimelineItems(
      scenes,
      coerced.timelineItems?.length ? coerced.timelineItems : prev.timelineItems,
    ),
  );

  return { ...coerced, scenes, totalDuration, timelineItems };
}

/**
 * Editor sync boundary for media-only commits.
 * Skips narration excerpt sync, subtitleText seeding, and timing recompute side effects.
 */
export function applyMediaStoryUpdate(
  prev: FootieScript,
  next: FootieScript,
): FootieScript {
  return applyPresentationStoryUpdate(prev, next);
}

/**
 * Editor sync boundary for presentation-only commits.
 * Skips narration excerpt sync, subtitleText seeding, and timing recompute.
 */
export function applyPresentationStoryUpdate(
  prev: FootieScript,
  next: FootieScript,
): FootieScript {
  void prev;
  const coerced = coerceLegacyStoryFields(next);
  const scenes = normalizeSceneIds(coerced.scenes ?? []).map(normalizeSceneCaptionSettings);
  const totalDuration = getStoryTotalDuration(scenes);
  const timelineItems = syncTimelineSceneRefs(
    scenes,
    ensureTimelineItems(
      scenes,
      coerced.timelineItems?.length ? coerced.timelineItems : prev.timelineItems,
    ),
  );

  return { ...coerced, scenes, totalDuration, timelineItems };
}

/**
 * Caption display mode switch — presentation only; updates `captionMode` alone.
 */
export function applyCaptionModeSwitchUpdate(
  script: FootieScript,
  sceneId: string,
  mode: CaptionMode,
): FootieScript {
  return applyPresentationSceneUpdate(script, sceneId, { captionMode: mode });
}

/**
 * Patches scene image transform metadata (pan/zoom/rotation/fit).
 * Does not change the image URL or trigger AI generation.
 * Editor commits must run through `applyStoryUpdate` / the editor sync boundary.
 * Dual-writes scene.media.transform for image scenes (preview/export parity).
 */
export function applySceneImageSettings(
  script: FootieScript,
  sceneId: string,
  updates: SceneImageTransformPatch | SceneImage,
): FootieScript {
  return {
    ...script,
    scenes: recalculateSceneTimings(
      updateSceneImageSettings(script.scenes, sceneId, updates),
    ),
  };
}

/**
 * Unified framing commit for images and videos.
 * Maps legacy SceneImageTransformPatch fields onto buildMediaFramingPatch.
 * Video: writes media.transform/fitMode only (trim/playback untouched).
 * Image: dual-writes scene.image + scene.media.
 */
export function applyMediaFramingSettings(
  script: FootieScript,
  sceneId: string,
  updates: SceneImageTransformPatch,
): FootieScript {
  const scene = script.scenes.find((entry) => entry.id === sceneId);
  if (!scene) {
    return script;
  }

  const framingPatch: SceneMediaFramingPatch = {
    ...(updates.fitMode !== undefined ? { fitMode: updates.fitMode } : {}),
    ...(updates.x !== undefined ? { positionX: updates.x } : {}),
    ...(updates.y !== undefined ? { positionY: updates.y } : {}),
    ...(updates.scale !== undefined ? { zoom: updates.scale } : {}),
    ...(updates.rotation !== undefined ? { rotationDeg: updates.rotation } : {}),
  };

  const result = buildMediaFramingPatch(scene, framingPatch);
  if (!result) {
    return applySceneImageSettings(script, sceneId, updates);
  }

  return applySceneUpdate(script, sceneId, result.patch);
}

/**
 * Resets pan, zoom, and rotation for one scene image by id.
 * Editor commits must run through `applyStoryUpdate` / the editor sync boundary.
 */
export function applyResetSceneImageSettings(
  script: FootieScript,
  sceneId: string,
): FootieScript {
  return {
    ...script,
    scenes: recalculateSceneTimings(resetSceneImageSettings(script.scenes, sceneId)),
  };
}

/** Resets framing for image or video via shared framing patch helper. */
export function applyResetMediaFramingSettings(
  script: FootieScript,
  sceneId: string,
): FootieScript {
  const scene = script.scenes.find((entry) => entry.id === sceneId);
  if (!scene) {
    return script;
  }

  const result = buildResetMediaFramingPatch(scene);
  if (!result) {
    return applyResetSceneImageSettings(script, sceneId);
  }

  return applySceneUpdate(script, sceneId, result.patch);
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
 * Replaces the full scene list (scene timings only).
 * Does not modify narration text or trigger AI generation.
 * Editor commits must run through `applyStoryUpdate` / the editor sync boundary
 * so timelineItems are rebuilt.
 */
export function applyScenesUpdate(script: FootieScript, scenes: FootieScene[]): FootieScript {
  return {
    ...script,
    scenes: recalculateSceneTimings(scenes),
  };
}

/**
 * Patches a transition item in the timeline. Does not modify scenes, narration,
 * captions, or voiceover — and never triggers AI generation.
 * Editor commits must run through `applyStoryUpdate` / the editor sync boundary.
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

  return { ...script, timelineItems };
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
