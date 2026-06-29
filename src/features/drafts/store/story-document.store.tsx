"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import type { Draft, DraftPipelineStage } from "../types";
import { resolveDraftScriptForEditor } from "../utils/draft-load.utils";
import { touchDraft } from "../utils/draft-model.utils";

export type StoryDocumentState = {
  currentDraft: Draft | null;
  currentScript: FootieScript | null;
  draftId: string | null;
};

export type StoryDocumentStore = StoryDocumentState & {
  setCurrentDraft: (draft: Draft) => void;
  setCurrentScript: (script: FootieScript) => void;
  updateCurrentScript: (
    updater: FootieScript | ((current: FootieScript) => FootieScript),
  ) => void;
  clearCurrentDocument: () => void;
  hydrateFromDraft: (draft: Draft) => void;
};

const EMPTY_STATE: StoryDocumentState = {
  currentDraft: null,
  currentScript: null,
  draftId: null,
};

/** Module snapshot — survives client route changes without a shared layout provider. */
let documentState: StoryDocumentState = { ...EMPTY_STATE };

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeStoryDocument(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStoryDocumentSnapshot(): StoryDocumentState {
  return documentState;
}

function applyState(next: StoryDocumentState): void {
  documentState = next;
  emitChange();
}

function scriptFromDraft(draft: Draft): FootieScript {
  return syncFootieScript(resolveDraftScriptForEditor(draft));
}

/** Replace runtime draft + derived script (no localStorage write). */
export function setCurrentDraft(draft: Draft): void {
  const script = scriptFromDraft(draft);
  applyState({
    currentDraft: draft,
    currentScript: script,
    draftId: draft.id,
  });
}

/** Replace runtime script; keeps draft metadata in sync when a draft is open. */
export function setCurrentScript(script: FootieScript): void {
  const nextScript = syncFootieScript(script);
  const currentDraft = documentState.currentDraft;

  applyState({
    currentDraft:
      currentDraft != null ? touchDraft(currentDraft, nextScript) : null,
    currentScript: nextScript,
    draftId: currentDraft?.id ?? documentState.draftId,
  });
}

/** Update the open script in memory; throws if no script is loaded. */
export function updateCurrentScript(
  updater: FootieScript | ((current: FootieScript) => FootieScript),
): void {
  const currentScript = documentState.currentScript;
  if (!currentScript) {
    throw new Error("No story document is loaded.");
  }

  const nextScript =
    typeof updater === "function"
      ? syncFootieScript(updater(currentScript))
      : syncFootieScript(updater);

  setCurrentScript(nextScript);
}

/** Clear in-memory document state. */
export function clearCurrentDocument(): void {
  applyState({ ...EMPTY_STATE });
}

/** Hydrate runtime state from a draft record (storage load, dashboard open, etc.). */
export function hydrateFromDraft(draft: Draft): void {
  setCurrentDraft(draft);
}

/** Atomically mark the in-memory document editor-ready with generated scenes. */
export function applyEditorReadyStoryDocument(nextScript: FootieScript): void {
  const currentDraft = documentState.currentDraft;
  if (!currentDraft) {
    throw new Error("No story document is loaded.");
  }

  const synced = syncFootieScript(nextScript);
  setCurrentDraft({
    ...touchDraft(currentDraft, synced),
    pipelineStage: "editor_ready" satisfies DraftPipelineStage,
  });
}

const StoryDocumentContext = createContext<StoryDocumentStore | null>(null);

function buildStore(state: StoryDocumentState): StoryDocumentStore {
  return {
    ...state,
    setCurrentDraft,
    setCurrentScript,
    updateCurrentScript,
    clearCurrentDocument,
    hydrateFromDraft,
  };
}

/**
 * Optional provider for subtrees that prefer Context over the module snapshot hook.
 * Persistence is handled elsewhere — setters only update runtime memory.
 */
export function StoryDocumentProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribeStoryDocument,
    getStoryDocumentSnapshot,
    getStoryDocumentSnapshot,
  );

  const value = useMemo(() => buildStore(state), [state]);

  return (
    <StoryDocumentContext.Provider value={value}>{children}</StoryDocumentContext.Provider>
  );
}

/** Runtime story/draft document — in-memory source of truth for the active session. */
export function useStoryDocument(): StoryDocumentStore {
  const context = useContext(StoryDocumentContext);
  const state = useSyncExternalStore(
    subscribeStoryDocument,
    getStoryDocumentSnapshot,
    getStoryDocumentSnapshot,
  );

  return useMemo(
    () => context ?? buildStore(state),
    [context, state],
  );
}

/** Read snapshot without subscribing (e.g. persist workers). */
export function getStoryDocumentState(): StoryDocumentState {
  return documentState;
}
