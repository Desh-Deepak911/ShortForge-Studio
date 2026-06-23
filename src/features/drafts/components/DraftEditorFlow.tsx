"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/layout";
import StoryWorkspace from "@/components/StoryWorkspace";
import { getDraft, resolveDraftScriptForEditor, serializeEditorStateForDraftAsync, updateDraft } from "@/features/drafts";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import {
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
} from "@/lib/studioUi";
import { applyStoryUpdate, syncFootieScript } from "@/lib/voiceover";

const SAVE_CONFIRMATION_MS = 3000;

interface DraftEditorFlowProps {
  draftId: string;
}

type DraftEdits = {
  draftId: string;
  script: FootieScript;
  selectedSceneIndex: number;
};

function loadDraftFromStorage(draftId: string): {
  notFound: boolean;
  script: FootieScript | null;
} {
  const loaded = getDraft(draftId);

  if (!loaded) {
    return { notFound: true, script: null };
  }

  return { notFound: false, script: resolveDraftScriptForEditor(loaded) };
}

/**
 * Loads a saved draft from localStorage and hydrates the existing editor shell.
 * No generation API calls — story data comes entirely from the draft store.
 */
export default function DraftEditorFlow({ draftId }: DraftEditorFlowProps) {
  const router = useRouter();
  const loadedDraft = useMemo(() => loadDraftFromStorage(draftId), [draftId]);
  const [draftEdits, setDraftEdits] = useState<DraftEdits | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveConfirmationTimeoutRef = useRef<number | null>(null);
  const exportSettingsRef = useRef<ExportSettings | null>(null);

  const isCurrentDraftEdits = draftEdits?.draftId === draftId;
  const script = isCurrentDraftEdits ? draftEdits.script : loadedDraft.script;
  const selectedSceneIndex = isCurrentDraftEdits ? draftEdits.selectedSceneIndex : 0;
  const notFound = loadedDraft.notFound;

  useEffect(() => {
    return () => {
      if (saveConfirmationTimeoutRef.current != null) {
        window.clearTimeout(saveConfirmationTimeoutRef.current);
      }
    };
  }, []);

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
      setDraftEdits((prev) => {
        const baseScript = prev?.draftId === draftId ? prev.script : loadedDraft.script;
        if (!baseScript) {
          return prev;
        }

        return {
          draftId,
          script: applyStoryUpdate(baseScript, next),
          selectedSceneIndex: prev?.draftId === draftId ? prev.selectedSceneIndex : 0,
        };
      });
      setSaveConfirmation(null);
    },
    [draftId, loadedDraft.script],
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
      const serializedScript = await serializeEditorStateForDraftAsync(studioScript, {
        exportSettings: exportSettingsRef.current ?? studioScript.exportSettings,
      });

      const updated = updateDraft(draftId, { script: serializedScript });

      if (!updated) {
        setSaveConfirmation("Could not save draft.");
        return;
      }

      setDraftEdits({
        draftId,
        script: resolveDraftScriptForEditor(updated),
        selectedSceneIndex: isCurrentDraftEdits ? draftEdits.selectedSceneIndex : 0,
      });
      exportSettingsRef.current = serializedScript.exportSettings ?? exportSettingsRef.current;
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
  }, [draftEdits, draftId, isCurrentDraftEdits, isSaving, studioScript]);

  const handleSelectedSceneChange = useCallback(
    (index: number) => {
      setDraftEdits((prev) => {
        const baseScript = prev?.draftId === draftId ? prev.script : loadedDraft.script;
        if (!baseScript) {
          return prev;
        }

        return {
          draftId,
          script: baseScript,
          selectedSceneIndex: index,
        };
      });
    },
    [draftId, loadedDraft.script],
  );

  const scrollToExport = useCallback(() => {
    document.getElementById("studio-export")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (notFound || !studioScript) {
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
              This story may have been deleted or saved in another browser.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
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
    <AppShell
      hasProject
      projectTitle={studioScript.title}
      projectMeta={`${totalDuration}s · ${studioScript.scenes.length} scenes`}
      onCreateStory={() => router.push("/create")}
      onExport={scrollToExport}
      exportDisabled={studioScript.scenes.length === 0}
      onSaveDraft={handleSaveDraft}
      saveDraftDisabled={isSaving}
      saveDraftConfirmation={saveConfirmation}
    >
      <StoryWorkspace
        script={studioScript}
        onScriptChange={handleStoryChange}
        selectedSceneIndex={previewSceneIndex}
        onSelectedSceneChange={handleSelectedSceneChange}
        onScrollToExport={scrollToExport}
        onExportSettingsChange={handleExportSettingsChange}
      />
    </AppShell>
  );
}
