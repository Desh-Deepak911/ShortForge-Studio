"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { probeImageObjectUrlMetadata } from "@/features/source-quality/client/probe-source-media-metadata";
import type { SourceMediaMetadataFacts } from "@/features/source-quality/domain/source-media-metadata";
import {
  createSceneImageFromUrl,
  getSceneImageUrl,
  getSceneMediaUrl,
} from "@/features/story/utils";
import { probeVideoMetadata } from "@/features/story/utils/probe-video-metadata.utils";
import type { ProbedVideoMetadata } from "@/features/story/utils/probe-video-metadata.utils";
import {
  buildRemoveSceneMediaPatch,
  buildSceneMediaImageFromUpload,
  buildSceneMediaVideoFromUpload,
  isImageUploadFile,
  isVideoUploadFile,
} from "@/features/story/utils/scene-media-upload.utils";
import { applySceneUpdate, type StoryScriptChangeOptions } from "@/lib/utils/voiceover";
import type { FootieScript } from "@/features/story/types";
import {
  isPreviewMediaSourceMounted,
  scheduleAfterNextPaint,
} from "@/features/preview/runtime-parity/schedule-owned-preview-blob-revocation";

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

export type SceneMediaReplaceOutcome =
  | { readonly status: "committed" }
  | { readonly status: "aborted" }
  | { readonly status: "failed"; readonly message: string };

export interface SceneMediaReplaceSession {
  readonly getScript: () => FootieScript;
  readonly onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly isOwnedBlobUrl: (url: string) => boolean;
  readonly trackOwnedBlobUrl: (url: string) => void;
  readonly revokeOwnedBlobUrl: (url: string | undefined) => void;
  readonly beginRequest: (sceneId: string) => number;
  readonly isCurrentRequest: (sceneId: string, token: number) => boolean;
  readonly probeImageObjectUrlMetadata?: (
    objectUrl: string,
    mimeType?: string,
  ) => Promise<SourceMediaMetadataFacts>;
  readonly probeVideoMetadata?: (
    fileOrUrl: File | string,
  ) => Promise<ProbedVideoMetadata>;
  readonly createObjectUrl?: (file: File) => string;
}

/**
 * Production replace transaction used by useSceneMediaUpload.
 * Safe ordering: probe candidate first; revoke previous owned blob only after commit.
 */
export async function performSceneMediaReplace(
  session: SceneMediaReplaceSession,
  sceneId: string,
  file: File,
): Promise<SceneMediaReplaceOutcome> {
  const token = session.beginRequest(sceneId);
  const probeImage =
    session.probeImageObjectUrlMetadata ?? probeImageObjectUrlMetadata;
  const probeVideo = session.probeVideoMetadata ?? probeVideoMetadata;
  const createObjectUrl = session.createObjectUrl ?? ((entry: File) => URL.createObjectURL(entry));

  const scriptAtStart = session.getScript();
  const sceneAtStart = scriptAtStart.scenes.find((entry) => entry.id === sceneId);
  if (!sceneAtStart) {
    return { status: "failed", message: "Scene not found." };
  }
  const previousUrl =
    getSceneMediaUrl(sceneAtStart) ?? getSceneImageUrl(sceneAtStart);

  if (isVideoUploadFile(file)) {
    let candidateUrl: string | null = null;
    try {
      candidateUrl = createObjectUrl(file);
      session.trackOwnedBlobUrl(candidateUrl);
      const metadata = await probeVideo(file);

      if (!session.isCurrentRequest(sceneId, token)) {
        session.revokeOwnedBlobUrl(candidateUrl);
        return { status: "aborted" };
      }

      const currentScript = session.getScript();
      if (!currentScript.scenes.some((entry) => entry.id === sceneId)) {
        session.revokeOwnedBlobUrl(candidateUrl);
        return {
          status: "failed",
          message: "Scene was removed before the replacement could be applied.",
        };
      }

      // Re-check immediately before the synchronous commit (single-threaded CAS).
      if (!session.isCurrentRequest(sceneId, token)) {
        session.revokeOwnedBlobUrl(candidateUrl);
        return { status: "aborted" };
      }

      session.onScriptChange(
        applySceneUpdate(currentScript, sceneId, {
          media: buildSceneMediaVideoFromUpload(candidateUrl, metadata),
          image: undefined,
          uploadedImage: undefined,
          assetAttachment: undefined,
        }),
        { intent: "media" },
      );

      if (previousUrl && previousUrl !== candidateUrl) {
        scheduleAfterNextPaint(() => {
          if (isPreviewMediaSourceMounted(previousUrl)) {
            return;
          }
          session.revokeOwnedBlobUrl(previousUrl);
        });
      }
      return { status: "committed" };
    } catch (error) {
      if (candidateUrl) {
        session.revokeOwnedBlobUrl(candidateUrl);
      }
      return {
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to read video metadata. Try another clip.",
      };
    }
  }

  if (!isImageUploadFile(file)) {
    return {
      status: "failed",
      message: "Unsupported file type. Upload an image or MP4/WebM/MOV clip.",
    };
  }

  let candidateUrl: string | null = null;
  try {
    candidateUrl = createObjectUrl(file);
    session.trackOwnedBlobUrl(candidateUrl);

    let facts: SourceMediaMetadataFacts | undefined;
    if (session.sourceQualityIntelligenceEnabled) {
      facts = await probeImage(candidateUrl, file.type || undefined);
    }

    if (!session.isCurrentRequest(sceneId, token)) {
      session.revokeOwnedBlobUrl(candidateUrl);
      return { status: "aborted" };
    }

    const currentScript = session.getScript();
    if (!currentScript.scenes.some((entry) => entry.id === sceneId)) {
      session.revokeOwnedBlobUrl(candidateUrl);
      return {
        status: "failed",
        message: "Scene was removed before the replacement could be applied.",
      };
    }

    // Re-check immediately before the synchronous commit (single-threaded CAS).
    if (!session.isCurrentRequest(sceneId, token)) {
      session.revokeOwnedBlobUrl(candidateUrl);
      return { status: "aborted" };
    }

    const image = createSceneImageFromUrl(candidateUrl);
    session.onScriptChange(
      applySceneUpdate(currentScript, sceneId, {
        image,
        uploadedImage: undefined,
        media: buildSceneMediaImageFromUpload(image, file.type || undefined, facts),
      }),
      { intent: "media" },
    );

    if (previousUrl && previousUrl !== candidateUrl) {
      scheduleAfterNextPaint(() => {
        if (isPreviewMediaSourceMounted(previousUrl)) {
          return;
        }
        session.revokeOwnedBlobUrl(previousUrl);
      });
    }
    return { status: "committed" };
  } catch (error) {
    if (candidateUrl) {
      session.revokeOwnedBlobUrl(candidateUrl);
    }

    // Legacy FileReader fallback only when capability-off and object URL creation failed.
    if (!session.sourceQualityIntelligenceEnabled && !candidateUrl) {
      return await new Promise<SceneMediaReplaceOutcome>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (!session.isCurrentRequest(sceneId, token)) {
            resolve({ status: "aborted" });
            return;
          }
          const currentScript = session.getScript();
          if (!currentScript.scenes.some((entry) => entry.id === sceneId)) {
            resolve({
              status: "failed",
              message: "Scene was removed before the replacement could be applied.",
            });
            return;
          }
          const url = reader.result as string;
          const image = createSceneImageFromUrl(url);
          session.onScriptChange(
            applySceneUpdate(currentScript, sceneId, {
              image,
              uploadedImage: undefined,
              media: buildSceneMediaImageFromUpload(image, file.type || undefined),
            }),
            { intent: "media" },
          );
          if (previousUrl && isBlobUrl(previousUrl) && previousUrl !== url) {
            scheduleAfterNextPaint(() => {
              if (isPreviewMediaSourceMounted(previousUrl)) {
                return;
              }
              session.revokeOwnedBlobUrl(previousUrl);
            });
          }
          resolve({ status: "committed" });
        };
        reader.onerror = () => {
          resolve({ status: "failed", message: "Unable to read image file." });
        };
        reader.readAsDataURL(file);
      });
    }

    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to read image metadata. Try another image.",
    };
  }
}

interface UseSceneMediaUploadOptions {
  script: FootieScript;
  onScriptChange: (script: FootieScript, options?: StoryScriptChangeOptions) => void;
  /**
   * Explicit source-quality capture gate. When false (or capabilities not ready),
   * image uploads keep legacy behavior without intrinsic dimension capture.
   * Video metadata probing remains unchanged.
   */
  sourceQualityIntelligenceEnabled: boolean;
}

/**
 * Shared scene media file replace handler for inspector and context ribbon.
 * Images dual-write `scene.image` + `scene.media`; videos write `scene.media` only.
 */
export function useSceneMediaUpload({
  script,
  onScriptChange,
  sourceQualityIntelligenceEnabled,
}: UseSceneMediaUploadOptions) {
  const managedBlobUrls = useRef<Set<string>>(new Set());
  const scriptRef = useRef(script);
  const replaceGenerationByScene = useRef<Map<string, number>>(new Map());
  const onScriptChangeRef = useRef(onScriptChange);
  const sourceQualityEnabledRef = useRef(sourceQualityIntelligenceEnabled);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  useEffect(() => {
    onScriptChangeRef.current = onScriptChange;
  }, [onScriptChange]);

  useEffect(() => {
    sourceQualityEnabledRef.current = sourceQualityIntelligenceEnabled;
  }, [sourceQualityIntelligenceEnabled]);

  const revokeBlobUrl = useCallback((url: string | undefined) => {
    if (url && isBlobUrl(url) && managedBlobUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      managedBlobUrls.current.delete(url);
    }
  }, []);

  const clearUploadError = useCallback(() => {
    setUploadError(null);
  }, []);

  const beginRequest = useCallback((sceneId: string) => {
    const next = (replaceGenerationByScene.current.get(sceneId) ?? 0) + 1;
    replaceGenerationByScene.current.set(sceneId, next);
    return next;
  }, []);

  const isCurrentRequest = useCallback((sceneId: string, token: number) => {
    return replaceGenerationByScene.current.get(sceneId) === token;
  }, []);

  const replaceSceneMedia = useCallback(
    async (sceneId: string, file: File) => {
      setUploadError(null);
      const outcome = await performSceneMediaReplace(
        {
          getScript: () => scriptRef.current,
          onScriptChange: (next, options) => {
            scriptRef.current = next;
            onScriptChangeRef.current(next, options);
          },
          sourceQualityIntelligenceEnabled: sourceQualityEnabledRef.current,
          isOwnedBlobUrl: (url) => managedBlobUrls.current.has(url),
          trackOwnedBlobUrl: (url) => {
            managedBlobUrls.current.add(url);
          },
          revokeOwnedBlobUrl: revokeBlobUrl,
          beginRequest,
          isCurrentRequest,
        },
        sceneId,
        file,
      );

      if (outcome.status === "failed") {
        setUploadError(outcome.message);
      }
    },
    [beginRequest, isCurrentRequest, revokeBlobUrl],
  );

  const removeSceneMedia = useCallback(
    (sceneId: string) => {
      beginRequest(sceneId);
      const currentScript = scriptRef.current;
      const scene = currentScript.scenes.find((entry) => entry.id === sceneId) ?? {};
      const existingUrl = getSceneMediaUrl(scene) ?? getSceneImageUrl(scene);
      revokeBlobUrl(existingUrl);
      setUploadError(null);
      const next = applySceneUpdate(currentScript, sceneId, buildRemoveSceneMediaPatch());
      scriptRef.current = next;
      onScriptChangeRef.current(next, { intent: "media" });
    },
    [beginRequest, revokeBlobUrl],
  );

  useEffect(() => {
    const blobs = managedBlobUrls.current;
    return () => {
      blobs.forEach((url) => URL.revokeObjectURL(url));
      blobs.clear();
    };
  }, []);

  return {
    replaceSceneMedia,
    removeSceneMedia,
    uploadError,
    clearUploadError,
    /** @deprecated Use replaceSceneMedia */
    replaceSceneImage: replaceSceneMedia,
    /** @deprecated Use removeSceneMedia */
    removeSceneImage: removeSceneMedia,
  };
}

/** @deprecated Use useSceneMediaUpload */
export const useSceneImageUpload = useSceneMediaUpload;
