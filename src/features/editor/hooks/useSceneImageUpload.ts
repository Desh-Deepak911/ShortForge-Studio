"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  createSceneImageFromUrl,
  getSceneImageUrl,
} from "@/features/story/utils";
import { applySceneUpdate } from "@/lib/utils/voiceover";
import type { FootieScript } from "@/features/story/types";

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

interface UseSceneImageUploadOptions {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Shared scene image file replace handler for inspector and context ribbon.
 */
export function useSceneImageUpload({ script, onScriptChange }: UseSceneImageUploadOptions) {
  const managedBlobUrls = useRef<Set<string>>(new Set());

  const revokeBlobUrl = useCallback((url: string | undefined) => {
    if (url && isBlobUrl(url) && managedBlobUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      managedBlobUrls.current.delete(url);
    }
  }, []);

  const replaceSceneImage = useCallback(
    (sceneId: string, file: File) => {
      const existing = getSceneImageUrl(script.scenes.find((entry) => entry.id === sceneId) ?? {});
      revokeBlobUrl(existing);

      try {
        const objectUrl = URL.createObjectURL(file);
        managedBlobUrls.current.add(objectUrl);
        onScriptChange(
          applySceneUpdate(script, sceneId, {
            image: createSceneImageFromUrl(objectUrl),
            uploadedImage: undefined,
          }),
        );
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          const url = reader.result as string;
          onScriptChange(
            applySceneUpdate(script, sceneId, {
              image: createSceneImageFromUrl(url),
              uploadedImage: undefined,
            }),
          );
        };
        reader.readAsDataURL(file);
      }
    },
    [onScriptChange, revokeBlobUrl, script],
  );

  const removeSceneImage = useCallback(
    (sceneId: string) => {
      const existing = getSceneImageUrl(script.scenes.find((entry) => entry.id === sceneId) ?? {});
      revokeBlobUrl(existing);
      onScriptChange(
        applySceneUpdate(script, sceneId, { image: undefined, uploadedImage: undefined }),
      );
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

  return { replaceSceneImage, removeSceneImage };
}
