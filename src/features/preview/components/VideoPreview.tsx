"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  Smartphone,
  Square,
  Volume2,
} from "lucide-react";

import EditorCanvasEditLayer from "@/features/editor/components/EditorCanvasEditLayer";
import { useEditorSelection } from "@/features/editor/selection";
import { useMixedMediaScenesEnabled } from "@/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext";
import { sceneHasFramableMedia } from "@/features/media-framing";
import {
  EngagementOverlayPreview,
  getSceneEngagementOverlay,
  shouldSuppressEngagementOverlayForInterSceneTransition,
} from "@/features/engagement-overlays";
import CaptionOverlay from "@/features/preview/components/CaptionOverlay";
import PreviewFrame, {
  DynamicIsland,
  PreviewDeviceFrame,
} from "@/features/preview/components/PreviewFrame";
import SubtitleOverlay from "@/features/preview/components/SubtitleOverlay";
import {
  useEngagementOverlaysEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { usePreviewPlayback } from "@/features/preview/hooks/usePreviewPlayback";
import {
  getPreviewSceneTiming,
  resolvePreviewCaptionOverlayClassName,
  resolvePreviewImageEditLayerClassName,
  resolvePreviewInteractionLayer,
  resolvePreviewTransitionOverlay,
} from "@/features/preview/utils";
import { resolvePreviewSceneLocalTimeMs } from "@/features/editor/preview/motion";
import { useVideoTrimPreviewOptional } from "@/features/preview/video-trim-preview";
import { composeIntraSceneTransitionPreview } from "@/features/scene-media-transitions/preview";
import {
  getSceneMediaType,
  getSceneTimingMap,
  normalizeCaptionMode,
  resolveSceneDurationMsForTiming,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import type { TimelinePlaybackSnapshot } from "@/features/timeline-editor/timeline-playback-port.types";
import { EMPTY_TIMELINE_PLAYBACK_SNAPSHOT } from "@/features/timeline-editor/timeline-playback-port.types";
import { StudioStatus } from "@/components/studio-status";
import {
  studioPreviewControls,
  studioPreviewFrameSlot,
  studioPreviewStack,
  studioPreviewTransportStack,
  studioPreviewPill,
  studioPreviewPillMuted,
  studioPreviewPillPrimary,
  studioSelectChevronCompact,
  studioSelectCompact,
} from "@/lib/utils/studioUi";
import { formatDisplayTimeRangeSec } from "@/lib/utils/formatDisplayDuration.utils";
import type { FootieScript } from "@/features/story/types";

interface VideoPreviewProps {
  script: FootieScript | null;
  /** Mount canvas drag/pan when idle (editor route). Requires EditorSelectionProvider. */
  enableCanvasEdit?: boolean;
  /** Blocks canvas edit while export is running. */
  canvasEditBlocked?: boolean;
  onSceneImageTransformChange?: (
    sceneId: string,
    patch: SceneImageTransformPatch,
  ) => void;
  onSceneImageReset?: (sceneId: string) => void;
  onCaptionLayoutOffsetCommit?: (
    sceneId: string,
    offsetX: number,
    offsetY: number,
  ) => void;
  onCaptionLayoutReset?: (sceneId: string) => void;
  /** Publishes preview clock snapshots for timeline playhead — does not affect playback. */
  onClockUpdate?: (snapshot: TimelinePlaybackSnapshot) => void;
  /** Optional — notifies parent when voiceover preview playback starts (sync wiring only). */
  onPreviewStart?: () => void;
  /** Presentation-only preview width controlled by the editor workspace. */
  previewMaxWidth?: string | number;
}

export default function VideoPreview({
  script,
  enableCanvasEdit = false,
  canvasEditBlocked = false,
  onSceneImageTransformChange,
  onSceneImageReset,
  onCaptionLayoutOffsetCommit,
  onCaptionLayoutReset,
  onClockUpdate,
  onPreviewStart,
  previewMaxWidth,
}: VideoPreviewProps) {
  const selection = useEditorSelection();
  const canvasEditActive = enableCanvasEdit;

  const navigateSceneIndex = useCallback(
    (index: number) => {
      selection.syncSceneIndex(index);
    },
    [selection],
  );

  const previewRootRef = useRef<HTMLDivElement>(null);
  const mixedMediaScenesEnabled = useMixedMediaScenesEnabled();
  const visualRetentionCapabilitiesReady =
    useVisualRetentionCapabilitiesReady();
  const engagementOverlaysCapability = useEngagementOverlaysEnabled();
  const engagementOverlaysEnabled =
    visualRetentionCapabilitiesReady && engagementOverlaysCapability;
  const trimPreview = useVideoTrimPreviewOptional();
  const trimPreviewActive = Boolean(trimPreview?.override?.isActive);
  const playback = usePreviewPlayback({
    script,
    selectedSceneIndex: selection.selectedSceneIndex,
    onSelectedSceneChange: navigateSceneIndex,
  });

  const {
    scenes,
    sceneCount,
    totalDuration,
    safeIndex,
    hasCanonicalVoiceover,
    hasPlayableVoiceover,
    playbackError,
    isPlaying,
    isSpeaking,
    playbackMode,
    elapsedSec,
    previewFrame,
    activeSceneIndex,
    progressPct,
    isClient,
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    speechRate,
    setSpeechRate,
    speechPitch,
    setSpeechPitch,
    speechVolume,
    setSpeechVolume,
    previewClockMs,
    browserSceneStartedAtMs,
    masterTimeline,
    currentTimeMs,
    scene,
    playbackScope,
    loopSceneEnabled,
    playPreview,
    playScenePreview,
    toggleLoopScene,
    playWithBrowserVoice,
    pauseVoice,
    stopVoice,
    goPrevious,
    goNext,
  } = playback;

  useEffect(() => {
    // Pause story/scene playback when trim scrubbing begins so clocks don't fight.
    if (trimPreviewActive) {
      pauseVoice();
    }
  }, [trimPreviewActive, pauseVoice]);

  const displayScene = previewFrame?.scene ?? null;
  const previewSceneTiming =
    script && sceneCount > 0 && scene && previewFrame
      ? getPreviewSceneTiming({
          scenes,
          sceneIndex: activeSceneIndex,
          elapsedSec,
          playbackMode,
          isPlaying,
          browserSceneStartedAtMs,
          previewClockMs,
          masterTimeline,
          currentTimeMs,
          defaultCaptionAnimation: script.defaultCaptionAnimation,
        })
      : null;
  const transitionOverlay =
    previewSceneTiming &&
    masterTimeline &&
    previewSceneTiming.timelineTimeMs != null
      ? resolvePreviewTransitionOverlay(
          masterTimeline,
          scenes,
          previewSceneTiming.timelineTimeMs,
        )
      : null;
  // Intra-scene overlays keep captions; they only block two-layer canvas framing edit.
  const intraSceneTransitionActive = Boolean(
    displayScene &&
    previewSceneTiming &&
    !transitionOverlay &&
    composeIntraSceneTransitionPreview(
      displayScene,
      previewSceneTiming.sceneElapsedMs,
    ),
  );

  const playbackActive = isPlaying || isSpeaking;
  const sceneScopePlaybackActive = isPlaying && playbackScope === "scene";
  const isVideoScene = Boolean(
    displayScene && getSceneMediaType(displayScene) === "video",
  );
  const canvasEditAvailable = Boolean(
    canvasEditActive &&
    displayScene &&
    sceneHasFramableMedia(displayScene) &&
    !playbackActive &&
    !canvasEditBlocked &&
    !transitionOverlay &&
    !intraSceneTransitionActive &&
    onSceneImageTransformChange,
  );

  const isFrameEditing = canvasEditActive && selection.isImageEditing;
  const scenePreviewControlsDisabled = isFrameEditing;
  const [framingDragOffset, setFramingDragOffset] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const exitFrameEdit = useCallback(() => {
    selection.exitImageEdit();
  }, [selection]);

  useEffect(() => {
    if (!canvasEditActive) {
      return;
    }

    selection.setImageEditAvailable(canvasEditAvailable);
    return () => selection.setImageEditAvailable(false);
  }, [canvasEditActive, canvasEditAvailable, selection]);

  useEffect(() => {
    if (!canvasEditActive) {
      return;
    }

    selection.setPlaybackLocked(playbackActive);
  }, [canvasEditActive, playbackActive, selection]);

  useEffect(() => {
    if (!onClockUpdate) {
      return;
    }

    if (
      !script ||
      sceneCount === 0 ||
      !masterTimeline ||
      masterTimeline.renderDurationMs <= 0
    ) {
      onClockUpdate(EMPTY_TIMELINE_PLAYBACK_SNAPSHOT);
      return;
    }

    const publishClock = () => {
      const timing = getPreviewSceneTiming({
        scenes,
        sceneIndex: activeSceneIndex,
        elapsedSec,
        playbackMode,
        isPlaying,
        browserSceneStartedAtMs,
        previewClockMs,
        masterTimeline,
        currentTimeMs,
      });

      const timelineTimeMs = timing.timelineTimeMs ?? currentTimeMs;
      const activeScene = scenes[activeSceneIndex];

      onClockUpdate({
        currentTimeMs: isPlaying || isSpeaking ? timelineTimeMs : currentTimeMs,
        renderDurationMs: masterTimeline.renderDurationMs,
        isPlaying: isPlaying || isSpeaking,
        activeSceneId: activeScene?.id ?? null,
      });
    };

    publishClock();

    if (!isPlaying && !isSpeaking) {
      return;
    }

    let frameId = 0;
    const tick = () => {
      publishClock();
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    activeSceneIndex,
    browserSceneStartedAtMs,
    currentTimeMs,
    elapsedSec,
    isPlaying,
    isSpeaking,
    masterTimeline,
    onClockUpdate,
    playbackMode,
    previewClockMs,
    sceneCount,
    scenes,
    script,
  ]);

  useEffect(() => {
    if (!isFrameEditing) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = previewRootRef.current;
      if (!root || root.contains(event.target as Node)) {
        return;
      }

      exitFrameEdit();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [exitFrameEdit, isFrameEditing]);

  const handleCaptionOffsetCommit = useCallback(
    (offsetX: number, offsetY: number) => {
      if (!onCaptionLayoutOffsetCommit || !selection.selectedSceneId) {
        return;
      }

      onCaptionLayoutOffsetCommit(selection.selectedSceneId, offsetX, offsetY);
    },
    [onCaptionLayoutOffsetCommit, selection.selectedSceneId],
  );

  const handleCaptionLayoutReset = useCallback(() => {
    if (!onCaptionLayoutReset || !selection.selectedSceneId) {
      return;
    }

    onCaptionLayoutReset(selection.selectedSceneId);
  }, [onCaptionLayoutReset, selection.selectedSceneId]);

  if (
    !script ||
    sceneCount === 0 ||
    !scene ||
    !previewFrame ||
    !displayScene ||
    !previewSceneTiming
  ) {
    return (
      <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:gap-4">
        <PreviewDeviceFrame>
          <DynamicIsland />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
              <Smartphone className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-sm font-medium text-white/90">
              Preview your short
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/45">
              Your 9:16 storyboard appears here scene by scene.
            </p>
          </div>
        </PreviewDeviceFrame>
      </div>
    );
  }

  const isNarrationSubtitles =
    normalizeCaptionMode(displayScene.captionMode) === "subtitles";

  const { sceneElapsedMs, sceneDurationMs, timelineTimeMs } =
    previewSceneTiming;
  const timingMap = getSceneTimingMap(scenes);
  const transitionFromSceneElapsedMs =
    transitionOverlay && timelineTimeMs != null
      ? resolvePreviewSceneLocalTimeMs({
          timelineTimeMs,
          sceneStartMs:
            transitionOverlay.fromScene.startMs ??
            timingMap[transitionOverlay.fromSceneIndex]?.startMs ??
            0,
          sceneDurationMs: resolveSceneDurationMsForTiming(
            transitionOverlay.fromScene,
          ),
        })
      : 0;
  const transitionFromSceneDurationMs = transitionOverlay
    ? resolveSceneDurationMsForTiming(transitionOverlay.fromScene)
    : 0;
  const transitionToSceneElapsedMs =
    transitionOverlay && timelineTimeMs != null
      ? resolvePreviewSceneLocalTimeMs({
          timelineTimeMs,
          sceneStartMs:
            transitionOverlay.toScene.startMs ??
            timingMap[transitionOverlay.toSceneIndex]?.startMs ??
            0,
          sceneDurationMs: resolveSceneDurationMsForTiming(
            transitionOverlay.toScene,
          ),
        })
      : 0;
  const transitionToSceneDurationMs = transitionOverlay
    ? resolveSceneDurationMsForTiming(transitionOverlay.toScene)
    : 0;
  // Scene-to-scene only — intra-scene transitions keep subtitles/captions continuous.
  const hideCaptionsDuringTransition = transitionOverlay != null;
  const suppressEngagementOverlay =
    shouldSuppressEngagementOverlayForInterSceneTransition(
      transitionOverlay != null,
    );
  const subtitleSceneIndex =
    playbackMode === "narration" && previewSceneTiming.activeSceneIndex != null
      ? previewSceneTiming.activeSceneIndex
      : previewFrame.sceneIndex;
  const subtitleScene =
    playbackMode === "narration" && previewSceneTiming.activeSceneIndex != null
      ? (scenes[previewSceneTiming.activeSceneIndex] ?? displayScene)
      : displayScene;
  const showSubtitles = isNarrationSubtitles && !hideCaptionsDuringTransition;
  const showGeneratedCaption =
    !isNarrationSubtitles && !hideCaptionsDuringTransition;

  const previewInteraction = resolvePreviewInteractionLayer({
    canvasEditEnabled: canvasEditActive,
    sceneId: displayScene.id,
    selectedSceneId: selection.selectedSceneId,
    playbackActive,
    imageEditActive: isFrameEditing,
  });
  const captionOverlayClassName =
    resolvePreviewCaptionOverlayClassName(previewInteraction);
  const imageEditLayerClassName =
    resolvePreviewImageEditLayerClassName(previewInteraction);

  const editLayer =
    canvasEditAvailable && onSceneImageTransformChange && displayScene ? (
      <EditorCanvasEditLayer
        scene={displayScene}
        sceneIndex={previewFrame.sceneIndex}
        allowPointerEvents={previewInteraction.allowImagePointerEvents}
        layerClassName={imageEditLayerClassName}
        overlayOnly={isVideoScene}
        onDragOffsetChange={setFramingDragOffset}
        onTransformChange={(patch) =>
          onSceneImageTransformChange(displayScene.id, patch)
        }
        onResetFrame={
          onSceneImageReset
            ? () => onSceneImageReset(displayScene.id)
            : undefined
        }
      />
    ) : null;

  return (
    <div ref={previewRootRef} className={studioPreviewStack}>
      <div className={studioPreviewFrameSlot}>
        <PreviewFrame
          maxWidth={previewMaxWidth}
          title={script.title}
          previewFrame={previewFrame}
          transitionOverlay={transitionOverlay}
          transitionFromSceneElapsedMs={transitionFromSceneElapsedMs}
          transitionFromSceneDurationMs={transitionFromSceneDurationMs}
          transitionToSceneElapsedMs={transitionToSceneElapsedMs}
          transitionToSceneDurationMs={transitionToSceneDurationMs}
          editLayer={editLayer}
          hideSceneImage={isFrameEditing && !isVideoScene}
          framingDragOffset={
            isFrameEditing && isVideoScene ? framingDragOffset : null
          }
          frameEditActive={isFrameEditing}
          onExitFrameEdit={exitFrameEdit}
          sceneElapsedMs={sceneElapsedMs}
          sceneDurationMs={sceneDurationMs}
          isPlaying={playbackActive}
          mixedMediaScenesEnabled={mixedMediaScenesEnabled}
          overlay={
            <>
              {engagementOverlaysEnabled &&
              script &&
              !suppressEngagementOverlay ? (
                <EngagementOverlayPreview
                  overlay={getSceneEngagementOverlay(script, displayScene.id)}
                  sceneDurationMs={sceneDurationMs}
                  sceneElapsedMs={sceneElapsedMs}
                />
              ) : null}
              {showSubtitles ? (
                <SubtitleOverlay
                  scene={subtitleScene}
                  script={script}
                  sceneIndex={subtitleSceneIndex}
                  sceneElapsedMs={sceneElapsedMs}
                  sceneDurationMs={sceneDurationMs}
                  activeSubtitleChunk={previewSceneTiming.activeSubtitleChunk}
                  chunkProgress={previewSceneTiming.chunkProgress}
                  captionAnimationState={
                    previewSceneTiming.captionAnimationState
                  }
                  subtitleAvailableDurationMs={
                    previewSceneTiming.subtitleAvailableDurationMs
                  }
                  captionTooShortForEffect={
                    previewSceneTiming.captionTooShortForEffect
                  }
                  draggable={previewInteraction.allowCaptionDrag}
                  allowPointerEvents={
                    previewInteraction.allowCaptionPointerEvents
                  }
                  onOffsetCommit={handleCaptionOffsetCommit}
                  onResetLayout={handleCaptionLayoutReset}
                  className={captionOverlayClassName}
                />
              ) : null}
              {showGeneratedCaption ? (
                <CaptionOverlay
                  scene={displayScene}
                  script={script}
                  sceneIndex={previewFrame.sceneIndex}
                  draggable={previewInteraction.allowCaptionDrag}
                  allowPointerEvents={
                    previewInteraction.allowCaptionPointerEvents
                  }
                  onOffsetCommit={handleCaptionOffsetCommit}
                  onResetLayout={handleCaptionLayoutReset}
                  className={captionOverlayClassName}
                />
              ) : null}
            </>
          }
          footer={
            <>
              <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] text-white/50">
                {displayScene.sceneType &&
                displayScene.sceneType !== "transition" ? (
                  <span className="capitalize">{displayScene.sceneType}</span>
                ) : null}
                {displayScene.sceneType &&
                displayScene.sceneType !== "transition" ? (
                  <span>·</span>
                ) : null}
                <span className="tabular-nums">
                  {formatDisplayTimeRangeSec(
                    displayScene.start,
                    displayScene.end,
                  )}
                </span>
                {isSpeaking ? (
                  <>
                    <span>·</span>
                    <span>Speaking</span>
                  </>
                ) : null}
                {isPlaying && playbackMode === "narration" ? (
                  <>
                    <span>·</span>
                    <span>
                      {playbackScope === "scene" ? "Scene" : "Narration"}
                    </span>
                  </>
                ) : null}
              </div>

              {playbackMode === "narration" && totalDuration > 0 ? (
                <div className="overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-0.5 rounded-full bg-white/70 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              ) : null}
            </>
          }
        />
      </div>

      <div className={studioPreviewTransportStack}>
        <div
          className={`${studioPreviewControls} flex flex-wrap items-center justify-center gap-1`}
        >
          {scenes.map((s, index) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (isPlaying && playbackScope !== "scene") {
                  return;
                }

                const targetScene = scenes[index];
                if (targetScene) {
                  selection.selectScene(targetScene.id);
                }
              }}
              disabled={isPlaying && playbackScope !== "scene"}
              aria-label={`Scene ${index + 1}`}
              aria-current={index === activeSceneIndex ? "true" : undefined}
              className={`rounded-full transition-all duration-200 disabled:cursor-default ${
                index === activeSceneIndex
                  ? "h-1.5 w-5 bg-white/70"
                  : "h-1.5 w-1.5 bg-white/25 hover:bg-white/40"
              }`}
            />
          ))}
        </div>

        <div
          className={`${studioPreviewControls} flex flex-wrap items-center justify-center gap-1`}
        >
          <button
            type="button"
            onClick={() => {
              onPreviewStart?.();
              void playPreview();
            }}
            disabled={isPlaying || !hasPlayableVoiceover}
            className={studioPreviewPillPrimary}
            aria-label="Play story with voiceover"
          >
            <Play className="h-3 w-3" />
            Play Story
          </button>
          <button
            type="button"
            onClick={() => {
              onPreviewStart?.();
              void playScenePreview();
            }}
            disabled={
              isPlaying || !hasPlayableVoiceover || scenePreviewControlsDisabled
            }
            className={studioPreviewPill}
            aria-label="Play selected scene with voiceover"
            title={
              scenePreviewControlsDisabled
                ? "Exit image edit to preview a single scene"
                : "Play the selected scene with voiceover"
            }
          >
            <Play className="h-3 w-3" />
            Play Scene
          </button>
          <button
            type="button"
            onClick={toggleLoopScene}
            disabled={scenePreviewControlsDisabled}
            aria-pressed={loopSceneEnabled}
            className={`${studioPreviewPill} ${loopSceneEnabled ? "ring-accent/40 bg-accent/15 text-foreground" : ""}`}
            aria-label="Loop selected scene during scene preview"
            title={
              scenePreviewControlsDisabled
                ? "Exit image edit to use scene loop"
                : loopSceneEnabled
                  ? "Scene loop enabled"
                  : "Loop the selected scene during scene preview"
            }
          >
            <Repeat className="h-3 w-3" />
            Loop Scene
          </button>
          <button
            type="button"
            onClick={pauseVoice}
            disabled={!isPlaying && !isSpeaking}
            className={studioPreviewPillMuted}
            aria-label="Pause preview"
            title="Pause preview"
          >
            <Pause className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={stopVoice}
            disabled={!isPlaying && !isSpeaking}
            className={studioPreviewPillMuted}
            aria-label="Stop preview"
            title="Stop preview"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            data-preview-action="voice"
            onClick={playWithBrowserVoice}
            disabled={isPlaying}
            className={studioPreviewPill}
            aria-label="Preview with browser text-to-speech"
            title={
              hasCanonicalVoiceover
                ? "Preview with browser text-to-speech (does not use generated voiceover)"
                : "Preview with browser text-to-speech"
            }
          >
            <Volume2 className="h-3 w-3" />
            Voice
          </button>
        </div>

        {!hasCanonicalVoiceover ? (
          <p
            className={`${studioPreviewControls} text-center text-[10px] leading-relaxed text-muted`}
          >
            Generate or upload voiceover to preview with audio.
          </p>
        ) : null}

        {hasCanonicalVoiceover && !hasPlayableVoiceover && !playbackError ? (
          <p
            className={`${studioPreviewControls} text-center text-[10px] leading-relaxed text-muted`}
          >
            Voiceover exists but could not be loaded. Regenerate or upload
            audio.
          </p>
        ) : null}

        {playbackError ? (
          <StudioStatus
            variant="error"
            layout="inline"
            description={playbackError}
            className={`${studioPreviewControls} text-center`}
          />
        ) : null}

        <div className={`${studioPreviewControls} flex items-center gap-1`}>
          <button
            type="button"
            onClick={goPrevious}
            disabled={
              (isPlaying && !sceneScopePlaybackActive) || safeIndex === 0
            }
            className={`${studioPreviewPillMuted} flex-1`}
            aria-label="Previous scene"
            title={
              safeIndex === 0 ? "Already on the first scene" : "Previous scene"
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="shrink-0 rounded-full bg-surface-elevated/50 px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted ring-1 ring-border/30 sm:px-3 sm:py-1.5">
            {activeSceneIndex + 1} / {sceneCount}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={
              (isPlaying && !sceneScopePlaybackActive) ||
              safeIndex >= sceneCount - 1
            }
            className={`${studioPreviewPillMuted} flex-1`}
            aria-label="Next scene"
            title={
              safeIndex >= sceneCount - 1
                ? "Already on the last scene"
                : "Next scene"
            }
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {isClient ? (
          <details
            className={`${studioPreviewControls} rounded-xl bg-surface/30 ring-1 ring-border/30`}
          >
            <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-medium text-muted [&::-webkit-details-marker]:hidden">
              Browser voice settings
            </summary>
            <div className="space-y-2.5 border-t border-border/30 px-3 pb-2.5 pt-2">
              <div className="relative">
                <select
                  id="preview-voice"
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  disabled={isPlaying}
                  className={studioSelectCompact}
                >
                  {voices.length === 0 ? (
                    <option value="">Loading voices...</option>
                  ) : (
                    voices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className={studioSelectChevronCompact} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Rate", value: speechRate, set: setSpeechRate },
                  { label: "Pitch", value: speechPitch, set: setSpeechPitch },
                  {
                    label: "Vol",
                    value: speechVolume,
                    set: setSpeechVolume,
                    max: 1,
                  },
                ].map(({ label, value, set, max = 1.2 }) => (
                  <label key={label} className="space-y-1">
                    <span className="flex justify-between text-[9px] text-muted-foreground">
                      {label}
                      <span>{value.toFixed(1)}</span>
                    </span>
                    <input
                      type="range"
                      min={label === "Vol" ? 0 : 0.8}
                      max={max}
                      step={0.05}
                      value={value}
                      onChange={(e) => set(Number(e.target.value))}
                      disabled={isPlaying}
                      className="h-1 w-full accent-accent disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
