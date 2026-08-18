"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useEditorSelectionOptional } from "@/features/editor/selection";

import type { VideoTrimPreviewOverride } from "./video-trim-preview.types";
import { shouldApplyVideoTrimPreviewOverride } from "./video-trim-preview.utils";

export interface VideoTrimPreviewContextValue {
  override: VideoTrimPreviewOverride | null;
  setOverride: (next: VideoTrimPreviewOverride | null) => void;
  clearOverride: () => void;
}

const VideoTrimPreviewContext = createContext<VideoTrimPreviewContextValue | null>(
  null,
);

export function VideoTrimPreviewProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<VideoTrimPreviewOverride | null>(
    null,
  );
  const selection = useEditorSelectionOptional();
  const selectedSceneId = selection?.selectedSceneId ?? null;

  const setOverride = useCallback((next: VideoTrimPreviewOverride | null) => {
    setOverrideState(next);
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideState(null);
  }, []);

  // Scene switches drop the active override without an effect-driven setState.
  const scopedOverride =
    override && shouldApplyVideoTrimPreviewOverride(override, selectedSceneId)
      ? override
      : null;

  const value = useMemo(
    () => ({
      override: scopedOverride,
      setOverride,
      clearOverride,
    }),
    [scopedOverride, setOverride, clearOverride],
  );

  return (
    <VideoTrimPreviewContext.Provider value={value}>
      {children}
    </VideoTrimPreviewContext.Provider>
  );
}

export function useVideoTrimPreview(): VideoTrimPreviewContextValue {
  const ctx = useContext(VideoTrimPreviewContext);
  if (!ctx) {
    throw new Error("useVideoTrimPreview must be used within VideoTrimPreviewProvider");
  }
  return ctx;
}

export function useVideoTrimPreviewOptional(): VideoTrimPreviewContextValue | null {
  return useContext(VideoTrimPreviewContext);
}

export function useActiveVideoTrimPreviewOverride(
  sceneId: string | null | undefined,
  mediaItemId?: string | null,
): VideoTrimPreviewOverride | null {
  const ctx = useVideoTrimPreviewOptional();
  const override = ctx?.override ?? null;
  if (!shouldApplyVideoTrimPreviewOverride(override, sceneId, mediaItemId)) {
    return null;
  }
  return override;
}
