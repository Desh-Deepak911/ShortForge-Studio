"use client";

import { useCallback, useEffect, useState } from "react";

import type { FootieScript } from "@/features/story/types";

import { getDraft } from "../services";
import { hydrateDraftWithAudioAssets } from "../services/draft-audio-storage.service";
import { flushDraftSessionPersist } from "../session/draft-session-store";
import {
  getStoryDocumentState,
  useStoryDocument,
} from "../store/story-document.store";
import type { Draft, DraftPipelineStage } from "../types";
import { isEditorReadyDraft, shouldOpenScriptReview } from "../utils/draft-pipeline.utils";

import { useIsClientMounted } from "./useIsClientMounted";

export type EditorStoryDocumentLoadStatus =
  | "loading"
  | "ready"
  | "not_found"
  | "needs_review";

export type UseEditorStoryDocumentResult = {
  isLoading: boolean;
  isNotFound: boolean;
  needsReviewRedirect: boolean;
  draft: Draft | null;
  script: FootieScript | null;
  updateScript: (
    updater: FootieScript | ((current: FootieScript) => FootieScript),
  ) => void;
  flushPersist: (
    stage?: DraftPipelineStage,
    scriptOverride?: FootieScript,
  ) => Promise<Draft | null>;
};

function storyDocumentHasScenes(draftId: string): boolean {
  const snapshot = getStoryDocumentState();
  return (
    snapshot.draftId === draftId &&
    snapshot.currentDraft != null &&
    snapshot.currentScript != null &&
    snapshot.currentScript.scenes.length > 0
  );
}

function storedDraftHasScenes(stored: Draft): boolean {
  return stored.script.scenes.length > 0 || stored.scenes.length > 0;
}

/**
 * Editor load order:
 * 1. StoryDocumentStore with matching draftId + scenes → ready immediately
 * 2. Else localStorage after client mount
 * 3. localStorage with scenes → hydrate into store
 * 4. Neither has scenes → needs_review (redirect to review flow)
 */
export function useEditorStoryDocument(draftId: string): UseEditorStoryDocumentResult {
  const isClient = useIsClientMounted();
  const {
    currentDraft,
    currentScript,
    draftId: storeDraftId,
    hydrateFromDraft,
    updateCurrentScript,
  } = useStoryDocument();
  const [lookupResult, setLookupResult] = useState<{
    draftId: string;
    status: EditorStoryDocumentLoadStatus;
  } | null>(null);

  const storeReadyWithScenes =
    isClient &&
    storeDraftId === draftId &&
    currentScript != null &&
    currentScript.scenes.length > 0;

  useEffect(() => {
    if (!isClient || storeReadyWithScenes) {
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

        if (
          storedDraftHasScenes(hydratedDraft) ||
          isEditorReadyDraft(hydratedDraft)
        ) {
          hydrateFromDraft(hydratedDraft);

          if (storyDocumentHasScenes(draftId)) {
            setLookupResult({ draftId, status: "ready" });
            return;
          }
        }

        if (
          shouldOpenScriptReview(hydratedDraft) ||
          !storedDraftHasScenes(hydratedDraft)
        ) {
          setLookupResult({ draftId, status: "needs_review" });
          return;
        }

        hydrateFromDraft(hydratedDraft);
        setLookupResult({
          draftId,
          status: storyDocumentHasScenes(draftId)
            ? "ready"
            : "needs_review",
        });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [draftId, hydrateFromDraft, isClient, storeReadyWithScenes]);

  const updateScript = useCallback(
    (updater: FootieScript | ((current: FootieScript) => FootieScript)) => {
      updateCurrentScript(updater);
    },
    [updateCurrentScript],
  );

  const flushPersist = useCallback(
    (stage?: DraftPipelineStage, scriptOverride?: FootieScript) =>
      flushDraftSessionPersist(draftId, stage, scriptOverride),
    [draftId],
  );

  const statusForDraft =
    lookupResult?.draftId === draftId ? lookupResult.status : null;
  const isLoading = !isClient || (!storeReadyWithScenes && statusForDraft === null);
  const isNotFound = storeReadyWithScenes ? false : statusForDraft === "not_found";
  const needsReviewRedirect = storeReadyWithScenes
    ? false
    : statusForDraft === "needs_review";

  const draft =
    storeDraftId === draftId && !isNotFound ? currentDraft : null;
  const script =
    storeDraftId === draftId && !isNotFound && !needsReviewRedirect
      ? currentScript
      : null;

  return {
    isLoading,
    isNotFound,
    needsReviewRedirect,
    draft,
    script,
    updateScript,
    flushPersist,
  };
}
