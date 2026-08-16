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
import { projectBrandStingToManifest } from "@/features/brand-sting/domain/project-brand-sting-to-manifest";
import { resolveBrandStingTimelineBounds } from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import { projectEngagementOverlayToManifest } from "@/features/engagement-overlays/domain/project-engagement-overlay-to-manifest";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { projectMediaVisualEffectToManifest } from "@/features/media-motion/domain/resolve-media-visual-effect";
import { projectSceneVisualPlan } from "@/features/mixed-media-scenes/adapters/project-visual-sequence";
import { resolveSceneMediaWindows } from "@/features/scene-media-timeline";

import { buildExportEnvironmentSnapshot } from "./export-environment.utils";
import { buildExportManifestFingerprint } from "./export-manifest-fingerprint";
import { deepFreezeExportManifest } from "./export-manifest-freeze";
import { buildExportSceneMediaTransitionTrack } from "./build-export-scene-media-transitions";
import { projectSceneMediaKeyframesToManifest } from "./project-media-motion-keyframes-to-manifest";
import {
  EXPORT_MANIFEST_V5_VERSION,
  EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES,
  EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
  EXPORT_RENDERER_CAPABILITY_GENERATED_VOICE_MASTERING,
  EXPORT_RENDERER_CAPABILITY_CONTINUOUS_INTRA_SCENE_TRANSITIONS,
  EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
  EXPORT_RENDERER_CONTRACT_V5,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  type ExportBrandStingManifest,
  type ExportSceneManifestV3,
  type ExportAudioManifest,
  type ExportBrandingManifest,
  type ExportCapabilitySnapshot,
  type ExportCaptionManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV4Draft,
  type ExportManifest,
  type ExportManifestV5Draft,
  type ExportManifestFormat,
  type ExportRendererCapabilityId,
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
   * Must not be derived from environment variables inside this module.
   */
  readonly multiImageScenesEnabled?: boolean;
  /**
   * Explicit `mixed-media-scenes-v1` decision.
   * Default false (fail-closed). Caller supplies the resolved capability —
   * this module never reads environment variables.
   */
  readonly mixedMediaScenesEnabled?: boolean;
  /** Explicit keyframed visual-effects capability. Defaults false (fail-closed). */
  readonly keyframedVisualEffectsEnabled?: boolean;
  /** Explicit engagement-overlays capability. Defaults false (fail-closed). */
  readonly engagementOverlaysEnabled?: boolean;
  /** Explicit ShortForge brand-sting capability. Defaults false (fail-closed). */
  readonly shortForgeBrandStingEnabled?: boolean;
}

export function buildExportManifest(input: BuildExportManifestInput): ExportManifest {
  const mixedMediaScenesEnabled = input.mixedMediaScenesEnabled === true;
  const keyframedVisualEffectsEnabled = input.keyframedVisualEffectsEnabled === true;
  const engagementOverlaysEnabled = input.engagementOverlaysEnabled === true;
  const shortForgeBrandStingEnabled = input.shortForgeBrandStingEnabled === true;
  // Fallback preparation freezes timing only. Authoring guidance (Visual pacing)
  // is owned by prepareExportRequest, not manifest construction.
  const prepared =
    input.prepared ??
    prepareStoryForExport(input.story, { mixedMediaScenesEnabled });
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

  const narrationEndMs = prepared.contentEndMs;
  const projectedBrandSting = projectBrandStingToManifest(
    story.visualRetentionExtensions?.shortForgeBrandSting,
    narrationEndMs,
    shortForgeBrandStingEnabled,
  );
  const brandSting: ExportBrandStingManifest | undefined =
    projectedBrandSting.brandSting;
  const brandStingDurationMs = brandSting?.durationMs ?? 0;
  const project = buildProjectManifest(
    story,
    timeline,
    prepared,
    brandStingDurationMs,
  );
  const output = buildOutputManifest(settings, quality);
  const scenes = buildSceneManifests(
    story,
    timeline,
    multiImageScenesEnabled,
    mixedMediaScenesEnabled,
    keyframedVisualEffectsEnabled,
    engagementOverlaysEnabled,
  );
  const captions = buildCaptionManifests(story, timeline);
  const audio = buildAudioManifest(story, audioMix, {
    includeNarration,
    includeMusic,
  });
  const branding = buildBrandingManifest();
  const hasProjectedKeyframes = keyframedVisualEffectsEnabled && scenes.some((scene) =>
    scene.mediaTimeline.items.some((item) => item.media.type !== "placeholder" &&
      item.media.motion?.keyframes != null),
  );
  const hasProjectedVisualEffect = keyframedVisualEffectsEnabled && scenes.some((scene) =>
    scene.mediaTimeline.items.some((item) => item.media.type !== "placeholder" &&
      item.media.visualEffect != null),
  );
  const hasProjectedEngagementOverlay =
    engagementOverlaysEnabled &&
    scenes.some(
      (scene) =>
        Array.isArray(scene.engagementOverlays) &&
        scene.engagementOverlays.length > 0,
    );
  const hasProjectedBrandSting = brandSting != null;
  const hasProjectedBackgroundTreatment = scenes.some((scene) =>
    scene.mediaTimeline.items.some(
      (item) =>
        item.media.type !== "placeholder" &&
        item.media.backgroundTreatment === "blurred_fill" &&
        item.media.fitMode === "fit",
    ),
  );
  const hasGeneratedVoiceMastering =
    audio.voiceover?.masteringProfile === "generated_speech_v1";
  const hasContinuousIntraSceneTransitions = scenes.some((scene) =>
    scene.mediaTransitions.boundaries.some(
      (boundary) => boundary.timingModel === "centered-continuous-v1",
    ),
  );
  const requiredCapabilities: ExportRendererCapabilityId[] = [];
  if (hasProjectedKeyframes || hasProjectedVisualEffect) {
    requiredCapabilities.push(EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS);
  }
  if (hasProjectedEngagementOverlay) {
    requiredCapabilities.push(EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS);
  }
  if (hasProjectedBrandSting) {
    requiredCapabilities.push(EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING);
  }
  if (hasProjectedBackgroundTreatment) {
    requiredCapabilities.push(
      EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
    );
  }
  if (hasGeneratedVoiceMastering) {
    requiredCapabilities.push(
      EXPORT_RENDERER_CAPABILITY_GENERATED_VOICE_MASTERING,
    );
  }
  if (hasContinuousIntraSceneTransitions) {
    requiredCapabilities.push(
      EXPORT_RENDERER_CAPABILITY_CONTINUOUS_INTRA_SCENE_TRANSITIONS,
    );
  }
  const hasAuthoritativeEnhancement = requiredCapabilities.length > 0;
  const capabilities = buildCapabilitySnapshot(environment);

  const draftBase = {
    manifestId: createManifestId(),
    createdAt: new Date().toISOString(),
    project,
    output,
    scenes,
    captions,
    audio,
    branding,
    capabilities,
  };
  const draft: ExportManifestV4Draft | ExportManifestV5Draft = hasAuthoritativeEnhancement
    ? {
        ...draftBase,
        version: EXPORT_MANIFEST_V5_VERSION,
        rendererContractVersion: EXPORT_RENDERER_CONTRACT_V5,
        requiredCapabilities,
        ...(brandSting ? { brandSting } : {}),
      }
    : {
        ...draftBase,
        version: EXPORT_MANIFEST_VERSION,
        rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
      };

  const fingerprint = buildExportManifestFingerprint(draft);
  const manifest: ExportManifest = { ...draft, fingerprint } as ExportManifest;
  return deepFreezeExportManifest(manifest);
}

function buildProjectManifest(
  story: FootieScript,
  timeline: MasterTimeline,
  prepared: ReturnType<typeof prepareStoryForExport>,
  brandStingDurationMs = 0,
): ExportProjectManifest {
  const endBufferMs = Math.max(0, timeline.renderDurationMs - prepared.contentEndMs);
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: prepared.contentEndMs,
    endBufferMs,
    brandStingDurationMs,
  });
  return {
    projectId: slugifyStoryTitle(story.title ?? "") || "story",
    storyTitle: story.title ?? "",
    contentDurationMs: bounds.contentDurationMs,
    renderDurationMs: bounds.renderDurationMs,
    endBufferMs: bounds.endBufferMs,
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
  mixedMediaScenesEnabled: boolean,
  keyframedVisualEffectsEnabled: boolean,
  engagementOverlaysEnabled: boolean,
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
      mixedMediaScenesEnabled,
      keyframedVisualEffectsEnabled,
    );
    const media =
      mediaTimeline.items[0]?.media ?? ({ type: "placeholder" } as const);
    const hasDrawableMedia = mediaTimeline.items.some((item) =>
      isDrawableMediaManifest(item.media),
    );
    const mediaTransitions = buildExportSceneMediaTransitionTrack(
      scene,
      mediaTimeline,
      { continuousTimingEnabled: true },
    );
    const projectedOverlay = projectEngagementOverlayToManifest(
      getSceneEngagementOverlay(story, scene.id),
      durationMs,
      engagementOverlaysEnabled,
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
      ...(projectedOverlay.overlay
        ? { engagementOverlays: [projectedOverlay.overlay] }
        : {}),
    };
  });
}

function buildSceneMediaTimelineManifest(
  scene: FootieScene,
  sceneDurationMs: number,
  multiImageScenesEnabled: boolean,
  mixedMediaScenesEnabled: boolean,
  keyframedVisualEffectsEnabled: boolean,
): ExportSceneMediaTimelineManifest {
  // Same explicit capability decision as Preview / headless.
  const visualPlan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled,
  });
  const projected = visualPlan.timelineProjection;
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

  // Prefer absolute windows from visualSequence when that authority won so
  // proportional weight re-allocation cannot drift from the normalized plan.
  const windows = visualPlan.fromVisualSequence
    ? multiImageScenesEnabled
      ? visualPlan.windows
      : [
          {
            ...visualPlan.windows[0]!,
            itemIndex: 0,
            startMs: 0,
            endMs: sceneDurationMs,
            durationMs: sceneDurationMs,
          },
        ]
    : resolveSceneMediaWindows({
        items: sourceItems,
        sceneDurationMs,
        provenance: projected.fromStoredTimeline
          ? "stored_timeline"
          : "legacy_virtual",
      });

  const items: ExportSceneMediaTimelineItemManifest[] = windows.map((window) => ({
    id: window.itemId,
    index: window.itemIndex,
    startOffsetMs: window.startMs,
    endOffsetMs: window.endMs,
    durationMs: window.durationMs,
    media: buildMediaManifestFromSceneMedia(
      window.media,
      window.durationMs,
      keyframedVisualEffectsEnabled,
    ),
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
function buildMediaManifestFromSceneMedia(
  media: SceneMedia,
  mediaWindowDurationMs: number,
  keyframedVisualEffectsEnabled: boolean,
): ExportMediaManifest {
  if (!media || media.type === "placeholder") {
    return { type: "placeholder" };
  }

  const framingScene = { media };
  const framing = resolveSceneMediaFraming(framingScene, { media });
  const fitMode = resolveExportMediaFitMode(framingScene, media);
  const motion = buildMotionManifestFromMedia(
    media,
    mediaWindowDurationMs,
    keyframedVisualEffectsEnabled,
  );
  const positionX = framing.positionX;
  const positionY = framing.positionY;
  const zoom = framing.zoom;
  const rotationDeg = framing.rotationDeg;
  const source = typeof media.url === "string" ? media.url.trim() : "";
  const visualAdjustments = freezeMediaVisualAdjustments(media.visualAdjustments);
  const visualEffect = projectMediaVisualEffectToManifest(
    media.visualEffect,
    keyframedVisualEffectsEnabled,
  );

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
      ...(visualEffect ? { visualEffect } : {}),
      ...(framing.backgroundTreatment === "blurred_fill" && fitMode !== "fill"
        ? { backgroundTreatment: "blurred_fill" as const }
        : {}),
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
    ...(visualEffect ? { visualEffect } : {}),
    ...(framing.backgroundTreatment === "blurred_fill" && fitMode !== "fill"
      ? { backgroundTreatment: "blurred_fill" as const }
      : {}),
  };
}

function buildMotionManifestFromMedia(
  media: SceneMedia,
  mediaWindowDurationMs: number,
  keyframedVisualEffectsEnabled: boolean,
): ExportMediaMotionManifest | null {
  const motion = resolveSceneMediaMotion({ media });
  if (!motion) return null;
  const enabled = motion.enabled !== false && motion.presetId !== "static";
  // Project only under the complete authority rule (cap + enabled + ≥2 frames).
  const projected =
    keyframedVisualEffectsEnabled === true && motion.enabled === true
      ? projectSceneMediaKeyframesToManifest(media, mediaWindowDurationMs)
      : undefined;
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
    ...(projected ?? {}),
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
      ...(story.voiceoverSourceKind === "generated"
        ? { masteringProfile: "generated_speech_v1" as const }
        : {}),
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
    // Implementation-owned Browser advertisement — never mirrors requiredCapabilities.
    supportedCapabilities: [...EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES],
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
