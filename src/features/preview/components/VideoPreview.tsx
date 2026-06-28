"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Smartphone,
  Square,
  Volume2,
} from "lucide-react";

import CaptionOverlay from "@/features/preview/components/CaptionOverlay";
import PreviewFrame, { DynamicIsland, PreviewDeviceFrame } from "@/features/preview/components/PreviewFrame";
import SubtitleOverlay from "@/features/preview/components/SubtitleOverlay";
import { usePreviewPlayback } from "@/features/preview/hooks/usePreviewPlayback";
import { getPreviewSceneTiming, resolvePreviewTimelineImageMotion, resolvePreviewTransitionOverlay } from "@/features/preview/utils";
import { normalizeCaptionMode } from "@/features/story/utils";
import {
  studioPreviewControls,
  studioPreviewPill,
  studioPreviewPillMuted,
  studioPreviewPillPrimary,
  studioSelectChevronCompact,
  studioSelectCompact,
} from "@/lib/studioUi";
import type { FootieScript } from "@/features/story/types";

interface VideoPreviewProps {
  script: FootieScript | null;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
}

export default function VideoPreview({
  script,
  selectedSceneIndex,
  onSelectedSceneChange,
}: VideoPreviewProps) {
  const playback = usePreviewPlayback({
    script,
    selectedSceneIndex,
    onSelectedSceneChange,
  });

  const {
    scenes,
    sceneCount,
    totalDuration,
    safeIndex,
    hasNarration,
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
    playPreview,
    playWithBrowserVoice,
    pauseVoice,
    stopVoice,
    goPrevious,
    goNext,
  } = playback;

  if (!script || sceneCount === 0 || !scene || !previewFrame) {
    return (
      <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:gap-4">
        <PreviewDeviceFrame>
          <DynamicIsland />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
              <Smartphone className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-sm font-medium text-white/90">Preview your short</p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/45">
              Your 9:16 storyboard appears here scene by scene.
            </p>
          </div>
        </PreviewDeviceFrame>
      </div>
    );
  }

  const displayScene = previewFrame.scene;
  const isNarrationSubtitles =
    normalizeCaptionMode(displayScene.captionMode) === "subtitles";

  const previewSceneTiming = getPreviewSceneTiming({
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
  const { sceneElapsedMs, sceneDurationMs, sceneTimelineImageMotion, timelineTimeMs } =
    previewSceneTiming;
  const transitionOverlay =
    masterTimeline && timelineTimeMs != null
      ? resolvePreviewTransitionOverlay(masterTimeline, scenes, timelineTimeMs)
      : null;
  const transitionFromTimelineImageMotion =
    transitionOverlay && masterTimeline && timelineTimeMs != null
      ? resolvePreviewTimelineImageMotion(
          masterTimeline,
          transitionOverlay.fromScene,
          timelineTimeMs,
        )
      : null;
  const transitionToTimelineImageMotion =
    transitionOverlay && masterTimeline && timelineTimeMs != null
      ? resolvePreviewTimelineImageMotion(
          masterTimeline,
          transitionOverlay.toScene,
          timelineTimeMs,
        )
      : null;
  const hideCaptionsDuringTransition = transitionOverlay != null;
  const subtitleScene =
    playbackMode === "narration" && previewSceneTiming.activeSceneIndex != null
      ? (scenes[previewSceneTiming.activeSceneIndex] ?? displayScene)
      : displayScene;
  const showSubtitles = isNarrationSubtitles && !hideCaptionsDuringTransition;
  const showGeneratedCaption = !isNarrationSubtitles && !hideCaptionsDuringTransition;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:gap-4">
      <PreviewFrame
        title={script.title}
        previewFrame={previewFrame}
        transitionOverlay={transitionOverlay}
        sceneTimelineImageMotion={sceneTimelineImageMotion}
        transitionFromTimelineImageMotion={transitionFromTimelineImageMotion}
        transitionToTimelineImageMotion={transitionToTimelineImageMotion}
        overlay={
          showSubtitles ? (
            <SubtitleOverlay
              scene={subtitleScene}
              sceneElapsedMs={sceneElapsedMs}
              sceneDurationMs={sceneDurationMs}
              activeSubtitleChunk={previewSceneTiming.activeSubtitleChunk}
              chunkProgress={previewSceneTiming.chunkProgress}
              captionAnimationState={previewSceneTiming.captionAnimationState}
              subtitleAvailableDurationMs={previewSceneTiming.subtitleAvailableDurationMs}
            />
          ) : null
        }
        footer={
          <>
            {showGeneratedCaption ? <CaptionOverlay scene={displayScene} /> : null}

            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-white/50">
              {displayScene.sceneType ? (
                <span className="capitalize">{displayScene.sceneType}</span>
              ) : null}
              {displayScene.sceneType ? <span>·</span> : null}
              <span className="tabular-nums">
                {displayScene.start}s – {displayScene.end}s
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
                  <span>Narration</span>
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

      <div className={`${studioPreviewControls} flex flex-wrap items-center justify-center gap-1.5`}>
        {scenes.map((s, index) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              if (!isPlaying) onSelectedSceneChange(index);
            }}
            disabled={isPlaying}
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

      <div className={`${studioPreviewControls} flex flex-wrap items-center justify-center gap-1.5`}>
        <button
          type="button"
          onClick={playPreview}
          disabled={isPlaying || !hasNarration}
          className={studioPreviewPillPrimary}
        >
          <Play className="h-3 w-3" />
          Play
        </button>
        <button
          type="button"
          onClick={playWithBrowserVoice}
          disabled={isPlaying}
          className={studioPreviewPill}
        >
          <Volume2 className="h-3 w-3" />
          Voice
        </button>
        <button
          type="button"
          onClick={pauseVoice}
          disabled={!isPlaying && !isSpeaking}
          className={studioPreviewPillMuted}
        >
          <Pause className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={stopVoice}
          disabled={!isPlaying && !isSpeaking}
          className={studioPreviewPillMuted}
        >
          <Square className="h-3 w-3" />
        </button>
      </div>

      {!hasNarration ? (
        <p className={`${studioPreviewControls} text-center text-[10px] leading-relaxed text-muted`}>
          No narration yet. Create it from your script to sync scenes and preview audio.
        </p>
      ) : null}

      <div className={`${studioPreviewControls} flex items-center gap-1.5`}>
        <button
          type="button"
          onClick={goPrevious}
          disabled={isPlaying || safeIndex === 0}
          className={`${studioPreviewPillMuted} flex-1`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="shrink-0 rounded-full bg-surface-elevated/50 px-3 py-1.5 text-[10px] font-medium tabular-nums text-muted ring-1 ring-border/30">
          {activeSceneIndex + 1} / {sceneCount}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={isPlaying || safeIndex >= sceneCount - 1}
          className={`${studioPreviewPillMuted} flex-1`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {isClient ? (
        <details className={`${studioPreviewControls} rounded-xl bg-surface/30 ring-1 ring-border/30`}>
          <summary className="cursor-pointer list-none px-3 py-2.5 text-[10px] font-medium text-muted [&::-webkit-details-marker]:hidden">
            Browser voice settings
          </summary>
          <div className="space-y-3 border-t border-border/30 px-3 pb-3 pt-2">
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
                { label: "Vol", value: speechVolume, set: setSpeechVolume, max: 1 },
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
  );
}
