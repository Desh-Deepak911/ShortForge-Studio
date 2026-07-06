"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import StudioAccordion from "@/components/studio-shell/StudioAccordion";
import {
  buildSceneCaptionPresetPatch,
  buildSceneSubtitleEffectPatch,
  CaptionAnimationControl,
  CaptionLayoutControl,
  CaptionPresetPanel,
  CaptionStyleControl,
} from "@/features/caption-engine";
import { CaptionAnimationWorkflow } from "@/features/caption-animation-workflow";
import { CaptionLayoutWorkflow } from "@/features/caption-layout-workflow";
import CaptionModeControl from "@/features/editor/components/CaptionModeControl";
import SubtitleEffectControl from "@/features/editor/components/SubtitleEffectControl";
import {
  clearPendingSceneCaptionDraft,
  registerPendingSceneCaptionDraft,
  registerSceneCaptionDraftCancel,
} from "@/features/editor/scene-caption-drafts/scene-caption-draft-registry";
import { DEFAULT_SCENE_SUBTITLE } from "@/features/story/utils";
import {
  studioFieldLabel,
  studioWorkspaceTabActive,
  studioWorkspaceTabInactive,
  studioWorkspaceTabTrack,
  studioTextarea,
} from "@/lib/utils/studioUi";
import type { ScenePresentationPatch } from "@/lib/utils/voiceover";
import type { CaptionMode, FootieScript } from "@/features/story/types";

import {
  readCaptionWorkspaceTab,
  writeCaptionWorkspaceTab,
} from "./caption-workspace.session";
import {
  CAPTION_WORKSPACE_TAB_LABELS,
  CAPTION_WORKSPACE_TABS,
  type CaptionWorkspaceTabId,
} from "./caption-workspace.types";

const CAPTION_FIELD_DEBOUNCE_MS = 300;

function resolvePlaceholderCaptionInput(storedValue: string, inputValue: string): string {
  if (storedValue.trim() !== DEFAULT_SCENE_SUBTITLE) {
    return inputValue;
  }

  if (inputValue === DEFAULT_SCENE_SUBTITLE) {
    return inputValue;
  }

  if (inputValue.startsWith(DEFAULT_SCENE_SUBTITLE)) {
    const withoutPlaceholder = inputValue.slice(DEFAULT_SCENE_SUBTITLE.length);
    return withoutPlaceholder.length > 0 ? withoutPlaceholder : inputValue;
  }

  return inputValue;
}

function useDebouncedSceneFieldCommit(
  sceneId: string,
  onCommit: (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => void,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{
    sceneId: string;
    patch: Partial<FootieScript["scenes"][number]>;
  } | null>(null);

  const cancelPending = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const pending = pendingRef.current;
    if (!pending) {
      return;
    }

    onCommit(pending.sceneId, pending.patch);
    clearPendingSceneCaptionDraft(pending.sceneId);
    pendingRef.current = null;
  }, [onCommit]);

  const schedule = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      pendingRef.current = { sceneId: targetSceneId, patch };
      registerPendingSceneCaptionDraft(targetSceneId, patch);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        flush();
      }, CAPTION_FIELD_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    return registerSceneCaptionDraftCancel(cancelPending);
  }, [cancelPending]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [sceneId, flush]);

  return { schedule, flush };
}

interface SceneCaptionTextFieldsProps {
  scene: FootieScript["scenes"][number];
  isSubtitlesMode: boolean;
  onCommit: (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => void;
}

function SceneCaptionTextFields({ scene, isSubtitlesMode, onCommit }: SceneCaptionTextFieldsProps) {
  const { schedule, flush } = useDebouncedSceneFieldCommit(scene.id, onCommit);
  const [generatedCaptionDraft, setGeneratedCaptionDraft] = useState(scene.subtitle ?? "");
  const [subtitleTextDraft, setSubtitleTextDraft] = useState(
    scene.subtitleText || scene.narration || "",
  );

  if (isSubtitlesMode) {
    return (
      <div>
        <label htmlFor={`inspector-subtitle-text-${scene.id}`} className={studioFieldLabel}>
          Subtitle text
        </label>
        <textarea
          id={`inspector-subtitle-text-${scene.id}`}
          value={subtitleTextDraft}
          onChange={(event) => {
            const next = resolvePlaceholderCaptionInput(
              scene.subtitleText || scene.narration || "",
              event.target.value,
            );
            setSubtitleTextDraft(next);
            schedule(scene.id, { subtitleText: next });
          }}
          onBlur={flush}
          rows={3}
          placeholder="On-screen subtitle for this scene"
          className={`${studioTextarea} mt-1.5 min-h-[4.5rem]`}
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`inspector-caption-${scene.id}`} className={studioFieldLabel}>
        Caption
      </label>
      <textarea
        id={`inspector-caption-${scene.id}`}
        value={generatedCaptionDraft}
        onChange={(event) => {
          const next = resolvePlaceholderCaptionInput(scene.subtitle, event.target.value);
          setGeneratedCaptionDraft(next);
          schedule(scene.id, { subtitle: next });
        }}
        onBlur={flush}
        rows={3}
        placeholder="On-screen text for this scene"
        className={`${studioTextarea} mt-1.5 min-h-[4.5rem]`}
      />
    </div>
  );
}

export interface CaptionWorkspaceProps {
  scene: FootieScript["scenes"][number];
  script: FootieScript;
  sceneIndex: number;
  captionMode: CaptionMode;
  isSubtitlesMode: boolean;
  onCaptionModeChange: (mode: CaptionMode) => void;
  onCommitPresentationPatch: (patch: ScenePresentationPatch) => void;
  onCommitScenePatch: (patch: Partial<FootieScript["scenes"][number]>) => void;
  onCommitPresentationScript: (script: FootieScript) => void;
}

/**
 * Caption workspace — secondary tabs for content, layout, style, and animation.
 */
export default function CaptionWorkspace({
  scene,
  script,
  sceneIndex,
  captionMode,
  isSubtitlesMode,
  onCaptionModeChange,
  onCommitPresentationPatch,
  onCommitScenePatch,
  onCommitPresentationScript,
}: CaptionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<CaptionWorkspaceTabId>(() => readCaptionWorkspaceTab());

  const selectTab = useCallback((tabId: CaptionWorkspaceTabId) => {
    writeCaptionWorkspaceTab(tabId);
    setActiveTab(tabId);
  }, []);

  const handleScenePatch = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      if (targetSceneId !== scene.id) {
        return;
      }
      onCommitScenePatch(patch);
    },
    [onCommitScenePatch, scene.id],
  );

  return (
    <div className="min-w-0" data-caption-workspace>
      <div
        className={`${studioWorkspaceTabTrack} mb-3 shrink-0`}
        role="tablist"
        aria-label="Caption workspace"
      >
        {CAPTION_WORKSPACE_TABS.map((tabId) => {
          const isActive = activeTab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              id={`caption-workspace-tab-${tabId}`}
              aria-selected={isActive}
              aria-controls={`caption-workspace-panel-${tabId}`}
              className={isActive ? studioWorkspaceTabActive : studioWorkspaceTabInactive}
              onClick={() => selectTab(tabId)}
            >
              {CAPTION_WORKSPACE_TAB_LABELS[tabId]}
            </button>
          );
        })}
      </div>

      <div className="relative min-w-0">
        <div
          id="caption-workspace-panel-content"
          role="tabpanel"
          aria-labelledby="caption-workspace-tab-content"
          hidden={activeTab !== "content"}
          className={`min-w-0 space-y-3 ${activeTab !== "content" ? "pointer-events-none" : ""}`}
        >
          <CaptionModeControl value={captionMode} onChange={onCaptionModeChange} />

          {isSubtitlesMode ? (
            <>
              <CaptionPresetPanel
                compact
                captionPreset={scene.captionPreset}
                subtitleEffect={scene.subtitleEffect}
                onPresetSelect={(presetId) =>
                  onCommitPresentationPatch(buildSceneCaptionPresetPatch(presetId))
                }
              />
              <StudioAccordion variant="nested" title="Advanced subtitle effect">
                <SubtitleEffectControl
                  value={scene.subtitleEffect}
                  onChange={(effect) =>
                    onCommitPresentationPatch(buildSceneSubtitleEffectPatch(effect))
                  }
                />
              </StudioAccordion>
              <SceneCaptionTextFields
                key={scene.id}
                scene={scene}
                isSubtitlesMode={isSubtitlesMode}
                onCommit={handleScenePatch}
              />
            </>
          ) : (
            <SceneCaptionTextFields
              key={scene.id}
              scene={scene}
              isSubtitlesMode={false}
              onCommit={handleScenePatch}
            />
          )}
        </div>

        <div
          id="caption-workspace-panel-layout"
          role="tabpanel"
          aria-labelledby="caption-workspace-tab-layout"
          hidden={activeTab !== "layout"}
          className={`min-w-0 space-y-3 ${activeTab !== "layout" ? "pointer-events-none" : ""}`}
        >
          <CaptionLayoutControl
            scene={scene}
            script={script}
            onSceneLayoutChange={onCommitPresentationPatch}
          />
          <CaptionLayoutWorkflow
            scene={scene}
            script={script}
            sceneIndex={sceneIndex}
            onSceneLayoutChange={onCommitPresentationPatch}
            onScriptPresentationChange={onCommitPresentationScript}
          />
        </div>

        <div
          id="caption-workspace-panel-style"
          role="tabpanel"
          aria-labelledby="caption-workspace-tab-style"
          hidden={activeTab !== "style"}
          className={`min-w-0 ${activeTab !== "style" ? "pointer-events-none" : ""}`}
        >
          <CaptionStyleControl
            scene={scene}
            script={script}
            onSceneStyleChange={onCommitPresentationPatch}
          />
        </div>

        <div
          id="caption-workspace-panel-animation"
          role="tabpanel"
          aria-labelledby="caption-workspace-tab-animation"
          hidden={activeTab !== "animation"}
          className={`min-w-0 space-y-3 ${activeTab !== "animation" ? "pointer-events-none" : ""}`}
        >
          <CaptionAnimationControl
            scene={scene}
            script={script}
            onSceneAnimationChange={onCommitPresentationPatch}
          />
          <CaptionAnimationWorkflow
            scene={scene}
            script={script}
            onSceneAnimationChange={onCommitPresentationPatch}
            onScriptPresentationChange={onCommitPresentationScript}
          />
        </div>
      </div>
    </div>
  );
}
