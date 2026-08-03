"use client";

import { Download, Film, Play, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import ExportPanel from "@/components/ExportPanel";
import {
  ExportDrawer,
  StudioShell,
  StudioContextRibbon,
} from "@/components/studio-shell";
import EditorProjectSidebar from "@/features/editor/components/EditorProjectSidebar";
import EditorCanvasToolbar from "@/features/editor/components/EditorCanvasToolbar";
import ImageRibbonContext from "@/features/editor/components/ImageRibbonContext";
import EditorStudioHeader from "@/features/editor/components/EditorStudioHeader";
import EditorWorkflowStatus from "@/features/editor/components/EditorWorkflowStatus";
import {
  useCreatorAssetPlanningCache,
  useCreatorAssetStudioVisible,
} from "@/features/editor/creator-asset-planning/useCreatorAssetPlanningCache";
import {
  InspectorContextProvider,
  InspectorResolver,
} from "@/features/editor/inspector";
import {
  focusInspectorProjectTab,
  focusInspectorSceneWorkspace,
} from "@/features/editor/inspector/inspector-tab-shell.session";
import { useSceneImageUpload } from "@/features/editor/hooks/useSceneImageUpload";
import {
  useSourceQualityIntelligenceEnabled,
  useVisualRetentionCapabilitiesReady,
  VisualRetentionCapabilitiesProvider,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import {
  EditorSelectionProvider,
  useEditorSelection,
} from "@/features/editor/selection";
import { useEditorWorkspaceLayout } from "@/features/editor/workspace-layout";
import {
  StudioTimeline,
  TimelinePlaybackPortProvider,
  useTimelinePlaybackPublisher,
} from "@/features/timeline-editor";
import { SceneMediaImageAppendProvider } from "@/features/timeline-editor/scene-media/SceneMediaImageAppendContext";
import { PreviewMasterTimelineProvider } from "@/features/timeline-intelligence/master-timeline";
import TimelineDeveloperView from "@/features/timeline-intelligence/TimelineDeveloperView";
import { VideoPreview } from "@/features/preview/components";
import { VideoTrimPreviewProvider } from "@/features/preview/video-trim-preview";
import { buildVideoTrimPatch } from "@/features/media-playback";
import { buildCaptionLayoutOffsetCommitPatch } from "@/features/caption-layout-drag";
import { buildResetCaptionLayoutPatch } from "@/features/caption-layout";
import {
  NO_USABLE_NARRATION_WARNING,
  formatUnsafeNarrationRebuildWarning,
  rebuildNarrationFromScenes,
  useOptionalStorySync,
} from "@/features/story-sync";
import type { SceneImageTransformPatch } from "@/features/story/utils";
import { getSceneImage, sceneHasMedia } from "@/features/story/utils";
import { applyPendingSceneCaptionDrafts } from "@/features/editor/scene-caption-drafts/scene-caption-draft-registry";
import {
  applyMediaFramingSettings,
  applyPresentationSceneUpdate,
  applyResetMediaFramingSettings,
  applySceneUpdate,
  type StoryScriptChangeOptions,
} from "@/lib/utils/voiceover";
import {
  studioMobileActionBar,
  studioMobileActionButton,
  studioMobileActionButtonPrimary,
  studioShellEditorCanvasColumn,
  studioShellEditorCanvasInset,
  studioShellEditorCanvasMaxWidth,
  studioShellEditorPreviewStage,
  studioShellEditorPreviewWrap,
} from "@/lib/utils/studioUi";
import type {
  ExportSettings,
  FootieScript,
  SceneImage,
} from "@/features/story/types";
import type { StoryCreationBrief } from "@/features/drafts/types";
import type { ScriptMode } from "@/types/footiebitz";

interface StoryWorkspaceProps {
  script: FootieScript;
  /** Bumped by DraftEditorFlow when preview master timeline must rebuild. */
  timelineEpoch?: number;
  onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
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
    <VisualRetentionCapabilitiesProvider>
      <EditorSelectionProvider
        script={props.script}
        selectedSceneIndex={props.selectedSceneIndex}
        onSelectedSceneChange={props.onSelectedSceneChange}
      >
        <TimelinePlaybackPortProvider>
          <PreviewMasterTimelineProvider
            script={props.script}
            timelineEpoch={props.timelineEpoch}
          >
            <VideoTrimPreviewProvider>
              <StoryWorkspaceContent {...props} />
            </VideoTrimPreviewProvider>
          </PreviewMasterTimelineProvider>
        </TimelinePlaybackPortProvider>
      </EditorSelectionProvider>
    </VisualRetentionCapabilitiesProvider>
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
  const [exportActive, setExportActive] = useState(false);
  const [narrationRebuildWarning, setNarrationRebuildWarning] = useState<
    string | null
  >(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const workspaceLayout = useEditorWorkspaceLayout();
  const exportDrawerOpen = workspaceLayout.exportDrawerOpen;
  const setExportDrawerOpen = workspaceLayout.setExportDrawerOpen;
  const publishTimelinePlayback = useTimelinePlaybackPublisher();
  const creatorAssetStudioVisible = useCreatorAssetStudioVisible();
  const assetPlanning = useCreatorAssetPlanningCache(
    draftId,
    script,
    scriptMode,
  );
  const { selectedSceneId } = useEditorSelection();
  const missingMediaScenes = useMemo(
    () => script.scenes.filter((scene) => !sceneHasMedia(scene)),
    [script.scenes],
  );
  const firstMissingScene = missingMediaScenes[0] ?? null;
  const missingMediaWarning =
    missingMediaScenes.length > 0
      ? `${missingMediaScenes.length === 1 ? "One scene has" : `${missingMediaScenes.length} scenes have`} no media. Add media before saving or exporting.`
      : null;
  const effectivePersistWarning = persistWarning ?? missingMediaWarning;
  const effectiveSaveDisabled =
    saveDraftDisabled || missingMediaScenes.length > 0;
  const effectiveExportDisabled =
    exportDisabled || missingMediaScenes.length > 0;
  const previewMaxWidth =
    workspaceLayout.previewSize === "125"
      ? "360px"
      : workspaceLayout.previewSize === "100"
        ? "288px"
        : "min(100%, calc((100dvh - 24rem) * 0.5625))";

  const storySync = useOptionalStorySync();

  const openExportDrawer = useCallback(() => {
    setExportDrawerOpen(true);
  }, [setExportDrawerOpen]);

  const focusVoiceoverSection = useCallback(() => {
    focusInspectorProjectTab();
    window.requestAnimationFrame(() => {
      document.getElementById("studio-project-voiceover")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      window.setTimeout(() => {
        document.getElementById("studio-project-voiceover-regenerate")?.focus();
      }, 200);
    });
  }, []);

  const handleUpdateNarration = useCallback(() => {
    const scriptWithDrafts = applyPendingSceneCaptionDrafts(script);
    const result = rebuildNarrationFromScenes(scriptWithDrafts);
    if (!result.ok) {
      if (result.reason === "unsafe_partial_rebuild") {
        setNarrationRebuildWarning(
          formatUnsafeNarrationRebuildWarning(result.blockedSceneNumbers),
        );
      } else {
        setNarrationRebuildWarning(NO_USABLE_NARRATION_WARNING);
      }
      return;
    }

    setNarrationRebuildWarning(null);
    onScriptChange(result.script, { intent: "narration_rebuild" });
    // Explicit user repair — clear stuck narration dirty when rebuilt text is unchanged.
    storySync?.applySyncEdit("narration");
  }, [onScriptChange, script, storySync]);

  const handlePreviewStart = useCallback(() => {
    if (!storySync) {
      return;
    }
    const { state, applySyncEdit } = storySync;
    if (state.previewDirty && !state.voiceDirty) {
      applySyncEdit("preview_refreshed");
    }
  }, [storySync]);

  const handleExportSuccess = useCallback(() => {
    storySync?.applySyncEdit("export_success");
  }, [storySync]);

  const handleSceneImageTransformChange = useCallback(
    (sceneId: string, patch: SceneImageTransformPatch) => {
      onScriptChange(applyMediaFramingSettings(script, sceneId, patch), {
        intent: "media",
      });
    },
    [onScriptChange, script],
  );

  const handleSceneImageReset = useCallback(
    (sceneId: string) => {
      onScriptChange(applyResetMediaFramingSettings(script, sceneId), {
        intent: "media",
      });
    },
    [onScriptChange, script],
  );

  const handleApplyVideoTrim = useCallback(
    (
      sceneId: string,
      trim: { trimStartMs: number; trimEndMs: number },
    ): boolean => {
      const target = script.scenes.find((entry) => entry.id === sceneId);
      if (!target) {
        return false;
      }

      const result = buildVideoTrimPatch(target, trim);
      if (!result) {
        return false;
      }

      onScriptChange(applySceneUpdate(script, sceneId, result.patch), {
        intent: "media",
      });
      return true;
    },
    [onScriptChange, script],
  );

  const handleCaptionLayoutOffsetCommit = useCallback(
    (sceneId: string, offsetX: number, offsetY: number) => {
      const scene = script.scenes.find((entry) => entry.id === sceneId);
      if (!scene) {
        return;
      }

      onScriptChange(
        applyPresentationSceneUpdate(
          script,
          sceneId,
          buildCaptionLayoutOffsetCommitPatch(scene, script, offsetX, offsetY),
        ),
        { intent: "presentation" },
      );
    },
    [onScriptChange, script],
  );

  const handleCaptionLayoutReset = useCallback(
    (sceneId: string) => {
      onScriptChange(
        applyPresentationSceneUpdate(
          script,
          sceneId,
          buildResetCaptionLayoutPatch(),
        ),
        {
          intent: "presentation",
        },
      );
    },
    [onScriptChange, script],
  );

  const capabilitiesReady = useVisualRetentionCapabilitiesReady();
  const sourceQualityEnabled = useSourceQualityIntelligenceEnabled();
  const { replaceSceneImage } = useSceneImageUpload({
    script,
    onScriptChange,
    sourceQualityIntelligenceEnabled:
      capabilitiesReady && sourceQualityEnabled,
  });

  const selectedScene =
    selectedSceneId != null
      ? (script.scenes.find((scene) => scene.id === selectedSceneId) ?? null)
      : null;
  const selectedSceneImage = selectedScene
    ? getSceneImage(selectedScene)
    : undefined;

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
    setMobileSidebarOpen(false);
    setMobileInspectorOpen(false);
    document
      .getElementById("studio-preview")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToScenes = () => {
    setMobileInspectorOpen(false);
    setMobileSidebarOpen(true);
  };

  const openMobileInspector = useCallback(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileInspectorOpen(true);
    }
  }, []);

  const handleInspectorToggle = useCallback(() => {
    // Desktop actions may previously have opened the mobile drawer state.
    // Clear it before toggling so it cannot suppress the collapsed rail.
    setMobileInspectorOpen(false);
    workspaceLayout.toggleInspector();
  }, [workspaceLayout]);

  const focusSceneMedia = useCallback(() => {
    if (firstMissingScene) {
      document
        .querySelector<HTMLElement>(
          `[data-scene-sidebar-id="${CSS.escape(firstMissingScene.id)}"]`,
        )
        ?.click();
    }
    if (workspaceLayout.inspectorCollapsed) {
      workspaceLayout.toggleInspector();
    }
    openMobileInspector();
    focusInspectorSceneWorkspace("media");
  }, [firstMissingScene, openMobileInspector, workspaceLayout]);

  return (
    <>
      <SceneMediaImageAppendProvider
        script={script}
        onScriptChange={onScriptChange}
      >
        <StudioShell
          aria-label="Editor"
          viewportMode="fixed"
          canvasCenterContent={false}
          canvasLayout="editor"
          focusMode={workspaceLayout.focusMode}
          className="h-full min-h-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
          header={
            <EditorStudioHeader
              projectTitle={projectTitle}
              projectMeta={projectMeta}
              onSaveDraft={onSaveDraft}
              saveDraftDisabled={effectiveSaveDisabled}
              saveDraftConfirmation={saveDraftConfirmation}
              onExport={openExportDrawer}
              exportDisabled={effectiveExportDisabled}
              persistWarning={effectivePersistWarning}
              workflowStatus={
                <EditorWorkflowStatus
                  script={script}
                  persistWarning={effectivePersistWarning}
                  saveDraftConfirmation={saveDraftConfirmation}
                  warning={narrationRebuildWarning}
                  onUpdateNarration={handleUpdateNarration}
                  onGenerateVoice={focusVoiceoverSection}
                  onExportUpdated={openExportDrawer}
                  persistActionLabel={
                    missingMediaScenes.length > 0 ? "Add media" : "Retry save"
                  }
                  onPersistAction={
                    missingMediaScenes.length > 0
                      ? focusSceneMedia
                      : onSaveDraft
                  }
                />
              }
            />
          }
          sidebar={
            <EditorProjectSidebar
              script={script}
              projectTitle={projectTitle}
              collapsed={workspaceLayout.sidebarCollapsed}
              mobileOpen={mobileSidebarOpen}
              onCollapsedToggle={workspaceLayout.toggleSidebar}
              onRequestMediaForScene={() => {
                if (workspaceLayout.inspectorCollapsed) {
                  workspaceLayout.toggleInspector();
                }
                openMobileInspector();
                focusInspectorSceneWorkspace("media");
              }}
            />
          }
          canvas={
            <div
              id="studio-preview"
              className={`${studioShellEditorCanvasMaxWidth} ${studioShellEditorCanvasColumn} ${studioShellEditorCanvasInset} scroll-mt-24`}
            >
              <EditorCanvasToolbar
                previewSize={workspaceLayout.previewSize}
                focusMode={workspaceLayout.focusMode}
                onPreviewSizeChange={workspaceLayout.setPreviewSize}
                onFocusModeToggle={workspaceLayout.toggleFocusMode}
                onResetLayout={workspaceLayout.resetLayout}
              />
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
              <div className={studioShellEditorPreviewStage}>
                <div className={studioShellEditorPreviewWrap}>
                  <VideoPreview
                    script={script}
                    previewMaxWidth={previewMaxWidth}
                    enableCanvasEdit
                    canvasEditBlocked={exportActive}
                    onSceneImageTransformChange={
                      handleSceneImageTransformChange
                    }
                    onSceneImageReset={handleSceneImageReset}
                    onCaptionLayoutOffsetCommit={
                      handleCaptionLayoutOffsetCommit
                    }
                    onCaptionLayoutReset={handleCaptionLayoutReset}
                    onClockUpdate={publishTimelinePlayback}
                    onPreviewStart={handlePreviewStart}
                  />
                </div>
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
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <InspectorResolver />
              </div>
            </InspectorContextProvider>
          }
          timeline={
            <StudioTimeline
              id="studio-timeline-rail"
              script={script}
              onScriptChange={onScriptChange}
              onApplyVideoTrim={handleApplyVideoTrim}
              selectedSceneDetailOnly
              showSelectedSceneMedia={
                workspaceLayout.timelineDensity !== "compact"
              }
            />
          }
          editorLayout={{
            sidebarCollapsed: workspaceLayout.sidebarCollapsed,
            inspectorCollapsed: workspaceLayout.inspectorCollapsed,
            inspectorWidthPx: workspaceLayout.inspectorWidthPx,
            timelineDensity: workspaceLayout.timelineDensity,
            timelineHeightPx: workspaceLayout.timelineHeightPx,
            sidebarNarrow: false,
            onSidebarToggle: workspaceLayout.toggleSidebar,
            onInspectorToggle: handleInspectorToggle,
            onInspectorResizePointerDown: workspaceLayout.beginInspectorResize,
            onTimelineDensityChange: workspaceLayout.setTimelineDensity,
            onTimelineResizePointerDown: workspaceLayout.beginTimelineResize,
            mobileSidebarOpen,
            mobileInspectorOpen,
            onMobileSidebarOpenChange: setMobileSidebarOpen,
            onMobileInspectorOpenChange: setMobileInspectorOpen,
          }}
        />
      </SceneMediaImageAppendProvider>

      <ExportDrawer open={exportDrawerOpen} onOpenChange={setExportDrawerOpen}>
        <ExportPanel
          script={script}
          compact
          trackExportFingerprint={exportDrawerOpen}
          onExportSettingsChange={onExportSettingsChange}
          onScriptChange={onScriptChange}
          onExportActiveChange={setExportActive}
          onExportSuccess={handleExportSuccess}
          draftId={draftId}
          creationBrief={creationBrief}
          scriptMode={scriptMode}
        />
      </ExportDrawer>

      <div
        className={studioMobileActionBar}
        role="toolbar"
        aria-label="Storyboard actions"
      >
        <div className="mx-auto flex min-w-0 max-w-lg gap-1.5 px-3.5 sm:gap-2 sm:px-4">
          <button
            type="button"
            onClick={scrollToScenes}
            className={studioMobileActionButton}
          >
            <Film className="h-3.5 w-3.5" />
            Scenes
          </button>
          <button
            type="button"
            onClick={scrollToPreview}
            className={studioMobileActionButton}
          >
            <Play className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileSidebarOpen(false);
              setMobileInspectorOpen(true);
            }}
            className={studioMobileActionButton}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Tools
          </button>
          <button
            type="button"
            onClick={openExportDrawer}
            disabled={effectiveExportDisabled}
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
