"use client";

/**
 * Client shell for the Visual pacing QA harness.
 * Composes production StoryWorkspace (inspector, preview, capability, export).
 * Story state is in-memory only — no draft persistence or browser story storage.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import StoryWorkspace from "@/components/StoryWorkspace";
import { buildVisualPacingQaStory } from "@/features/visual-beat-density/qa/build-visual-pacing-qa-story";
import type { FootieScript } from "@/features/story/types";

export function VisualPacingQaHarness() {
  const [script, setScript] = useState<FootieScript>(() =>
    buildVisualPacingQaStory(),
  );
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  const projectMeta = useMemo(() => {
    const sceneCount = script.scenes.length;
    const durationSec = Math.round(script.totalDuration ?? 0);
    return `${durationSec}s · ${sceneCount} scene · in-memory QA`;
  }, [script.scenes.length, script.totalDuration]);

  const handleScriptChange = useCallback((next: FootieScript) => {
    setScript(next);
  }, []);

  const handleReset = useCallback(() => {
    setScript(buildVisualPacingQaStory());
    setSelectedSceneIndex(0);
    setWorkspaceKey((key) => key + 1);
    queueMicrotask(() => {
      resetButtonRef.current?.focus();
    });
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-visual-pacing-qa-harness
    >
      <header className="shrink-0 border-b border-border bg-background/95 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Local development QA harness · Visual pacing
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Visual pacing QA
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Deterministic in-memory story for exercising the real Visual pacing
              and Visual sequence controls together with Preview, Browser, and
              Headless export. No online story generation, no provider requests,
              and no draft persistence.
            </p>
          </div>
          <button
            ref={resetButtonRef}
            type="button"
            onClick={handleReset}
            className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            data-visual-pacing-qa-reset
          >
            Reset QA story
          </button>
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
          onSaveDraft={() => {
            /* intentionally no-op — harness never persists */
          }}
          saveDraftDisabled
          persistWarning="Local QA harness — in-memory only. Save Draft is disabled."
        />
      </div>
    </div>
  );
}
