"use client";

import { applyPresentationScriptUpdate } from "@/lib/utils/voiceover";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  applyMotionPresetToAllScenes,
  buildMotionPresetPastePatch,
  buildProjectDefaultMotionPresetPatch,
  buildResetMotionPresetPatch,
  copyMotionPresetToClipboard,
  resolveMotionPresetWorkflowContext,
} from "@/features/caption-animation-presets";
import { studioCompactButton } from "@/lib/utils/studioUi";

import {
  applyCaptionAnimationToAllScenes,
  buildCaptionAnimationPastePatch,
  buildProjectDefaultCaptionAnimationPatch,
  buildResetCaptionAnimationPatch,
  copyCaptionAnimationToClipboard,
  extractCopyableCaptionAnimation,
  getCaptionAnimationClipboard,
  resolveCaptionAnimationWorkflowContext,
} from "./caption-animation-workflow.utils";

export interface CaptionAnimationWorkflowProps {
  scene: FootieScene;
  script: FootieScript;
  onSceneAnimationChange: (patch: Partial<FootieScene>) => void;
  onScriptPresentationChange: (nextScript: FootieScript) => void;
}

const workflowButtonClass = `${studioCompactButton} px-2 py-1 text-[10px] sm:min-h-0 sm:py-1`;

export default function CaptionAnimationWorkflow({
  scene,
  script,
  onSceneAnimationChange,
  onScriptPresentationChange,
}: CaptionAnimationWorkflowProps) {
  const { hasClipboard } = resolveCaptionAnimationWorkflowContext();
  const motionContext = resolveMotionPresetWorkflowContext(scene);

  const handleCopy = () => {
    copyCaptionAnimationToClipboard(
      extractCopyableCaptionAnimation(scene.captionAnimation, script.defaultCaptionAnimation),
    );
  };

  const handlePaste = () => {
    const clipboard = getCaptionAnimationClipboard();
    if (!clipboard) {
      return;
    }

    onSceneAnimationChange(buildCaptionAnimationPastePatch(clipboard));
  };

  const handleApplyAll = () => {
    if (
      !window.confirm(
        "Apply this scene's caption animation to all scenes? Caption text, layout, and style will not change.",
      )
    ) {
      return;
    }

    onScriptPresentationChange(applyCaptionAnimationToAllScenes(script, scene.id));
  };

  const handleReset = () => {
    onSceneAnimationChange(buildResetCaptionAnimationPatch());
  };

  const handleSetDefault = () => {
    onScriptPresentationChange(
      applyPresentationScriptUpdate(
        script,
        buildProjectDefaultCaptionAnimationPatch(scene, script),
      ),
    );
  };

  const handleCopyMotionPreset = () => {
    const motionPresetId =
      scene.captionAnimation?.motionPresetId ?? script.defaultCaptionAnimation?.motionPresetId;
    if (motionPresetId) {
      copyMotionPresetToClipboard(motionPresetId);
    }
  };

  const handlePasteMotionPreset = () => {
    const patch = buildMotionPresetPastePatch(scene);
    if (patch) {
      onSceneAnimationChange(patch);
    }
  };

  const handleApplyMotionPresetAll = () => {
    if (
      !window.confirm(
        "Apply this scene's motion preset to all scenes? Caption text, layout, and style will not change.",
      )
    ) {
      return;
    }

    const next = applyMotionPresetToAllScenes(script, scene.id);
    if (next) {
      onScriptPresentationChange(next);
    }
  };

  const handleResetMotionPreset = () => {
    const patch = buildResetMotionPresetPatch(scene);
    if (patch) {
      onSceneAnimationChange(patch);
    }
  };

  const handleSetMotionPresetDefault = () => {
    const patch = buildProjectDefaultMotionPresetPatch(scene, script);
    if (!patch) {
      return;
    }

    onScriptPresentationChange(applyPresentationScriptUpdate(script, patch));
  };

  return (
    <div className="space-y-3 border-t border-border/30 pt-3">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-tight text-foreground/80">Workflow</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={workflowButtonClass} onClick={handleCopy}>
            Copy
          </button>
          <button
            type="button"
            className={workflowButtonClass}
            disabled={!hasClipboard}
            title={hasClipboard ? "Paste copied caption animation" : "Copy animation settings first"}
            onClick={handlePaste}
          >
            Paste
          </button>
          <button type="button" className={workflowButtonClass} onClick={handleApplyAll}>
            Apply All
          </button>
          <button type="button" className={workflowButtonClass} onClick={handleReset}>
            Reset Animation
          </button>
          <button type="button" className={workflowButtonClass} onClick={handleSetDefault}>
            Set Default
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-tight text-foreground/80">Motion Preset</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={workflowButtonClass}
            disabled={!motionContext.hasMotionPreset}
            onClick={handleCopyMotionPreset}
          >
            Copy Preset
          </button>
          <button
            type="button"
            className={workflowButtonClass}
            disabled={!motionContext.hasMotionPresetClipboard}
            onClick={handlePasteMotionPreset}
          >
            Paste Preset
          </button>
          <button
            type="button"
            className={workflowButtonClass}
            disabled={!motionContext.hasMotionPreset}
            onClick={handleApplyMotionPresetAll}
          >
            Apply Preset All
          </button>
          <button
            type="button"
            className={workflowButtonClass}
            disabled={!motionContext.hasMotionPreset}
            onClick={handleResetMotionPreset}
          >
            Reset Preset
          </button>
          <button
            type="button"
            className={workflowButtonClass}
            disabled={!motionContext.hasMotionPreset}
            onClick={handleSetMotionPresetDefault}
          >
            Set Preset Default
          </button>
        </div>
      </div>
    </div>
  );
}
