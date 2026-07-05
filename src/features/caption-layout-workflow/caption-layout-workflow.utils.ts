import {
  buildResetCaptionLayoutPatch,
  buildSceneCaptionLayoutPatch,
  mergeCaptionLayoutSettings,
  type CaptionLayout,
} from "@/features/caption-layout";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { normalizeSceneCaptionSettings } from "@/features/story/utils/caption.utils";
import { ensureTimelineItems, syncTimelineSceneRefs } from "@/features/story/utils/timeline.utils";

import type { CopyableCaptionLayout } from "./caption-layout-workflow.types";

let captionLayoutClipboard: CopyableCaptionLayout | null = null;

/** In-memory editor clipboard — resets on page reload. */
export function getCaptionLayoutClipboard(): CopyableCaptionLayout | null {
  return captionLayoutClipboard;
}

export function copyCaptionLayoutToClipboard(layout: CopyableCaptionLayout): void {
  captionLayoutClipboard = { ...layout };
}

export function clearCaptionLayoutClipboard(): void {
  captionLayoutClipboard = null;
}

/** Extract only workflow-copyable layout fields from effective merged settings. */
export function extractCopyableCaptionLayout(
  sceneLayout?: Partial<CaptionLayout> | null,
  projectLayout?: Partial<CaptionLayout> | null,
): CopyableCaptionLayout {
  const effective = mergeCaptionLayoutSettings(sceneLayout, projectLayout);
  return {
    version: effective.version,
    anchor: effective.anchor,
    textAlign: effective.textAlign,
    offsetX: effective.offsetX,
    offsetY: effective.offsetY,
    maxWidthPercent: effective.maxWidthPercent,
    safeAreaEnabled: effective.safeAreaEnabled,
    ...(effective.backgroundOpacity != null ? { backgroundOpacity: effective.backgroundOpacity } : {}),
  };
}

export function buildCaptionLayoutPastePatch(
  layout: CopyableCaptionLayout,
): { captionLayout: CaptionLayout } {
  return buildSceneCaptionLayoutPatch({ ...layout, version: layout.version ?? 2 });
}

export function buildProjectDefaultCaptionLayoutPatch(
  scene: Pick<FootieScene, "captionLayout">,
  script: Pick<FootieScript, "defaultCaptionLayout">,
): { defaultCaptionLayout: CaptionLayout } {
  return {
    defaultCaptionLayout: extractCopyableCaptionLayout(
      scene.captionLayout,
      script.defaultCaptionLayout,
    ),
  };
}

export function resolvePreviousSceneIndex(sceneIndex: number): number | null {
  if (sceneIndex <= 0) {
    return null;
  }

  return sceneIndex - 1;
}

export function canCopyPreviousSceneLayout(sceneIndex: number): boolean {
  return resolvePreviousSceneIndex(sceneIndex) != null;
}

export function buildCopyPreviousSceneLayoutPatch(
  script: FootieScript,
  sceneIndex: number,
): { captionLayout: CaptionLayout } | null {
  const previousIndex = resolvePreviousSceneIndex(sceneIndex);
  if (previousIndex == null) {
    return null;
  }

  const previousScene = script.scenes[previousIndex];
  if (!previousScene) {
    return null;
  }

  return buildSceneCaptionLayoutPatch(
    extractCopyableCaptionLayout(previousScene.captionLayout, script.defaultCaptionLayout),
  );
}

function syncPresentationScenes(script: FootieScript, scenes: FootieScene[]): FootieScript {
  const timelineItems = syncTimelineSceneRefs(
    scenes,
    ensureTimelineItems(scenes, script.timelineItems),
  );

  return { ...script, scenes, timelineItems };
}

/** Apply one scene's effective layout to every scene — presentation-only. */
export function applyCaptionLayoutToAllScenes(
  script: FootieScript,
  sourceSceneId: string,
): FootieScript {
  const sourceScene = script.scenes.find((scene) => scene.id === sourceSceneId);
  if (!sourceScene) {
    return script;
  }

  const layout = extractCopyableCaptionLayout(
    sourceScene.captionLayout,
    script.defaultCaptionLayout,
  );
  const patch = buildSceneCaptionLayoutPatch(layout);

  const scenes = script.scenes.map((scene) =>
    normalizeSceneCaptionSettings({ ...scene, ...patch }),
  );

  return syncPresentationScenes(script, scenes);
}

/** Reset caption layout on every scene to engine defaults — presentation-only. */
export function applyResetAllCaptionLayouts(script: FootieScript): FootieScript {
  const resetPatch = buildResetCaptionLayoutPatch();
  const scenes = script.scenes.map((scene) =>
    normalizeSceneCaptionSettings({ ...scene, ...resetPatch }),
  );

  return syncPresentationScenes(script, scenes);
}

export function resolveCaptionLayoutWorkflowContext(
  sceneIndex: number,
): { hasClipboard: boolean; canCopyPrevious: boolean; previousSceneIndex: number | null } {
  return {
    hasClipboard: getCaptionLayoutClipboard() != null,
    canCopyPrevious: canCopyPreviousSceneLayout(sceneIndex),
    previousSceneIndex: resolvePreviousSceneIndex(sceneIndex),
  };
}
