import { normalizeExportSettings, resolveExportSettings } from "@/features/export/utils/export-settings.utils";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import { normalizeStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import { normalizeStoryVoiceSettings } from "@/features/story/utils/voice-settings.utils";
import { syncFootieScript } from "@/lib/voiceover";

export interface SerializeEditorStateOptions {
  /** Latest export panel values — may live outside `script` until save. */
  exportSettings?: ExportSettings;
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
  const exportSettings = normalizeExportSettings(
    options?.exportSettings ?? script.exportSettings ?? resolveExportSettings(script),
    script.title,
  );

  const voiceSettings = normalizeStoryVoiceSettings(script);
  const backgroundMusic = normalizeStoryBackgroundMusic(script.backgroundMusic);

  const synced = syncFootieScript({
    ...script,
    exportSettings,
    voiceSettings,
    backgroundMusic,
    voiceoverUrl: script.voiceoverUrl,
    voiceoverDurationMs: script.voiceoverDurationMs,
    narration: script.narration,
    title: script.title,
    scenes: script.scenes,
    timelineItems: script.timelineItems,
  });

  return cloneJsonSerializable(synced);
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
