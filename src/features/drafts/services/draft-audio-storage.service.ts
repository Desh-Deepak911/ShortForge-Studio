import type { FootieScript } from "@/features/story/types";
import { normalizeStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";

import type {
  DraftPersistedBackgroundMusic,
  DraftPersistedScript,
} from "../utils/draft-audio-persistence.utils";
import type { Draft } from "../types";
import { normalizeDraft } from "../utils/draft-model.utils";

const DATABASE_NAME = "shortforge-draft-assets";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "audio";
const AUDIO_REFERENCE_PREFIX = "shortforge-draft-audio:";

type DraftAudioKind = "voiceover" | "background";

function buildAudioKey(draftId: string, kind: DraftAudioKind): string {
  return `${draftId}:${kind}`;
}

function buildAudioReference(draftId: string, kind: DraftAudioKind): string {
  return `${AUDIO_REFERENCE_PREFIX}${buildAudioKey(draftId, kind)}`;
}

function parseAudioReference(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized?.startsWith(AUDIO_REFERENCE_PREFIX)) {
    return null;
  }
  return normalized.slice(AUDIO_REFERENCE_PREFIX.length) || null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        database.createObjectStore(OBJECT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function writeBlob(database: IDBDatabase, key: string, blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
    transaction.objectStore(OBJECT_STORE_NAME).put(blob, key);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}

function readBlob(database: IDBDatabase, key: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
    const request = transaction.objectStore(OBJECT_STORE_NAME).get(key);
    request.onsuccess = () =>
      resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => resolve(null);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function resolvePersistableBlob(
  url: string | undefined,
  base64: string | undefined,
  mimeType: string,
): Promise<Blob | null> {
  if (base64) {
    return base64ToBlob(base64, mimeType);
  }
  if (!url?.startsWith("blob:")) {
    return null;
  }
  try {
    const response = await fetch(url);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/**
 * Moves bulky draft audio out of the shared localStorage JSON bucket.
 * IndexedDB owns the Blob; localStorage keeps only a stable, non-secret reference.
 */
export async function offloadDraftAudioAssets(
  draftId: string,
  script: FootieScript,
): Promise<FootieScript> {
  const database = await openDatabase();
  if (!database) {
    return script;
  }

  try {
    const persisted = script as DraftPersistedScript;
    const voiceoverBlob = await resolvePersistableBlob(
      script.voiceoverUrl,
      persisted.voiceoverAudioBase64,
      "audio/mpeg",
    );

    let voiceoverStored = false;
    if (voiceoverBlob) {
      voiceoverStored = await writeBlob(
        database,
        buildAudioKey(draftId, "voiceover"),
        voiceoverBlob,
      );
    }

    const background = normalizeStoryBackgroundMusic(
      script.backgroundMusic,
    ) as DraftPersistedBackgroundMusic;
    const backgroundBlob = await resolvePersistableBlob(
      background.fileUrl,
      background.fileDataBase64,
      background.fileMimeType ?? "audio/mpeg",
    );

    let backgroundStored = false;
    if (backgroundBlob) {
      backgroundStored = await writeBlob(
        database,
        buildAudioKey(draftId, "background"),
        backgroundBlob,
      );
    }

    const compact = { ...persisted };
    if (voiceoverStored) {
      delete compact.voiceoverAudioBase64;
      compact.voiceoverUrl = buildAudioReference(draftId, "voiceover");
    }

    const compactBackground = { ...background };
    if (backgroundStored) {
      delete compactBackground.fileDataBase64;
      compactBackground.fileUrl = buildAudioReference(draftId, "background");
    }

    return {
      ...compact,
      backgroundMusic: compactBackground,
    };
  } finally {
    database.close();
  }
}

/** Restores IndexedDB-backed draft audio as fresh playable object URLs. */
export async function hydrateDraftAudioAssets(
  script: FootieScript,
): Promise<FootieScript> {
  const voiceoverKey = parseAudioReference(script.voiceoverUrl);
  const background = normalizeStoryBackgroundMusic(script.backgroundMusic);
  const backgroundKey = parseAudioReference(background.fileUrl);
  if (!voiceoverKey && !backgroundKey) {
    return script;
  }

  const database = await openDatabase();
  if (!database) {
    return script;
  }

  try {
    const voiceoverBlob = voiceoverKey
      ? await readBlob(database, voiceoverKey)
      : null;
    const backgroundBlob = backgroundKey
      ? await readBlob(database, backgroundKey)
      : null;

    return {
      ...script,
      voiceoverUrl: voiceoverBlob
        ? URL.createObjectURL(voiceoverBlob)
        : script.voiceoverUrl,
      backgroundMusic: {
        ...background,
        fileUrl: backgroundBlob
          ? URL.createObjectURL(backgroundBlob)
          : background.fileUrl,
      },
    };
  } finally {
    database.close();
  }
}

/** Rebuilds draft summary/editor slices after restoring playable audio URLs. */
export async function hydrateDraftWithAudioAssets(
  draft: Draft,
): Promise<Draft> {
  const script = await hydrateDraftAudioAssets(draft.script);
  return normalizeDraft({
    ...draft,
    script,
  });
}
