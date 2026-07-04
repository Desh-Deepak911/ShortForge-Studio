import type { FootieScene, FootieScript } from "@/features/story/types";
import { applySceneUpdate } from "@/lib/utils/voiceover";

type SceneCaptionDraftPatch = Partial<FootieScene>;

const pendingDrafts = new Map<string, SceneCaptionDraftPatch>();
const cancelCallbacks = new Set<() => void>();

/** Tracks the latest debounced caption/subtitle patch for a scene. */
export function registerPendingSceneCaptionDraft(
  sceneId: string,
  patch: SceneCaptionDraftPatch,
): void {
  pendingDrafts.set(sceneId, {
    ...pendingDrafts.get(sceneId),
    ...patch,
  });
}

/** Clears a scene draft after it has been committed through the editor. */
export function clearPendingSceneCaptionDraft(sceneId: string): void {
  pendingDrafts.delete(sceneId);
}

/** Registers a callback that clears local debounce state without committing. */
export function registerSceneCaptionDraftCancel(callback: () => void): () => void {
  cancelCallbacks.add(callback);
  return () => {
    cancelCallbacks.delete(callback);
  };
}

function cancelPendingSceneCaptionDrafts(): void {
  for (const callback of cancelCallbacks) {
    callback();
  }
}

/**
 * Applies all pending caption/subtitle drafts to a script without triggering
 * per-field editor commits. Clears registry and local debounce state.
 */
export function applyPendingSceneCaptionDrafts(script: FootieScript): FootieScript {
  if (pendingDrafts.size === 0) {
    return script;
  }

  let next = script;
  for (const [sceneId, patch] of pendingDrafts) {
    next = applySceneUpdate(next, sceneId, patch);
  }

  pendingDrafts.clear();
  cancelPendingSceneCaptionDrafts();
  return next;
}

/** Test helper — resets registry state between verification cases. */
export function resetSceneCaptionDraftRegistryForTests(): void {
  pendingDrafts.clear();
  cancelPendingSceneCaptionDrafts();
}
