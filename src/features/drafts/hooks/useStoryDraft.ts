"use client";

import { useCallback, useMemo, useState } from "react";

import type { FootieScript } from "@/features/story/types";

import { getDraft, updateDraft } from "../services";
import type { StoryDraft } from "../types";

interface UseStoryDraftResult {
  draft: StoryDraft | null;
  loading: boolean;
  notFound: boolean;
  saveScript: (script: FootieScript) => void;
}

export function useStoryDraft(draftId: string): UseStoryDraftResult {
  const loadedDraft = useMemo(() => getDraft(draftId), [draftId]);
  const [savedDraft, setSavedDraft] = useState<StoryDraft | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);

  const draft = useMemo(() => {
    if (savedDraftId === draftId && savedDraft) {
      return savedDraft;
    }
    return loadedDraft;
  }, [draftId, loadedDraft, savedDraft, savedDraftId]);

  const saveScript = useCallback(
    (script: FootieScript) => {
      const updated = updateDraft(draftId, { script });
      if (updated) {
        setSavedDraft(updated);
        setSavedDraftId(draftId);
      }
    },
    [draftId],
  );

  return {
    draft,
    loading: false,
    notFound: !draft,
    saveScript,
  };
}
