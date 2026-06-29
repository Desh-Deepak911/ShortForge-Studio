import { getCanonicalVoiceover } from "@/features/audio";
import { normalizeExportSettings, resolveExportSettings } from "@/features/export/utils/export-settings.utils";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import { normalizeStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import { normalizeStoryVoiceSettings } from "@/features/story/utils/voice-settings.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  persistDraftAudioInScript,
  type DraftPersistedBackgroundMusic,
  type DraftPersistedScript,
} from "./draft-audio-persistence.utils";

export interface SerializeEditorStateOptions {
  /** Latest export panel values — may live outside `script` until save. */
  exportSettings?: ExportSettings;
}

function buildSerializedScript(
  script: FootieScript,
  options?: SerializeEditorStateOptions,
): FootieScript {
  const exportSettings = normalizeExportSettings(
    options?.exportSettings ?? script.exportSettings ?? resolveExportSettings(script),
    script.title,
  );

  const voiceSettings = normalizeStoryVoiceSettings(script);
  const backgroundMusic = normalizeStoryBackgroundMusic(script.backgroundMusic);
  const persistedBackground = script.backgroundMusic as DraftPersistedBackgroundMusic | undefined;
  const canonicalVoiceover = getCanonicalVoiceover(script);
  const persistedScript = script as DraftPersistedScript;

  const synced = syncFootieScript(
    {
      ...script,
      exportSettings,
      voiceSettings,
      backgroundMusic,
      voiceoverUrl: canonicalVoiceover?.url ?? script.voiceoverUrl,
      voiceoverDurationMs:
        canonicalVoiceover?.durationMs ?? script.voiceoverDurationMs,
      narration: script.narration,
      title: script.title,
      scenes: script.scenes,
      timelineItems: script.timelineItems,
    },
    script,
  );

  return cloneJsonSerializable({
    ...synced,
    ...(persistedScript.voiceoverAudioBase64
      ? { voiceoverAudioBase64: persistedScript.voiceoverAudioBase64 }
      : {}),
    backgroundMusic: {
      ...synced.backgroundMusic!,
      ...(persistedBackground?.fileDataBase64
        ? { fileDataBase64: persistedBackground.fileDataBase64 }
        : {}),
      ...(persistedBackground?.fileMimeType
        ? { fileMimeType: persistedBackground.fileMimeType }
        : {}),
    },
  });
}

/**
 * Prepares the full editor story for JSON/localStorage persistence.
 * Normalizes timeline, voice/background/export settings, and deep-clones so
 * scenes, transitions, captions, image transforms, and durations are preserved.
 */
export function serializeEditorStateForDraft(
  script: FootieScript,
  options?: SerializeEditorStateOptions,
): FootieScript {
  return buildSerializedScript(script, options);
}

/**
 * Serializes editor state and embeds JSON-safe base64 audio for voiceover and
 * uploaded background music so drafts survive reload.
 */
export async function serializeEditorStateForDraftAsync(
  script: FootieScript,
  options?: SerializeEditorStateOptions,
): Promise<FootieScript> {
  const serialized = buildSerializedScript(script, options);
  const withAudio = await persistDraftAudioInScript(serialized);
  return cloneJsonSerializable(withAudio);
}

/** Returns true when a value can be persisted with JSON.stringify. */
export function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function cloneJsonSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
