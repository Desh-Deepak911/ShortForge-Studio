"use client";

import { useMemo } from "react";

import { readPlanningData } from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import type { CreatorAssetStudioPlanningData } from "@/features/editor/creator-asset-planning/creator-asset-planning.types";
import {
  buildScriptHash,
} from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { isCreatorAssetStudioVisible } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.visibility.utils";
import type { FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";

/** Reads cached planning for the editor — never executes intelligence. */
export function useCreatorAssetPlanningCache(
  storyId: string | undefined,
  script: FootieScript,
  storyMode?: ScriptMode,
): CreatorAssetStudioPlanningData | null {
  const scriptHash = buildScriptHash(script);
  const sceneCount = script.scenes.length;
  const resolvedStoryMode = storyMode ?? "default";

  return useMemo(() => {
    if (!storyId || !isCreatorAssetStudioVisible()) {
      return null;
    }

    return readPlanningData(storyId, {
      scriptHash,
      sceneCount,
      storyMode: resolvedStoryMode,
    });
  }, [storyId, scriptHash, sceneCount, resolvedStoryMode]);
}

export function useCreatorAssetStudioVisible(): boolean {
  return isCreatorAssetStudioVisible();
}
