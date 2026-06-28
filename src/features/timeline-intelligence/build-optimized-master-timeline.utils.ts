import type { FootieScript } from "@/features/story/types";

import {
  buildMasterTimeline,
  type BuildMasterTimelineOptions,
} from "./build-master-timeline";
import {
  optimizeMasterTimeline,
  type OptimizeMasterTimelineOptions,
} from "./optimize-master-timeline.utils";
import type { MasterTimeline } from "./timeline.types";

export interface BuildOptimizedMasterTimelineOptions extends BuildMasterTimelineOptions {
  optimizer?: OptimizeMasterTimelineOptions;
  /** When false, returns the raw built timeline (diagnostics/dev only). Default true. */
  applyOptimizer?: boolean;
}

/**
 * Canonical preview/export pipeline:
 * buildMasterTimeline() → optimizeMasterTimeline()
 */
export function buildOptimizedMasterTimeline(
  script: FootieScript,
  options: BuildOptimizedMasterTimelineOptions,
): MasterTimeline {
  const { optimizer, applyOptimizer = true, ...buildOptions } = options;
  const built = buildMasterTimeline(script, buildOptions);

  if (!applyOptimizer) {
    return built;
  }

  const result = optimizeMasterTimeline(built, optimizer);
  const warningCount = result.findings.filter((finding) => finding.severity === "warning").length;

  return {
    ...result.timeline,
    diagnostics: {
      ...result.timeline.diagnostics,
      optimizer: {
        appliedChangeCount: result.appliedChangeCount,
        warningCount,
        findings: result.findings,
      },
    },
  };
}
