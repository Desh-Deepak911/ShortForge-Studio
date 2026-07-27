"use client";

import { useCallback, useEffect, useState } from "react";

import type { FootieScript } from "@/features/story/types";

import { getDraft } from "../services";
import { hydrateDraftWithAudioAssets } from "../services/draft-audio-storage.service";
import {
  flushDraftSessionPersist,
  persistDraftSessionCreationBrief,
  scheduleDraftSessionPersist,
} from "../session/draft-session-store";
import {
  applyEditorReadyStoryDocument,
  useStoryDocument,
} from "../store/story-document.store";
import type { Draft, DraftPipelineStage, StoryCreationBrief } from "../types";

import { useIsClientMounted } from "./useIsClientMounted";

export type RouteStoryDocumentLoadStatus = "ready" | "not_found";

export type UseRouteStoryDocumentResult = {
  isLoading: boolean;
  isNotFound: boolean;
  draft: Draft | null;
  script: FootieScript | null;
  updateScript: (
    updater: FootieScript | ((current: FootieScript) => FootieScript),
  ) => void;
  applyEditorReadyScript: (script: FootieScript) => void;
  setPipelineStage: (stage: DraftPipelineStage) => void;
  setCreationBrief: (brief: StoryCreationBrief) => void;
  schedulePersist: (stage?: DraftPipelineStage) => void;
  flushPersist: (
    stage?: DraftPipelineStage,
    scriptOverride?: FootieScript,
  ) => Promise<Draft | null>;
};

/**
 * Route-scoped story document load:
 * 1. Use StoryDocumentStore when draftId matches
 * 2. Else load from localStorage after client mount (hydrated via hydrateFromDraft)
 */
export function useRouteStoryDocument(draftId: string): UseRouteStoryDocumentResult {
  const isClient = useIsClientMounted();
  const {
    currentDraft,
    currentScript,
    draftId: storeDraftId,
    hydrateFromDraft,
    updateCurrentScript,
    setCurrentDraft,
  } = useStoryDocument();
  const [lookupResult, setLookupResult] = useState<{
    draftId: string;
    status: RouteStoryDocumentLoadStatus;
  } | null>(null);

  const storeReady =
    isClient &&
    storeDraftId === draftId &&
    currentDraft != null &&
    currentScript != null;

  useEffect(() => {
    if (!isClient || storeReady) {
      return;
    }

    let cancelled = false;

    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      const stored = getDraft(draftId);
      if (!stored) {
        setLookupResult({ draftId, status: "not_found" });
        return;
      }

      void hydrateDraftWithAudioAssets(stored).then((hydratedDraft) => {
        if (cancelled) {
          return;
        }
        hydrateFromDraft(hydratedDraft);
        setLookupResult({ draftId, status: "ready" });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [draftId, hydrateFromDraft, isClient, storeReady]);

  const draft = storeDraftId === draftId ? currentDraft : null;
  const script = storeDraftId === draftId ? currentScript : null;

  const updateScript = useCallback(
    (updater: FootieScript | ((current: FootieScript) => FootieScript)) => {
      updateCurrentScript(updater);
    },
    [updateCurrentScript],
  );

  const applyEditorReadyScript = useCallback((nextScript: FootieScript) => {
    applyEditorReadyStoryDocument(nextScript);
  }, []);

  const setPipelineStage = useCallback(
    (stage: DraftPipelineStage) => {
      if (storeDraftId !== draftId || !currentDraft) {
        return;
      }

      setCurrentDraft({ ...currentDraft, pipelineStage: stage });
    },
    [currentDraft, draftId, setCurrentDraft, storeDraftId],
  );

  const setCreationBrief = useCallback(
    (brief: StoryCreationBrief) => {
      if (storeDraftId !== draftId || !currentDraft) {
        return;
      }

      setCurrentDraft({ ...currentDraft, creationBrief: brief });
      void persistDraftSessionCreationBrief(draftId, brief);
    },
    [currentDraft, draftId, setCurrentDraft, storeDraftId],
  );

  const schedulePersist = useCallback(
    (stage?: DraftPipelineStage) => {
      scheduleDraftSessionPersist(draftId, stage);
    },
    [draftId],
  );

  const flushPersist = useCallback(
    (stage?: DraftPipelineStage, scriptOverride?: FootieScript) =>
      flushDraftSessionPersist(draftId, stage, scriptOverride),
    [draftId],
  );

  const statusForDraft =
    lookupResult?.draftId === draftId ? lookupResult.status : null;
  const isLoading = !isClient || (!storeReady && statusForDraft === null);
  const isNotFound = storeReady ? false : statusForDraft === "not_found";

  return {
    isLoading,
    isNotFound,
    draft,
    script,
    updateScript,
    applyEditorReadyScript,
    setPipelineStage,
    setCreationBrief,
    schedulePersist,
    flushPersist,
  };
}

/** @deprecated Prefer {@link useRouteStoryDocument}. */
export const useReviewStoryDocument = useRouteStoryDocument;

export type UseReviewStoryDocumentResult = UseRouteStoryDocumentResult;
