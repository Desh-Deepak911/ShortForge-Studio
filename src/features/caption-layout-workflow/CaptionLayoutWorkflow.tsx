"use client";

import { buildResetCaptionLayoutPatch } from "@/features/caption-layout";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { applyPresentationScriptUpdate } from "@/lib/utils/voiceover";
import { studioCompactButton, studioSubtleText } from "@/lib/utils/studioUi";

import {
  applyCaptionLayoutToAllScenes,
  applyResetAllCaptionLayouts,
  buildCaptionLayoutPastePatch,
  buildCopyPreviousSceneLayoutPatch,
  buildProjectDefaultCaptionLayoutPatch,
  copyCaptionLayoutToClipboard,
  extractCopyableCaptionLayout,
  getCaptionLayoutClipboard,
  resolveCaptionLayoutWorkflowContext,
} from "./caption-layout-workflow.utils";

export interface CaptionLayoutWorkflowProps {
  scene: FootieScene;
  script: FootieScript;
  sceneIndex: number;
  onSceneLayoutChange: (patch: Partial<FootieScene>) => void;
  onScriptPresentationChange: (nextScript: FootieScript) => void;
}

const workflowButtonClass = `${studioCompactButton} px-2 py-1 text-[10px] sm:min-h-0 sm:py-1`;

export default function CaptionLayoutWorkflow({
  scene,
  script,
  sceneIndex,
  onSceneLayoutChange,
  onScriptPresentationChange,
}: CaptionLayoutWorkflowProps) {
  const { hasClipboard, canCopyPrevious } = resolveCaptionLayoutWorkflowContext(sceneIndex);

  const handleCopy = () => {
    copyCaptionLayoutToClipboard(
      extractCopyableCaptionLayout(scene.captionLayout, script.defaultCaptionLayout),
    );
  };

  const handlePaste = () => {
    const clipboard = getCaptionLayoutClipboard();
    if (!clipboard) {
      return;
    }

    onSceneLayoutChange(buildCaptionLayoutPastePatch(clipboard));
  };

  const handleCopyPrevious = () => {
    const patch = buildCopyPreviousSceneLayoutPatch(script, sceneIndex);
    if (!patch) {
      return;
    }

    onSceneLayoutChange(patch);
  };

  const handleApplyAll = () => {
    if (
      !window.confirm(
        "Apply this scene's caption layout to all scenes? Caption text and subtitles will not change.",
      )
    ) {
      return;
    }

    onScriptPresentationChange(applyCaptionLayoutToAllScenes(script, scene.id));
  };

  const handleReset = () => {
    onSceneLayoutChange(buildResetCaptionLayoutPatch());
  };

  const handleResetAll = () => {
    if (
      !window.confirm(
        "Reset caption layout on every scene to defaults? Caption text and subtitles will not change.",
      )
    ) {
      return;
    }

    onScriptPresentationChange(applyResetAllCaptionLayouts(script));
  };

  const handleSetDefault = () => {
    onScriptPresentationChange(
      applyPresentationScriptUpdate(
        script,
        buildProjectDefaultCaptionLayoutPatch(scene, script),
      ),
    );
  };

  return (
    <div className="space-y-2 border-t border-border/30 pt-3">
      <p className="text-[11px] font-semibold tracking-tight text-foreground/80">Workflow</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={workflowButtonClass} onClick={handleCopy}>
          Copy
        </button>
        <button
          type="button"
          className={workflowButtonClass}
          disabled={!hasClipboard}
          title={hasClipboard ? "Paste copied caption layout" : "Copy a layout first"}
          onClick={handlePaste}
        >
          Paste
        </button>
        <button
          type="button"
          className={workflowButtonClass}
          disabled={!canCopyPrevious}
          title={
            canCopyPrevious
              ? "Copy previous scene layout"
              : "No previous scene — copy previous is unavailable on the first scene"
          }
          onClick={handleCopyPrevious}
        >
          Previous
        </button>
        <button type="button" className={workflowButtonClass} onClick={handleApplyAll}>
          Apply All
        </button>
        <button type="button" className={workflowButtonClass} onClick={handleReset}>
          Reset
        </button>
        <button type="button" className={workflowButtonClass} onClick={handleSetDefault}>
          Set Default
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-[10px] font-medium text-foreground/70 underline-offset-2 hover:text-foreground/90 hover:underline"
          onClick={handleResetAll}
        >
          Reset All Scenes
        </button>
        {!canCopyPrevious ? (
          <p className={studioSubtleText}>First scene — no previous layout to copy.</p>
        ) : null}
      </div>
    </div>
  );
}
