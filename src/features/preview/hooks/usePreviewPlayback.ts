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
import { resolvePreviewVoiceoverPlaybackRate } from "@/features/audio/utils/voiceover-playback-rate.utils";
import {
  getVoiceoverAvailability,
  readVoiceoverAudioBase64,
} from "@/features/audio/utils/canonical-voiceover.utils";
import {
  resolvePlayableVoiceoverFromStory,
  VOICEOVER_UNPLAYABLE_MESSAGE,
  type PlayableVoiceoverDiagnostics,
} from "@/features/audio/utils/playable-voiceover-src.utils";
import { getDisplayCaption, getSceneTimingMap, getSceneVoiceoverExcerpt } from "@/features/story/utils";
import type { PreviewPlaybackScope } from "@/features/preview/types/preview-playback-scope.types";
import {
  buildPreviewMasterTimeline,
  resolvePreviewDurationSec,
  resolvePreviewPlaybackState,
  resolvePreviewBackgroundMusicPlaybackVolume,
  resolvePreviewPeakProtectionActive,
  resolvePreviewVoiceStemGain,
  resolveTimelineItems,
  type PreviewSceneFrame,
} from "@/features/preview/utils";
import {
  resolveScenePlaybackBounds,
  resolveScenePlaybackBoundary,
} from "@/features/preview/utils/preview-scene-playback.utils";
import { resolveAuthoritativeBrandStingDurationMs } from "@/features/brand-sting/domain/normalize-brand-sting";
import {
  resolveBrandStingTimelineBounds,
  resolvePreviewPlaybackDurationMs,
} from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import {
  useShortForgeBrandStingEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { usePreviewMasterTimelineContext } from "@/features/timeline-intelligence/master-timeline";
import { logPreviewMasterTimelineDiagnostics } from "@/features/timeline-intelligence/preview-timeline-diagnostics.dev.utils";
import { isTimelineDevDiagnosticsEnabled } from "@/features/timeline-intelligence/timeline-diagnostics.dev.types";
import type { FootieScript } from "@/features/story/types";
import { getStoryVoiceoverDurationSec } from "@/lib/utils/voiceover";

export type PlaybackMode = "browser" | "narration";

const VOICEOVER_MISSING_MESSAGE =
  "Generate or upload voiceover to preview with audio.";

function reportPreviewPlaybackError(
  message: string,
  err?: unknown,
  diagnostics?: PlayableVoiceoverDiagnostics,
): void {
  if (process.env.NODE_ENV === "development") {
    console.error("[FootieBitz preview playback]", message, err ?? "", diagnostics ?? "");
  }
}

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
  const voiceoverAvailability = useMemo(
    () => getVoiceoverAvailability(script),
    [script],
  );
  const persistedVoiceoverBase64 = script ? readVoiceoverAudioBase64(script) : undefined;
  const storyVoiceoverUrl = script?.voiceoverUrl;
  const playableVoiceover = useMemo(
    () => resolvePlayableVoiceoverFromStory(script, { preferObjectUrl: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on persistedVoiceoverBase64 + storyVoiceoverUrl
    [persistedVoiceoverBase64, storyVoiceoverUrl],
  );
  const voiceoverUrl = useMemo(
    () => playableVoiceover.src ?? audioEngine.getStableVoiceoverPlaybackUrl(script),
    // Re-resolve only when canonical voiceover payload changes — not on every scene edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on persistedVoiceoverBase64 + storyVoiceoverUrl
    [audioEngine, persistedVoiceoverBase64, playableVoiceover.src, storyVoiceoverUrl],
  );
  const hasCanonicalVoiceover = voiceoverAvailability.hasCanonicalVoiceover;
  const hasPlayableVoiceover = voiceoverAvailability.hasPlayableVoiceover;
  const canPlayNarration = hasPlayableVoiceover && Boolean(voiceoverUrl);
  const voiceoverDiagnostics = playableVoiceover;
  const sharedPreviewTimeline = usePreviewMasterTimelineContext();
  const visualRetentionCapabilitiesReady =
    useVisualRetentionCapabilitiesReady();
  const shortForgeBrandStingCapability = useShortForgeBrandStingEnabled();
  const shortForgeBrandStingEnabled =
    visualRetentionCapabilitiesReady && shortForgeBrandStingCapability;
  const brandStingDurationMs = resolveAuthoritativeBrandStingDurationMs({
    shortForgeBrandStingEnabled,
    extensions: script?.visualRetentionExtensions,
  });
  const fallbackMasterTimeline = useMemo(() => {
    if (sharedPreviewTimeline) {
      return null;
    }
    return buildPreviewMasterTimeline(script);
  }, [script, sharedPreviewTimeline]);
  const masterTimeline =
    sharedPreviewTimeline?.previewMasterTimeline ?? fallbackMasterTimeline;
  const sceneCount = scenes.length;
  const narrationEndMs = masterTimeline?.contentEndMs ?? 0;
  const exportEndBufferMs = masterTimeline
    ? Math.max(0, masterTimeline.renderDurationMs - masterTimeline.contentEndMs)
    : 0;
  // hydration-safe: brandStingDurationMs is 0 while capabilities load / sting
  // off / invalid / removed — restore exact legacy resolvePreviewDurationSec.
  const stingBounds = resolveBrandStingTimelineBounds({
    narrationEndMs,
    endBufferMs: exportEndBufferMs,
    brandStingDurationMs,
  });
  const previewDurationMs = masterTimeline
    ? resolvePreviewPlaybackDurationMs({
        contentEndMs: masterTimeline.contentEndMs,
        renderDurationMs: masterTimeline.renderDurationMs,
        brandStingDurationMs,
      })
    : 0;
  const effectiveRenderDurationMs = previewDurationMs;
  // Legacy (no authoritative sting): identical to resolvePreviewDurationSec.
  // Authoritative sting: ends at brandStingEndMs; export end buffer excluded after.
  const totalDuration = masterTimeline
    ? brandStingDurationMs > 0
      ? previewDurationMs / 1000
      : resolvePreviewDurationSec(masterTimeline)
    : getStoryVoiceoverDurationSec(script);
  const safeIndex = sceneCount > 0 ? Math.min(selectedSceneIndex, sceneCount - 1) : 0;
  const hasNarration = canPlayNarration;
  const backgroundMusicUrl =
    backgroundTrack?.enabled ? backgroundTrack.src : undefined;

  useEffect(() => {
    logAudioEngineState(script, "preview");
    if (isTimelineDevDiagnosticsEnabled && script) {
      console.info("[FootieBitz preview playback] voiceover diagnostics", voiceoverDiagnostics);
    }
  }, [script, audioMix.masterDurationMs, voiceoverUrl, backgroundMusicUrl, voiceoverDiagnostics]);

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
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackScope, setPlaybackScope] = useState<PreviewPlaybackScope | null>(null);
  const [loopSceneEnabled, setLoopSceneEnabled] = useState(false);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);

  const isPlayingRef = useRef(false);
  const playbackModeRef = useRef<PlaybackMode | null>(null);
  const playbackScopeRef = useRef<PreviewPlaybackScope | null>(null);
  const loopSceneEnabledRef = useRef(false);
  const scenePlaybackIndexRef = useRef(0);
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

    // Silent trailing brand sting — do not extend music into the outro.
    if (
      brandStingDurationMs > 0 &&
      timelineClockMsRef.current >= narrationEndMs
    ) {
      musicAudio.volume = 0;
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

    // Fade-out stays anchored to narration end — sting must not push it later.
    const musicMixEndSec =
      brandStingDurationMs > 0 ? narrationEndMs / 1000 : totalDuration;

    musicAudio.volume = resolvePreviewBackgroundMusicPlaybackVolume({
      script,
      elapsedSec,
      totalDurationSec: musicMixEndSec,
      voiceoverIsPlaying,
    });
  }, [brandStingDurationMs, narrationEndMs, script, totalDuration]);

  const syncVoiceoverVolume = useCallback(() => {
    const narrationAudio = narrationAudioRef.current;
    if (!narrationAudio || !script || playbackModeRef.current !== "narration") {
      return;
    }

    // Mute only during the sting; seeking back into narration restores gain.
    if (
      brandStingDurationMs > 0 &&
      timelineClockMsRef.current >= narrationEndMs
    ) {
      narrationAudio.volume = 0;
      return;
    }

    audioEngine.syncNarrationPreviewGain(
      narrationAudio,
      resolvePreviewVoiceStemGain(script),
      resolvePreviewPeakProtectionActive(script),
    );
  }, [audioEngine, brandStingDurationMs, narrationEndMs, script]);

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
    playbackScopeRef.current = null;
    loopSceneEnabledRef.current = false;
    scenePlaybackIndexRef.current = 0;
    setIsPlaying(false);
    setIsSpeaking(false);
    setPlaybackMode(null);
    setPlaybackScope(null);
    setLoopSceneEnabled(false);
    setCurrentSceneId(null);
    resetTimeline();
  }, [clearAdvanceTimeout, resetTimeline, stopBackgroundMusic, stopNarrationAudio]);

  const applyVoiceoverPlaybackRate = useCallback(
    (audio: HTMLAudioElement) => {
      audio.playbackRate = resolvePreviewVoiceoverPlaybackRate({
        nominalSpeed: voiceoverTrack?.playbackRate,
      });
    },
    [voiceoverTrack?.playbackRate],
  );

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
    (timeMs: number, options?: { updateSelection?: boolean }) => {
      if (!masterTimeline) return;

      const updateSelection = options?.updateSelection ?? true;
      const clampedMs = Math.min(
        Math.max(0, timeMs),
        resolvePreviewPlaybackDurationMs({
          contentEndMs: masterTimeline.contentEndMs,
          renderDurationMs: masterTimeline.renderDurationMs,
          brandStingDurationMs,
        }),
      );
      timelineClockMsRef.current = clampedMs;
      const state = resolvePreviewPlaybackState(masterTimeline, scenes, clampedMs);
      if (!state) return;

      setCurrentSceneIndex(state.sceneIndex);
      setElapsedSec(clampedMs / 1000);
      setCurrentTimeMs(clampedMs);
      if (updateSelection) {
        onSelectedSceneChange(state.sceneIndex);
      }
    },
    [brandStingDurationMs, masterTimeline, onSelectedSceneChange, scenes],
  );

  const pauseScenePlaybackAtBoundary = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsSpeaking(false);
    pauseBackgroundMusic();
  }, [pauseBackgroundMusic]);

  const applyScenePlaybackBoundary = useCallback(
    (timeMs: number): boolean => {
      if (playbackScopeRef.current !== "scene") {
        return false;
      }

      const bounds = resolveScenePlaybackBounds(scenes, scenePlaybackIndexRef.current);
      if (!bounds) {
        return false;
      }

      const boundary = resolveScenePlaybackBoundary(
        timeMs,
        bounds,
        loopSceneEnabledRef.current,
      );
      if (!boundary) {
        return false;
      }

      const audio = narrationAudioRef.current;
      if (audio) {
        audio.currentTime = boundary.timelineMs / 1000;
      }

      syncSceneToTimelineTime(boundary.timelineMs);

      if (boundary.continuePlaying) {
        if (audio?.paused && isPlayingRef.current) {
          void audio.play().catch(() => {
            pauseScenePlaybackAtBoundary();
          });
        }
        return true;
      }

      if (audio && !audio.paused) {
        audio.pause();
      }
      pauseScenePlaybackAtBoundary();
      return true;
    },
    [pauseScenePlaybackAtBoundary, scenes, syncSceneToTimelineTime],
  );

  const seekSceneDuringPlayback = useCallback(
    (sceneIndex: number) => {
      const bounds = resolveScenePlaybackBounds(scenes, sceneIndex);
      if (!bounds) {
        return;
      }

      scenePlaybackIndexRef.current = sceneIndex;
      setCurrentSceneId(bounds.sceneId);
      onSelectedSceneChange(sceneIndex);

      const audio = narrationAudioRef.current;
      if (audio) {
        audio.currentTime = bounds.startMs / 1000;
        narrationEndedRef.current = false;
        lastTailTickWallMsRef.current = null;
        tailHoldLoggedRef.current = false;
        setNarrationEnded(false);
      }

      syncSceneToTimelineTime(bounds.startMs);

      if (audio && isPlayingRef.current && audio.paused) {
        void audio.play().catch(() => {
          pauseScenePlaybackAtBoundary();
        });
        void startBackgroundMusic(bounds.startMs / 1000);
      } else if (audio && isPlayingRef.current) {
        void startBackgroundMusic(bounds.startMs / 1000);
      }
    },
    [
      onSelectedSceneChange,
      pauseScenePlaybackAtBoundary,
      scenes,
      startBackgroundMusic,
      syncSceneToTimelineTime,
    ],
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
            const timeMs = Math.floor(audio.currentTime * 1000);
            if (playbackScopeRef.current === "scene") {
              if (applyScenePlaybackBoundary(timeMs)) {
                syncBackgroundMusicVolume();
                syncVoiceoverVolume();
                frameId = window.requestAnimationFrame(tick);
                return;
              }
              syncSceneToTimelineTime(timeMs);
            } else {
              narrationEndedRef.current = false;
              lastTailTickWallMsRef.current = null;
              tailHoldLoggedRef.current = false;
              setNarrationEnded(false);
              syncSceneToTimelineTime(timeMs);
            }
          } else if (
            playbackScopeRef.current !== "scene" &&
            (audio.ended || narrationEndedRef.current)
          ) {
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
                effectiveRenderDurationMs > audioEndMs
              ) {
                tailHoldLoggedRef.current = true;
                logPreviewMasterTimelineDiagnostics(masterTimeline, {
                  script,
                  previewTimeline: masterTimeline,
                  currentTimeMs: timelineClockMsRef.current,
                  narrationEnded: true,
                });
              }
            } else if (!audio.paused || audio.ended) {
              const lastTick = lastTailTickWallMsRef.current ?? now;
              lastTailTickWallMsRef.current = now;
              const deltaMs = now - lastTick;
              const nextMs = Math.min(
                effectiveRenderDurationMs,
                timelineClockMsRef.current + deltaMs,
              );
              syncSceneToTimelineTime(nextMs);
              if (nextMs >= effectiveRenderDurationMs) {
                stopVoice();
              }
            }
          }
        }
      }

      syncBackgroundMusicVolume();
      syncVoiceoverVolume();

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    applyScenePlaybackBoundary,
    effectiveRenderDurationMs,
    isPlaying,
    masterTimeline,
    script,
    stopVoice,
    syncBackgroundMusicVolume,
    syncVoiceoverVolume,
    syncSceneToTimelineTime,
  ]);

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
    playbackScopeRef.current = null;
    setPlaybackScope(null);
    setLoopSceneEnabled(false);
    loopSceneEnabledRef.current = false;
    setCurrentSceneId(null);
    setPlaybackMode("browser");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSceneIndex(0);
    onSelectedSceneChange(0);
    playbackStartedAtMsRef.current = Date.now();
    void startBackgroundMusic(0);
    speakSceneAt(0);
  }, [onSelectedSceneChange, sceneCount, speakSceneAt, startBackgroundMusic, stopNarrationAudio]);

  const beginNarrationPlayback = async (options: {
    scope: PreviewPlaybackScope;
    sceneIndex: number;
    startMs: number;
    allowResume?: boolean;
  }) => {
    setPlaybackError(null);

    if (sceneCount === 0 || !script) {
      const message = "Add scenes before previewing.";
      reportPreviewPlaybackError(message);
      setPlaybackError(message);
      return;
    }

    if (!hasCanonicalVoiceover) {
      reportPreviewPlaybackError(VOICEOVER_MISSING_MESSAGE, undefined, voiceoverDiagnostics);
      setPlaybackError(VOICEOVER_MISSING_MESSAGE);
      return;
    }

    if (!hasPlayableVoiceover) {
      reportPreviewPlaybackError(VOICEOVER_UNPLAYABLE_MESSAGE, undefined, voiceoverDiagnostics);
      setPlaybackError(VOICEOVER_UNPLAYABLE_MESSAGE);
      return;
    }

    const resolvedVoiceoverUrl =
      voiceoverUrl ?? audioEngine.getStableVoiceoverPlaybackUrl(script);
    if (!resolvedVoiceoverUrl) {
      const message = VOICEOVER_UNPLAYABLE_MESSAGE;
      reportPreviewPlaybackError(message, undefined, voiceoverDiagnostics);
      setPlaybackError(message);
      return;
    }

    const playbackAudio = audioEngine.getNarrationAudioElementBySrc(resolvedVoiceoverUrl);
    if (!playbackAudio) {
      const message = "Voiceover player failed to initialize.";
      reportPreviewPlaybackError(message);
      setPlaybackError(message);
      return;
    }

    narrationAudioRef.current = playbackAudio;
    applyVoiceoverPlaybackRate(playbackAudio);
    syncVoiceoverVolume();

    const previousScope = playbackScopeRef.current;
    const previousSceneIndex = scenePlaybackIndexRef.current;

    playbackScopeRef.current = options.scope;
    setPlaybackScope(options.scope);
    scenePlaybackIndexRef.current = options.sceneIndex;
    setCurrentSceneId(scenes[options.sceneIndex]?.id ?? null);

    if (options.scope === "story") {
      loopSceneEnabledRef.current = false;
      setLoopSceneEnabled(false);
    }

    const sceneBounds =
      options.scope === "scene"
        ? resolveScenePlaybackBounds(scenes, options.sceneIndex)
        : null;
    const pausedTimeMs = Math.floor(playbackAudio.currentTime * 1000);
    const canResumeWithinScene =
      sceneBounds != null &&
      pausedTimeMs >= sceneBounds.startMs &&
      pausedTimeMs < sceneBounds.endMs;

    if (
      options.allowResume !== false &&
      playbackModeRef.current === "narration" &&
      previousScope === options.scope &&
      previousSceneIndex === options.sceneIndex &&
      !playbackAudio.ended &&
      playbackAudio.paused &&
      playbackAudio.currentTime > 0 &&
      (options.scope === "story" || canResumeWithinScene)
    ) {
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsSpeaking(false);

      try {
        await playbackAudio.play();
        playbackStartedAtMsRef.current = Date.now();
        await startBackgroundMusic(playbackAudio.currentTime);
        syncBackgroundMusicVolume();
        syncVoiceoverVolume();
      } catch (err) {
        const message = "Could not resume voiceover playback.";
        reportPreviewPlaybackError(message, err);
        setPlaybackError(message);
        stopVoice();
      }
      return;
    }

    clearAdvanceTimeout();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();

    playbackModeRef.current = "narration";
    setPlaybackMode("narration");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsSpeaking(false);

    playbackAudio.pause();
    playbackAudio.currentTime = options.startMs / 1000;
    narrationEndedRef.current = false;
    lastTailTickWallMsRef.current = null;
    tailHoldLoggedRef.current = false;
    setNarrationEnded(false);
    setCurrentSceneIndex(options.sceneIndex);
    setElapsedSec(options.startMs / 1000);
    setCurrentTimeMs(options.startMs);
    timelineClockMsRef.current = options.startMs;
    onSelectedSceneChange(options.sceneIndex);

    try {
      await playbackAudio.play();
      playbackStartedAtMsRef.current = Date.now();
      await startBackgroundMusic(options.startMs / 1000);
      syncBackgroundMusicVolume();
      syncVoiceoverVolume();
    } catch (err) {
      const message = "Could not play voiceover. Check browser audio permissions.";
      reportPreviewPlaybackError(message, err);
      setPlaybackError(message);
      stopVoice();
    }
  };

  const playPreview = async () => {
    await beginNarrationPlayback({
      scope: "story",
      sceneIndex: 0,
      startMs: 0,
    });
  };

  const playScenePreview = async () => {
    const bounds = resolveScenePlaybackBounds(scenes, safeIndex);
    if (!bounds) {
      return;
    }

    await beginNarrationPlayback({
      scope: "scene",
      sceneIndex: safeIndex,
      startMs: bounds.startMs,
    });
  };

  const toggleLoopScene = useCallback(() => {
    setLoopSceneEnabled((previous) => {
      const next = !previous;
      loopSceneEnabledRef.current = next;
      return next;
    });
  }, []);

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
    applyVoiceoverPlaybackRate(audio);
    syncVoiceoverVolume();

    const handleTimeUpdate = () => {
      if (!isPlayingRef.current || playbackModeRef.current !== "narration") return;
      if (narrationEndedRef.current) return;
      const timeMs = Math.floor(audio.currentTime * 1000);
      if (playbackScopeRef.current === "scene") {
        if (applyScenePlaybackBoundary(timeMs)) {
          return;
        }
      }
      syncSceneToTimelineTime(timeMs);
    };

    const handleEnded = () => {
      if (playbackModeRef.current !== "narration") return;
      if (playbackScopeRef.current === "scene") {
        applyScenePlaybackBoundary(Number.MAX_SAFE_INTEGER);
        return;
      }
      narrationEndedRef.current = true;
      setNarrationEnded(true);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      if (!isPlayingRef.current || playbackModeRef.current !== "narration") {
        audioEngine.detachNarrationPreviewElement(voiceoverUrl, audio);
        if (narrationAudioRef.current === audio) {
          narrationAudioRef.current = null;
        }
      }
    };
  }, [
    applyScenePlaybackBoundary,
    applyVoiceoverPlaybackRate,
    audioEngine,
    script,
    syncSceneToTimelineTime,
    syncVoiceoverVolume,
    voiceoverUrl,
  ]);

  useEffect(() => {
    if (!masterTimeline || !script) {
      return;
    }

    logPreviewMasterTimelineDiagnostics(masterTimeline, {
      script,
      previewTimeline: masterTimeline,
    });
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

  useEffect(() => {
    if (!isPlaying || playbackScopeRef.current !== "scene") {
      return;
    }

    if (safeIndex === scenePlaybackIndexRef.current) {
      return;
    }

    seekSceneDuringPlayback(safeIndex);
  }, [isPlaying, safeIndex, seekSceneDuringPlayback]);

  // Sting removed / capability-off may shorten duration — clamp without restart.
  useEffect(() => {
    if (!masterTimeline || effectiveRenderDurationMs <= 0) return;
    if (timelineClockMsRef.current <= effectiveRenderDurationMs) return;
    syncSceneToTimelineTime(effectiveRenderDurationMs, {
      updateSelection: false,
    });
  }, [effectiveRenderDurationMs, masterTimeline, syncSceneToTimelineTime]);

  const activeBrowserSceneStartedAtMs = isPlaying ? browserSceneStartedAtMs : null;

  const isSceneScopePlayback = playbackScope === "scene";
  const sceneNavigationWhilePlaying = isPlaying && isSceneScopePlayback;
  // Half-open [brandStingStartMs, brandStingEndMs) — starts at contentEndMs, no gap.
  const brandStingActive =
    !isSceneScopePlayback &&
    stingBounds.durationMs > 0 &&
    currentTimeMs >= stingBounds.brandStingStartMs &&
    currentTimeMs < stingBounds.brandStingEndMs;
  const brandStingElapsedMs = brandStingActive
    ? Math.max(0, currentTimeMs - stingBounds.brandStingStartMs)
    : 0;

  const goPrevious = () => {
    if (safeIndex <= 0) return;
    if (isPlaying && !isSceneScopePlayback) return;

    const nextIndex = safeIndex - 1;
    if (sceneNavigationWhilePlaying) {
      seekSceneDuringPlayback(nextIndex);
      return;
    }

    onSelectedSceneChange(nextIndex);
  };

  const goNext = () => {
    if (safeIndex >= sceneCount - 1) return;
    if (isPlaying && !isSceneScopePlayback) return;

    const nextIndex = safeIndex + 1;
    if (sceneNavigationWhilePlaying) {
      seekSceneDuringPlayback(nextIndex);
      return;
    }

    onSelectedSceneChange(nextIndex);
  };

  return {
    scenes,
    sceneCount,
    totalDuration,
    safeIndex,
    hasNarration,
    hasCanonicalVoiceover,
    hasPlayableVoiceover,
    canPlayNarration,
    playbackError,
    voiceoverDiagnostics,
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
    brandStingActive,
    brandStingElapsedMs,
    brandStingDurationMs,
    effectiveRenderDurationMs,
    scene,
    playbackScope,
    loopSceneEnabled,
    currentSceneId,
    playPreview,
    playScenePreview,
    toggleLoopScene,
    playWithBrowserVoice,
    pauseVoice,
    stopVoice,
    goPrevious,
    goNext,
  };
}
