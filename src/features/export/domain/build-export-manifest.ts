/**
 * Build immutable ExportManifest from story + timeline + options (Sprint 6B).
 */

import {
  resolveAudioMixerSettings,
  resolveMusicStemGain,
  resolvePeakProtectionFromMixer,
  resolveVoiceStemGain,
} from "@/features/audio-mixer";
import { buildAudioMixFromStory } from "@/features/audio";
import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import { resolveCaptionAnimation } from "@/features/caption-animation";
import {
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  isDefaultCaptionLayoutStorage,
  mergeCaptionLayoutSettings,
} from "@/features/caption-layout";
import {
  isDefaultCaptionStyleStorage,
  resolveCaptionStyle,
} from "@/features/caption-style";
import { normalizeCaptionOpacityPercent } from "./normalize-caption-opacity";
import {
  resolveSceneMediaMotion,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion";
import { clampSceneMediaTrim } from "@/features/media-playback";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import { resolveSceneMediaFraming } from "@/features/media-framing";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { CREATOR_BRAND } from "@/lib/constants/product-brand";

import { resolveExportMediaFitMode } from "@/features/export/utils/export-scene-media-renderer";
import {
  buildExportDownloadFileName,
  exportSettingsToQualityPreset,
  normalizeExportSettings,
  slugifyStoryTitle,
  type ExportSettings,
} from "@/features/export/utils/export-settings.utils";
import type { ExportAudioMode } from "@/features/export/utils/export-quality.utils";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { isExportBackgroundMusicActiveFromMix } from "@/features/export/utils/export-background-music.utils";
import { freezeMediaVisualAdjustments } from "@/features/media-visual-adjustments/normalize-media-visual-adjustments";
import {
  projectSceneMediaTimeline,
  resolveSceneMediaWindows,
} from "@/features/scene-media-timeline";

import { buildExportEnvironmentSnapshot } from "./export-environment.utils";
import { buildExportManifestFingerprint } from "./export-manifest-fingerprint";
import { deepFreezeExportManifest } from "./export-manifest-freeze";
import { buildExportSceneMediaTransitionTrack } from "./build-export-scene-media-transitions";
import {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  type ExportSceneManifestV3,
  type ExportAudioManifest,
  type ExportBrandingManifest,
  type ExportCapabilitySnapshot,
  type ExportCaptionManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV4,
  type ExportManifestV4Draft,
  type ExportManifestFormat,
  type ExportManifestResolutionLabel,
  type ExportMediaManifest,
  type ExportMediaMotionManifest,
  type ExportOutputManifest,
  type ExportProjectManifest,
  type ExportSceneMediaTimelineItemManifest,
  type ExportSceneMediaTimelineManifest,
  type ExportTransitionManifest,
} from "./export-manifest.types";

export interface BuildExportManifestInput {
  readonly story: FootieScript;
  readonly exportSettings?: Partial<ExportSettings>;
  readonly audioMode?: ExportAudioMode;
  readonly includeBackgroundMusic?: boolean;
  readonly environment?: Partial<ExportEnvironmentSnapshot>;
  /** Optional precomputed timeline/story from prepareStoryForExport. */
  readonly prepared?: ReturnType<typeof prepareStoryForExport>;
  /**
   * When false, freezes one first-item compatibility timeline per scene
   * (deterministic regression / migration tests only).
   * Default true — production multi-image ExportManifest v2.
   * Must not be derived from process.env inside this module.
   */
  readonly multiImageScenesEnabled?: boolean;
}

export function buildExportManifest(input: BuildExportManifestInput): ExportManifestV4 {
  const prepared = input.prepared ?? prepareStoryForExport(input.story);
  const story = prepared.story;
  const timeline = prepared.masterTimeline;
  const settings = normalizeExportSettings(
    input.exportSettings ?? story.exportSettings,
    story.title,
  );
  const quality = exportSettingsToQualityPreset(settings);
  const environment = buildExportEnvironmentSnapshot(input.environment);
  const audioMix = buildAudioMixFromStory(story);

  const includeNarration = input.audioMode === "with-voice";
  const includeMusic =
    input.includeBackgroundMusic ?? isExportBackgroundMusicActiveFromMix(audioMix);

  const multiImageScenesEnabled = input.multiImageScenesEnabled !== false;

  const project = buildProjectManifest(story, timeline, prepared);
  const output = buildOutputManifest(settings, quality);
  const scenes = buildSceneManifests(story, timeline, multiImageScenesEnabled);
  const captions = buildCaptionManifests(story, timeline);
  const audio = buildAudioManifest(story, audioMix, {
    includeNarration,
    includeMusic,
  });
  const branding = buildBrandingManifest();
  const capabilities = buildCapabilitySnapshot(environment);

  const draft: ExportManifestV4Draft = {
    version: EXPORT_MANIFEST_VERSION,
    manifestId: createManifestId(),
    createdAt: new Date().toISOString(),
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    project,
    output,
    scenes,
    captions,
    audio,
    branding,
    capabilities,
  };

  const fingerprint = buildExportManifestFingerprint(draft);
  const manifest: ExportManifestV4 = { ...draft, fingerprint };
  return deepFreezeExportManifest(manifest);
}

function buildProjectManifest(
  story: FootieScript,
  timeline: MasterTimeline,
  prepared: ReturnType<typeof prepareStoryForExport>,
): ExportProjectManifest {
  return {
    projectId: slugifyStoryTitle(story.title ?? "") || "story",
    storyTitle: story.title ?? "",
    contentDurationMs: prepared.contentEndMs,
    renderDurationMs: timeline.renderDurationMs,
    endBufferMs: Math.max(0, timeline.renderDurationMs - prepared.contentEndMs),
    aspectRatio: "9:16",
    sceneCount: story.scenes.length,
  };
}

function buildOutputManifest(
  settings: ExportSettings,
  quality: { width: number; height: number; fps: number; bitrate: number },
): ExportOutputManifest {
  const format = settings.format as ExportManifestFormat;
  const resolution: ExportManifestResolutionLabel =
    settings.resolution === "720x1280" ? "720p" : "1080p";
  const filename = buildExportDownloadFileName(settings);
  return {
    format,
    quality: settings.quality,
    resolution,
    width: quality.width,
    height: quality.height,
    fps: 30,
    filename,
    mimeType: format === "mp4" ? "video/mp4" : "video/webm",
    extension: format === "mp4" ? ".mp4" : ".webm",
    bitrate: quality.bitrate,
  };
}

function isDrawableMediaManifest(media: ExportMediaManifest): boolean {
  if (media.type === "placeholder") {
    return false;
  }
  return typeof media.source === "string" && Boolean(media.source.trim());
}

function buildSceneManifests(
  story: FootieScript,
  timeline: MasterTimeline,
  multiImageScenesEnabled: boolean,
): readonly ExportSceneManifestV3[] {
  const transitions = collectTransitions(story, timeline);
  return story.scenes.map((scene, index) => {
    const startMs = Math.max(0, Math.round(scene.startMs ?? (scene.start ?? 0) * 1000));
    const durationMs = Math.max(
      1,
      Math.round(scene.durationMs ?? (scene.duration ?? 0) * 1000),
    );
    const endMs = startMs + durationMs;
    const mediaTimeline = buildSceneMediaTimelineManifest(
      scene,
      durationMs,
      multiImageScenesEnabled,
    );
    const media =
      mediaTimeline.items[0]?.media ?? ({ type: "placeholder" } as const);
    const hasDrawableMedia = mediaTimeline.items.some((item) =>
      isDrawableMediaManifest(item.media),
    );
    const mediaTransitions = buildExportSceneMediaTransitionTrack(
      scene,
      mediaTimeline,
    );

    return {
      id: scene.id,
      index,
      startMs,
      durationMs,
      endMs,
      media,
      mediaTimeline,
      mediaTransitions,
      transitionOut: transitions.get(scene.id) ?? null,
      captionMode: scene.captionMode ?? "generated",
      hasDrawableMedia,
    };
  });
}

function buildSceneMediaTimelineManifest(
  scene: FootieScene,
  sceneDurationMs: number,
  multiImageScenesEnabled: boolean,
): ExportSceneMediaTimelineManifest {
  const projected = projectSceneMediaTimeline(scene);
  const sourceItems =
    multiImageScenesEnabled || projected.items.length === 0
      ? projected.items
      : [projected.items[0]!];

  if (sourceItems.length === 0) {
    return {
      version: 1,
      items: [
        {
          id: `${scene.id}__placeholder`,
          index: 0,
          startOffsetMs: 0,
          endOffsetMs: sceneDurationMs,
          durationMs: sceneDurationMs,
          media: { type: "placeholder" },
        },
      ],
    };
  }

  const windows = resolveSceneMediaWindows({
    items: sourceItems,
    sceneDurationMs,
    provenance: projected.fromStoredTimeline ? "stored_timeline" : "legacy_virtual",
  });

  const items: ExportSceneMediaTimelineItemManifest[] = windows.map((window) => ({
    id: window.itemId,
    index: window.itemIndex,
    startOffsetMs: window.startMs,
    endOffsetMs: window.endMs,
    durationMs: window.durationMs,
    media: buildMediaManifestFromSceneMedia(window.media),
  }));

  return { version: 1, items };
}

function collectTransitions(
  story: FootieScript,
  timeline: MasterTimeline,
): Map<string, ExportTransitionManifest> {
  const map = new Map<string, ExportTransitionManifest>();

  for (const item of story.timelineItems ?? []) {
    if (item.type !== "transition") continue;
    map.set(item.fromSceneId, {
      type: String(item.effect ?? "cut"),
      durationMs: Math.max(0, Math.round(item.durationMs ?? 0)),
      fromSceneId: item.fromSceneId,
      toSceneId: item.toSceneId,
    });
  }

  // Prefer MasterTimeline transition track when present (canonical scheduling).
  const transitionTrack = timeline.tracks.find((track) => track.type === "transition");
  for (const event of transitionTrack?.events ?? []) {
    const meta = event.metadata as {
      fromSceneId?: string;
      toSceneId?: string;
      effect?: string;
      transitionType?: string;
      durationMs?: number;
    };
    if (!meta.fromSceneId || !meta.toSceneId) continue;
    map.set(meta.fromSceneId, {
      type: String(meta.transitionType ?? meta.effect ?? "cut"),
      durationMs: Math.max(
        0,
        Math.round(meta.durationMs ?? event.endMs - event.startMs),
      ),
      fromSceneId: meta.fromSceneId,
      toSceneId: meta.toSceneId,
    });
  }

  return map;
}

/**
 * Builds ExportMediaManifest from one item's SceneMedia.
 * Never resolves later items through the scene's first compatibility slot.
 */
function buildMediaManifestFromSceneMedia(media: SceneMedia): ExportMediaManifest {
  if (!media || media.type === "placeholder") {
    return { type: "placeholder" };
  }

  const framingScene = { media };
  const framing = resolveSceneMediaFraming(framingScene, { media });
  const fitMode = resolveExportMediaFitMode(framingScene, media);
  const motion = buildMotionManifestFromMedia(media);
  const positionX = framing.positionX;
  const positionY = framing.positionY;
  const zoom = framing.zoom;
  const rotationDeg = framing.rotationDeg;
  const source = typeof media.url === "string" ? media.url.trim() : "";
  const visualAdjustments = freezeMediaVisualAdjustments(media.visualAdjustments);

  if (media.type === "image") {
    return {
      type: "image",
      source,
      fitMode: fitMode === "fill" ? "fill" : "fit",
      positionX,
      positionY,
      zoom,
      rotationDeg,
      motion,
      ...(visualAdjustments ? { visualAdjustments } : {}),
    };
  }

  const trim = clampSceneMediaTrim(media);
  return {
    type: "video",
    source,
    sourceDurationMs: trim.durationMs,
    trimStartMs: trim.trimStartMs,
    trimEndMs: trim.trimEndMs,
    playbackRate: 1,
    sourceAudioPolicy: "muted",
    fitMode: fitMode === "fill" ? "fill" : "fit",
    positionX,
    positionY,
    zoom,
    rotationDeg,
    motion,
    ...(visualAdjustments ? { visualAdjustments } : {}),
  };
}

function buildMotionManifestFromMedia(
  media: SceneMedia,
): ExportMediaMotionManifest | null {
  const motion = resolveSceneMediaMotion({ media });
  if (!motion) return null;
  const enabled = motion.enabled !== false && motion.presetId !== "static";
  if (!enabled && motion.presetId === "static") {
    return {
      enabled: false,
      presetId: "static",
      easing: String(motion.easing ?? "linear"),
      intensity: typeof motion.intensity === "number" ? motion.intensity : 0,
    };
  }
  return {
    enabled,
    presetId: motion.presetId ?? "static",
    easing: String(motion.easing ?? "linear"),
    intensity: typeof motion.intensity === "number" ? motion.intensity : 1,
  };
}

function buildCaptionManifests(
  story: FootieScript,
  timeline: MasterTimeline,
): readonly ExportCaptionManifest[] {
  const captions: ExportCaptionManifest[] = [];
  const subtitleTrack = timeline.tracks.find((track) => track.type === "subtitle");
  const events = subtitleTrack?.events ?? [];

  if (events.length > 0) {
    for (const event of events) {
      const meta = event.metadata as {
        text?: string;
        sceneId?: string;
      };
      const text = typeof meta.text === "string" ? meta.text.trim() : "";
      if (!text) continue;
      const sceneId = meta.sceneId ?? story.scenes[0]?.id ?? "scene";
      captions.push({
        id: String(event.id ?? `${sceneId}-${event.startMs}`),
        sceneId,
        startMs: Math.round(event.startMs),
        endMs: Math.round(event.endMs),
        text,
        style: buildCaptionStyle(story, sceneId),
        layout: buildCaptionLayout(story, sceneId),
        animation: buildCaptionAnimation(story, sceneId),
      });
    }
    return captions;
  }

  for (const scene of story.scenes) {
    const text = (scene.subtitleText || scene.subtitle || "").trim();
    if (!text) continue;
    const startMs = Math.round(scene.startMs ?? (scene.start ?? 0) * 1000);
    const endMs = Math.round(scene.endMs ?? startMs + (scene.durationMs ?? 3000));
    captions.push({
      id: `scene-caption-${scene.id}`,
      sceneId: scene.id,
      startMs,
      endMs,
      text,
      style: buildCaptionStyle(story, scene.id),
      layout: buildCaptionLayout(story, scene.id),
      animation: buildCaptionAnimation(story, scene.id),
    });
  }
  return captions;
}

function resolveEffectiveCaptionBackgroundOpacityPercent(
  story: FootieScript,
  sceneId: string,
): number {
  const scene = story.scenes.find((entry) => entry.id === sceneId);
  const usesStoredStyle = !isDefaultCaptionStyleStorage(
    scene?.captionStyle,
    story.defaultCaptionStyle,
  );
  if (usesStoredStyle) {
    return normalizeCaptionOpacityPercent(
      resolveCaptionStyle({
        sceneStyle: scene?.captionStyle,
        projectStyle: story.defaultCaptionStyle,
      }).resolvedStyle.backgroundOpacity,
      DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
    );
  }

  const layout = mergeCaptionLayoutSettings(
    scene?.captionLayout,
    story.defaultCaptionLayout,
  );
  if (
    typeof layout.backgroundOpacity === "number" &&
    Number.isFinite(layout.backgroundOpacity)
  ) {
    return normalizeCaptionOpacityPercent(
      layout.backgroundOpacity,
      DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
    );
  }

  return DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY;
}

function buildCaptionStyle(
  story: FootieScript,
  sceneId: string,
): ExportCaptionManifest["style"] {
  const scene = story.scenes.find((entry) => entry.id === sceneId);
  const layout = mergeCaptionLayoutSettings(
    scene?.captionLayout,
    story.defaultCaptionLayout,
  );
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: scene?.captionStyle,
    projectStyle: story.defaultCaptionStyle,
  });
  return {
    fontFamily: resolvedStyle.fontFamily,
    fontSize: resolvedStyle.fontSize,
    fontWeight: String(resolvedStyle.fontWeight),
    color: resolvedStyle.textColor,
    backgroundColor: resolvedStyle.backgroundColor,
    textAlign: layout.textAlign ?? "center",
    backgroundOpacity: resolveEffectiveCaptionBackgroundOpacityPercent(story, sceneId),
    backgroundEnabled: resolvedStyle.backgroundEnabled,
    paddingX: resolvedStyle.paddingX,
    paddingY: resolvedStyle.paddingY,
    cornerRadius: resolvedStyle.cornerRadius,
    lineHeight: resolvedStyle.lineHeight,
  };
}

function buildCaptionLayout(
  story: FootieScript,
  sceneId: string,
): ExportCaptionManifest["layout"] {
  const scene = story.scenes.find((entry) => entry.id === sceneId);
  const usesLegacyBottomCenter = isDefaultCaptionLayoutStorage(
    scene?.captionLayout,
    story.defaultCaptionLayout,
  );
  const layout = mergeCaptionLayoutSettings(
    scene?.captionLayout,
    story.defaultCaptionLayout,
  );
  return {
    anchor: layout.anchor ?? "bottom_center",
    textAlign: layout.textAlign ?? "center",
    offsetX: layout.offsetX ?? 0,
    offsetY: layout.offsetY ?? 0,
    maxWidthPercent: layout.maxWidthPercent ?? 90,
    safeAreaEnabled: layout.safeAreaEnabled !== false,
    backgroundOpacity:
      typeof layout.backgroundOpacity === "number" && Number.isFinite(layout.backgroundOpacity)
        ? layout.backgroundOpacity
        : null,
    usesLegacyBottomCenter,
  };
}

function buildCaptionAnimation(
  story: FootieScript,
  sceneId: string,
): ExportCaptionManifest["animation"] {
  const scene = story.scenes.find((entry) => entry.id === sceneId);
  const { animationPreset, resolvedAnimation } = resolveCaptionAnimation({
    sceneAnimation: scene?.captionAnimation,
    projectAnimation: story.defaultCaptionAnimation,
    sceneSubtitleEffect: scene?.subtitleEffect,
  });
  return {
    preset: String(resolvedAnimation.preset ?? animationPreset ?? "fade"),
    enabled: (resolvedAnimation.preset ?? animationPreset) !== "none",
  };
}

function buildAudioManifest(
  story: FootieScript,
  audioMix: ReturnType<typeof buildAudioMixFromStory>,
  options: { includeNarration: boolean; includeMusic: boolean },
): ExportAudioManifest {
  const canonical = getCanonicalVoiceover(story);
  const mixer = resolveAudioMixerSettings(story);
  const voiceSpeed =
    typeof story.voiceoverVoiceSettings?.speed === "number"
      ? story.voiceoverVoiceSettings.speed
      : typeof story.voiceSettings?.speed === "number"
        ? story.voiceSettings.speed
        : 1;

  const voiceStemGain = resolveVoiceStemGain(mixer);
  const musicStemGain = resolveMusicStemGain(mixer);

  let voiceover: ExportAudioManifest["voiceover"] = null;
  if (options.includeNarration && audioMix.voiceover?.src) {
    voiceover = {
      source: audioMix.voiceover.src,
      durationMs: Math.round(
        canonical?.durationMs ??
          story.voiceoverDurationMs ??
          audioMix.voiceover.durationMs ??
          0,
      ),
      // Stem gain (voice.volume × master.volume) — Preview uses the same formula.
      volume: voiceStemGain,
      generatedPlaybackRate: 1,
      sourceVoiceSpeed: voiceSpeed,
    };
  }

  let music: ExportAudioManifest["music"] = null;
  if (options.includeMusic && audioMix.background?.enabled && audioMix.background.src) {
    music = {
      source: audioMix.background.src,
      // Stem gain (music.volume × master.volume) — matches Preview.
      volume: musicStemGain,
      duckingEnabled: mixer.music.duckingEnabled,
      duckingStrength: mixer.music.duckingStrength,
      fadeInMs: mixer.music.fadeInMs,
      fadeOutMs: mixer.music.fadeOutMs,
      looping: true,
    };
  }

  // Preserve requested narration intent even when the voiceover asset is missing
  // so preflight can emit MISSING_VOICEOVER instead of silently becoming "silent".
  const mode =
    options.includeNarration && music
      ? "voice-with-music"
      : options.includeNarration
        ? "voice"
        : "silent";

  return {
    mode,
    voiceover,
    music,
    sourceVideoAudioPolicy: "muted",
    applyPeakProtection: resolvePeakProtectionFromMixer(
      mixer,
      voiceover ? voiceStemGain : 1,
      music ? musicStemGain : 1,
    ),
  };
}

function buildBrandingManifest(): ExportBrandingManifest {
  return {
    watermarkEnabled: true,
    watermarkText: CREATOR_BRAND.toUpperCase().replace(/\s+/g, ""),
    position: "top-left",
    opacity: 0.55,
  };
}

function buildCapabilitySnapshot(
  environment: ExportEnvironmentSnapshot,
): ExportCapabilitySnapshot {
  const mp4Ok = environment.mp4EncoderAvailable !== false;
  return {
    supportedFormats: mp4Ok ? ["webm", "mp4"] : ["webm"],
    supportedResolutions: ["720p", "1080p"],
    supportedFps: [30],
    browserRendererAvailable:
      environment.supportsCanvasCaptureStream &&
      environment.supportsManualCanvasFrameRequest &&
      environment.supportsMediaRecorder &&
      environment.supportsWebAssembly &&
      !environment.ffmpegRuntimePoisoned,
    serverRendererAvailable: environment.serverRendererAvailable,
    environment,
  };
}

function createManifestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Exported for tests — serializes motion fingerprint using shared engine. */
export function debugMotionFingerprint(scene: FootieScene): string {
  return serializeSceneMediaMotionFingerprint(resolveSceneMediaMotion(scene));
}

/** Type guard helper for media URL presence. */
export function sceneMediaHasSource(media: SceneMedia | null | undefined): boolean {
  return Boolean(
    media &&
      media.type !== "placeholder" &&
      typeof media.url === "string" &&
      media.url.trim(),
  );
}
