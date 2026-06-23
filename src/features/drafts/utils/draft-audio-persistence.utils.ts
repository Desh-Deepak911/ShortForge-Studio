import { getCanonicalVoiceover } from "@/features/audio";
import { fetchAudioBlobFromUrl } from "@/features/audio/utils/audio-blob.utils";
import {
  inferExportAudioMimeTypeFromFileName,
  resolveExportAudioMimeType,
} from "@/features/export/utils/export-audio-input.utils";
import type { FootieScript, StoryBackgroundMusic } from "@/features/story/types";
import { normalizeStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import { normalizeStoryVoiceSettings } from "@/features/story/utils/voice-settings.utils";
import { createAudioBlobUrl, createVoiceoverBlobUrl } from "@/lib/voiceover";

/** Optional persisted audio payloads stored on draft scripts (JSON-safe). */
export type DraftPersistedScript = FootieScript & {
  voiceoverAudioBase64?: string;
};

export type DraftPersistedBackgroundMusic = StoryBackgroundMusic & {
  fileDataBase64?: string;
  fileMimeType?: string;
};

function isEphemeralAudioUrl(url: string | undefined): boolean {
  return Boolean(url?.trim().startsWith("blob:"));
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  });
}

async function fetchAudioBlobForDraftPersist(url: string): Promise<Blob> {
  return fetchAudioBlobFromUrl(
    url,
    "Audio is empty",
    "Failed to read audio for draft save",
  );
}

function resolveBackgroundMusicMimeType(
  music: Pick<DraftPersistedBackgroundMusic, "fileMimeType" | "fileName">,
  blobType?: string,
): string {
  return resolveExportAudioMimeType({
    explicitMimeType: music.fileMimeType,
    fileName: music.fileName,
    blobType,
  });
}

function materializeVoiceoverBase64(audioBase64: string): string {
  return createVoiceoverBlobUrl(audioBase64);
}

function materializeBackgroundMusicBase64(
  audioBase64: string,
  music: Pick<DraftPersistedBackgroundMusic, "fileMimeType" | "fileName">,
): string {
  return createAudioBlobUrl(
    audioBase64,
    resolveBackgroundMusicMimeType(music),
  );
}

/** Embeds JSON-safe base64 audio payloads for voiceover and uploaded background music. */
export async function persistDraftAudioInScript(
  script: FootieScript,
): Promise<DraftPersistedScript> {
  const canonical = getCanonicalVoiceover(script);
  const voiceSettings = normalizeStoryVoiceSettings(script);
  const backgroundMusic = normalizeStoryBackgroundMusic(
    script.backgroundMusic,
  ) as DraftPersistedBackgroundMusic;

  let voiceoverAudioBase64 = (script as DraftPersistedScript).voiceoverAudioBase64;
  const canonicalUrl = canonical?.url;
  const voiceoverDurationMs = canonical?.durationMs ?? script.voiceoverDurationMs;

  if (canonicalUrl && isEphemeralAudioUrl(canonicalUrl)) {
    voiceoverAudioBase64 = await blobToBase64(await fetchAudioBlobForDraftPersist(canonicalUrl));
  }

  let nextBackgroundMusic: DraftPersistedBackgroundMusic = { ...backgroundMusic };
  const musicUrl = backgroundMusic.fileUrl?.trim();

  if (musicUrl && isEphemeralAudioUrl(musicUrl)) {
    const musicBlob = await fetchAudioBlobForDraftPersist(musicUrl);
    nextBackgroundMusic = {
      ...nextBackgroundMusic,
      fileDataBase64: await blobToBase64(musicBlob),
      fileMimeType: resolveBackgroundMusicMimeType(backgroundMusic, musicBlob.type),
      fileUrl: undefined,
    };
  } else if (
    backgroundMusic.fileDataBase64 &&
    !backgroundMusic.fileMimeType &&
    backgroundMusic.fileName
  ) {
    nextBackgroundMusic = {
      ...nextBackgroundMusic,
      fileMimeType:
        inferExportAudioMimeTypeFromFileName(backgroundMusic.fileName) ?? undefined,
    };
  }

  return {
    ...script,
    voiceSettings,
    backgroundMusic: nextBackgroundMusic,
    voiceoverDurationMs,
    voiceoverUrl: voiceoverAudioBase64 ? undefined : canonicalUrl,
    ...(voiceoverAudioBase64 ? { voiceoverAudioBase64 } : {}),
  };
}

/** Restores playable blob URLs from persisted draft audio payloads. */
export function hydrateDraftScriptAudio(script: FootieScript): FootieScript {
  const persisted = script as DraftPersistedScript;
  const canonical = getCanonicalVoiceover(persisted);
  let voiceoverUrl = canonical?.url ?? persisted.voiceoverUrl;
  const voiceoverAudioBase64 = persisted.voiceoverAudioBase64;

  if ((!voiceoverUrl || isEphemeralAudioUrl(voiceoverUrl)) && voiceoverAudioBase64) {
    voiceoverUrl = materializeVoiceoverBase64(voiceoverAudioBase64);
  }

  const backgroundMusic = normalizeStoryBackgroundMusic(
    persisted.backgroundMusic,
  ) as DraftPersistedBackgroundMusic;
  let nextBackgroundMusic: StoryBackgroundMusic = backgroundMusic;
  const fileDataBase64 = backgroundMusic.fileDataBase64;
  const fileUrl = backgroundMusic.fileUrl?.trim();

  if (
    backgroundMusic.enabled &&
    backgroundMusic.source !== "none" &&
    fileDataBase64 &&
    (!fileUrl || isEphemeralAudioUrl(fileUrl))
  ) {
    nextBackgroundMusic = {
      ...backgroundMusic,
      fileUrl: materializeBackgroundMusicBase64(fileDataBase64, backgroundMusic),
      fileMimeType: resolveBackgroundMusicMimeType(backgroundMusic),
    };
  }

  return {
    ...persisted,
    voiceoverUrl,
    voiceoverDurationMs: canonical?.durationMs ?? persisted.voiceoverDurationMs,
    voiceSettings: normalizeStoryVoiceSettings(persisted),
    backgroundMusic: nextBackgroundMusic,
  };
}
