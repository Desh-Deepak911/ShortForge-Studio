import type { ScenePlanDevDebug, ScenePlanSource } from "@/types/footiebitz";

/** Scene planning outcome metadata for dev/staging debug badges. */
export interface ScenePlanOutcomeMeta {
  source: ScenePlanSource;
  densityAdapted: boolean;
}

/**
 * True when the Review storyboard SI toggle may be shown.
 * Production hides it unless `NEXT_PUBLIC_STUDIO_INTELLIGENCE_SCENE_PLAN_TOGGLE=true`.
 */
export function isStudioIntelligenceScenePlanToggleVisible(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_STUDIO_INTELLIGENCE_SCENE_PLAN_TOGGLE === "true"
  );
}

/** True when dev/staging scene-plan debug badges may be shown in the UI. */
export function isScenePlanDevDebugEnabled(): boolean {
  return isStudioIntelligenceScenePlanToggleVisible();
}

/** Strips scene-plan debug metadata outside dev/staging surfaces. */
export function resolveScenePlanDevDebug(
  meta?: ScenePlanOutcomeMeta,
): ScenePlanDevDebug | undefined {
  if (!meta || !isScenePlanDevDebugEnabled()) {
    return undefined;
  }

  return {
    source: meta.source,
    densityAdapted: meta.densityAdapted,
  };
}
