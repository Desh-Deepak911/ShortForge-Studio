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

import { probeImageObjectUrlMetadata } from "@/features/source-quality/client/probe-source-media-metadata";
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

/** Thrown when a newer append for the same scene supersedes an in-flight probe. */
export class StaleSceneMediaAppendError extends Error {
  readonly code = "STALE_APPEND" as const;

  constructor() {
    super("A newer media append replaced this request.");
    this.name = "StaleSceneMediaAppendError";
  }
}

export function isStaleSceneMediaAppendError(error: unknown): boolean {
  return (
    error instanceof StaleSceneMediaAppendError ||
    (typeof error === "object" &&
      error != null &&
      "code" in error &&
      (error as { code?: unknown }).code === "STALE_APPEND")
  );
}

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
  /**
   * Explicit source-quality capture gate. When false, appends keep legacy
   * behavior without intrinsic dimension capture.
   */
  sourceQualityIntelligenceEnabled: boolean;
}) {
  const enabled = input.enabled !== false;
  const ownedBlobUrls = useRef<Set<string>>(new Set());
  const scriptRef = useRef(input.script);
  const appendGenerationByScene = useRef<Map<string, number>>(new Map());
  const inputRef = useRef(input);

  useEffect(() => {
    scriptRef.current = input.script;
  }, [input.script]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // Intentionally no unmount revoke — see file header (duplicate-scene safety).

  const appendImageFile = useCallback(
    async (sceneId: string, file: File) => {
      if (!enabled) {
        throw new Error("Scene media append is owned by the shared provider.");
      }
      if (!isImageUploadFile(file)) {
        throw new Error("Only image files can be added to the scene media timeline.");
      }

      const requestToken =
        (appendGenerationByScene.current.get(sceneId) ?? 0) + 1;
      appendGenerationByScene.current.set(sceneId, requestToken);

      const sceneAtStart = scriptRef.current.scenes.find((entry) => entry.id === sceneId);
      if (!sceneAtStart) {
        throw new Error("Scene not found.");
      }
      if (!canAddSceneMediaItem(sceneAtStart)) {
        throw new Error(
          "Cannot add media item: scene is shorter than the minimum duration per item.",
        );
      }

      const objectUrl = URL.createObjectURL(file);
      ownedBlobUrls.current.add(objectUrl);
      let committed = false;

      try {
        const facts = inputRef.current.sourceQualityIntelligenceEnabled
          ? await probeImageObjectUrlMetadata(objectUrl, file.type || undefined)
          : undefined;

        if (appendGenerationByScene.current.get(sceneId) !== requestToken) {
          throw new StaleSceneMediaAppendError();
        }

        const currentScript = scriptRef.current;
        const scene = currentScript.scenes.find((entry) => entry.id === sceneId);
        if (!scene) {
          throw new Error("Scene not found.");
        }
        if (!canAddSceneMediaItem(scene)) {
          throw new Error(
            "Cannot add media item: scene is shorter than the minimum duration per item.",
          );
        }

        const image = createSceneImageFromUrl(objectUrl);
        const media = buildSceneMediaImageFromUpload(
          image,
          file.type || undefined,
          facts,
        );
        const result = appendSceneMediaImageItem(scene, media);
        const next = applySceneUpdate(currentScript, sceneId, {
          media: result.scene.media,
          mediaTimeline: result.scene.mediaTimeline,
        });
        scriptRef.current = next;
        inputRef.current.onScriptChange(next, { intent: "media" });
        committed = true;
        if (result.selectedMediaItemId) {
          inputRef.current.onSelectMediaItem?.(sceneId, result.selectedMediaItemId);
        }
        return result;
      } catch (error) {
        if (!committed) {
          revokeOwnedBlobUrlIfPresent(objectUrl, ownedBlobUrls.current);
        }
        throw error;
      }
    },
    [enabled],
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
