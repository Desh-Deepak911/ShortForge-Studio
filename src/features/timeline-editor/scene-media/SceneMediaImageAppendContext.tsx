"use client";

/**
 * Shared Scene Media image-append authority (Sprint 8E.2).
 * One ownership set for Inspector + timeline lane surfaces.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useEditorSelection } from "@/features/editor/selection";
import type { FootieScript } from "@/features/story/types";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";

import {
  SCENE_MEDIA_IMAGE_ACCEPT,
  useSceneMediaImageAppend,
} from "./useSceneMediaImageAppend";

export type SceneMediaImageAppendResult = ReturnType<
  ReturnType<typeof useSceneMediaImageAppend>["appendImageFile"]
>;

export interface SceneMediaImageAppendApi {
  readonly appendImageFile: (
    sceneId: string,
    file: File,
  ) => SceneMediaImageAppendResult;
  readonly revokeOwnedUrlIfPresent: (url: string | undefined) => void;
  readonly accept: string;
}

const SceneMediaImageAppendContext = createContext<SceneMediaImageAppendApi | null>(
  null,
);

export function SceneMediaImageAppendProvider({
  script,
  onScriptChange,
  children,
}: {
  script: FootieScript;
  onScriptChange: (
    next: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  children: ReactNode;
}) {
  const selection = useEditorSelection();
  const api = useSceneMediaImageAppend({
    script,
    onScriptChange,
    onSelectMediaItem: selection.selectSceneMediaItem,
  });

  const value = useMemo<SceneMediaImageAppendApi>(
    () => ({
      appendImageFile: api.appendImageFile,
      revokeOwnedUrlIfPresent: api.revokeOwnedUrlIfPresent,
      accept: api.accept || SCENE_MEDIA_IMAGE_ACCEPT,
    }),
    [api.appendImageFile, api.revokeOwnedUrlIfPresent, api.accept],
  );

  return (
    <SceneMediaImageAppendContext.Provider value={value}>
      {children}
    </SceneMediaImageAppendContext.Provider>
  );
}

export function useSceneMediaImageAppendContext(): SceneMediaImageAppendApi {
  const ctx = useContext(SceneMediaImageAppendContext);
  if (!ctx) {
    throw new Error(
      "useSceneMediaImageAppendContext requires SceneMediaImageAppendProvider",
    );
  }
  return ctx;
}

export function useOptionalSceneMediaImageAppendContext(): SceneMediaImageAppendApi | null {
  return useContext(SceneMediaImageAppendContext);
}
