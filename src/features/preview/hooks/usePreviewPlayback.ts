"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { buildAudioMixFromStory, getAudioEngine, logAudioEngineState } from "@/features/audio";
import { getDisplayCaption, getSceneTimingMap, getSceneVoiceoverExcerpt } from "@/features/story/utils";
import {
  buildPreviewMasterTimeline,
  resolvePreviewDurationSec,
  resolvePreviewPlaybackState,
  resolvePreviewBackgroundMusicPlaybackVolume,
  resolveTimelineItems,
  type PreviewSceneFrame,
} from "@/features/preview/utils";
import { logPreviewMasterTimelineDiagnostics } from "@/features/timeline-intelligence/preview-timeline-diagnostics.dev.utils";
import type { FootieScript } from "@/features/story/types";
import { getStoryVoiceoverDurationSec } from "@/lib/voiceover";

export type PlaybackMode = "browser" | "narration";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export interface UsePreviewPlaybackOptions {
  script: FootieScript | null;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
}

export function usePreviewPlayback({
  script,
  selectedSceneIndex,
  onSelectedSceneChange,
}: UsePreviewPlaybackOptions) {
  const scenes = useMemo(() => script?.scenes ?? [], [script?.scenes]);
  const timelineItems = useMemo(
    () => resolveTimelineItems(script?.timelineItems, scenes),
    [script?.timelineItems, scenes],
  );
  const audioEngine = useMemo(() => getAudioEngine(), []);
  const audioMix = useMemo(() => buildAudioMixFromStory(script), [script]);
  const voiceoverTrack = audioMix.voiceover;
  const backgroundTrack = audioMix.background;
  const masterTimeline = useMemo(() => buildPreviewMasterTimeline(script), [script]);
  const sceneCount = scenes.length;
  const totalDuration = masterTimeline
    ? resolvePreviewDurationSec(masterTimeline)
    : getStoryVoiceoverDurationSec(script);
  const safeIndex = sceneCount > 0 ? Math.min(selectedSceneIndex, sceneCount - 1) : 0;
  const hasNarration = Boolean(voiceoverTrack?.src);
  const voiceoverUrl = voiceoverTrack?.src;
  const backgroundMusicUrl =
    backgroundTrack?.enabled ? backgroundTrack.src : undefined;

  useEffect(() => {
    logAudioEngineState(script, "preview");
  }, [script, audioMix.masterDurationMs, voiceoverUrl, backgroundMusicUrl]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const isClient = useIsClient();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [speechRate, setSpeechRate] = useState(1);
  const [speechPitch, setSpeechPitch] = useState(1);
  const [speechVolume, setSpeechVolume] = useState(1);
  const [previewClockMs, setPreviewClockMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [narrationEnded, setNarrationEnded] = useState(false);

  const isPlayingRef = useRef(false);
  const playbackModeRef = useRef<PlaybackMode | null>(null);
  const speakSceneRef = useRef<(index: number) => void>(() => {});
  const advanceToSceneRef = useRef<(index: number) => void>(() => {});
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackStartedAtMsRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const narrationEndedRef = useRef(false);
  const timelineClockMsRef = useRef(0);
  const lastTailTickWallMsRef = useRef<number | null>(null);
  const tailHoldLoggedRef = useRef(false);
  const [browserSceneStartedAtMs, setBrowserSceneStartedAtMs] = useState<number | null>(null);
  const voiceInitializedRef = useRef(false);
  const voiceSettingsRef = useRef({ rate: 1, pitch: 1, volume: 1, voiceURI: "" });

  const displayIndex = isPlaying ? currentSceneIndex : safeIndex;
  const scene = scenes[displayIndex];

  const previewFrame = useMemo((): PreviewSceneFrame | null => {
    if (!scene) return null;
    if (isPlaying && playbackMode === "narration" && masterTimeline) {
      const state = resolvePreviewPlaybackState(
        masterTimeline,
        scenes,
        Math.floor(elapsedSec * 1000),
      );
      if (state) {
        return { kind: "scene", scene: state.scene, sceneIndex: state.sceneIndex };
      }
    }
    return { kind: "scene", scene, sceneIndex: displayIndex };
  }, [displayIndex, elapsedSec, isPlaying, masterTimeline, playbackMode, scene, scenes]);

  const activeSceneIndex = previewFrame?.sceneIndex ?? displayIndex;

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

  const stopNarrationAudio = useCallback(() => {
    const audio = narrationAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const stopBackgroundMusic = useCallback(() => {
    const audio = backgroundMusicAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const pauseBackgroundMusic = useCallback(() => {
    backgroundMusicAudioRef.current?.pause();
  }, []);

  const startBackgroundMusic = useCallback(async (startAtSec = 0) => {
    const audio = backgroundMusicAudioRef.current;
    if (!audio) return;

    audio.loop = true;
    audio.currentTime = startAtSec;

    try {
      await audio.play();
    } catch {
      // Background music is optional — preview still works without it.
    }
  }, []);

  const syncBackgroundMusicVolume = useCallback(() => {
    const musicAudio = backgroundMusicAudioRef.current;
    if (!musicAudio || !script) {
      return;
    }

    const narrationAudio = narrationAudioRef.current;
    const mode = playbackModeRef.current;
    let elapsedSec = 0;
    let voiceoverIsPlaying = false;

    if (mode === "narration" && narrationAudio) {
      elapsedSec = narrationAudio.currentTime;
      voiceoverIsPlaying = !narrationAudio.paused && !narrationAudio.ended;
    } else if (mode === "browser") {
      if (playbackStartedAtMsRef.current != null) {
        elapsedSec = (Date.now() - playbackStartedAtMsRef.current) / 1000;
      }
      voiceoverIsPlaying = isSpeakingRef.current;
    }

    musicAudio.volume = resolvePreviewBackgroundMusicPlaybackVolume({
      script,
      elapsedSec,
      totalDurationSec: totalDuration,
      voiceoverIsPlaying,
    });
  }, [script, totalDuration]);

  const resetTimeline = useCallback(() => {
    setCurrentSceneIndex(0);
    setElapsedSec(0);
    setCurrentTimeMs(0);
    timelineClockMsRef.current = 0;
    narrationEndedRef.current = false;
    lastTailTickWallMsRef.current = null;
    tailHoldLoggedRef.current = false;
    setNarrationEnded(false);
    onSelectedSceneChange(0);
  }, [onSelectedSceneChange]);

  const stopVoice = useCallback(() => {
    clearAdvanceTimeout();
    stopNarrationAudio();
    stopBackgroundMusic();
    playbackStartedAtMsRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isPlayingRef.current = false;
    playbackModeRef.current = null;
    setIsPlaying(false);
    setIsSpeaking(false);
    setPlaybackMode(null);
    resetTimeline();
  }, [clearAdvanceTimeout, resetTimeline, stopBackgroundMusic, stopNarrationAudio]);

  const pauseVoice = useCallback(() => {
    clearAdvanceTimeout();
    if (playbackModeRef.current === "narration") {
      narrationAudioRef.current?.pause();
    } else if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    pauseBackgroundMusic();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsSpeaking(false);
  }, [clearAdvanceTimeout, pauseBackgroundMusic]);

  const syncSceneToTimelineTime = useCallback(
    (timeMs: number) => {
      if (!masterTimeline) return;

      const clampedMs = Math.min(Math.max(0, timeMs), masterTimeline.renderDurationMs);
      timelineClockMsRef.current = clampedMs;
      const state = resolvePreviewPlaybackState(masterTimeline, scenes, clampedMs);
      if (!state) return;

      setCurrentSceneIndex(state.sceneIndex);
      setElapsedSec(clampedMs / 1000);
      setCurrentTimeMs(clampedMs);
      onSelectedSceneChange(state.sceneIndex);
    },
    [masterTimeline, onSelectedSceneChange, scenes],
  );

  const scheduleAdvanceAfterScene = useCallback(
    (index: number, sceneStartTime: number) => {
      const sceneDurationMs = getSceneTimingMap(scenes)[index]?.durationMs ?? 1000;
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
          stopBackgroundMusic();
          playbackStartedAtMsRef.current = null;
        }
      }, remainingMs);
    },
    [clearAdvanceTimeout, sceneCount, scenes, stopBackgroundMusic],
  );

  const speakSceneAt = useCallback(
    (index: number) => {
      if (!script || index >= sceneCount || !isPlayingRef.current) {
        stopVoice();
        return;
      }

      clearAdvanceTimeout();
      const sceneStartTime = Date.now();
      setBrowserSceneStartedAtMs(sceneStartTime);
      const currentScene = scenes[index];
      const speechText = currentScene
        ? getSceneVoiceoverExcerpt(currentScene) || getDisplayCaption(currentScene)
        : "";

      setCurrentSceneIndex(index);
      onSelectedSceneChange(index);

      if (!speechText) {
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
      const utterance = new SpeechSynthesisUtterance(speechText);
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
      speakSceneRef.current(nextIndex);
    },
    [sceneCount],
  );

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let frameId = 0;
    const tick = () => {
      const now = Date.now();
      setPreviewClockMs(now);

      if (playbackModeRef.current === "narration" && masterTimeline) {
        const audio = narrationAudioRef.current;
        if (audio && isPlayingRef.current) {
          if (!audio.ended && !audio.paused) {
            narrationEndedRef.current = false;
            lastTailTickWallMsRef.current = null;
            tailHoldLoggedRef.current = false;
            setNarrationEnded(false);
            syncSceneToTimelineTime(Math.floor(audio.currentTime * 1000));
          } else if (audio.ended || narrationEndedRef.current) {
            if (!narrationEndedRef.current) {
              narrationEndedRef.current = true;
              setNarrationEnded(true);
              const audioEndMs =
                Math.floor(audio.duration * 1000) || masterTimeline.narrationDurationMs;
              syncSceneToTimelineTime(Math.max(timelineClockMsRef.current, audioEndMs));
              lastTailTickWallMsRef.current = now;

              if (
                process.env.NODE_ENV === "development" &&
                script &&
                !tailHoldLoggedRef.current &&
                masterTimeline.renderDurationMs > audioEndMs
              ) {
                tailHoldLoggedRef.current = true;
                logPreviewMasterTimelineDiagnostics(masterTimeline, {
                  script,
                  currentTimeMs: timelineClockMsRef.current,
                  narrationEnded: true,
                });
              }
            } else if (!audio.paused || audio.ended) {
              const lastTick = lastTailTickWallMsRef.current ?? now;
              lastTailTickWallMsRef.current = now;
              const deltaMs = now - lastTick;
              const nextMs = Math.min(
                masterTimeline.renderDurationMs,
                timelineClockMsRef.current + deltaMs,
              );
              syncSceneToTimelineTime(nextMs);
              if (nextMs >= masterTimeline.renderDurationMs) {
                stopVoice();
              }
            }
          }
        }
      }

      syncBackgroundMusicVolume();

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, masterTimeline, script, stopVoice, syncBackgroundMusicVolume, syncSceneToTimelineTime]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

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
    playbackModeRef.current = "browser";
    setPlaybackMode("browser");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSceneIndex(0);
    onSelectedSceneChange(0);
    playbackStartedAtMsRef.current = Date.now();
    void startBackgroundMusic(0);
    speakSceneAt(0);
  }, [onSelectedSceneChange, sceneCount, speakSceneAt, startBackgroundMusic, stopNarrationAudio]);

  const playPreview = async () => {
    if (sceneCount === 0 || !voiceoverUrl || !script) return;

    const playbackAudio = audioEngine.getNarrationAudioElementBySrc(voiceoverUrl);
    if (!playbackAudio) return;

    narrationAudioRef.current = playbackAudio;

    clearAdvanceTimeout();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();

    playbackModeRef.current = "narration";
    setPlaybackMode("narration");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsSpeaking(false);

    playbackAudio.pause();
    playbackAudio.currentTime = 0;
    narrationEndedRef.current = false;
    lastTailTickWallMsRef.current = null;
    tailHoldLoggedRef.current = false;
    setNarrationEnded(false);
    setCurrentSceneIndex(0);
    setElapsedSec(0);
    setCurrentTimeMs(0);
    timelineClockMsRef.current = 0;
    onSelectedSceneChange(0);

    try {
      await playbackAudio.play();
      playbackStartedAtMsRef.current = Date.now();
      await startBackgroundMusic(0);
      syncBackgroundMusicVolume();
    } catch {
      stopVoice();
    }
  };

  useEffect(() => {
    if (!script || !voiceoverUrl) {
      narrationAudioRef.current = null;
      return;
    }

    const audio = audioEngine.getNarrationAudioElementBySrc(voiceoverUrl);
    if (!audio) {
      narrationAudioRef.current = null;
      return;
    }

    narrationAudioRef.current = audio;

    const handleTimeUpdate = () => {
      if (!isPlayingRef.current || playbackModeRef.current !== "narration") return;
      if (narrationEndedRef.current) return;
      syncSceneToTimelineTime(Math.floor(audio.currentTime * 1000));
    };

    const handleEnded = () => {
      if (playbackModeRef.current !== "narration") return;
      narrationEndedRef.current = true;
      setNarrationEnded(true);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audioEngine.detachNarrationPreviewElement(voiceoverUrl, audio);
      if (narrationAudioRef.current === audio) narrationAudioRef.current = null;
      if (playbackModeRef.current === "narration") {
        isPlayingRef.current = false;
        playbackModeRef.current = null;
      }
    };
  }, [audioEngine, script, syncSceneToTimelineTime, voiceoverUrl]);

  useEffect(() => {
    if (!masterTimeline || !script) {
      return;
    }

    logPreviewMasterTimelineDiagnostics(masterTimeline, { script });
  }, [masterTimeline, script]);

  useEffect(() => {
    if (!backgroundMusicUrl) {
      backgroundMusicAudioRef.current = null;
      return;
    }

    const audio = audioEngine.getBackgroundMusicAudioElementBySrc(backgroundMusicUrl);
    if (!audio) {
      backgroundMusicAudioRef.current = null;
      return;
    }

    backgroundMusicAudioRef.current = audio;

    return () => {
      audioEngine.detachBackgroundMusicPreviewElement(backgroundMusicUrl, audio);
      if (backgroundMusicAudioRef.current === audio) {
        backgroundMusicAudioRef.current = null;
      }
    };
  }, [audioEngine, backgroundMusicUrl]);

  useEffect(() => {
    return () => {
      clearAdvanceTimeout();
      stopNarrationAudio();
      stopBackgroundMusic();
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      isPlayingRef.current = false;
      playbackModeRef.current = null;
    };
  }, [clearAdvanceTimeout, stopBackgroundMusic, stopNarrationAudio]);

  const activeBrowserSceneStartedAtMs = isPlaying ? browserSceneStartedAtMs : null;

  const goPrevious = () => {
    if (isPlaying || safeIndex <= 0) return;
    onSelectedSceneChange(safeIndex - 1);
  };

  const goNext = () => {
    if (isPlaying || safeIndex >= sceneCount - 1) return;
    onSelectedSceneChange(safeIndex + 1);
  };

  return {
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
    browserSceneStartedAtMs: activeBrowserSceneStartedAtMs,
    timelineItems,
    masterTimeline,
    currentTimeMs,
    narrationEnded,
    scene,
    playPreview,
    playWithBrowserVoice,
    pauseVoice,
    stopVoice,
    goPrevious,
    goNext,
  };
}
