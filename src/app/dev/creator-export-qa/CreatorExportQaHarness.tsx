"use client";

/**
 * Client shell for the creator-export journey QA harness.
 * Composes production StoryWorkspace and keeps an honest in-memory
 * Save Draft / Reopen checkpoint — never application draft storage or providers.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import StoryWorkspace from "@/components/StoryWorkspace";
import {
  buildCreatorExportJourneyStory,
  cloneCreatorExportQaCheckpoint,
  CREATOR_EXPORT_QA_DRAFT_ID,
} from "@/features/export/qa/build-creator-export-journey-story";
import type { FootieScript } from "@/features/story/types";

const SESSION_NOTICE =
  "Local QA session — Save Draft stores an in-memory checkpoint only." as const;

export type CreatorExportQaSessionChromeProps = {
  readonly canReopen: boolean;
  readonly onReopen: () => void;
  readonly onReset: () => void;
  readonly reopenRef: RefObject<HTMLButtonElement | null>;
  readonly resetRef: RefObject<HTMLButtonElement | null>;
};

/** External QA session controls (Reopen / Reset) — rendered without StoryWorkspace. */
export function CreatorExportQaSessionChrome(
  props: CreatorExportQaSessionChromeProps,
) {
  const { canReopen, onReopen, onReset, reopenRef, resetRef } = props;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-creator-export-qa-session-chrome
    >
      <button
        ref={reopenRef}
        type="button"
        onClick={onReopen}
        disabled={!canReopen}
        className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        data-creator-export-qa-reopen
      >
        Reopen saved checkpoint
      </button>
      <button
        ref={resetRef}
        type="button"
        onClick={onReset}
        className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        data-creator-export-qa-reset
      >
        Reset QA story
      </button>
    </div>
  );
}

export function CreatorExportQaHarness() {
  const [script, setScript] = useState<FootieScript>(() =>
    buildCreatorExportJourneyStory(),
  );
  const [savedCheckpoint, setSavedCheckpoint] = useState<FootieScript | null>(
    null,
  );
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);

  /** Latest committed story — Save must not read a stale render closure. */
  const latestScriptRef = useRef<FootieScript>(script);
  /** Detached checkpoint authority — Reopen must not race a stale state cell. */
  const savedCheckpointRef = useRef<FootieScript | null>(null);

  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  const projectMeta = useMemo(() => {
    const sceneCount = script.scenes.length;
    const durationSec = Math.round(script.totalDuration ?? 0);
    return `${durationSec}s · ${sceneCount} scenes · in-memory QA`;
  }, [script.scenes.length, script.totalDuration]);

  const handleScriptChange = useCallback((next: FootieScript) => {
    latestScriptRef.current = next;
    setScript(next);
    setSaveConfirmation(null);
  }, []);

  const handleSaveDraft = useCallback(() => {
    const snapshot = cloneCreatorExportQaCheckpoint(latestScriptRef.current);
    savedCheckpointRef.current = snapshot;
    setSavedCheckpoint(snapshot);
    setSaveConfirmation("In-memory checkpoint saved for this QA session.");
  }, []);

  const handleReopen = useCallback(() => {
    const saved = savedCheckpointRef.current;
    if (!saved) return;
    const restored = cloneCreatorExportQaCheckpoint(saved);
    latestScriptRef.current = restored;
    setScript(restored);
    setSelectedSceneIndex(0);
    setWorkspaceKey((key) => key + 1);
    setSaveConfirmation(null);
    queueMicrotask(() => {
      reopenButtonRef.current?.focus();
    });
  }, []);

  const handleReset = useCallback(() => {
    const pristine = buildCreatorExportJourneyStory();
    latestScriptRef.current = pristine;
    savedCheckpointRef.current = null;
    setScript(pristine);
    setSavedCheckpoint(null);
    setSelectedSceneIndex(0);
    setWorkspaceKey((key) => key + 1);
    setSaveConfirmation(null);
    queueMicrotask(() => {
      resetButtonRef.current?.focus();
    });
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-creator-export-qa-harness
    >
      <header className="shrink-0 border-b border-border bg-background/95 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Local development QA harness · Creator export journey
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Creator Export Journey QA
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Deterministic in-memory story for the real editor journey: Visual
              Retention Presets, pacing, motion/look, engagement, ShortForge
              outro, Preview, Browser, and Headless export. Capabilities follow
              the live visual-retention API. No providers and no application
              draft storage. A page reload clears the in-memory checkpoint.
            </p>
            <p
              className="max-w-2xl text-xs text-muted-foreground"
              data-creator-export-qa-session-notice
            >
              {SESSION_NOTICE}
            </p>
            <p
              className="max-w-2xl text-xs text-muted-foreground"
              data-creator-export-qa-fixture
            >
              Fixture: 3 narration scenes · Scene 1 pacing/motion/look baseline ·
              Scene 2 custom keyframes + freeform brightness · Scene 3 Share
              Ready closing target · local /file.svg only
            </p>
          </div>
          <CreatorExportQaSessionChrome
            canReopen={savedCheckpoint != null}
            onReopen={handleReopen}
            onReset={handleReset}
            reopenRef={reopenButtonRef}
            resetRef={resetButtonRef}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <StoryWorkspace
          key={workspaceKey}
          script={script}
          onScriptChange={handleScriptChange}
          selectedSceneIndex={selectedSceneIndex}
          onSelectedSceneChange={setSelectedSceneIndex}
          projectTitle={script.title}
          projectMeta={projectMeta}
          draftId={CREATOR_EXPORT_QA_DRAFT_ID}
          onSaveDraft={handleSaveDraft}
          saveDraftConfirmation={saveConfirmation}
        />
      </div>
    </div>
  );
}
