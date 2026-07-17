/**
 * Export Media Cache foundation (4.2A-5B-1 / Sprint 8D).
 *
 * Preloads image + video scene media into one cache abstraction.
 * Keys are collision-safe composites of sceneId + mediaItemId.
 */
import type { FootieScene, SceneMedia, SceneMediaType } from "@/features/story/types";
import { getSceneImageUrl, getSceneMedia } from "@/features/story/utils";

const VIDEO_PRELOAD_TIMEOUT_MS = 20_000;

/**
 * Collision-safe cache key. Length-prefixed segments avoid delimiter ambiguity
 * when sceneId or mediaItemId contain separators.
 */
export function buildExportMediaCacheKey(
  sceneId: string,
  mediaItemId: string,
): string {
  const safeSceneId = typeof sceneId === "string" ? sceneId : "";
  const safeItemId = typeof mediaItemId === "string" ? mediaItemId : "";
  return `s${safeSceneId.length}:${safeSceneId}|m${safeItemId.length}:${safeItemId}`;
}

/** Compatibility key when a caller only has a scene id (legacy single-media path). */
export function buildExportSceneOnlyCacheKey(sceneId: string): string {
  return buildExportMediaCacheKey(sceneId, "__scene__");
}

export type ExportMediaAssetStatus = "ready" | "error";

export interface ExportImageAsset {
  kind: "image";
  sceneId: string;
  mediaItemId: string;
  cacheKey: string;
  url: string;
  element: HTMLImageElement;
  status: ExportMediaAssetStatus;
  error?: string;
}

export interface ExportVideoAsset {
  kind: "video";
  sceneId: string;
  mediaItemId: string;
  cacheKey: string;
  url: string;
  element: HTMLVideoElement;
  /** Source duration in ms when known from element or SceneMedia. */
  durationMs: number;
  muted: true;
  status: ExportMediaAssetStatus;
  error?: string;
}

export type ExportMediaAsset = ExportImageAsset | ExportVideoAsset;

export type ExportMediaCacheDiagnosticStatus = "ready" | "skipped" | "error";

export interface ExportMediaCacheDiagnostic {
  sceneId: string;
  mediaItemId?: string;
  mediaType: SceneMediaType | "none";
  status: ExportMediaCacheDiagnosticStatus;
  message?: string;
}

/**
 * Unified export media cache.
 * `images` mirrors the legacy Map<sceneId, HTMLImageElement> shape used by the renderer.
 */
export interface ExportMediaCache {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
  assets: Map<string, ExportMediaAsset>;
  diagnostics: ExportMediaCacheDiagnostic[];
}

export interface ExportMediaCacheLoaders {
  loadImage?: (url: string) => Promise<HTMLImageElement>;
  loadVideo?: (url: string, media: SceneMedia) => Promise<{
    element: HTMLVideoElement;
    durationMs: number;
  }>;
}

export interface PreloadExportMediaOptions {
  loaders?: ExportMediaCacheLoaders;
  /** Override video preload timeout (ms). */
  videoTimeoutMs?: number;
}

function pushDiagnostic(
  cache: ExportMediaCache,
  diagnostic: ExportMediaCacheDiagnostic,
): void {
  cache.diagnostics.push(diagnostic);
}

function resolveImageUrl(scene: FootieScene, media: SceneMedia | undefined): string | undefined {
  // When SceneMedia is present, it is the sole URL authority — never fall back to stale scene.image.
  if (media) {
    if (media.type === "image" && typeof media.url === "string" && media.url.trim()) {
      return media.url.trim();
    }
    return undefined;
  }

  // Legacy stories without scene.media — getSceneMedia already maps these; this is a safety net
  // for callers that pass an unresolved scene into image preload.
  return getSceneImageUrl(scene);
}

/**
 * Default image loader — mirrors video-render.service `loadImage` behavior.
 */
export function loadExportImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image loading requires a browser environment"));
      return;
    }

    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load scene image"));
    img.src = src;
  });
}

/**
 * Creates a muted HTMLVideoElement and waits until metadata / seekable data is available.
 * Does not play audio. Does not draw frames.
 */
export function loadExportVideoElement(
  src: string,
  media: SceneMedia,
  timeoutMs = VIDEO_PRELOAD_TIMEOUT_MS,
): Promise<{ element: HTMLVideoElement; durationMs: number }> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Video loading requires a browser environment"));
      return;
    }

    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");

    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      video.crossOrigin = "anonymous";
    }

    let settled = false;

    const cleanupListeners = () => {
      video.onloadeddata = null;
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      cleanupListeners();
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore cleanup errors.
      }
      reject(new Error(message));
    };

    const succeed = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      cleanupListeners();

      const elementDurationMs = Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : 0;
      const mediaDurationMs =
        typeof media.durationMs === "number" && Number.isFinite(media.durationMs)
          ? Math.round(media.durationMs)
          : 0;
      const durationMs = elementDurationMs > 0 ? elementDurationMs : mediaDurationMs;

      // Keep muted for the lifetime of the cached element.
      video.muted = true;
      video.volume = 0;

      resolve({ element: video, durationMs });
    };

    const timeoutId = window.setTimeout(() => {
      fail("Video preload timed out");
    }, timeoutMs);

    video.onloadeddata = () => succeed();
    video.onloadedmetadata = () => {
      // Metadata alone is enough to seek; prefer loadeddata when it arrives first.
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        succeed();
      }
    };
    video.onerror = () => fail("Failed to load scene video");

    video.src = src;
    try {
      video.load();
    } catch {
      fail("Failed to start scene video load");
    }
  });
}

export function createExportMediaCache(): ExportMediaCache {
  return {
    images: new Map(),
    videos: new Map(),
    assets: new Map(),
    diagnostics: [],
  };
}

/**
 * Preloads one scene's media into the cache.
 * Image failures are soft (diagnostic only) — matches current export fallback.
 * Video failures are soft (diagnostic only) — no throw.
 */
export async function preloadExportSceneMedia(
  scene: FootieScene,
  cache: ExportMediaCache,
  options: PreloadExportMediaOptions = {},
): Promise<ExportMediaAsset | null> {
  const media = getSceneMedia(scene);
  const loadImage = options.loaders?.loadImage ?? loadExportImageElement;
  const loadVideo = options.loaders?.loadVideo ?? ((url, sceneMedia) =>
    loadExportVideoElement(url, sceneMedia, options.videoTimeoutMs));
  const mediaItemId = "__scene__";

  if (media?.type === "placeholder") {
    pushDiagnostic(cache, {
      sceneId: scene.id,
      mediaItemId,
      mediaType: "placeholder",
      status: "skipped",
      message: "Placeholder media skipped",
    });
    return null;
  }

  if (!media) {
    const legacyUrl = getSceneImageUrl(scene);
    if (!legacyUrl) {
      pushDiagnostic(cache, {
        sceneId: scene.id,
        mediaItemId,
        mediaType: "none",
        status: "skipped",
        message: "No media URL",
      });
      return null;
    }

    return preloadImageAsset(scene.id, mediaItemId, legacyUrl, cache, loadImage, "image");
  }

  if (media.type === "image") {
    const url = resolveImageUrl(scene, media);
    if (!url) {
      pushDiagnostic(cache, {
        sceneId: scene.id,
        mediaItemId,
        mediaType: "image",
        status: "skipped",
        message: "Missing image URL",
      });
      return null;
    }

    return preloadImageAsset(scene.id, mediaItemId, url, cache, loadImage, "image");
  }

  if (media.type === "video") {
    const url = typeof media.url === "string" ? media.url.trim() : "";
    if (!url) {
      pushDiagnostic(cache, {
        sceneId: scene.id,
        mediaItemId,
        mediaType: "video",
        status: "skipped",
        message: "Missing video URL",
      });
      return null;
    }

    try {
      const { element, durationMs } = await loadVideo(url, media);
      element.muted = true;
      element.volume = 0;
      const cacheKey = buildExportMediaCacheKey(scene.id, mediaItemId);

      const asset: ExportVideoAsset = {
        kind: "video",
        sceneId: scene.id,
        mediaItemId,
        cacheKey,
        url,
        element,
        durationMs,
        muted: true,
        status: "ready",
      };

      cache.videos.set(cacheKey, element);
      cache.assets.set(cacheKey, asset);
      pushDiagnostic(cache, {
        sceneId: scene.id,
        mediaItemId,
        mediaType: "video",
        status: "ready",
      });
      return asset;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load scene video";
      pushDiagnostic(cache, {
        sceneId: scene.id,
        mediaItemId,
        mediaType: "video",
        status: "error",
        message,
      });
      return null;
    }
  }

  pushDiagnostic(cache, {
    sceneId: scene.id,
    mediaItemId,
    mediaType: "none",
    status: "skipped",
    message: "Unsupported media type",
  });
  return null;
}

async function preloadImageAsset(
  sceneId: string,
  mediaItemId: string,
  url: string,
  cache: ExportMediaCache,
  loadImage: (url: string) => Promise<HTMLImageElement>,
  mediaType: SceneMediaType,
): Promise<ExportImageAsset | null> {
  const cacheKey = buildExportMediaCacheKey(sceneId, mediaItemId);
  try {
    const element = await loadImage(url);
    const asset: ExportImageAsset = {
      kind: "image",
      sceneId,
      mediaItemId,
      cacheKey,
      url,
      element,
      status: "ready",
    };
    cache.images.set(cacheKey, element);
    cache.assets.set(cacheKey, asset);
    pushDiagnostic(cache, {
      sceneId,
      mediaItemId,
      mediaType,
      status: "ready",
    });
    return asset;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load scene image";
    pushDiagnostic(cache, {
      sceneId,
      mediaItemId,
      mediaType,
      status: "error",
      message,
    });
    return null;
  }
}

/** Preloads media for every scene. Soft-fails per scene. */
export async function preloadExportStoryMedia(
  scenes: FootieScene[],
  cache: ExportMediaCache = createExportMediaCache(),
  options: PreloadExportMediaOptions = {},
): Promise<ExportMediaCache> {
  for (const scene of scenes) {
    await preloadExportSceneMedia(scene, cache, options);
  }
  return cache;
}

type ManifestPreloadMedia = {
  type: "image" | "video" | "placeholder";
  source?: string;
  sourceDurationMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
};

type ManifestPreloadScene = {
  id: string;
  media: ManifestPreloadMedia;
  mediaTimeline?: {
    items: ReadonlyArray<{
      id: string;
      media: ManifestPreloadMedia;
    }>;
  };
};

/**
 * Preload from ExportManifest sources only (Sprint 6C / 8D).
 * Prefers mediaTimeline items; falls back to compatibility scene.media.
 * Does not read StoryDocument / getSceneMedia.
 */
export async function preloadExportManifestMedia(
  scenes: ReadonlyArray<ManifestPreloadScene>,
  cache: ExportMediaCache = createExportMediaCache(),
  options: PreloadExportMediaOptions = {},
): Promise<ExportMediaCache> {
  for (const scene of scenes) {
    const timelineItems = scene.mediaTimeline?.items;
    const entries =
      timelineItems && timelineItems.length > 0
        ? timelineItems.map((item) => ({
            mediaItemId: item.id,
            media: item.media,
          }))
        : [{ mediaItemId: "__scene__", media: scene.media }];

    for (const entry of entries) {
      await preloadManifestMediaEntry(scene.id, entry.mediaItemId, entry.media, cache, options);
    }
  }

  return cache;
}

async function preloadManifestMediaEntry(
  sceneId: string,
  mediaItemId: string,
  media: ManifestPreloadMedia,
  cache: ExportMediaCache,
  options: PreloadExportMediaOptions,
): Promise<void> {
  if (media.type === "placeholder" || !media.source?.trim()) {
    pushDiagnostic(cache, {
      sceneId,
      mediaItemId,
      mediaType: media.type === "placeholder" ? "placeholder" : "none",
      status: "skipped",
      message: "No drawable media source",
    });
    return;
  }

  if (media.type === "image") {
    await preloadImageAsset(
      sceneId,
      mediaItemId,
      media.source.trim(),
      cache,
      options.loaders?.loadImage ?? loadExportImageElement,
      "image",
    );
    return;
  }

  const syntheticMedia: SceneMedia = {
    type: "video",
    url: media.source.trim(),
    source: "upload",
    durationMs: media.sourceDurationMs,
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
  };
  const loadVideo =
    options.loaders?.loadVideo ??
    ((url, sceneMedia) =>
      loadExportVideoElement(url, sceneMedia, options.videoTimeoutMs));

  try {
    const { element, durationMs } = await loadVideo(media.source.trim(), syntheticMedia);
    element.muted = true;
    element.volume = 0;
    const cacheKey = buildExportMediaCacheKey(sceneId, mediaItemId);
    const asset: ExportVideoAsset = {
      kind: "video",
      sceneId,
      mediaItemId,
      cacheKey,
      url: media.source.trim(),
      element,
      durationMs,
      muted: true,
      status: "ready",
    };
    cache.videos.set(cacheKey, element);
    cache.assets.set(cacheKey, asset);
    pushDiagnostic(cache, {
      sceneId,
      mediaItemId,
      mediaType: "video",
      status: "ready",
    });
  } catch (error) {
    pushDiagnostic(cache, {
      sceneId,
      mediaItemId,
      mediaType: "video",
      status: "error",
      message: error instanceof Error ? error.message : "Failed to load scene video",
    });
  }
}

/** Returns the cached asset for a scene media item, if preloaded successfully. */
export function getExportSceneMediaAsset(
  cache: ExportMediaCache,
  scene: Pick<FootieScene, "id"> | string,
  mediaItemId?: string,
): ExportMediaAsset | null {
  const sceneId = typeof scene === "string" ? scene : scene.id;
  const itemId = mediaItemId?.trim() ? mediaItemId.trim() : "__scene__";
  const key = buildExportMediaCacheKey(sceneId, itemId);
  const direct = cache.assets.get(key);
  if (direct) {
    return direct;
  }
  // Legacy fallback: some tests still seed by raw sceneId.
  return cache.assets.get(sceneId) ?? null;
}

/** Legacy-compatible image lookup used by the current renderer shape. */
export function getExportCachedImage(
  cache: ExportMediaCache,
  sceneId: string,
  mediaItemId?: string,
): HTMLImageElement | null {
  const key = buildExportMediaCacheKey(sceneId, mediaItemId?.trim() || "__scene__");
  return cache.images.get(key) ?? cache.images.get(sceneId) ?? null;
}

export function getExportCachedVideo(
  cache: ExportMediaCache,
  sceneId: string,
  mediaItemId?: string,
): HTMLVideoElement | null {
  const key = buildExportMediaCacheKey(sceneId, mediaItemId?.trim() || "__scene__");
  return cache.videos.get(key) ?? cache.videos.get(sceneId) ?? null;
}

/**
 * Releases video element resources and clears the cache.
 * Safe to call multiple times.
 */
export function disposeExportMediaCache(cache: ExportMediaCache): void {
  for (const video of cache.videos.values()) {
    try {
      if (!video.paused) {
        video.pause();
      }
      video.removeAttribute("src");
      video.load();
    } catch {
      // Ignore dispose errors.
    }
  }

  cache.images.clear();
  cache.videos.clear();
  cache.assets.clear();
  cache.diagnostics.length = 0;
}
