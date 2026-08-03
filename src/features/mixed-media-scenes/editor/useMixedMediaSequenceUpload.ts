"use client";

/**
 * Mixed-media sequence upload ownership.
 *
 * Aligns with Sprint 8B scene-media blob policy:
 * - Track object URLs created by this upload session.
 * - Revoke on failed probe/append, or when an explicitly removed item is owned.
 * - Never revoke on hook/panel unmount — duplicated scenes may still reference
 *   the same blob URL.
 * - Never revoke external, asset-library, or otherwise unowned URLs.
 *
 * Draft JSON may still persist blob: URLs; binary rehydration of those blobs
 * after reload remains an existing product limitation and is not expanded here.
 */

import { useCallback, useEffect, useRef } from "react";

import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { createSceneImageFromUrl } from "@/features/story/utils/scene.utils";
import { probeVideoMetadata } from "@/features/story/utils/probe-video-metadata.utils";
import {
  buildSceneMediaImageFromUpload,
  buildSceneMediaVideoFromUpload,
  isImageUploadFile,
  isVideoUploadFile,
  SCENE_MEDIA_FILE_ACCEPT,
} from "@/features/story/utils/scene-media-upload.utils";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";

import { StaleSceneMediaAppendError } from "@/features/timeline-editor/scene-media/useSceneMediaImageAppend";

import {
  revokeFailedAppendObjectUrl,
  revokeRemovedOwnedMediaUrl,
  trackOwnedObjectUrl,
} from "./mixed-media-blob-ownership";
import {
  appendMixedMediaSequenceItem,
  removeMixedMediaSequenceItem,
  type MixedMediaSceneCommandResult,
} from "./mixed-media-scene.commands";

type ScriptChangeHandler = (
  next: FootieScript,
  options?: StoryScriptChangeOptions,
) => void;

function commitScenePatch(
  script: FootieScript,
  sceneId: string,
  scene: FootieScene,
  onScriptChange: ScriptChangeHandler,
) {
  const next: FootieScript = {
    ...script,
    scenes: script.scenes.map((entry) => (entry.id === sceneId ? scene : entry)),
  };
  onScriptChange(next, { intent: "media" });
}

export type MixedMediaImageMetadataProbe = (
  objectUrl: string,
  mimeType?: string,
) => Promise<{
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
}>;

export function useMixedMediaSequenceUpload(input: {
  script: FootieScript;
  scene: FootieScene;
  onScriptChange: ScriptChangeHandler;
  mixedMediaScenesEnabled: boolean;
  /**
   * Explicit source-quality capture gate. When false, image appends keep
   * legacy behavior without intrinsic dimension capture. Video probing stays on.
   */
  sourceQualityIntelligenceEnabled: boolean;
  /**
   * Injected by the editor/composition root so mixed-media never imports
   * source-quality directly. Required when source-quality capture is enabled.
   */
  probeImageObjectUrlMetadata?: MixedMediaImageMetadataProbe;
  onSelectMediaItem?: (sceneId: string, mediaItemId: string) => void;
}) {
  const ownedBlobUrls = useRef<Set<string>>(new Set());
  const scriptRef = useRef(input.script);
  const sceneRef = useRef(input.scene);
  const appendGenerationByScene = useRef<Map<string, number>>(new Map());
  const inputRef = useRef(input);

  useEffect(() => {
    scriptRef.current = input.script;
  }, [input.script]);

  useEffect(() => {
    sceneRef.current = input.scene;
  }, [input.scene]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // Intentionally no unmount revoke — see file header (duplicate-scene safety).

  const appendMediaFile = useCallback(
    async (file: File): Promise<MixedMediaSceneCommandResult> => {
      if (!inputRef.current.mixedMediaScenesEnabled) {
        throw new Error(
          "Mixed-media scenes are unavailable while mixed-media-scenes-v1 is disabled.",
        );
      }

      const sceneId = sceneRef.current.id;
      const requestToken =
        (appendGenerationByScene.current.get(sceneId) ?? 0) + 1;
      appendGenerationByScene.current.set(sceneId, requestToken);

      let objectUrl: string | null = null;
      let committed = false;
      try {
        if (isVideoUploadFile(file)) {
          objectUrl = URL.createObjectURL(file);
          trackOwnedObjectUrl(objectUrl, ownedBlobUrls.current);
          const metadata = await probeVideoMetadata(file);
          if (appendGenerationByScene.current.get(sceneId) !== requestToken) {
            throw new StaleSceneMediaAppendError();
          }
          const currentScene =
            scriptRef.current.scenes.find((entry) => entry.id === sceneId) ??
            sceneRef.current;
          if (!scriptRef.current.scenes.some((entry) => entry.id === sceneId)) {
            throw new Error("Scene not found.");
          }
          const media = buildSceneMediaVideoFromUpload(objectUrl, metadata);
          const result = appendMixedMediaSequenceItem(currentScene, media, {
            mixedMediaScenesEnabled: true,
          });
          commitScenePatch(
            scriptRef.current,
            sceneId,
            result.scene,
            inputRef.current.onScriptChange,
          );
          committed = true;
          scriptRef.current = {
            ...scriptRef.current,
            scenes: scriptRef.current.scenes.map((entry) =>
              entry.id === sceneId ? result.scene : entry,
            ),
          };
          sceneRef.current = result.scene;
          if (result.selectedMediaItemId) {
            inputRef.current.onSelectMediaItem?.(sceneId, result.selectedMediaItemId);
          }
          return result;
        }

        if (!isImageUploadFile(file)) {
          throw new Error(
            "Unsupported file type. Upload an image or MP4/WebM/MOV clip.",
          );
        }

        objectUrl = URL.createObjectURL(file);
        trackOwnedObjectUrl(objectUrl, ownedBlobUrls.current);
        const probe = inputRef.current.probeImageObjectUrlMetadata;
        const facts =
          inputRef.current.sourceQualityIntelligenceEnabled && probe
            ? await probe(objectUrl, file.type || undefined)
            : undefined;
        if (appendGenerationByScene.current.get(sceneId) !== requestToken) {
          throw new StaleSceneMediaAppendError();
        }
        const currentScene =
          scriptRef.current.scenes.find((entry) => entry.id === sceneId) ??
          sceneRef.current;
        if (!scriptRef.current.scenes.some((entry) => entry.id === sceneId)) {
          throw new Error("Scene not found.");
        }
        const image = createSceneImageFromUrl(objectUrl);
        const media = buildSceneMediaImageFromUpload(
          image,
          file.type || undefined,
          facts,
        );
        const result = appendMixedMediaSequenceItem(currentScene, media, {
          mixedMediaScenesEnabled: true,
        });
        commitScenePatch(
          scriptRef.current,
          sceneId,
          result.scene,
          inputRef.current.onScriptChange,
        );
        committed = true;
        scriptRef.current = {
          ...scriptRef.current,
          scenes: scriptRef.current.scenes.map((entry) =>
            entry.id === sceneId ? result.scene : entry,
          ),
        };
        sceneRef.current = result.scene;
        if (result.selectedMediaItemId) {
          inputRef.current.onSelectMediaItem?.(sceneId, result.selectedMediaItemId);
        }
        return result;
      } catch (error) {
        if (!committed && objectUrl) {
          revokeFailedAppendObjectUrl(objectUrl, ownedBlobUrls.current);
        }
        throw error;
      }
    },
    [],
  );

  const removeOwnedMediaItem = useCallback(
    (mediaItemId: string): MixedMediaSceneCommandResult => {
      const scene = sceneRef.current;
      const target = scene.visualSequence?.items.find((item) => item.id === mediaItemId)
        ?? scene.mediaTimeline?.items.find((item) => item.id === mediaItemId);
      const ownedUrl =
        target && "media" in target
          ? (target.media as SceneMedia | undefined)?.url
          : undefined;

      const result = removeMixedMediaSequenceItem(scene, mediaItemId, {
        mixedMediaScenesEnabled: input.mixedMediaScenesEnabled,
      });
      commitScenePatch(scriptRef.current, scene.id, result.scene, input.onScriptChange);
      if (result.selectedMediaItemId) {
        input.onSelectMediaItem?.(scene.id, result.selectedMediaItemId);
      }
      revokeRemovedOwnedMediaUrl(ownedUrl, ownedBlobUrls.current);
      return result;
    },
    [input],
  );

  const revokeOwnedUrlIfPresent = useCallback((url: string | undefined) => {
    revokeRemovedOwnedMediaUrl(url, ownedBlobUrls.current);
  }, []);

  return {
    appendMediaFile,
    removeOwnedMediaItem,
    revokeOwnedUrlIfPresent,
    accept: SCENE_MEDIA_FILE_ACCEPT,
    /** Test/helper access — do not revoke from outside the ownership helpers. */
    isUrlOwnedForTests: (url: string) => ownedBlobUrls.current.has(url),
  };
}
