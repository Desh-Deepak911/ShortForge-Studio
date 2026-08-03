"use client";

import {
  ArrowLeftRight,
  ChevronDown,
  ImageIcon,
  ImagePlus,
  Mic,
  MoveHorizontal,
  Package,
  PenLine,
  SlidersHorizontal,
  Timer,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import InspectorEmptyState from "@/components/studio-shell/InspectorEmptyState";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import { StudioNumberStepper } from "@/components/ui";
import CaptionWorkspace from "@/features/editor/components/caption-workspace/CaptionWorkspace";
import CreatorAssetStudio from "@/features/editor/components/creator-asset-studio/CreatorAssetStudio";
import SceneImageInspector from "@/features/editor/components/SceneImageInspector";
import MediaMotionInspectorPanel from "@/features/editor/components/media/MediaMotionInspectorPanel";
import MediaVisualAdjustmentsPanel from "@/features/editor/components/media/MediaVisualAdjustmentsPanel";
import SceneMediaItemInspector from "@/features/editor/components/media/SceneMediaItemInspector";
import SceneMediaTransitionInspector from "@/features/editor/components/media/SceneMediaTransitionInspector";
import SceneVideoInspector from "@/features/editor/components/media/SceneVideoInspector";
import TransitionCard from "@/features/editor/components/TransitionCard";
import SmartEditImageAction, {
  SMART_EDIT_HAS_IMAGE_COPY,
} from "@/features/tool/components/SmartEditImageAction";
import { useSceneMediaUpload } from "@/features/editor/hooks/useSceneImageUpload";
import { useInspectorContext } from "@/features/editor/inspector/InspectorContext";
import {
  SCENE_INSPECTOR_GROUP_LABELS,
  type SceneInspectorWorkspaceId,
} from "@/features/editor/inspector/inspector-tab-shell.types";
import {
  readActiveSceneInspectorWorkspace,
  registerInspectorSceneWorkspaceFocus,
  writeActiveSceneInspectorWorkspace,
} from "@/features/editor/inspector/inspector-tab-shell.session";
import { useEditorSelection } from "@/features/editor/selection";
import { resolveSafeSceneIndex } from "@/features/editor/selection/selection.utils";
import {
  isInspectorSelectableMediaItemId,
  resolveInspectorSceneMediaProjection,
  resolveNearestInspectorMediaItemId,
} from "@/features/mixed-media-scenes/adapters/inspector-scene-media-projection";
import MixedMediaSequencePanel from "@/features/mixed-media-scenes/editor/MixedMediaSequencePanel";
import { useMixedMediaScenesEnabled } from "@/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext";
import { resolveSceneMediaFraming } from "@/features/media-framing";
import { probeImageObjectUrlMetadata } from "@/features/source-quality/client/probe-source-media-metadata";
import { resolveSourceQualityWinningAdjustmentTarget } from "@/features/source-quality/adapters/resolve-source-quality-adjustment-target";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import VisualPacingPanel from "@/features/visual-beat-density/editor/VisualPacingPanel";
import {
  useSourceQualityIntelligenceEnabled,
  useVisualBeatDensityEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { isSelectableSceneMediaTransitionPair } from "@/features/scene-media-transitions";
import { SelectionPhase } from "@/features/editor/selection/selection.types";
import {
  formatSceneMediaItemOrdinal,
  SceneMediaAddAnotherImageButton,
} from "@/features/timeline-editor/scene-media/scene-media-append-affordance";
import { useOptionalSceneMediaImageAppendContext } from "@/features/timeline-editor/scene-media/SceneMediaImageAppendContext";
import { useTimelineExclusiveInteractionLocked } from "@/features/timeline-editor/scene-media/useTimelineExclusiveInteraction";
import {
  buildMediaMotionPatch,
  buildResetMediaMotionPatch,
  resolveSceneMediaMotion,
  type SceneMediaMotion,
} from "@/features/media-motion";
import {
  buildMediaVisualAdjustmentsPatch,
  buildResetMediaVisualAdjustmentsPatch,
} from "@/features/media-visual-adjustments";
import {
  buildPosterTimePatch,
  buildResetPosterPatch,
} from "@/features/media-thumbnails";
import {
  buildResetVideoTrimPatch,
  buildVideoTrimPatch,
} from "@/features/media-playback";
import {
  ensureTimelineItems,
  getSceneImage,
  getSceneMedia,
  getSceneMediaType,
  isTransitionTimelineItem,
  normalizeCaptionMode,
  sceneHasImage,
  sceneHasMedia,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import {
  SCENE_MEDIA_FILE_ACCEPT,
  SCENE_MEDIA_UPLOAD_HELPER_COPY,
} from "@/features/story/utils/scene-media-upload.utils";
import {
  formatDisplayDurationSec,
  formatDisplayTimeRangeSec,
} from "@/lib/utils/formatDisplayDuration.utils";
import {
  studioBadge,
  studioDestructiveButton,
  studioFieldLabel,
  studioInspectorStack,
  studioInspectorSummaryStrip,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioStoryboardMeta,
  studioStoryboardScenePill,
  studioSubtleText,
  studioUploadButton,
  studioUploadZone,
} from "@/lib/utils/studioUi";
import {
  applyCaptionModeSwitchUpdate,
  applyMediaFramingSettings,
  applyPresentationSceneUpdate,
  applyResetMediaFramingSettings,
  applySceneImageSettings,
  applySceneUpdate,
  applyTransitionUpdate,
  type ScenePresentationPatch,
  type StoryScriptChangeOptions,
} from "@/lib/utils/voiceover";
import type {
  CaptionMode,
  FootieScript,
  SceneImage,
  SceneMedia,
  SceneType,
  TransitionTimelineItem,
} from "@/features/story/types";
import type { TimelineItem } from "@/features/story/types";

const SCENE_TYPE_OPTIONS: { value: SceneType; label: string }[] = [
  { value: "intro", label: "Intro" },
  { value: "context", label: "Context" },
  { value: "match", label: "Match" },
  { value: "transition", label: "Transition" },
  { value: "ending", label: "Ending" },
];

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  intro: "Intro",
  context: "Context",
  match: "Match",
  transition: "Transition",
  ending: "Ending",
};

const SCENE_WORKSPACES: {
  id: SceneInspectorWorkspaceId;
  label: string;
  icon: typeof ImageIcon;
}[] = [
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "adjust", label: "Adjust", icon: SlidersHorizontal },
  { id: "caption", label: "Caption", icon: PenLine },
  { id: "timing", label: "Timing", icon: Timer },
  { id: "transition", label: "Transition", icon: ArrowLeftRight },
  { id: "assets", label: "Assets", icon: Package },
];

export interface StudioSceneInspectorProps {
  script: FootieScript;
  onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
}

function formatTimeRange(start: number, end: number): string {
  return formatDisplayTimeRangeSec(start, end);
}

function getTransitionAfterScene(
  timelineItems: TimelineItem[],
  sceneId: string,
): TransitionTimelineItem | null {
  const sceneItemIndex = timelineItems.findIndex(
    (item) => item.type === "scene" && item.id === sceneId,
  );

  if (sceneItemIndex < 0 || sceneItemIndex >= timelineItems.length - 1) {
    return null;
  }

  const nextItem = timelineItems[sceneItemIndex + 1];
  return isTransitionTimelineItem(nextItem) ? nextItem : null;
}

function resolveSceneStatus(scene: FootieScript["scenes"][number]): string {
  if (scene.sceneType) {
    return SCENE_TYPE_LABELS[scene.sceneType];
  }

  const mediaType = getSceneMediaType(scene);
  if (mediaType === "video") {
    return sceneHasMedia(scene) ? "Video ready" : "Video needs duration";
  }

  if (sceneHasMedia(scene)) {
    return "Media ready";
  }

  return "Needs media";
}

/**
 * Context-aware scene inspector — reuses existing editor controls for the selected scene.
 */
export default function StudioSceneInspector({
  script,
  onScriptChange,
}: StudioSceneInspectorProps) {
  const selection = useEditorSelection();
  const {
    selectedSceneIndex,
    inspectorImageEditing,
    selectImage,
    selectedMediaItemId,
    isSceneMediaItemSelected,
    selectedMediaTransition,
    isSceneMediaTransitionSelected,
  } = selection;
  const { assetPlanning, creatorAssetStudioVisible } = useInspectorContext();
  const [activeWorkspace, setActiveWorkspace] =
    useState<SceneInspectorWorkspaceId>(() =>
      readActiveSceneInspectorWorkspace(),
    );
  const visualRetentionCapabilitiesReady =
    useVisualRetentionCapabilitiesReady();
  const sourceQualityEnabled = useSourceQualityIntelligenceEnabled();
  const sourceQualityIntelligenceEnabled =
    visualRetentionCapabilitiesReady && sourceQualityEnabled;
  const { replaceSceneMedia, removeSceneMedia, uploadError, clearUploadError } =
    useSceneMediaUpload({
      script,
      onScriptChange,
      sourceQualityIntelligenceEnabled,
    });
  const scenes = script.scenes;
  const timelineItems = ensureTimelineItems(scenes, script.timelineItems);
  const safeIndex = resolveSafeSceneIndex(scenes, selectedSceneIndex);
  const scene = safeIndex >= 0 ? scenes[safeIndex] : null;
  const appendApi = useOptionalSceneMediaImageAppendContext();
  const mixedMediaScenesEnabled = useMixedMediaScenesEnabled();
  const visualBeatDensityEnabled = useVisualBeatDensityEnabled();
  const visualPacingPanelEnabled =
    visualRetentionCapabilitiesReady &&
    mixedMediaScenesEnabled &&
    visualBeatDensityEnabled;
  const inspectorMediaProjection = useMemo(
    () =>
      scene
        ? resolveInspectorSceneMediaProjection(scene, { mixedMediaScenesEnabled })
        : null,
    [mixedMediaScenesEnabled, scene],
  );
  const mediaWindows = useMemo(
    () => inspectorMediaProjection?.windows ?? [],
    [inspectorMediaProjection],
  );
  const inspectorMediaWarnings = useMemo(
    () => inspectorMediaProjection?.warnings ?? [],
    [inspectorMediaProjection],
  );
  const showMediaItemInspector = Boolean(
    scene &&
    isSceneMediaItemSelected &&
    selectedMediaItemId &&
    isInspectorSelectableMediaItemId(scene, selectedMediaItemId, {
      mixedMediaScenesEnabled,
    }),
  );
  const showMediaTransitionInspector = Boolean(
    scene &&
    isSceneMediaTransitionSelected &&
    selectedMediaTransition &&
    isSelectableSceneMediaTransitionPair(
      scene,
      selectedMediaTransition.fromItemId,
      selectedMediaTransition.toItemId,
    ),
  );

  const selectWorkspace = useCallback(
    (workspaceId: SceneInspectorWorkspaceId) => {
      writeActiveSceneInspectorWorkspace(workspaceId);
      setActiveWorkspace(workspaceId);
    },
    [],
  );

  useEffect(
    () => registerInspectorSceneWorkspaceFocus(selectWorkspace),
    [selectWorkspace],
  );

  // Selection-derived presentation does not mutate editor or workspace state.
  const displayedWorkspace: SceneInspectorWorkspaceId =
    showMediaTransitionInspector
      ? "transition"
      : inspectorImageEditing
        ? "adjust"
        : activeWorkspace;
  const selectedMediaIndex = selectedMediaItemId
    ? mediaWindows.findIndex((window) => window.itemId === selectedMediaItemId)
    : -1;
  const lastSelectedMediaIndexRef = useRef(-1);
  useEffect(() => {
    if (selectedMediaIndex >= 0) {
      lastSelectedMediaIndexRef.current = selectedMediaIndex;
    }
  }, [selectedMediaIndex]);

  /**
   * One coherent Source-quality adjustment target: displayed media and the
   * command mediaItemId always name the same projected item. Explicit item
   * selection uses the live or nearest-survivor id; mixed-media with no
   * selection uses the first projected item; legacy uses canonical + null.
   * Does not mutate editor selection.
   *
   * previousIndexHint reads lastSelectedMediaIndexRef only when the selection
   * is already stale. The effect records live indexes; SSR/first hydration keep
   * the ref at -1 (first projected item) without client-only hint state.
   */
  const sourceQualityWinningTarget = useMemo(() => {
    if (!scene) {
      return { media: null, mediaItemId: null as string | null };
    }
    const explicitSelectedId = isSceneMediaItemSelected
      ? selectedMediaItemId
      : null;
    const previousIndexHint =
      selectedMediaIndex >= 0
        ? selectedMediaIndex
        : // eslint-disable-next-line react-hooks/refs -- stale-only previous-index hint; live path never reads the ref
          lastSelectedMediaIndexRef.current;
    return resolveSourceQualityWinningAdjustmentTarget(scene, {
      mixedMediaScenesEnabled,
      selectedMediaItemId: explicitSelectedId,
      previousIndexHint,
    });
  }, [
    isSceneMediaItemSelected,
    mixedMediaScenesEnabled,
    scene,
    selectedMediaIndex,
    selectedMediaItemId,
  ]);
  const sourceQualityWinningMedia = sourceQualityWinningTarget.media;
  const sourceQualityWinningMediaItemId =
    sourceQualityWinningTarget.mediaItemId;
  const sourceQualityFraming = useMemo(() => {
    if (!scene) {
      return undefined;
    }
    if (sourceQualityWinningMedia) {
      return resolveSceneMediaFraming(
        { media: sourceQualityWinningMedia },
        { media: sourceQualityWinningMedia },
      );
    }
    return resolveSceneMediaFraming(scene, {
      media: sourceQualityWinningMedia,
    });
  }, [scene, sourceQualityWinningMedia]);
  const mediaOrdinalLabel = formatSceneMediaItemOrdinal(
    selectedMediaIndex >= 0 ? selectedMediaIndex : 0,
    mediaWindows.length,
  );

  // Keep selection coherent with capability-aware windows (delete/reconcile survivors).
  useEffect(() => {
    if (!scene || !selectedMediaItemId || !isSceneMediaItemSelected) {
      return;
    }
    if (selectedMediaIndex >= 0) {
      return;
    }
    const nearest = resolveNearestInspectorMediaItemId(
      mediaWindows,
      selectedMediaItemId,
      lastSelectedMediaIndexRef.current,
    );
    if (nearest) {
      selection.selectSceneMediaItem(scene.id, nearest);
      return;
    }
    selection.clearSceneMediaItemSelection();
  }, [
    isSceneMediaItemSelected,
    mediaWindows,
    scene,
    selectedMediaIndex,
    selectedMediaItemId,
    selection,
  ]);
  const exclusiveInteractionLocked = useTimelineExclusiveInteractionLocked();
  const appendInteractionLocked =
    selection.phase === SelectionPhase.PlaybackLocked ||
    exclusiveInteractionLocked;

  const commitPresentationPatch = useCallback(
    (targetSceneId: string, patch: ScenePresentationPatch) => {
      onScriptChange(
        applyPresentationSceneUpdate(script, targetSceneId, patch),
        {
          intent: "presentation",
        },
      );
    },
    [onScriptChange, script],
  );

  const commitPresentationScript = useCallback(
    (nextScript: FootieScript) => {
      onScriptChange(nextScript, { intent: "presentation" });
    },
    [onScriptChange],
  );

  const commitScenePatch = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      onScriptChange(applySceneUpdate(script, targetSceneId, patch));
    },
    [onScriptChange, script],
  );

  const updateScene = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      onScriptChange(applySceneUpdate(script, targetSceneId, patch));
    },
    [onScriptChange, script],
  );

  const handleImageSettingsChange = useCallback(
    (sceneId: string, updates: SceneImageTransformPatch | SceneImage) => {
      if (
        typeof updates === "object" &&
        "url" in updates &&
        typeof updates.url === "string"
      ) {
        onScriptChange(applySceneImageSettings(script, sceneId, updates), {
          intent: "media",
        });
        return;
      }
      onScriptChange(
        applyMediaFramingSettings(
          script,
          sceneId,
          updates as SceneImageTransformPatch,
        ),
        { intent: "media" },
      );
    },
    [onScriptChange, script],
  );

  const handleImageReset = useCallback(
    (sceneId: string) => {
      onScriptChange(applyResetMediaFramingSettings(script, sceneId), {
        intent: "media",
      });
    },
    [onScriptChange, script],
  );

  const handleSetPoster = useCallback(
    (sceneId: string, posterTimeMs: number) => {
      const target = script.scenes.find((entry) => entry.id === sceneId);
      if (!target) {
        return;
      }

      const patch = buildPosterTimePatch(target, posterTimeMs);
      if (!patch) {
        return;
      }

      onScriptChange(applySceneUpdate(script, sceneId, patch), {
        intent: "media",
      });
    },
    [onScriptChange, script],
  );

  const handleResetPoster = useCallback(
    (sceneId: string) => {
      const target = script.scenes.find((entry) => entry.id === sceneId);
      if (!target) {
        return;
      }

      const patch = buildResetPosterPatch(target);
      if (!patch) {
        return;
      }

      onScriptChange(applySceneUpdate(script, sceneId, patch), {
        intent: "media",
      });
    },
    [onScriptChange, script],
  );

  const handleApplyTrim = useCallback(
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

  const handleResetTrim = useCallback(
    (sceneId: string): boolean => {
      const target = script.scenes.find((entry) => entry.id === sceneId);
      if (!target) {
        return false;
      }

      const result = buildResetVideoTrimPatch(target);
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

  const updateTransition = useCallback(
    (
      transitionId: string,
      patch: { effect?: TransitionTimelineItem["effect"]; durationMs?: number },
    ) => {
      onScriptChange(applyTransitionUpdate(script, transitionId, patch));
    },
    [onScriptChange, script],
  );

  const sceneId = scene?.id;

  const handleImageTransformChange = useCallback(
    (patch: SceneImageTransformPatch) => {
      if (!sceneId) {
        return;
      }
      handleImageSettingsChange(sceneId, patch);
    },
    [handleImageSettingsChange, sceneId],
  );

  const handleFitModeChange = useCallback(
    (fitMode: NonNullable<SceneImage["fitMode"]>) => {
      if (!sceneId) {
        return;
      }
      handleImageSettingsChange(sceneId, { fitMode });
    },
    [handleImageSettingsChange, sceneId],
  );

  const handleMediaMotionChange = useCallback(
    (patch: Partial<SceneMediaMotion>) => {
      if (!sceneId) {
        return;
      }
      const target = script.scenes.find((entry) => entry.id === sceneId);
      if (!target) {
        return;
      }
      const result = buildMediaMotionPatch(target, patch);
      if (!result) {
        return;
      }
      onScriptChange(applySceneUpdate(script, sceneId, result.patch), {
        intent: "media",
      });
    },
    [onScriptChange, sceneId, script],
  );

  const handleResetMediaMotion = useCallback(() => {
    if (!sceneId) {
      return;
    }
    const target = script.scenes.find((entry) => entry.id === sceneId);
    if (!target) {
      return;
    }
    const result = buildResetMediaMotionPatch(target);
    if (!result) {
      return;
    }
    onScriptChange(applySceneUpdate(script, sceneId, result.patch), {
      intent: "media",
    });
  }, [onScriptChange, sceneId, script]);

  const handleMediaVisualAdjustmentsChange = useCallback(
    (patch: Parameters<typeof buildMediaVisualAdjustmentsPatch>[1]) => {
      if (!sceneId) return;
      const target = script.scenes.find((entry) => entry.id === sceneId);
      if (!target) return;
      const result = buildMediaVisualAdjustmentsPatch(target, patch);
      if (!result) return;
      onScriptChange(applySceneUpdate(script, sceneId, result), {
        intent: "media",
      });
    },
    [onScriptChange, sceneId, script],
  );

  const handleResetMediaVisualAdjustments = useCallback(() => {
    if (!sceneId) return;
    const target = script.scenes.find((entry) => entry.id === sceneId);
    if (!target) return;
    const result = buildResetMediaVisualAdjustmentsPatch(target);
    if (!result) return;
    onScriptChange(applySceneUpdate(script, sceneId, result), {
      intent: "media",
    });
  }, [onScriptChange, sceneId, script]);

  const handleVisualEffectMediaChange = useCallback(
    (nextMedia: SceneMedia) => {
      if (!sceneId) return;
      onScriptChange(applySceneUpdate(script, sceneId, { media: nextMedia }), {
        intent: "media",
      });
    },
    [onScriptChange, sceneId, script],
  );

  const handleCaptionModeChange = useCallback(
    (mode: CaptionMode) => {
      if (!sceneId) {
        return;
      }
      onScriptChange(applyCaptionModeSwitchUpdate(script, sceneId, mode), {
        intent: "presentation",
      });
    },
    [onScriptChange, sceneId, script],
  );

  const handleMediaUpload = async (
    uploadSceneId: string,
    file: File | null,
  ) => {
    if (!file) {
      return;
    }

    clearUploadError();
    await replaceSceneMedia(uploadSceneId, file);
  };

  const removeMedia = (removeSceneId: string) => {
    removeSceneMedia(removeSceneId);
  };

  if (!scene || safeIndex < 0 || !sceneId) {
    return <InspectorEmptyState />;
  }

  const sceneImage = getSceneImage(scene);
  const sceneMedia = getSceneMedia(scene);
  const mediaType = getSceneMediaType(scene);
  const isVideoMedia = mediaType === "video";
  const hasImageMedia = sceneHasImage(scene);
  const captionMode = normalizeCaptionMode(scene.captionMode);
  const isSubtitlesMode = captionMode === "subtitles";
  const transitionAfterScene = getTransitionAfterScene(timelineItems, sceneId);
  const selectionLabel = showMediaTransitionInspector
    ? `Transition · ${mediaOrdinalLabel}`
    : showMediaItemInspector
      ? `${getSceneMediaType(scene) === "video" ? "Video" : "Media"} · ${mediaOrdinalLabel}`
      : `Scene ${safeIndex + 1}`;

  return (
    <div className={`${studioInspectorStack} pb-1`}>
      <div className="rounded-2xl bg-background/30 p-2.5 ring-1 ring-border/30">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground/95">
              Scene {safeIndex + 1}
            </p>
            <p className="truncate text-[10px] text-muted">{selectionLabel}</p>
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted">
            {formatTimeRange(scene.start, scene.end)}
          </span>
        </div>
        <div
          className="grid grid-cols-3 gap-1 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6"
          role="tablist"
          aria-label="Scene editing tools"
          data-scene-inspector-workspaces
        >
          {SCENE_WORKSPACES.filter(
            (workspace) =>
              workspace.id !== "assets" || creatorAssetStudioVisible,
          ).map((workspace) => {
            const Icon = workspace.icon;
            const selected = displayedWorkspace === workspace.id;
            return (
              <button
                key={workspace.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectWorkspace(workspace.id)}
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 text-[10px] font-medium transition ${
                  selected
                    ? "bg-accent/15 text-accent ring-1 ring-accent/25"
                    : "text-muted hover:bg-surface-elevated/45 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span>{workspace.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {displayedWorkspace === "timing" ? (
        <InspectorSection
          icon={SlidersHorizontal}
          title="Timing"
          description={SCENE_INSPECTOR_GROUP_LABELS.general.description}
          defaultOpen
        >
          <div className={studioInspectorSummaryStrip}>
            <div className="flex items-start gap-2.5">
              <span
                className={studioStoryboardScenePill}
                aria-label={`Scene ${safeIndex + 1}`}
              >
                {safeIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight text-foreground/95">
                  Scene {safeIndex + 1}
                </p>
                <p className={`${studioStoryboardMeta} mt-0.5`}>
                  {formatTimeRange(scene.start, scene.end)} ·{" "}
                  {formatDisplayDurationSec(scene.duration)}
                </p>
                <span className={`${studioBadge} mt-2 inline-flex`}>
                  {resolveSceneStatus(scene)}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-border/15 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-muted" aria-hidden />
                <label
                  htmlFor={`inspector-duration-${scene.id}`}
                  className={studioFieldLabel}
                >
                  Duration
                </label>
                <StudioNumberStepper
                  id={`inspector-duration-${scene.id}`}
                  min={1}
                  max={20}
                  step={1}
                  value={scene.duration}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    const clamped = Math.min(20, Math.max(1, Math.round(raw)));
                    updateScene(scene.id, {
                      duration:
                        Number.isFinite(raw) && raw > 0
                          ? clamped
                          : scene.duration,
                    });
                  }}
                  onStepValue={(duration) =>
                    updateScene(scene.id, { duration })
                  }
                  aria-label="Scene duration"
                  suffix="sec"
                  compact
                />
              </div>
              <p className={`${studioSubtleText} text-[11px] leading-snug`}>
                Drag scene edges on the timeline for faster timing edits.
              </p>
            </div>

            <div className="mt-3">
              <label
                htmlFor={`inspector-scene-type-${scene.id}`}
                className={studioFieldLabel}
              >
                Scene type
              </label>
              <div className="relative mt-1.5 w-full">
                <select
                  id={`inspector-scene-type-${scene.id}`}
                  value={scene.sceneType ?? ""}
                  onChange={(event) =>
                    updateScene(scene.id, {
                      sceneType: event.target.value
                        ? (event.target.value as SceneType)
                        : undefined,
                    })
                  }
                  className={studioSelectCompact}
                >
                  <option value="">General</option>
                  {SCENE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className={studioSelectChevronCompact}
                  aria-hidden
                />
              </div>
            </div>
          </div>

          <InspectorSection
            icon={Mic}
            title="Narration"
            description="Voiceover timing for this scene."
            open={inspectorImageEditing ? false : undefined}
          >
            <div className="rounded-xl bg-background/25 px-3 py-3 ring-1 ring-border/30">
              <p className="text-sm leading-relaxed text-foreground/90">
                Plays during voiceover at{" "}
                <span className="font-medium tabular-nums">
                  {formatTimeRange(scene.start, scene.end)}
                </span>
              </p>
              <p className={`${studioSubtleText} mt-1.5`}>
                Visuals and captions appear while story narration continues.
                Click the image on the preview to adjust focus when playback is
                stopped.
              </p>
            </div>
          </InspectorSection>
        </InspectorSection>
      ) : null}

      {displayedWorkspace === "media" || displayedWorkspace === "adjust" ? (
        <>
          {displayedWorkspace === "media" ? (
            <InspectorSection
              icon={ImageIcon}
              title="Media"
              description="Upload images or clips, frame, zoom, and position."
              defaultOpen
              open={inspectorImageEditing ? true : undefined}
            >
              <SourceQualitySummary
                script={script}
                scene={scene}
                onScriptChange={onScriptChange}
                media={sourceQualityWinningMedia}
                framing={sourceQualityFraming}
                mediaItemId={sourceQualityWinningMediaItemId}
                mixedMediaScenesEnabled={mixedMediaScenesEnabled}
              />
              {visualPacingPanelEnabled ? (
                <div className="mb-3">
                  <VisualPacingPanel
                    script={script}
                    scene={scene}
                    onScriptChange={onScriptChange}
                    visualBeatDensityEnabled
                    mixedMediaScenesEnabled
                  />
                </div>
              ) : null}
              {mixedMediaScenesEnabled ? (
                <div className="mb-3">
                  <MixedMediaSequencePanel
                    script={script}
                    scene={scene}
                    onScriptChange={onScriptChange}
                    mixedMediaScenesEnabled
                    sourceQualityIntelligenceEnabled={
                      sourceQualityIntelligenceEnabled
                    }
                    probeImageObjectUrlMetadata={probeImageObjectUrlMetadata}
                  />
                </div>
              ) : null}
              {mediaWindows.length > 0 ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2"
                  data-scene-media-inspector-context
                >
                  <p
                    className="text-[11px] font-medium text-foreground/85"
                    data-scene-media-ordinal
                  >
                    Scene {safeIndex + 1} · {mediaOrdinalLabel}
                  </p>
                  {!mixedMediaScenesEnabled && appendApi ? (
                    <SceneMediaAddAnotherImageButton
                      scene={scene}
                      appendApi={appendApi}
                      disabled={appendInteractionLocked}
                      className={studioUploadButton}
                      label="Add another image"
                    />
                  ) : null}
                </div>
              ) : null}
              {inspectorMediaWarnings.length > 0 ? (
                <p
                  className="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-100 ring-1 ring-amber-400/30"
                  data-scene-media-inspector-warnings
                >
                  {inspectorMediaWarnings
                    .slice(0, 3)
                    .map((warning) => warning.message)
                    .join(" ")}
                </p>
              ) : null}
              {showMediaItemInspector && selectedMediaItemId ? (
                <SceneMediaItemInspector
                  script={script}
                  scene={scene}
                  mediaItemId={selectedMediaItemId}
                  onScriptChange={onScriptChange}
                  section="media"
                />
              ) : (
                <>
                  {isVideoMedia && sceneMedia?.type === "video" ? (
                    <SceneVideoInspector
                      media={sceneMedia}
                      sceneId={scene.id}
                      sceneDurationMs={
                        scene.durationMs ??
                        (typeof scene.duration === "number" &&
                        scene.duration > 0
                          ? Math.round(scene.duration * 1000)
                          : 0)
                      }
                      onReplace={(file) =>
                        void handleMediaUpload(scene.id, file)
                      }
                      onRemove={() => removeMedia(scene.id)}
                      onSetPoster={(posterTimeMs) =>
                        handleSetPoster(scene.id, posterTimeMs)
                      }
                      onResetPoster={() => handleResetPoster(scene.id)}
                      onApplyTrim={(trim) => handleApplyTrim(scene.id, trim)}
                      onResetTrim={() => handleResetTrim(scene.id)}
                      repositionActive={inspectorImageEditing}
                      onReposition={() => selectImage(scene.id)}
                      onResetFraming={() => handleImageReset(scene.id)}
                      onFramingChange={(patch) => {
                        handleImageTransformChange({
                          ...(patch.fitMode !== undefined
                            ? { fitMode: patch.fitMode }
                            : {}),
                          ...(patch.positionX !== undefined
                            ? { x: patch.positionX }
                            : {}),
                          ...(patch.positionY !== undefined
                            ? { y: patch.positionY }
                            : {}),
                          ...(patch.zoom !== undefined
                            ? { scale: patch.zoom }
                            : {}),
                          ...(patch.rotationDeg !== undefined
                            ? { rotation: patch.rotationDeg }
                            : {}),
                        });
                      }}
                    />
                  ) : hasImageMedia ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <SmartEditImageAction
                          hasImage
                          buttonOnly
                          sceneId={scene.id}
                        />
                        <label className={studioUploadButton}>
                          <ImagePlus className="h-3.5 w-3.5" />
                          Replace current image
                          <input
                            type="file"
                            accept={SCENE_MEDIA_FILE_ACCEPT}
                            className="hidden"
                            data-scene-media-replace-current="true"
                            onChange={(event) => {
                              void handleMediaUpload(
                                scene.id,
                                event.target.files?.[0] ?? null,
                              );
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeMedia(scene.id)}
                          className={studioDestructiveButton}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                      <p className={studioSubtleText}>
                        Replace current image changes only this scene’s current
                        media. Add another image appends a new timeline item.{" "}
                        {SMART_EDIT_HAS_IMAGE_COPY}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className={studioUploadZone}>
                        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated/50 ring-1 ring-border/25">
                          <ImagePlus className="h-4 w-4 text-muted" />
                        </div>
                        <p className="text-sm font-medium text-foreground/85">
                          Upload media
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Portrait 9:16 · Images or MP4, WebM, MOV clips
                        </p>
                        <input
                          type="file"
                          accept={SCENE_MEDIA_FILE_ACCEPT}
                          className="hidden"
                          onChange={(event) => {
                            void handleMediaUpload(
                              scene.id,
                              event.target.files?.[0] ?? null,
                            );
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <p className={studioSubtleText}>
                        {SCENE_MEDIA_UPLOAD_HELPER_COPY}
                      </p>
                      <SmartEditImageAction
                        hasImage={false}
                        sceneId={scene.id}
                      />
                    </div>
                  )}

                  {uploadError ? (
                    <p
                      className="mt-2 text-[11px] leading-snug text-amber-100/90"
                      role="status"
                    >
                      {uploadError}
                    </p>
                  ) : null}

                  {!isVideoMedia && sceneImage ? (
                    <SceneImageInspector
                      variant="standalone"
                      showHeader={false}
                      hideMotion
                      showSmartEdit={false}
                      sceneId={scene.id}
                      controlId={`inspector-scene-image-zoom-${scene.id}`}
                      scale={sceneImage.scale}
                      positionX={sceneImage.x}
                      positionY={sceneImage.y}
                      rotationDeg={sceneImage.rotation ?? 0}
                      fitMode={sceneImage.fitMode}
                      imageMotion={sceneImage.imageMotion}
                      onScaleChange={(scale) =>
                        handleImageTransformChange({ scale })
                      }
                      onFitModeChange={handleFitModeChange}
                      onPositionChange={(position) =>
                        handleImageTransformChange(position)
                      }
                      onReposition={() => selectImage(scene.id)}
                      onReset={() => handleImageReset(scene.id)}
                    />
                  ) : !isVideoMedia ? (
                    <p className={studioSubtleText}>
                      Add media to adjust frame, zoom, and position.
                    </p>
                  ) : null}
                </>
              )}
            </InspectorSection>
          ) : null}

          {displayedWorkspace === "adjust" && sceneHasMedia(scene) ? (
            <InspectorSection
              icon={MoveHorizontal}
              title="Adjust"
              description="Framing, motion and visual treatment."
              defaultOpen
            >
              {showMediaItemInspector && selectedMediaItemId ? (
                <SceneMediaItemInspector
                  script={script}
                  scene={scene}
                  mediaItemId={selectedMediaItemId}
                  onScriptChange={onScriptChange}
                  section="adjust"
                />
              ) : (
                <>
                  <MediaMotionInspectorPanel
                    controlId={`inspector-scene-media-motion-${scene.id}`}
                    motion={resolveSceneMediaMotion(scene)}
                    media={sceneMedia}
                    mediaWindowDurationMs={
                      scene.durationMs ??
                      Math.round((scene.duration ?? 0) * 1000)
                    }
                    mediaItemId={null}
                    requiresMediaItemSelection={
                      mixedMediaScenesEnabled && mediaWindows.length > 1
                    }
                    onMotionChange={handleMediaMotionChange}
                    onVisualEffectMediaChange={handleVisualEffectMediaChange}
                    onReset={handleResetMediaMotion}
                  />
                  {sceneMedia && sceneMedia.type !== "placeholder" ? (
                    <MediaVisualAdjustmentsPanel
                      media={sceneMedia}
                      onChange={handleMediaVisualAdjustmentsChange}
                      onReset={handleResetMediaVisualAdjustments}
                    />
                  ) : null}
                </>
              )}
            </InspectorSection>
          ) : null}
        </>
      ) : null}

      {displayedWorkspace === "caption" ? (
        <InspectorSection
          icon={PenLine}
          title={SCENE_INSPECTOR_GROUP_LABELS.caption.title}
          description={SCENE_INSPECTOR_GROUP_LABELS.caption.description}
          defaultOpen
        >
          <CaptionWorkspace
            scene={scene}
            script={script}
            sceneIndex={safeIndex}
            captionMode={captionMode}
            isSubtitlesMode={isSubtitlesMode}
            onCaptionModeChange={handleCaptionModeChange}
            onCommitPresentationPatch={(patch) =>
              commitPresentationPatch(scene.id, patch)
            }
            onCommitScenePatch={(patch) => commitScenePatch(scene.id, patch)}
            onCommitPresentationScript={commitPresentationScript}
          />
        </InspectorSection>
      ) : null}

      {displayedWorkspace === "transition" ? (
        <InspectorSection
          icon={ArrowLeftRight}
          title={SCENE_INSPECTOR_GROUP_LABELS.transition.title}
          description={SCENE_INSPECTOR_GROUP_LABELS.transition.description}
          defaultOpen
        >
          {showMediaTransitionInspector && selectedMediaTransition ? (
            <SceneMediaTransitionInspector
              script={script}
              scene={scene}
              fromItemId={selectedMediaTransition.fromItemId}
              toItemId={selectedMediaTransition.toItemId}
              onScriptChange={onScriptChange}
            />
          ) : (
            <InspectorSection
              icon={ArrowLeftRight}
              title="Transition"
              description="Effect to the next scene."
              open={inspectorImageEditing ? false : undefined}
            >
              {transitionAfterScene ? (
                <TransitionCard
                  variant="inline"
                  item={transitionAfterScene}
                  onUpdate={(patch) =>
                    updateTransition(transitionAfterScene.id, patch)
                  }
                />
              ) : (
                <p className={studioSubtleText}>
                  No transition after this scene.
                </p>
              )}
            </InspectorSection>
          )}
        </InspectorSection>
      ) : null}

      {displayedWorkspace === "assets" && creatorAssetStudioVisible ? (
        <InspectorSection
          icon={Package}
          title={SCENE_INSPECTOR_GROUP_LABELS.assets.title}
          description={SCENE_INSPECTOR_GROUP_LABELS.assets.description}
          defaultOpen
        >
          <CreatorAssetStudio
            sceneIndex={safeIndex}
            planning={assetPlanning ?? null}
            compact
          />
        </InspectorSection>
      ) : null}
    </div>
  );
}
