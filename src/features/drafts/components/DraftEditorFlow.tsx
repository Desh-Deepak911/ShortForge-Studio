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
import { applyStoryEvolutionOnEdit } from "@/features/editor/story-evolution";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import {
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
} from "@/lib/utils/studioUi";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";
import { applyStoryUpdate, syncFootieScript } from "@/lib/utils/voiceover";

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
  const { persistWarning, autosaveSavedMessage } = useDraftPersistFeedback(draftId);
  const saveConfirmationTimeoutRef = useRef<number | null>(null);
  const exportSettingsRef = useRef<ExportSettings | null>(null);
  const draftEditsRef = useRef<DraftEdits | null>(null);

  useEffect(() => {
    draftEditsRef.current = draftEdits;
  }, [draftEdits]);

  useEffect(() => {
    return () => {
      if (saveConfirmationTimeoutRef.current != null) {
        window.clearTimeout(saveConfirmationTimeoutRef.current);
      }
    };
  }, []);

  const isCurrentDraftEdits = draftEdits?.draftId === draftId;
  const script = isCurrentDraftEdits ? draftEdits.script : documentScript;
  const selectedSceneIndex = isCurrentDraftEdits ? draftEdits.selectedSceneIndex : 0;

  const studioScript = useMemo((): FootieScript | null => {
    if (!script) {
      return null;
    }

    return syncFootieScript(script);
  }, [script]);

  const totalDuration = studioScript?.totalDuration ?? 0;

  const previewSceneIndex =
    studioScript && studioScript.scenes.length > 0
      ? Math.min(selectedSceneIndex, studioScript.scenes.length - 1)
      : 0;

  const handleStoryChange = useCallback(
    (next: FootieScript) => {
      const prev = draftEditsRef.current;
      const baseScript = prev?.draftId === draftId ? prev.script : documentScript;
      if (!baseScript) {
        return;
      }

      const merged = applyStoryUpdate(baseScript, next);
      applyStoryEvolutionOnEdit({
        storyId: draftId,
        prevScript: syncFootieScript(baseScript),
        nextScript: merged,
      });
      const nextEdits: DraftEdits = {
        draftId,
        script: merged,
        selectedSceneIndex: prev?.draftId === draftId ? prev.selectedSceneIndex : 0,
      };

      draftEditsRef.current = nextEdits;
      setDraftEdits(nextEdits);
      updateScript(merged);
      setSaveConfirmation(null);
    },
    [documentScript, draftId, updateScript],
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
      const scriptToSave = syncFootieScript({
        ...studioScript,
        exportSettings:
          exportSettingsRef.current ?? studioScript.exportSettings,
      });

      updateScript(scriptToSave);
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
  }, [draftEdits, draftId, flushPersist, isCurrentDraftEdits, isSaving, studioScript, updateScript]);

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
    <StoryWorkspace
      script={studioScript}
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
  );
}
