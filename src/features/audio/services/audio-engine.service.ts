import {
  configurePreviewPeakProtectionCompressor,
} from "@/features/audio-mixer/audio-mixer.peak-protection.utils";
import { resolvePreviewBackgroundMusicUrl } from "@/features/preview/utils";
import {
  applyStoryBackgroundMusic,
  getStoryBackgroundMusic,
  getStoryVoiceSettings,
} from "@/features/story/utils";
import { resolveStoryDurationSec } from "@/features/story/utils";
import type { FootieScript, StoryBackgroundMusic } from "@/features/story/types";
import { revokeBlobUrl } from "@/lib/utils/blobUrl";
import { createVoiceoverBlobUrl } from "@/lib/utils/voiceover";
import {
  DEFAULT_VOICEOVER_VOICE,
  resolveVoiceoverSpeed,
  resolveVoiceoverVoice,
  type VoiceoverSpeedOption,
} from "@/lib/utils/voiceoverOptions";

import type {
  AudioEngineSnapshot,
  BackgroundMusicTrack,
  VoiceoverTrack,
} from "../types/audio-engine.types";
import type { AudioMix, AudioTrack } from "../types/audio.types";
import { fetchAudioBlobFromUrl, normalizeVoiceoverBlob } from "../utils/audio-blob.utils";
import { getCanonicalVoiceover, readVoiceoverAudioBase64 } from "../utils/canonical-voiceover.utils";
import { resolvePlayableVoiceoverFromStory } from "../utils/playable-voiceover-src.utils";

const VOICEOVER_TRACK_ID = "voiceover";
const BACKGROUND_TRACK_ID = "background";

export type VoiceoverTrackUpdate = Partial<
  Pick<AudioTrack, "src" | "durationMs" | "playbackRate" | "enabled" | "metadata">
>;

/** Master timeline length — voiceover duration when present, otherwise story duration. */
export function getMasterAudioDurationMs(
  story: FootieScript | null | undefined,
): number {
  if (!story) {
    return 0;
  }

  const canonical = getCanonicalVoiceover(story);
  if (
    canonical?.url &&
    canonical.durationMs != null &&
    canonical.durationMs > 0
  ) {
    return canonical.durationMs;
  }

  return Math.round(resolveStoryDurationSec(story) * 1000);
}

/** Normalized voiceover lane derived from canonical story fields. */
export function getVoiceoverTrack(
  story: FootieScript | null | undefined,
): AudioTrack | undefined {
  if (!story) {
    return undefined;
  }

  const canonical = getCanonicalVoiceover(story);
  if (!canonical) {
    return undefined;
  }

  const voiceSettings = getStoryVoiceSettings(story);
  const speed = resolveVoiceoverSpeed(voiceSettings.speed);
  const durationMs = canonical.durationMs;

  return {
    id: VOICEOVER_TRACK_ID,
    type: "voiceover",
    src: canonical.url,
    durationMs,
    volume: 1,
    playbackRate: speed,
    enabled: true,
    startMs: 0,
    ...(durationMs != null ? { endMs: durationMs } : {}),
    metadata: {
      voice: voiceSettings.voice ?? DEFAULT_VOICEOVER_VOICE,
      speed,
    },
  };
}

/** Normalized background music lane — omitted when disabled or missing a URL. */
export function getBackgroundTrack(
  story: FootieScript | null | undefined,
): AudioTrack | undefined {
  if (!story) {
    return undefined;
  }

  const music = getStoryBackgroundMusic(story);
  const src = resolvePreviewBackgroundMusicUrl(story);
  if (!src) {
    return undefined;
  }

  const masterDurationMs = getMasterAudioDurationMs(story);
  const fileName = music.fileName ?? music.trackName;
  const fileMimeType = (music as { fileMimeType?: string }).fileMimeType;

  return {
    id: BACKGROUND_TRACK_ID,
    type: "background",
    src,
    ...(fileName ? { fileName } : {}),
    volume: music.volume,
    playbackRate: 1,
    enabled: music.enabled,
    startMs: 0,
    ...(masterDurationMs > 0 ? { endMs: masterDurationMs } : {}),
    metadata: {
      source: music.source,
      ...(music.trackId ? { trackId: music.trackId } : {}),
      ...(music.trackName ? { trackName: music.trackName } : {}),
      ...(music.artist ? { artist: music.artist } : {}),
      ...(music.license ? { license: music.license } : {}),
      duckingEnabled: music.duckingEnabled,
      fadeIn: music.fadeIn,
      fadeOut: music.fadeOut,
      ...(fileMimeType ? { mimeType: fileMimeType } : {}),
    },
  };
}

/** Builds the full audio mix snapshot from story state without mutating the story. */
export function buildAudioMixFromStory(
  story: FootieScript | null | undefined,
): AudioMix {
  const music = getStoryBackgroundMusic(story);
  const voiceover = getVoiceoverTrack(story);
  const background = getBackgroundTrack(story);

  return {
    ...(voiceover ? { voiceover } : {}),
    ...(background ? { background } : {}),
    masterDurationMs: getMasterAudioDurationMs(story),
    duckingEnabled: music.duckingEnabled,
    fadeIn: music.fadeIn,
    fadeOut: music.fadeOut,
  };
}

/** Returns a new story with voiceover fields updated from normalized track data. */
export function updateVoiceoverTrack(
  story: FootieScript,
  voiceover: VoiceoverTrackUpdate,
): FootieScript {
  let voiceoverUrl = story.voiceoverUrl;
  let voiceoverDurationMs = story.voiceoverDurationMs;
  let voiceSettings = getStoryVoiceSettings(story);

  if (voiceover.enabled === false) {
    voiceoverUrl = undefined;
    voiceoverDurationMs = undefined;
  } else {
    if (voiceover.src !== undefined) {
      const trimmed = voiceover.src.trim();
      voiceoverUrl = trimmed || undefined;
    }

    if (voiceover.durationMs !== undefined) {
      voiceoverDurationMs =
        voiceover.durationMs > 0 ? Math.round(voiceover.durationMs) : undefined;
    }
  }

  if (voiceover.playbackRate !== undefined) {
    voiceSettings = {
      ...voiceSettings,
      speed: resolveVoiceoverSpeed(voiceover.playbackRate),
    };
  }

  const metadataVoice = voiceover.metadata?.voice;
  if (typeof metadataVoice === "string" && metadataVoice.trim()) {
    voiceSettings = {
      ...voiceSettings,
      voice: resolveVoiceoverVoice(metadataVoice),
    };
  }

  const metadataSpeed = voiceover.metadata?.speed;
  if (typeof metadataSpeed === "number") {
    voiceSettings = {
      ...voiceSettings,
      speed: resolveVoiceoverSpeed(metadataSpeed),
    };
  }

  return {
    ...story,
    voiceoverUrl,
    voiceoverDurationMs,
    voiceSettings,
  };
}

/** Returns a new story with background music settings merged and normalized. */
export function updateBackgroundTrack(
  story: FootieScript,
  backgroundMusic: Partial<StoryBackgroundMusic>,
): FootieScript {
  return applyStoryBackgroundMusic(story, backgroundMusic);
}

function buildVoiceoverCacheKey(url: string, voice: string, speed: VoiceoverSpeedOption): string {
  return `voiceover:${url}|${voice}|${speed}`;
}

function buildBackgroundMusicCacheKey(url: string, settingsRevision: string): string {
  return `music:${url}|${settingsRevision}`;
}

function backgroundMusicSettingsRevision(script: FootieScript): string {
  const music = getStoryBackgroundMusic(script);
  return JSON.stringify({
    enabled: music.enabled,
    source: music.source,
    fileUrl: music.fileUrl ?? "",
    volume: music.volume,
    duckingEnabled: music.duckingEnabled,
    fadeIn: music.fadeIn,
    fadeOut: music.fadeOut,
  });
}

/** Derives the shared audio snapshot from canonical story state. */
export function resolveAudioEngineSnapshot(
  script: FootieScript | null | undefined,
): AudioEngineSnapshot | null {
  if (!script) {
    return null;
  }

  const voiceSettings = getStoryVoiceSettings(script);
  const voice = voiceSettings.voice ?? DEFAULT_VOICEOVER_VOICE;
  const speed: VoiceoverSpeedOption = resolveVoiceoverSpeed(voiceSettings.speed);

  const canonical = getCanonicalVoiceover(script);
  const voiceover: VoiceoverTrack | null = canonical
    ? {
        url: canonical.url,
        durationMs: canonical.durationMs,
        voice,
        speed,
        cacheKey: buildVoiceoverCacheKey(canonical.url, voice, speed),
      }
    : null;

  const musicUrl = resolvePreviewBackgroundMusicUrl(script);
  const backgroundMusicSettings = getStoryBackgroundMusic(script);
  const backgroundMusic: BackgroundMusicTrack | null = musicUrl
    ? {
        url: musicUrl,
        settings: backgroundMusicSettings,
        cacheKey: buildBackgroundMusicCacheKey(
          musicUrl,
          backgroundMusicSettingsRevision(script),
        ),
      }
    : null;

  return {
    voiceover,
    backgroundMusic,
    voiceSettings,
  };
}

interface NarrationPreviewGainRoute {
  source: MediaElementAudioSourceNode;
  gainNode: GainNode;
  compressor?: DynamicsCompressorNode;
}

function resolveNarrationElementVolume(stemGain: number): number {
  return Math.min(1, Math.max(0, stemGain));
}

function shouldRouteNarrationThroughGainNode(
  stemGain: number,
  hasGainRoute: boolean,
  applyPeakProtection: boolean,
): boolean {
  return hasGainRoute || stemGain > 1 || applyPeakProtection;
}

/**
 * Browser-side audio coordinator — single source of truth for voiceover and
 * background music URLs, blob cache, and preview HTMLAudioElement reuse.
 */
export class AudioEngine {
  private readonly blobCache = new Map<string, Promise<Blob>>();
  private readonly narrationElements = new Map<string, HTMLAudioElement>();
  private readonly backgroundMusicElements = new Map<string, HTMLAudioElement>();
  private readonly narrationGainRoutes = new WeakMap<HTMLAudioElement, NarrationPreviewGainRoute>();
  private previewAudioContext: AudioContext | null = null;
  private readonly managedVoiceoverUrls = new Set<string>();
  /** Stable blob URLs keyed by persisted base64 — avoids preview URL churn on script edits. */
  private readonly voiceoverBase64UrlCache = new Map<string, string>();

  resolveSnapshot(script: FootieScript | null | undefined): AudioEngineSnapshot | null {
    return resolveAudioEngineSnapshot(script);
  }

  hasVoiceover(script: FootieScript | null | undefined): boolean {
    return Boolean(getCanonicalVoiceover(script)?.url);
  }

  getVoiceoverUrl(script: FootieScript | null | undefined): string | undefined {
    return getCanonicalVoiceover(script)?.url;
  }

  /**
   * Returns a stable playable voiceover URL for preview/export hydration.
   * Materializes persisted base64 once per payload so editor script edits do not
   * revoke/recreate blob URLs on every render.
   */
  getStableVoiceoverPlaybackUrl(
    script: FootieScript | null | undefined,
  ): string | undefined {
    if (!script) {
      return undefined;
    }

    const base64 = readVoiceoverAudioBase64(script);
    const resolution = resolvePlayableVoiceoverFromStory(script, { preferObjectUrl: true });
    if (!resolution.hasPlayableSrc || !resolution.src) {
      return undefined;
    }

    if (base64) {
      let cachedUrl = this.voiceoverBase64UrlCache.get(base64);
      if (!cachedUrl) {
        cachedUrl = resolution.src;
        this.voiceoverBase64UrlCache.set(base64, cachedUrl);
        if (cachedUrl.startsWith("blob:")) {
          this.registerManagedVoiceoverUrl(cachedUrl);
        }
      }
      return cachedUrl;
    }

    if (resolution.src.startsWith("blob:")) {
      this.registerManagedVoiceoverUrl(resolution.src);
    }

    return resolution.src;
  }

  resolvePlayableVoiceover(script: FootieScript | null | undefined) {
    return resolvePlayableVoiceoverFromStory(script, { preferObjectUrl: true });
  }

  getBackgroundMusicUrl(script: FootieScript | null | undefined): string | null {
    return this.resolveSnapshot(script)?.backgroundMusic?.url ?? null;
  }

  materializeVoiceoverBase64(audioBase64: string): string {
    return createVoiceoverBlobUrl(audioBase64);
  }

  materializeVoiceoverBlob(blob: Blob): string {
    const normalized = normalizeVoiceoverBlob(blob);
    return URL.createObjectURL(normalized);
  }

  registerManagedVoiceoverUrl(url: string): void {
    if (url) {
      this.managedVoiceoverUrls.add(url);
    }
  }

  releaseManagedVoiceoverUrls(): void {
    for (const url of this.managedVoiceoverUrls) {
      this.revokeVoiceoverUrl(url);
    }
    this.managedVoiceoverUrls.clear();
  }

  /** Clears cached blobs/elements and revokes a replaced voiceover blob URL. */
  revokeVoiceoverUrl(url: string | null | undefined): void {
    if (!url) {
      return;
    }

    this.blobCache.delete(url);
    this.dropNarrationElement(url);
    revokeBlobUrl(url);
  }

  handleVoiceoverReplacement(options: {
    previousUrl?: string | null;
    previousManagedUrl?: string | null;
    nextUrl: string;
  }): void {
    const { previousUrl, previousManagedUrl, nextUrl } = options;

    if (previousManagedUrl && previousManagedUrl !== nextUrl) {
      this.managedVoiceoverUrls.delete(previousManagedUrl);
      this.revokeVoiceoverUrl(previousManagedUrl);
    }

    if (
      previousUrl &&
      previousUrl !== nextUrl &&
      previousUrl !== previousManagedUrl
    ) {
      this.revokeVoiceoverUrl(previousUrl);
    }

    this.registerManagedVoiceoverUrl(nextUrl);
  }

  async fetchVoiceoverBlobForScript(script: FootieScript): Promise<Blob> {
    const track = this.resolveSnapshot(script)?.voiceover;
    if (!track) {
      throw new Error("Story has no voiceover audio");
    }

    return this.fetchVoiceoverBlobByUrl(track.url);
  }

  async fetchVoiceoverBlobByUrl(url: string): Promise<Blob> {
    return this.fetchCachedBlob(url, () =>
      fetchAudioBlobFromUrl(
        url,
        "Narration audio is empty",
        "Failed to load narration audio",
      ),
    );
  }

  async fetchBackgroundMusicBlobForScript(
    script: FootieScript,
  ): Promise<Blob | null> {
    const track = this.resolveSnapshot(script)?.backgroundMusic;
    if (!track) {
      return null;
    }

    return this.fetchBackgroundMusicBlobByUrl(track.url);
  }

  async fetchBackgroundMusicBlobByUrl(url: string): Promise<Blob> {
    return this.fetchCachedBlob(url, () =>
      fetchAudioBlobFromUrl(
        url,
        "Background music file is empty",
        "Failed to load background music",
      ),
    );
  }

  /** Preview narration element — reused per voiceover URL. */
  getNarrationAudioElement(script: FootieScript | null | undefined): HTMLAudioElement | null {
    return this.getNarrationAudioElementBySrc(getCanonicalVoiceover(script)?.url);
  }

  getNarrationAudioElementBySrc(src: string | undefined | null): HTMLAudioElement | null {
    if (typeof window === "undefined") {
      return null;
    }

    const url = src?.trim();
    if (!url) {
      return null;
    }

    let element = this.narrationElements.get(url);
    if (!element) {
      element = new Audio();
      element.preload = "auto";
      this.narrationElements.set(url, element);
    }

    if (element.getAttribute("src") !== url) {
      element.src = url;
      element.load();
    }

    return element;
  }

  /**
   * Applies preview voice stem gain. Uses HTMLMediaElement.volume when gain <= 1.0;
   * routes through Web Audio GainNode when gain > 1.0 (or after a boost route exists).
   * Optional dynamics compressor limits peaks when peak protection is active.
   */
  syncNarrationPreviewGain(
    element: HTMLAudioElement,
    stemGain: number,
    applyPeakProtection = false,
  ): void {
    if (typeof window === "undefined") {
      return;
    }

    const gainRoute = this.narrationGainRoutes.get(element);
    const useGainRoute = shouldRouteNarrationThroughGainNode(
      stemGain,
      Boolean(gainRoute),
      applyPeakProtection,
    );

    if (!useGainRoute) {
      element.volume = resolveNarrationElementVolume(stemGain);
      return;
    }

    const route = gainRoute ?? this.createNarrationPreviewGainRoute(element);
    element.volume = 1;
    route.gainNode.gain.value = stemGain;
    this.syncNarrationPeakProtection(route, applyPeakProtection);
    void this.getPreviewAudioContext().resume().catch(() => undefined);
  }

  /** Preview background music element — reused per music URL. */
  getBackgroundMusicAudioElement(
    script: FootieScript | null | undefined,
  ): HTMLAudioElement | null {
    return this.getBackgroundMusicAudioElementBySrc(
      this.resolveSnapshot(script)?.backgroundMusic?.url,
    );
  }

  getBackgroundMusicAudioElementBySrc(src: string | undefined | null): HTMLAudioElement | null {
    if (typeof window === "undefined") {
      return null;
    }

    const url = src?.trim();
    if (!url) {
      return null;
    }

    let element = this.backgroundMusicElements.get(url);
    if (!element) {
      element = new Audio(url);
      element.loop = true;
      element.preload = "auto";
      this.backgroundMusicElements.set(url, element);
    }

    return element;
  }

  detachNarrationPreviewElement(url: string, element: HTMLAudioElement): void {
    element.pause();
    element.currentTime = 0;
    this.teardownNarrationPreviewGainRoute(element);
    if (this.narrationElements.get(url) === element) {
      this.narrationElements.delete(url);
    }
  }

  detachBackgroundMusicPreviewElement(url: string, element: HTMLAudioElement): void {
    element.pause();
    element.currentTime = 0;
    if (this.backgroundMusicElements.get(url) === element) {
      this.backgroundMusicElements.delete(url);
    }
  }

  private getPreviewAudioContext(): AudioContext {
    if (!this.previewAudioContext) {
      this.previewAudioContext = new AudioContext();
    }

    return this.previewAudioContext;
  }

  private createNarrationPreviewGainRoute(
    element: HTMLAudioElement,
  ): NarrationPreviewGainRoute {
    const context = this.getPreviewAudioContext();
    const source = context.createMediaElementSource(element);
    const gainNode = context.createGain();
    source.connect(gainNode);

    const route: NarrationPreviewGainRoute = { source, gainNode };
    this.narrationGainRoutes.set(element, route);
    return route;
  }

  private syncNarrationPeakProtection(
    route: NarrationPreviewGainRoute,
    active: boolean,
  ): void {
    const context = this.getPreviewAudioContext();
    route.gainNode.disconnect();
    route.compressor?.disconnect();

    if (active) {
      if (!route.compressor) {
        route.compressor = context.createDynamicsCompressor();
        configurePreviewPeakProtectionCompressor(route.compressor);
      }
      route.gainNode.connect(route.compressor);
      route.compressor.connect(context.destination);
      return;
    }

    route.gainNode.connect(context.destination);
  }

  private teardownNarrationPreviewGainRoute(element: HTMLAudioElement): void {
    const route = this.narrationGainRoutes.get(element);
    if (!route) {
      return;
    }

    route.gainNode.disconnect();
    route.compressor?.disconnect();
    route.source.disconnect();
    this.narrationGainRoutes.delete(element);
  }

  private async fetchCachedBlob(
    cacheKey: string,
    loader: () => Promise<Blob>,
  ): Promise<Blob> {
    const existing = this.blobCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const pending = loader();
    this.blobCache.set(cacheKey, pending);

    try {
      return await pending;
    } catch (error) {
      this.blobCache.delete(cacheKey);
      throw error;
    }
  }

  private dropNarrationElement(url: string): void {
    const element = this.narrationElements.get(url);
    if (!element) {
      return;
    }

    element.pause();
    element.src = "";
    this.teardownNarrationPreviewGainRoute(element);
    this.narrationElements.delete(url);
  }

  /** Test-only teardown of preview Web Audio resources. */
  disposePreviewAudioContextForTests(): void {
    void this.previewAudioContext?.close().catch(() => undefined);
    this.previewAudioContext = null;
  }
}

let audioEngineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!audioEngineInstance) {
    audioEngineInstance = new AudioEngine();
  }
  return audioEngineInstance;
}

/** Test-only reset. */
export function resetAudioEngineForTests(): void {
  audioEngineInstance?.disposePreviewAudioContextForTests();
  audioEngineInstance = null;
}
