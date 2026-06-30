"use client";

import type { ScenePlanDevDebug } from "@/types/footiebitz";
import { isScenePlanDevDebugEnabled } from "@/features/story/utils/studio-intelligence-scene-plan-dev.utils";
import { studioBadge, studioSubtleText } from "@/lib/utils/studioUi";

export interface ScenePlanDevBadgeProps {
  debug?: ScenePlanDevDebug | null;
}

/**
 * Dev/staging-only badge summarizing how the storyboard was planned.
 * Never renders in production unless the public staging toggle flag is enabled.
 */
export default function ScenePlanDevBadge({ debug }: ScenePlanDevBadgeProps) {
  if (!isScenePlanDevDebugEnabled() || !debug) {
    return null;
  }

  const sourceLabel =
    debug.source === "studio_intelligence" ? "Studio Intelligence used" : "AI fallback used";

  return (
    <div className="mt-3 space-y-2" aria-label="Scene plan debug">
      <p className={studioSubtleText}>Scene planning (dev)</p>
      <div className="flex flex-wrap gap-2">
        <span className={studioBadge}>{sourceLabel}</span>
        {debug.densityAdapted ? (
          <span className={studioBadge}>Scene density adapted</span>
        ) : null}
      </div>
    </div>
  );
}
