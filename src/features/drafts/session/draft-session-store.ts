import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import { getDraft, updateDraft } from "../services";
import type { Draft, DraftPipelineStage, StoryCreationBrief } from "../types";
import { resolveDraftScriptForEditor } from "../utils/draft-load.utils";
import { touchDraft } from "../utils/draft-model.utils";

import { persistDraftSessionToStorage } from "./draft-session-persist.utils";
import { DRAFT_AUTOSAVE_FAILED_MESSAGE } from "./draft-persist-messages";
import type { DraftSessionPersistStatus, DraftSessionRecord } from "./draft-session.types";
import {
  clearCurrentDocument,
  getStoryDocumentState,
  hydrateFromDraft,
} from "../store/story-document.store";

type Listener = () => void;

const sessions = new Map<string, DraftSessionRecord>();
const listeners = new Set<Listener>();

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const persistInFlight = new Map<string, Promise<Draft | null>>();

const SCRIPT_AUTOSAVE_MS = 800;

/** Stable empty snapshots per draftId — required for useSyncExternalStore referential equality. */
const emptySessionSnapshots = new Map<string, DraftSessionRecord>();

function getEmptySessionSnapshot(draftId: string): DraftSessionRecord {
  let empty = emptySessionSnapshots.get(draftId);
  if (!empty) {
    empty = {
      draftId,
      loadStatus: "idle",
      draft: null,
      script: null,
      persistStatus: "idle",
    };
    emptySessionSnapshots.set(draftId, empty);
  }
  return empty;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function notifyDraft(draftId: string) {
  emitChange();
  void draftId;
}

export function subscribeDraftSessionStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDraftSessionSnapshot(draftId: string): DraftSessionRecord {
  return sessions.get(draftId) ?? getEmptySessionSnapshot(draftId);
}

function buildSessionFromDraft(draft: Draft): DraftSessionRecord {
  const script = syncFootieScript(resolveDraftScriptForEditor(draft));
  return {
    draftId: draft.id,
    loadStatus: "ready",
    draft,
    script,
    persistStatus: "saved",
  };
}

function syncStoryDocument(record: DraftSessionRecord): void {
  if (record.loadStatus === "ready" && record.draft) {
    hydrateFromDraft(record.draft);
  }
}

/** Seed session after createDraft or before navigating from the dashboard. */
export function seedDraftSession(draft: Draft): DraftSessionRecord {
  const record = buildSessionFromDraft(draft);
  sessions.set(draft.id, record);
  syncStoryDocument(record);
  notifyDraft(draft.id);
  return record;
}

/** Drop session when draft is deleted. */
export function clearDraftSession(draftId: string): void {
  const timer = persistTimers.get(draftId);
  if (timer != null) {
    clearTimeout(timer);
    persistTimers.delete(draftId);
  }
  persistInFlight.delete(draftId);
  sessions.delete(draftId);
  if (getStoryDocumentState().draftId === draftId) {
    clearCurrentDocument();
  }
  notifyDraft(draftId);
}

/**
 * Load session from memory or localStorage (cold start / refresh).
 * Skips storage when an in-memory session already exists.
 */
export function ensureDraftSession(draftId: string): DraftSessionRecord {
  const existing = sessions.get(draftId);
  if (existing?.loadStatus === "ready") {
    return existing;
  }

  if (existing?.loadStatus === "loading") {
    return existing;
  }

  const loadingRecord: DraftSessionRecord = {
    draftId,
    loadStatus: "loading",
    draft: null,
    script: null,
    persistStatus: "idle",
  };
  sessions.set(draftId, loadingRecord);
  notifyDraft(draftId);

  const stored = getDraft(draftId);
  if (!stored) {
    const notFound: DraftSessionRecord = {
      draftId,
      loadStatus: "not_found",
      draft: null,
      script: null,
      persistStatus: "idle",
    };
    sessions.set(draftId, notFound);
    notifyDraft(draftId);
    return notFound;
  }

  const record = buildSessionFromDraft(stored);
  sessions.set(draftId, record);
  syncStoryDocument(record);
  notifyDraft(draftId);
  return record;
}

export function updateDraftSessionScript(
  draftId: string,
  updater: FootieScript | ((current: FootieScript) => FootieScript),
): DraftSessionRecord | null {
  const current = sessions.get(draftId);
  if (!current?.script || !current.draft) {
    return current ?? null;
  }

  const nextScript =
    typeof updater === "function"
      ? syncFootieScript(updater(current.script))
      : syncFootieScript(updater);

  const record: DraftSessionRecord = {
    ...current,
    script: nextScript,
    draft: touchDraft(current.draft, nextScript),
  };
  sessions.set(draftId, record);
  syncStoryDocument(record);
  notifyDraft(draftId);
  return record;
}

export function updateDraftSessionMeta(
  draftId: string,
  updates: {
    pipelineStage?: DraftPipelineStage;
    creationBrief?: StoryCreationBrief;
  },
): DraftSessionRecord | null {
  const current = sessions.get(draftId);
  if (!current?.draft) {
    return current ?? null;
  }

  const record: DraftSessionRecord = {
    ...current,
    draft: {
      ...current.draft,
      ...updates,
    },
  };
  sessions.set(draftId, record);
  syncStoryDocument(record);
  notifyDraft(draftId);
  return record;
}

/** Ensure a session record exists so background persist status can be tracked. */
function ensurePersistSession(draftId: string): DraftSessionRecord {
  const existing = sessions.get(draftId);
  if (existing?.draft && existing.script) {
    return existing;
  }

  const doc = getStoryDocumentState();
  if (doc.draftId === draftId && doc.currentDraft && doc.currentScript) {
    const record: DraftSessionRecord = {
      draftId,
      loadStatus: "ready",
      draft: doc.currentDraft,
      script: doc.currentScript,
      persistStatus: existing?.persistStatus ?? "idle",
      persistError: existing?.persistError,
    };
    sessions.set(draftId, record);
    return record;
  }

  const stored = getDraft(draftId);
  if (stored) {
    const record = buildSessionFromDraft(stored);
    sessions.set(draftId, record);
    return record;
  }

  const fallback: DraftSessionRecord = {
    draftId,
    loadStatus: existing?.loadStatus ?? "idle",
    draft: existing?.draft ?? null,
    script: existing?.script ?? null,
    persistStatus: existing?.persistStatus ?? "idle",
    persistError: existing?.persistError,
  };
  sessions.set(draftId, fallback);
  return fallback;
}

function applyPersistResult(
  draftId: string,
  updated: Draft | null,
  persistStatus: DraftSessionPersistStatus,
  persistError?: string,
): DraftSessionRecord | null {
  const current = sessions.get(draftId);
  if (!current) {
    return null;
  }

  if (!updated) {
    const record: DraftSessionRecord = {
      ...current,
      persistStatus,
      persistError:
        persistStatus === "error"
          ? (persistError ?? DRAFT_AUTOSAVE_FAILED_MESSAGE)
          : undefined,
    };
    sessions.set(draftId, record);
    notifyDraft(draftId);
    return record;
  }

  const script = syncFootieScript(updated.script);
  const record: DraftSessionRecord = {
    draftId,
    loadStatus: "ready",
    draft: updated,
    script,
    persistStatus: "saved",
    persistError: undefined,
  };
  sessions.set(draftId, record);
  syncStoryDocument(record);
  notifyDraft(draftId);
  return record;
}

function resolvePersistScript(
  draftId: string,
  scriptOverride?: FootieScript,
): FootieScript | null {
  if (scriptOverride) {
    return scriptOverride;
  }

  const doc = getStoryDocumentState();
  if (doc.draftId === draftId && doc.currentScript) {
    return doc.currentScript;
  }

  return sessions.get(draftId)?.script ?? null;
}

function resolvePersistDraftMeta(draftId: string): Draft | null {
  const doc = getStoryDocumentState();
  if (doc.draftId === draftId && doc.currentDraft) {
    return doc.currentDraft;
  }

  return sessions.get(draftId)?.draft ?? null;
}

/** Immediate persist — used for editor save and Open Editor. */
export function flushDraftSessionPersist(
  draftId: string,
  nextStage?: DraftPipelineStage,
  scriptOverride?: FootieScript,
): Promise<Draft | null> {
  const inFlight = persistInFlight.get(draftId);
  if (inFlight) {
    return inFlight;
  }

  const timer = persistTimers.get(draftId);
  if (timer != null) {
    clearTimeout(timer);
    persistTimers.delete(draftId);
  }

  const scriptToSave = resolvePersistScript(draftId, scriptOverride);
  if (!scriptToSave) {
    return Promise.resolve(null);
  }

  ensurePersistSession(draftId);
  const metaDraft = resolvePersistDraftMeta(draftId);
  applyPersistResult(draftId, null, "pending");

  const promise = persistDraftSessionToStorage(
    draftId,
    scriptToSave,
    nextStage,
    metaDraft?.pipelineStage,
    scriptToSave,
  )
    .then((updated) => {
      applyPersistResult(draftId, updated, updated ? "saved" : "error");
      return updated;
    })
    .catch((error: unknown) => {
      applyPersistResult(
        draftId,
        null,
        "error",
        error instanceof Error ? error.message : DRAFT_AUTOSAVE_FAILED_MESSAGE,
      );
      return null;
    })
    .finally(() => {
      persistInFlight.delete(draftId);
    });

  persistInFlight.set(draftId, promise);
  return promise;
}

/** Debounced background persist for script/voiceover edits on the review page. */
export function scheduleDraftSessionPersist(
  draftId: string,
  nextStage?: DraftPipelineStage,
  delayMs = SCRIPT_AUTOSAVE_MS,
): void {
  const timer = persistTimers.get(draftId);
  if (timer != null) {
    clearTimeout(timer);
  }

  persistTimers.set(
    draftId,
    setTimeout(() => {
      persistTimers.delete(draftId);
      void flushDraftSessionPersist(draftId, nextStage);
    }, delayMs),
  );
}

/** Persist creationBrief metadata without touching the full script serialize path. */
export function persistDraftSessionCreationBrief(
  draftId: string,
  creationBrief: StoryCreationBrief,
): Draft | null {
  const updated = updateDraft(draftId, { creationBrief });
  if (!updated) {
    return null;
  }

  const current = sessions.get(draftId);
  if (current?.draft) {
    const record: DraftSessionRecord = {
      ...current,
      draft: updated,
    };
    sessions.set(draftId, record);
    syncStoryDocument(record);
    notifyDraft(draftId);
  }

  return updated;
}
