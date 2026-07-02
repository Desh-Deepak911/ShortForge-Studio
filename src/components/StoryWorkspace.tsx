"use client";

import { Download, Film, Play } from "lucide-react";
import { useCallback, useState } from "react";

import ExportPanel from "@/components/ExportPanel";
import { ExportDrawer, StudioShell, StudioContextRibbon } from "@/components/studio-shell";
import EditorProjectSidebar from "@/features/editor/components/EditorProjectSidebar";
import ImageRibbonContext from "@/features/editor/components/ImageRibbonContext";
import EditorStudioHeader from "@/features/editor/components/EditorStudioHeader";
import {
  useCreatorAssetPlanningCache,
  useCreatorAssetStudioVisible,
} from "@/features/editor/creator-asset-planning/useCreatorAssetPlanningCache";
import { InspectorContextProvider, InspectorResolver } from "@/features/editor/inspector";
import { useSceneImageUpload } from "@/features/editor/hooks/useSceneImageUpload";
import { EditorSelectionProvider, useEditorSelection } from "@/features/editor/selection";
import { StudioTimeline, TimelinePlaybackPortProvider, useTimelinePlaybackPublisher } from "@/features/timeline-editor";
import TimelineDeveloperView from "@/features/timeline-intelligence/TimelineDeveloperView";
import { VideoPreview } from "@/features/preview/components";
import type { SceneImageTransformPatch } from "@/features/story/utils";
import { getSceneImage } from "@/features/story/utils";
import { applySceneImageSettings, applyResetSceneImageSettings } from "@/lib/utils/voiceover";
import {
  studioMobileActionBar,
  studioMobileActionButton,
  studioMobileActionButtonPrimary,
  studioShellEditorCanvasMaxWidth,
  studioShellEditorPreviewWrap,
} from "@/lib/utils/studioUi";
import type { ExportSettings, FootieScript, SceneImage } from "@/features/story/types";
import type { StoryCreationBrief } from "@/features/drafts/types";
import type { ScriptMode } from "@/types/footiebitz";

interface StoryWorkspaceProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
  onExportSettingsChange?: (settings: ExportSettings) => void;
  projectTitle: string;
  projectMeta: string;
  onSaveDraft: () => void;
  saveDraftDisabled?: boolean;
  saveDraftConfirmation?: string | null;
  persistWarning?: string | null;
  exportDisabled?: boolean;
  draftId?: string;
  scriptMode?: ScriptMode;
  creationBrief?: StoryCreationBrief;
}

export default function StoryWorkspace(props: StoryWorkspaceProps) {
  return (
    <EditorSelectionProvider
      script={props.script}
      selectedSceneIndex={props.selectedSceneIndex}
      onSelectedSceneChange={props.onSelectedSceneChange}
    >
      <TimelinePlaybackPortProvider>
        <StoryWorkspaceContent {...props} />
      </TimelinePlaybackPortProvider>
    </EditorSelectionProvider>
  );
}

function StoryWorkspaceContent({
  script,
  onScriptChange,
  onExportSettingsChange,
  projectTitle,
  projectMeta,
  onSaveDraft,
  saveDraftDisabled = false,
  saveDraftConfirmation,
  persistWarning,
  exportDisabled = false,
  draftId,
  scriptMode,
  creationBrief,
}: StoryWorkspaceProps) {
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [exportActive, setExportActive] = useState(false);
  const publishTimelinePlayback = useTimelinePlaybackPublisher();
  const creatorAssetStudioVisible = useCreatorAssetStudioVisible();
  const assetPlanning = useCreatorAssetPlanningCache(draftId, script, scriptMode);
  const {
    selectedSceneId,
  } = useEditorSelection();

  const openExportDrawer = useCallback(() => {
    setExportDrawerOpen(true);
  }, []);

  const handleSceneImageTransformChange = useCallback(
    (sceneId: string, patch: SceneImageTransformPatch) => {
      onScriptChange(applySceneImageSettings(script, sceneId, patch));
    },
    [onScriptChange, script],
  );

  const handleSceneImageReset = useCallback(
    (sceneId: string) => {
      onScriptChange(applyResetSceneImageSettings(script, sceneId));
    },
    [onScriptChange, script],
  );

  const { replaceSceneImage } = useSceneImageUpload({ script, onScriptChange });

  const selectedScene =
    selectedSceneId != null
      ? (script.scenes.find((scene) => scene.id === selectedSceneId) ?? null)
      : null;
  const selectedSceneImage = selectedScene ? getSceneImage(selectedScene) : undefined;

  const handleRibbonFitModeChange = useCallback(
    (fitMode: NonNullable<SceneImage["fitMode"]>) => {
      if (!selectedScene) {
        return;
      }

      handleSceneImageTransformChange(selectedScene.id, { fitMode });
    },
    [handleSceneImageTransformChange, selectedScene],
  );

  const handleRibbonReset = useCallback(() => {
    if (!selectedScene) {
      return;
    }

    handleSceneImageReset(selectedScene.id);
  }, [handleSceneImageReset, selectedScene]);

  const handleRibbonReplace = useCallback(
    (file: File) => {
      if (!selectedScene) {
        return;
      }

      replaceSceneImage(selectedScene.id, file);
    },
    [replaceSceneImage, selectedScene],
  );

  const scrollToPreview = () => {
    document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToScenes = () => {
    document.getElementById("studio-sidebar-scenes")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <>
      <StudioShell
        aria-label="Editor"
        canvasCenterContent={false}
        canvasLayout="editor"
        sidebarVisibleBelowLg
        className="h-full min-h-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
        header={
          <EditorStudioHeader
            projectTitle={projectTitle}
            projectMeta={projectMeta}
            onSaveDraft={onSaveDraft}
            saveDraftDisabled={saveDraftDisabled}
            saveDraftConfirmation={saveDraftConfirmation}
            onExport={openExportDrawer}
            exportDisabled={exportDisabled}
            persistWarning={persistWarning}
          />
        }
        sidebar={
          <EditorProjectSidebar script={script} projectTitle={projectTitle} />
        }
        canvas={
          <div
            id="studio-preview"
            className={`${studioShellEditorCanvasMaxWidth} mx-auto flex min-h-0 w-full max-h-full flex-col items-center justify-center gap-2 scroll-mt-24`}
          >
            <StudioContextRibbon
              renderers={{
                image: selectedSceneImage ? (
                  <ImageRibbonContext
                    fitMode={selectedSceneImage.fitMode}
                    scale={selectedSceneImage.scale}
                    onReplaceImage={handleRibbonReplace}
                    onFitModeChange={handleRibbonFitModeChange}
                    onReset={handleRibbonReset}
                  />
                ) : null,
              }}
            />
            <div className={studioShellEditorPreviewWrap}>
              <VideoPreview
                script={script}
                enableCanvasEdit
                canvasEditBlocked={exportActive}
                onSceneImageTransformChange={handleSceneImageTransformChange}
                onSceneImageReset={handleSceneImageReset}
                onClockUpdate={publishTimelinePlayback}
              />
            </div>
            <TimelineDeveloperView script={script} />
          </div>
        }
        inspector={
          <InspectorContextProvider
            script={script}
            onScriptChange={onScriptChange}
            storyId={draftId}
            assetPlanning={assetPlanning}
            creatorAssetStudioVisible={creatorAssetStudioVisible}
          >
            <InspectorResolver />
          </InspectorContextProvider>
        }
        timeline={
          <StudioTimeline id="studio-timeline-rail" script={script} onScriptChange={onScriptChange} />
        }
      />

      <ExportDrawer open={exportDrawerOpen} onOpenChange={setExportDrawerOpen}>
        <ExportPanel
          script={script}
          compact
          onExportSettingsChange={onExportSettingsChange}
          onScriptChange={onScriptChange}
          onExportActiveChange={setExportActive}
          draftId={draftId}
          creationBrief={creationBrief}
          scriptMode={scriptMode}
        />
      </ExportDrawer>

      <div className={studioMobileActionBar} role="toolbar" aria-label="Storyboard actions">
        <div className="mx-auto flex min-w-0 max-w-lg gap-1.5 px-3.5 sm:gap-2 sm:px-4">
          <button type="button" onClick={scrollToScenes} className={studioMobileActionButton}>
            <Film className="h-3.5 w-3.5" />
            Scenes
          </button>
          <button type="button" onClick={scrollToPreview} className={studioMobileActionButton}>
            <Play className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={openExportDrawer}
            disabled={exportDisabled}
            className={studioMobileActionButtonPrimary}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>
    </>
  );
}
