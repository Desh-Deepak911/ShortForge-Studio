"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/layout";
import StoryWorkspace from "@/components/StoryWorkspace";
import DraftLoadingState from "@/features/drafts/components/DraftLoadingState";
import { useEditorStoryDocument } from "@/features/drafts/hooks/useEditorStoryDocument";
import { useDraftPersistFeedback } from "@/features/drafts/hooks/useDraftPersistFeedback";
import type { Draft } from "@/features/drafts";
import {
  CONTENT_TIMELINE_REBUILD_DEBOUNCE_MS,
  classifyStoryPatch,
  resolveStoryEvolutionDebounceMs,
  resolveTimelineRebuildPolicy,
} from "@/features/editor/story-patches";
import { applyStoryEvolutionOnEdit } from "@/features/editor/story-evolution";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  getStorySyncDirtySignature,
  resolveStorySyncBanner,
  resolveStorySyncEditKind,
  resolvePresentationSyncEditKind,
  StorySyncProvider,
  type StorySyncContextValue,
  type StorySynchronizationState,
} from "@/features/story-sync";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import {
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
} from "@/lib/utils/studioUi";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";
import { applyStoryUpdate, applyPresentationStoryUpdate, applyNarrationRebuildStoryUpdate, type StoryScriptChangeOptions } from "@/lib/utils/voiceover";

const SAVE_CONFIRMATION_MS = 3000;

interface DraftEditorFlowProps {
  draftId: string;
}

type DraftEdits = {
  draftId: string;
  script: FootieScript;
  selectedSceneIndex: number;
};

/**
 * Editor reads StoryDocumentStore first; localStorage is fallback hydration only.
 */
export default function DraftEditorFlow({ draftId }: DraftEditorFlowProps) {
  const router = useRouter();
  const {
    isLoading,
    isNotFound,
    needsReviewRedirect,
    draft,
    script: documentScript,
    updateScript,
    flushPersist,
  } = useEditorStoryDocument(draftId);

  useEffect(() => {
    if (isLoading || isNotFound) {
      return;
    }

    if (needsReviewRedirect) {
      router.replace(`/create/review/${draftId}`);
    }
  }, [draftId, isLoading, isNotFound, needsReviewRedirect, router]);

  if (isLoading || needsReviewRedirect) {
    return <DraftLoadingState />;
  }

  return (
    <DraftEditorFlowBody
      key={draftId}
      draftId={draftId}
      documentScript={documentScript}
      draft={draft}
      router={router}
      updateScript={updateScript}
      flushPersist={flushPersist}
      isNotFound={isNotFound}
    />
  );
}

function DraftEditorFlowBody({
  draftId,
  documentScript,
  router,
  updateScript,
  flushPersist,
  isNotFound,
  draft,
}: DraftEditorFlowProps & {
  documentScript: FootieScript | null;
  router: ReturnType<typeof useRouter>;
  updateScript: (
    updater: FootieScript | ((current: FootieScript) => FootieScript),
  ) => void;
  flushPersist: (
    stage?: Draft["pipelineStage"],
    scriptOverride?: FootieScript,
  ) => Promise<Draft | null>;
  isNotFound: boolean;
  draft: Draft | null;
}) {
  const [draftEdits, setDraftEdits] = useState<DraftEdits | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [timelineEpoch, setTimelineEpoch] = useState(0);
  const [storySyncState, setStorySyncState] = useState<StorySynchronizationState>(() =>
    createInitialStorySynchronizationState(),
  );
  const [dismissedSyncSignature, setDismissedSyncSignature] = useState<string | null>(null);
  const { persistWarning, autosaveSavedMessage } = useDraftPersistFeedback(draftId);
  const saveConfirmationTimeoutRef = useRef<number | null>(null);
  const exportSettingsRef = useRef<ExportSettings | null>(null);
  const draftEditsRef = useRef<DraftEdits | null>(null);
  const storyEvolutionDebounceRef = useRef<number | null>(null);
  const storyEvolutionPendingRef = useRef<{ prevScript: FootieScript; nextScript: FootieScript } | null>(
    null,
  );
  const contentTimelineDebounceRef = useRef<number | null>(null);
  const timelineEpochRef = useRef(0);

  const bumpTimelineEpoch = useCallback(() => {
    timelineEpochRef.current += 1;
    setTimelineEpoch(timelineEpochRef.current);
  }, []);

  const clearContentTimelineDebounce = useCallback(() => {
    if (contentTimelineDebounceRef.current != null) {
      window.clearTimeout(contentTimelineDebounceRef.current);
      contentTimelineDebounceRef.current = null;
    }
  }, []);

  const scheduleContentTimelineRebuild = useCallback(() => {
    clearContentTimelineDebounce();
    contentTimelineDebounceRef.current = window.setTimeout(() => {
      contentTimelineDebounceRef.current = null;
      bumpTimelineEpoch();
    }, CONTENT_TIMELINE_REBUILD_DEBOUNCE_MS);
  }, [bumpTimelineEpoch, clearContentTimelineDebounce]);

  const flushStoryEvolution = useCallback(() => {
    const pending = storyEvolutionPendingRef.current;
    if (!pending) {
      return;
    }

    applyStoryEvolutionOnEdit({
      storyId: draftId,
      prevScript: pending.prevScript,
      nextScript: pending.nextScript,
    });
    storyEvolutionPendingRef.current = null;
  }, [draftId]);

  useEffect(() => {
    draftEditsRef.current = draftEdits;
  }, [draftEdits]);

  useEffect(() => {
    return () => {
      if (saveConfirmationTimeoutRef.current != null) {
        window.clearTimeout(saveConfirmationTimeoutRef.current);
      }
      if (storyEvolutionDebounceRef.current != null) {
        window.clearTimeout(storyEvolutionDebounceRef.current);
      }
      clearContentTimelineDebounce();
      flushStoryEvolution();
    };
  }, [clearContentTimelineDebounce, flushStoryEvolution]);

  const isCurrentDraftEdits = draftEdits?.draftId === draftId;
  // Already synced: draft load / store hydration, or handleStoryChange boundary.
  const studioScript = isCurrentDraftEdits ? draftEdits.script : documentScript;
  const selectedSceneIndex = isCurrentDraftEdits ? draftEdits.selectedSceneIndex : 0;

  const totalDuration = studioScript?.totalDuration ?? 0;

  const previewSceneIndex =
    studioScript && studioScript.scenes.length > 0
      ? Math.min(selectedSceneIndex, studioScript.scenes.length - 1)
      : 0;

  const handleStoryChange = useCallback(
    (next: FootieScript, options?: StoryScriptChangeOptions) => {
      const prev = draftEditsRef.current;
      const baseScript = prev?.draftId === draftId ? prev.script : documentScript;
      if (!baseScript) {
        return;
      }

      const isPresentation = options?.intent === "presentation";
      const isNarrationRebuild = options?.intent === "narration_rebuild";
      // Single editor sync boundary — patch helpers do not sync.
      const synced = isPresentation
        ? applyPresentationStoryUpdate(baseScript, next)
        : isNarrationRebuild
          ? applyNarrationRebuildStoryUpdate(baseScript, next)
          : applyStoryUpdate(baseScript, next);
      const classification = classifyStoryPatch(baseScript, synced);
      const timelinePolicy = resolveTimelineRebuildPolicy(baseScript, synced, classification);
      const evolutionDebounceMs = resolveStoryEvolutionDebounceMs(classification);

      storyEvolutionPendingRef.current = {
        prevScript: storyEvolutionPendingRef.current?.prevScript ?? baseScript,
        nextScript: synced,
      };

      if (storyEvolutionDebounceRef.current != null) {
        window.clearTimeout(storyEvolutionDebounceRef.current);
      }

      storyEvolutionDebounceRef.current = window.setTimeout(() => {
        flushStoryEvolution();
        storyEvolutionDebounceRef.current = null;
      }, evolutionDebounceMs);

      if (timelinePolicy === "immediate") {
        clearContentTimelineDebounce();
        bumpTimelineEpoch();
      } else if (timelinePolicy === "debounced") {
        scheduleContentTimelineRebuild();
      }

      const syncKind = isPresentation
        ? resolvePresentationSyncEditKind(classification)
        : isNarrationRebuild
          ? "narration"
          : resolveStorySyncEditKind(baseScript, synced, classification);
      if (syncKind) {
        setStorySyncState((current) => applyStorySyncEdit(current, syncKind));
      }

      const nextEdits: DraftEdits = {
        draftId,
        script: synced,
        selectedSceneIndex: prev?.draftId === draftId ? prev.selectedSceneIndex : 0,
      };

      draftEditsRef.current = nextEdits;
      setDraftEdits(nextEdits);
      updateScript(synced);
      setSaveConfirmation(null);
    },
    [
      bumpTimelineEpoch,
      clearContentTimelineDebounce,
      documentScript,
      draftId,
      flushStoryEvolution,
      scheduleContentTimelineRebuild,
      updateScript,
    ],
  );

  const handleExportSettingsChange = useCallback((settings: ExportSettings) => {
    exportSettingsRef.current = settings;
    setSaveConfirmation(null);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!studioScript || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      // studioScript is already synced at the editor boundary; only merge export settings.
      const scriptToSave: FootieScript = {
        ...studioScript,
        exportSettings:
          exportSettingsRef.current ?? studioScript.exportSettings,
      };

      updateScript(scriptToSave);
      // Flush deferred content evolution and any pending caption/motion timeline rebuild.
      if (storyEvolutionDebounceRef.current != null) {
        window.clearTimeout(storyEvolutionDebounceRef.current);
        storyEvolutionDebounceRef.current = null;
      }
      flushStoryEvolution();
      if (contentTimelineDebounceRef.current != null) {
        clearContentTimelineDebounce();
        bumpTimelineEpoch();
      }

      const updated = await flushPersist("editor_ready", scriptToSave);

      if (!updated) {
        setSaveConfirmation("Could not save draft.");
        return;
      }

      const savedEdits: DraftEdits = {
        draftId,
        script: updated.script,
        selectedSceneIndex: isCurrentDraftEdits ? draftEdits!.selectedSceneIndex : 0,
      };
      draftEditsRef.current = savedEdits;
      setDraftEdits(savedEdits);
      exportSettingsRef.current = updated.script.exportSettings ?? exportSettingsRef.current;
      setSaveConfirmation("Draft saved.");

      if (saveConfirmationTimeoutRef.current != null) {
        window.clearTimeout(saveConfirmationTimeoutRef.current);
      }

      saveConfirmationTimeoutRef.current = window.setTimeout(() => {
        setSaveConfirmation(null);
      }, SAVE_CONFIRMATION_MS);
    } finally {
      setIsSaving(false);
    }
  }, [
    bumpTimelineEpoch,
    clearContentTimelineDebounce,
    draftEdits,
    draftId,
    flushPersist,
    flushStoryEvolution,
    isCurrentDraftEdits,
    isSaving,
    studioScript,
    updateScript,
  ]);

  const handleSelectedSceneChange = useCallback(
    (index: number) => {
      const prev = draftEditsRef.current;
      const baseScript = prev?.draftId === draftId ? prev.script : documentScript;
      if (!baseScript) {
        return;
      }

      const nextEdits: DraftEdits = {
        draftId,
        script: baseScript,
        selectedSceneIndex: index,
      };
      draftEditsRef.current = nextEdits;
      setDraftEdits(nextEdits);
    },
    [documentScript, draftId],
  );

  const applySyncEdit = useCallback((kind: Parameters<StorySyncContextValue["applySyncEdit"]>[0], at?: string | null) => {
    setStorySyncState((current) => applyStorySyncEdit(current, kind, at));
  }, []);

  const dismissSyncBanner = useCallback(() => {
    setDismissedSyncSignature(getStorySyncDirtySignature(storySyncState));
  }, [storySyncState]);

  const activeSyncBanner = resolveStorySyncBanner(storySyncState);
  const syncDirtySignature = getStorySyncDirtySignature(storySyncState);
  const isBannerDismissed =
    activeSyncBanner != null && dismissedSyncSignature === syncDirtySignature;

  const storySyncValue = useMemo<StorySyncContextValue>(
    () => ({
      state: storySyncState,
      applySyncEdit,
      dismissBanner: dismissSyncBanner,
      isBannerDismissed,
    }),
    [applySyncEdit, dismissSyncBanner, isBannerDismissed, storySyncState],
  );

  if (isNotFound || !studioScript || studioScript.scenes.length === 0) {
    return (
      <AppShell
        hasProject={false}
        onCreateStory={() => router.push("/create")}
        onExport={() => undefined}
        exportDisabled
      >
        <div className={`${studioPanel} mx-auto max-w-lg space-y-5 px-5 py-10 sm:px-8 sm:py-12`}>
          <div className="text-center">
            <h1 className={studioSectionTitle}>Draft not found</h1>
            <p className={`${studioSectionDesc} mt-2`}>
              {isNotFound
                ? "This project could not be found. It may have been deleted or saved in another browser."
                : "Build your storyboard to continue editing."}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            {!isNotFound ? (
              <Link
                href={`/create/review/${draftId}`}
                className={`${studioPrimaryButton} w-full sm:w-auto`}
              >
                Back to review
              </Link>
            ) : null}
            <Link href="/drafts" className={`${studioPrimaryButton} w-full sm:w-auto`}>
              View drafts
            </Link>
            <Link href="/create" className={`${studioSecondaryButton} w-full sm:w-auto`}>
              Create a story
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <StorySyncProvider value={storySyncValue}>
      <StoryWorkspace
        script={studioScript}
        timelineEpoch={timelineEpoch}
        onScriptChange={handleStoryChange}
        selectedSceneIndex={previewSceneIndex}
        onSelectedSceneChange={handleSelectedSceneChange}
        onExportSettingsChange={handleExportSettingsChange}
        projectTitle={studioScript.title}
        projectMeta={`${formatDisplayDurationSec(totalDuration)} · ${studioScript.scenes.length} scenes`}
        onSaveDraft={handleSaveDraft}
        saveDraftDisabled={isSaving}
        saveDraftConfirmation={saveConfirmation ?? autosaveSavedMessage}
        persistWarning={persistWarning}
        exportDisabled={studioScript.scenes.length === 0}
        draftId={draftId}
        scriptMode={draft?.creationBrief?.scriptMode}
        creationBrief={draft?.creationBrief}
      />
    </StorySyncProvider>
  );
}
