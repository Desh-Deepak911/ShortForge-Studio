"use client";

/**
 * Shared Add-another-image control for Inspector + timeline lane (Sprint 8E.2).
 * Uses one append authority; does not own blob URLs itself.
 */

import { useRef, useState, type ChangeEvent } from "react";

import { canAddSceneMediaItem } from "@/features/scene-media-timeline/editor";
import type { FootieScene } from "@/features/story/types";

import {
  resolveSceneMediaLaneErrorCode,
  SCENE_MEDIA_LANE_ERROR_MESSAGES,
} from "./scene-media-lane-errors";
import { sceneMediaAddButton } from "./scene-media-timeline.ui";
import type { SceneMediaImageAppendApi } from "./SceneMediaImageAppendContext";

export function formatSceneMediaItemOrdinal(
  itemIndex: number,
  itemCount: number,
): string {
  if (itemCount <= 0 || itemIndex < 0) {
    return "Media";
  }
  return `Media ${itemIndex + 1} of ${itemCount}`;
}

export function SceneMediaAddAnotherImageButton({
  scene,
  appendApi,
  disabled = false,
  className = sceneMediaAddButton,
  label = "Add another image",
  onAppended,
}: {
  scene: FootieScene;
  appendApi: SceneMediaImageAppendApi;
  disabled?: boolean;
  className?: string;
  label?: string;
  onAppended?: (mediaItemId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = canAddSceneMediaItem(scene) && !disabled;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const result = appendApi.appendImageFile(scene.id, file);
      setError(null);
      if (result.selectedMediaItemId) {
        onAppended?.(result.selectedMediaItemId);
      }
    } catch (caught) {
      setError(SCENE_MEDIA_LANE_ERROR_MESSAGES[resolveSceneMediaLaneErrorCode(caught)]);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={className}
        disabled={!canAdd}
        onClick={() => fileInputRef.current?.click()}
        aria-label={label}
        data-scene-media-add-another="true"
      >
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={appendApi.accept}
        className="hidden"
        onChange={handleChange}
      />
      {error ? (
        <p className="text-[10px] leading-snug text-amber-100/90" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
