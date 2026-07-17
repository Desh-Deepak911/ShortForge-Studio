"use client";

/**
 * Append-only multi-image upload for Scene Media Timeline (Sprint 8B / 8B.2).
 * Does not replace the existing first media slot.
 *
 * Blob ownership (8B.2):
 * - Track URLs created by this upload session.
 * - Revoke only when a newly created append fails, or when an explicitly
 *   removed media item is owned by this session.
 * - Do NOT revoke on lane/hook unmount — duplicated scenes may still reference
 *   the same blob URL. The browser reclaims object URLs when the document ends.
 * - External/legacy/asset URLs are never revoked.
 * - Reorder, selection, and boundary cancellation never revoke.
 *
 * Draft persistence still stores blob: URLs in JSON — binary rehydration of
 * uploaded blobs is an existing limitation and is not migrated in 8B.
 */

import { useCallback, useEffect, useRef } from "react";

import {
  appendSceneMediaImageItem,
  canAddSceneMediaItem,
} from "@/features/scene-media-timeline/editor";
import type { FootieScript } from "@/features/story/types";
import {
  buildSceneMediaImageFromUpload,
  isImageUploadFile,
} from "@/features/story/utils/scene-media-upload.utils";
import { createSceneImageFromUrl } from "@/features/story/utils/scene.utils";
import { applySceneUpdate } from "@/lib/utils/voiceover";

import { revokeOwnedBlobUrlIfPresent } from "./blob-url-ownership";

export const SCENE_MEDIA_IMAGE_ACCEPT = "image/*";

type ScriptChangeHandler = (
  next: FootieScript,
  options?: { intent?: "media" | "story" | "presentation" | "narration_rebuild" },
) => void;

export function useSceneMediaImageAppend(input: {
  script: FootieScript;
  onScriptChange: ScriptChangeHandler;
  onSelectMediaItem?: (sceneId: string, mediaItemId: string) => void;
  /** When false, this instance is a no-op fallback (shared provider owns append). */
  enabled?: boolean;
}) {
  const enabled = input.enabled !== false;
  const ownedBlobUrls = useRef<Set<string>>(new Set());
  const scriptRef = useRef(input.script);

  useEffect(() => {
    scriptRef.current = input.script;
  }, [input.script]);

  // Intentionally no unmount revoke — see file header (duplicate-scene safety).

  const appendImageFile = useCallback(
    (sceneId: string, file: File) => {
      if (!enabled) {
        throw new Error("Scene media append is owned by the shared provider.");
      }
      if (!isImageUploadFile(file)) {
        throw new Error("Only image files can be added to the scene media timeline.");
      }

      const scene = scriptRef.current.scenes.find((entry) => entry.id === sceneId);
      if (!scene) {
        throw new Error("Scene not found.");
      }
      if (!canAddSceneMediaItem(scene)) {
        throw new Error(
          "Cannot add media item: scene is shorter than the minimum duration per item.",
        );
      }

      const objectUrl = URL.createObjectURL(file);
      ownedBlobUrls.current.add(objectUrl);

      try {
        const image = createSceneImageFromUrl(objectUrl);
        const media = buildSceneMediaImageFromUpload(image, file.type || undefined);
        const result = appendSceneMediaImageItem(scene, media);
        const next = applySceneUpdate(scriptRef.current, sceneId, {
          media: result.scene.media,
          mediaTimeline: result.scene.mediaTimeline,
        });
        input.onScriptChange(next, { intent: "media" });
        if (result.selectedMediaItemId) {
          input.onSelectMediaItem?.(sceneId, result.selectedMediaItemId);
        }
        return result;
      } catch (error) {
        revokeOwnedBlobUrlIfPresent(objectUrl, ownedBlobUrls.current);
        throw error;
      }
    },
    [enabled, input],
  );

  const revokeOwnedUrlIfPresent = useCallback((url: string | undefined) => {
    revokeOwnedBlobUrlIfPresent(url, ownedBlobUrls.current);
  }, []);

  return {
    appendImageFile,
    revokeOwnedUrlIfPresent,
    accept: SCENE_MEDIA_IMAGE_ACCEPT,
  };
}
