"use client";

/**
 * Client shell for the Visual Retention Presets QA harness.
 * Composes production StoryWorkspace (Project Inspector presets panel, native
 * pacing/motion/look/engagement/outro, Preview, Browser, and Headless export).
 * Story state is in-memory only — no draft persistence or browser story storage.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import StoryWorkspace from "@/components/StoryWorkspace";
import { buildVisualRetentionPresetsQaStory } from "@/features/visual-retention-presets/qa/build-visual-retention-presets-qa-story";
import type { FootieScript } from "@/features/story/types";

/**
 * Stable in-memory project key for InspectorContext.storyId.
 * Required so the Project Inspector presets surface can mount (fail-closed without it).
 * Not a persisted draft id — Save Draft remains disabled and no-op.
 */
const VISUAL_RETENTION_PRESETS_QA_DRAFT_ID =
  "visual-retention-presets-qa" as const;

export function VisualRetentionPresetsQaHarness() {
  const [script, setScript] = useState<FootieScript>(() =>
    buildVisualRetentionPresetsQaStory(),
  );
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  const projectMeta = useMemo(() => {
    const sceneCount = script.scenes.length;
    const durationSec = Math.round(script.totalDuration ?? 0);
    return `${durationSec}s · ${sceneCount} scenes · in-memory QA`;
  }, [script.scenes.length, script.totalDuration]);

  const handleScriptChange = useCallback((next: FootieScript) => {
    setScript(next);
  }, []);

  const handleReset = useCallback(() => {
    setScript(buildVisualRetentionPresetsQaStory());
    setSelectedSceneIndex(0);
    setWorkspaceKey((key) => key + 1);
    queueMicrotask(() => {
      resetButtonRef.current?.focus();
    });
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-visual-retention-presets-qa-harness
    >
      <header className="shrink-0 border-b border-border bg-background/95 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Local development QA harness · Visual Retention Presets
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Visual Retention Presets QA
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Deterministic in-memory story for exercising the real editor:
              Visual Retention Presets in Project Inspector, native Visual
              Pacing, motion/look, engagement, ShortForge outro, Preview,
              Browser, and Headless export. Visibility follows the live
              visual-retention capability API. No online story generation, no
              provider requests, and no draft persistence.
            </p>
            <p
              className="max-w-2xl text-xs text-muted-foreground"
              data-visual-retention-presets-qa-fixture
            >
              Fixture: 3 narration scenes · Scene 1 full pacing/motion/look ·
              Scene 2 manual custom keyframes + freeform adjustment · Scene 3
              closing-scene engagement/outro target · local /file.svg only
            </p>
          </div>
          <button
            ref={resetButtonRef}
            type="button"
            onClick={handleReset}
            className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            data-visual-retention-presets-qa-reset
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
          draftId={VISUAL_RETENTION_PRESETS_QA_DRAFT_ID}
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
