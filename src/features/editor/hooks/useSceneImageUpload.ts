"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSceneImageFromUrl,
  getSceneImageUrl,
  getSceneMediaUrl,
} from "@/features/story/utils";
import { probeVideoMetadata } from "@/features/story/utils/probe-video-metadata.utils";
import {
  buildRemoveSceneMediaPatch,
  buildSceneMediaImageFromUpload,
  buildSceneMediaVideoFromUpload,
  isImageUploadFile,
  isVideoUploadFile,
} from "@/features/story/utils/scene-media-upload.utils";
import { applySceneUpdate, type StoryScriptChangeOptions } from "@/lib/utils/voiceover";
import type { FootieScript } from "@/features/story/types";

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

interface UseSceneMediaUploadOptions {
  script: FootieScript;
  onScriptChange: (script: FootieScript, options?: StoryScriptChangeOptions) => void;
}

/**
 * Shared scene media file replace handler for inspector and context ribbon.
 * Images dual-write `scene.image` + `scene.media`; videos write `scene.media` only.
 */
export function useSceneMediaUpload({ script, onScriptChange }: UseSceneMediaUploadOptions) {
  const managedBlobUrls = useRef<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);

  const revokeBlobUrl = useCallback((url: string | undefined) => {
    if (url && isBlobUrl(url) && managedBlobUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      managedBlobUrls.current.delete(url);
    }
  }, []);

  const clearUploadError = useCallback(() => {
    setUploadError(null);
  }, []);

  const commitImageUpload = useCallback(
    (sceneId: string, url: string, mimeType?: string) => {
      const image = createSceneImageFromUrl(url);
      onScriptChange(
        applySceneUpdate(script, sceneId, {
          image,
          uploadedImage: undefined,
          media: buildSceneMediaImageFromUpload(image, mimeType),
        }),
        { intent: "media" },
      );
    },
    [onScriptChange, script],
  );

  const replaceSceneMedia = useCallback(
    async (sceneId: string, file: File) => {
      const scene = script.scenes.find((entry) => entry.id === sceneId) ?? {};
      const existingUrl = getSceneMediaUrl(scene) ?? getSceneImageUrl(scene);
      revokeBlobUrl(existingUrl);
      setUploadError(null);

      if (isVideoUploadFile(file)) {
        let objectUrl: string | null = null;

        try {
          objectUrl = URL.createObjectURL(file);
          managedBlobUrls.current.add(objectUrl);

          const metadata = await probeVideoMetadata(file);
          onScriptChange(
            applySceneUpdate(script, sceneId, {
              media: buildSceneMediaVideoFromUpload(objectUrl, metadata),
              image: undefined,
              uploadedImage: undefined,
              assetAttachment: undefined,
            }),
            { intent: "media" },
          );
        } catch (error) {
          if (objectUrl) {
            revokeBlobUrl(objectUrl);
          }

          const message =
            error instanceof Error
              ? error.message
              : "Unable to read video metadata. Try another clip.";
          setUploadError(message);
        }

        return;
      }

      if (!isImageUploadFile(file)) {
        setUploadError("Unsupported file type. Upload an image or MP4/WebM/MOV clip.");
        return;
      }

      try {
        const objectUrl = URL.createObjectURL(file);
        managedBlobUrls.current.add(objectUrl);
        commitImageUpload(sceneId, objectUrl, file.type || undefined);
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          const url = reader.result as string;
          commitImageUpload(sceneId, url, file.type || undefined);
        };
        reader.onerror = () => {
          setUploadError("Unable to read image file.");
        };
        reader.readAsDataURL(file);
      }
    },
    [commitImageUpload, onScriptChange, revokeBlobUrl, script],
  );

  const removeSceneMedia = useCallback(
    (sceneId: string) => {
      const scene = script.scenes.find((entry) => entry.id === sceneId) ?? {};
      const existingUrl = getSceneMediaUrl(scene) ?? getSceneImageUrl(scene);
      revokeBlobUrl(existingUrl);
      setUploadError(null);
      onScriptChange(applySceneUpdate(script, sceneId, buildRemoveSceneMediaPatch()), {
        intent: "media",
      });
    },
    [onScriptChange, revokeBlobUrl, script],
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
