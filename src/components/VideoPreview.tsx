"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  Pause,
  Play,
  Smartphone,
  Square,
  Volume2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  animateTransitionProgress,
  buildTransitionFrame,
  getPreviewFrameAtTime,
  getTransitionBetweenScenes,
  getTransitionLayerStyles,
  isPreviewTransitionFrame,
  resolveTimelineItems,
  type PreviewFrame,
} from "@/lib/previewTimeline";
import {
  getTransitionDurationLabel,
  getTransitionEffectLabel,
  TRANSITION_CARD_TITLE,
} from "@/lib/timelineItems";
import {
  studioPreviewCaption,
  studioPreviewControls,
  studioPreviewDevice,
  studioPreviewPill,
  studioPreviewPillMuted,
  studioPreviewPillPrimary,
  studioPreviewScreen,
  studioSelectChevronCompact,
  studioSelectCompact,
} from "@/lib/studioUi";
import type { FootieScene, FootieScript, SceneType } from "@/types/footiebitz";

interface VideoPreviewProps {
  script: FootieScript | null;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
}

type PlaybackMode = "browser" | "narration";

const SCENE_TYPE_META: Record<SceneType, { label: string; color: string }> = {
  intro: { label: "Intro", color: "text-white/70" },
  context: { label: "Context", color: "text-white/70" },
  match: { label: "Match", color: "text-white/70" },
  transition: { label: "Transition", color: "text-white/60" },
  ending: { label: "Ending", color: "text-white/60" },
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function SceneBackdrop({
  scene,
  sceneIndex,
  style,
}: {
  scene: FootieScene;
  sceneIndex: number;
  style?: CSSProperties;
}) {
  const sceneTypeMeta = scene.sceneType ? SCENE_TYPE_META[scene.sceneType] : null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={style}>
      {scene.uploadedImage ? (
        <img
          src={scene.uploadedImage}
          alt={`Scene ${sceneIndex + 1}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-surface via-background to-background px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
            <Film className="h-5 w-5 text-white/40" />
          </div>
          {sceneTypeMeta ? (
            <p className={`text-[10px] font-medium uppercase tracking-widest ${sceneTypeMeta.color}`}>
              {sceneTypeMeta.label}
            </p>
          ) : (
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">
              Scene {sceneIndex + 1}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewDeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className={studioPreviewDevice}>
      <div className={studioPreviewScreen}>{children}</div>
    </div>
  );
}

function DynamicIsland() {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2.5">
      <div className="h-[22px] w-[72px] rounded-full bg-black/80 ring-1 ring-white/[0.08]" />
    </div>
  );
}

export default function VideoPreview({
  script,
  selectedSceneIndex,
  onSelectedSceneChange,
}: VideoPreviewProps) {
  const scenes = useMemo(() => script?.scenes ?? [], [script?.scenes]);
  const timelineItems = useMemo(
    () => resolveTimelineItems(script?.timelineItems, scenes),
    [script?.timelineItems, scenes],
  );
  const sceneCount = scenes.length;
  const totalDuration = script?.totalDuration ?? 0;
  const safeIndex = sceneCount > 0 ? Math.min(selectedSceneIndex, sceneCount - 1) : 0;
  const hasNarration = Boolean(script?.voiceoverUrl);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [animatedFrame, setAnimatedFrame] = useState<PreviewFrame | null>(null);
  const isClient = useIsClient();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [speechRate, setSpeechRate] = useState(1);
  const [speechPitch, setSpeechPitch] = useState(1);
  const [speechVolume, setSpeechVolume] = useState(1);

  const isPlayingRef = useRef(false);
  const playbackModeRef = useRef<PlaybackMode | null>(null);
  const speakSceneRef = useRef<(index: number) => void>(() => {});
  const advanceToSceneRef = useRef<(index: number) => void>(() => {});
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const cancelTransitionRef = useRef<(() => void) | null>(null);
  const voiceInitializedRef = useRef(false);
  const voiceSettingsRef = useRef({ rate: 1, pitch: 1, volume: 1, voiceURI: "" });

  const displayIndex = isPlaying ? currentSceneIndex : safeIndex;
  const scene = scenes[displayIndex];

  const previewFrame = useMemo((): PreviewFrame | null => {
    if (!scene) return null;
    if (animatedFrame) return animatedFrame;
    if (isPlaying && playbackMode === "narration") {
      return getPreviewFrameAtTime(timelineItems, scenes, elapsedSec);
    }
    return { kind: "scene", scene, sceneIndex: displayIndex };
  }, [
    animatedFrame,
    displayIndex,
    elapsedSec,
    isPlaying,
    playbackMode,
    scene,
    scenes,
    timelineItems,
  ]);

  const activeSceneIndex = previewFrame
    ? isPreviewTransitionFrame(previewFrame)
      ? previewFrame.toSceneIndex
      : previewFrame.sceneIndex
    : displayIndex;

  const progressPct =
    totalDuration > 0 && playbackMode === "narration"
      ? Math.min(100, Math.round((elapsedSec / totalDuration) * 100))
      : 0;

  const clearAdvanceTimeout = useCallback(() => {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
  }, []);

  const cancelTransitionAnimation = useCallback(() => {
    cancelTransitionRef.current?.();
    cancelTransitionRef.current = null;
    setAnimatedFrame(null);
  }, []);

  const stopNarrationAudio = useCallback(() => {
    const audio = narrationAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const resetTimeline = useCallback(() => {
    setCurrentSceneIndex(0);
    setElapsedSec(0);
    onSelectedSceneChange(0);
  }, [onSelectedSceneChange]);

  const stopVoice = useCallback(() => {
    clearAdvanceTimeout();
    cancelTransitionAnimation();
    stopNarrationAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isPlayingRef.current = false;
    playbackModeRef.current = null;
    setIsPlaying(false);
    setIsSpeaking(false);
    setPlaybackMode(null);
    resetTimeline();
  }, [cancelTransitionAnimation, clearAdvanceTimeout, resetTimeline, stopNarrationAudio]);

  const pauseVoice = useCallback(() => {
    clearAdvanceTimeout();
    cancelTransitionAnimation();
    if (playbackModeRef.current === "narration") {
      narrationAudioRef.current?.pause();
    } else if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsSpeaking(false);
  }, [cancelTransitionAnimation, clearAdvanceTimeout]);

  const syncSceneToAudioTime = useCallback(
    (currentTimeSec: number) => {
      const frame = getPreviewFrameAtTime(timelineItems, scenes, currentTimeSec);
      const index = isPreviewTransitionFrame(frame) ? frame.toSceneIndex : frame.sceneIndex;
      setCurrentSceneIndex(index);
      setElapsedSec(currentTimeSec);
      onSelectedSceneChange(index);
    },
    [onSelectedSceneChange, scenes, timelineItems],
  );

  const scheduleAdvanceAfterScene = useCallback(
    (index: number, sceneStartTime: number) => {
      const sceneDurationMs = Math.max(1, scenes[index]?.duration ?? 5) * 1000;
      const elapsedMs = Date.now() - sceneStartTime;
      const remainingMs = Math.max(0, sceneDurationMs - elapsedMs);

      clearAdvanceTimeout();
      advanceTimeoutRef.current = setTimeout(() => {
        advanceTimeoutRef.current = null;
        if (!isPlayingRef.current) return;
        if (index + 1 < sceneCount) {
          advanceToSceneRef.current(index + 1);
        } else {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setIsSpeaking(false);
        }
      }, remainingMs);
    },
    [clearAdvanceTimeout, sceneCount, scenes],
  );

  const speakSceneAt = useCallback(
    (index: number) => {
      if (!script || index >= sceneCount || !isPlayingRef.current) {
        stopVoice();
        return;
      }

      clearAdvanceTimeout();
      const sceneStartTime = Date.now();
      const subtitle = scenes[index]?.subtitle?.trim();

      setCurrentSceneIndex(index);
      onSelectedSceneChange(index);

      if (!subtitle || subtitle === "Add subtitle...") {
        setIsSpeaking(false);
        scheduleAdvanceAfterScene(index, sceneStartTime);
        return;
      }

      setIsSpeaking(true);

      if (typeof window === "undefined" || !window.speechSynthesis) {
        stopVoice();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(subtitle);
      const { rate, pitch, volume, voiceURI } = voiceSettingsRef.current;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        setIsSpeaking(false);
        if (!isPlayingRef.current) return;
        scheduleAdvanceAfterScene(index, sceneStartTime);
      };
      utterance.onerror = () => stopVoice();

      window.speechSynthesis.speak(utterance);
    },
    [
      clearAdvanceTimeout,
      onSelectedSceneChange,
      sceneCount,
      scenes,
      scheduleAdvanceAfterScene,
      script,
      stopVoice,
    ],
  );

  const advanceToScene = useCallback(
    (nextIndex: number) => {
      if (!isPlayingRef.current || nextIndex >= sceneCount) return;

      const prevIndex = nextIndex - 1;
      if (prevIndex < 0) {
        speakSceneRef.current(nextIndex);
        return;
      }

      const fromScene = scenes[prevIndex];
      const toScene = scenes[nextIndex];
      const transition = getTransitionBetweenScenes(timelineItems, fromScene.id, toScene.id);

      if (!transition || transition.effect === "cut" || transition.durationMs <= 0) {
        speakSceneRef.current(nextIndex);
        return;
      }

      cancelTransitionAnimation();
      cancelTransitionRef.current = animateTransitionProgress(
        transition.durationMs,
        (progress) => {
          setAnimatedFrame(
            buildTransitionFrame(timelineItems, scenes, prevIndex, nextIndex, progress),
          );
        },
        () => {
          cancelTransitionRef.current = null;
          setAnimatedFrame(null);
          if (isPlayingRef.current) {
            speakSceneRef.current(nextIndex);
          }
        },
      );
    },
    [cancelTransitionAnimation, sceneCount, scenes, timelineItems],
  );

  useEffect(() => {
    advanceToSceneRef.current = advanceToScene;
  }, [advanceToScene]);

  useEffect(() => {
    speakSceneRef.current = speakSceneAt;
  }, [speakSceneAt]);

  useEffect(() => {
    voiceSettingsRef.current = {
      rate: speechRate,
      pitch: speechPitch,
      volume: speechVolume,
      voiceURI: selectedVoiceURI,
    };
  }, [speechRate, speechPitch, speechVolume, selectedVoiceURI]);

  useEffect(() => {
    if (!isClient || typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      if (!voiceInitializedRef.current && available.length > 0) {
        const preferred =
          available.find((v) => v.default) ??
          available.find((v) => v.lang.startsWith("en")) ??
          available[0];
        setSelectedVoiceURI(preferred.voiceURI);
        voiceInitializedRef.current = true;
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [isClient]);

  const playWithBrowserVoice = useCallback(() => {
    if (sceneCount === 0) return;
    stopNarrationAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    cancelTransitionAnimation();
    playbackModeRef.current = "browser";
    setPlaybackMode("browser");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSceneIndex(0);
    onSelectedSceneChange(0);
    speakSceneAt(0);
  }, [cancelTransitionAnimation, onSelectedSceneChange, sceneCount, speakSceneAt, stopNarrationAudio]);

  const playPreview = async () => {
    const voiceoverUrl = script?.voiceoverUrl;
    if (sceneCount === 0 || !voiceoverUrl) return;

    if (!narrationAudioRef.current) {
      narrationAudioRef.current = new Audio(voiceoverUrl);
    }

    const playbackAudio = narrationAudioRef.current;

    clearAdvanceTimeout();
    cancelTransitionAnimation();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();

    playbackModeRef.current = "narration";
    setPlaybackMode("narration");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsSpeaking(false);

    playbackAudio.pause();
    playbackAudio.currentTime = 0;
    setCurrentSceneIndex(0);
    setElapsedSec(0);
    onSelectedSceneChange(0);

    try {
      await playbackAudio.play();
    } catch {
      stopVoice();
    }
  };

  useEffect(() => {
    if (!script?.voiceoverUrl) {
      narrationAudioRef.current = null;
      return;
    }

    const audio = new Audio(script.voiceoverUrl);
    narrationAudioRef.current = audio;

    const handleTimeUpdate = () => {
      if (!isPlayingRef.current || playbackModeRef.current !== "narration") return;
      syncSceneToAudioTime(audio.currentTime);
    };

    const handleEnded = () => {
      if (playbackModeRef.current !== "narration") return;
      stopVoice();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audio.src = "";
      if (narrationAudioRef.current === audio) narrationAudioRef.current = null;
      if (playbackModeRef.current === "narration") {
        isPlayingRef.current = false;
        playbackModeRef.current = null;
      }
    };
  }, [script?.voiceoverUrl, stopVoice, syncSceneToAudioTime]);

  useEffect(() => {
    return () => {
      clearAdvanceTimeout();
      cancelTransitionAnimation();
      stopNarrationAudio();
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      isPlayingRef.current = false;
      playbackModeRef.current = null;
    };
  }, [cancelTransitionAnimation, clearAdvanceTimeout, stopNarrationAudio]);

  const goPrevious = () => {
    if (isPlaying || safeIndex <= 0) return;
    onSelectedSceneChange(safeIndex - 1);
  };

  const goNext = () => {
    if (isPlaying || safeIndex >= sceneCount - 1) return;
    onSelectedSceneChange(safeIndex + 1);
  };

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

  const displayScene = isPreviewTransitionFrame(previewFrame)
    ? previewFrame.toScene
    : previewFrame.scene;
  const captionText =
    !isPreviewTransitionFrame(previewFrame) &&
    displayScene.subtitle &&
    displayScene.subtitle !== "Add subtitle..."
      ? displayScene.subtitle
      : null;

  const transitionStyles = isPreviewTransitionFrame(previewFrame)
    ? getTransitionLayerStyles(previewFrame.transition.effect, previewFrame.progress)
    : null;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:gap-4">
      <PreviewDeviceFrame>
        <DynamicIsland />

        {isPreviewTransitionFrame(previewFrame) && transitionStyles ? (
          <>
            <SceneBackdrop
              scene={previewFrame.fromScene}
              sceneIndex={previewFrame.fromSceneIndex}
              style={transitionStyles.from}
            />
            <SceneBackdrop
              scene={previewFrame.toScene}
              sceneIndex={previewFrame.toSceneIndex}
              style={transitionStyles.to}
            />
          </>
        ) : previewFrame.kind === "scene" ? (
          <SceneBackdrop scene={previewFrame.scene} sceneIndex={previewFrame.sceneIndex} />
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" />

        <div className="absolute inset-x-0 top-0 z-10 px-4 pb-2 pt-11">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
            FootieBitz
          </p>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-white/95">
            {script.title}
          </h3>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-4 pb-4">
          {isPreviewTransitionFrame(previewFrame) ? (
            <div className={studioPreviewCaption}>{TRANSITION_CARD_TITLE}</div>
          ) : captionText ? (
            <div className={studioPreviewCaption}>{captionText}</div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-white/50">
            {isPreviewTransitionFrame(previewFrame) ? (
              <>
                <span>{getTransitionEffectLabel(previewFrame.transition.effect)}</span>
                <span>·</span>
                <span>{getTransitionDurationLabel(previewFrame.transition.durationMs)}</span>
              </>
            ) : (
              <>
                {displayScene.sceneType ? (
                  <span className="capitalize">{displayScene.sceneType}</span>
                ) : null}
                {displayScene.sceneType ? <span>·</span> : null}
                <span className="tabular-nums">
                  {displayScene.start}s – {displayScene.end}s
                </span>
              </>
            )}
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
        </div>
      </PreviewDeviceFrame>

      {/* Scene dots */}
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

      {/* Playback pills */}
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
          Create narration to unlock Play with voiceover.
        </p>
      ) : null}

      {/* Scene navigation */}
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
