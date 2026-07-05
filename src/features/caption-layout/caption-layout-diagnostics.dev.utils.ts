import type { FootieScene, FootieScript } from "@/features/story/types";

import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  resolveCaptionLayoutDiagnostics,
} from "@/features/caption-layout";
import { isTimelineDevDiagnosticsEnabled } from "@/features/timeline-intelligence/timeline-diagnostics.dev.types";

export function formatCaptionLayoutDiagnosticsForDev(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): string {
  const diagnostics = resolveCaptionLayoutDiagnostics({
    sceneLayout: scene.captionLayout,
    projectLayout: script?.defaultCaptionLayout,
    canvas: {
      width: CAPTION_LAYOUT_REFERENCE_WIDTH,
      height: CAPTION_LAYOUT_REFERENCE_HEIGHT,
      scale: 1,
    },
    contentBoxWidth: 480,
    contentBoxHeight: 120,
  });

  return JSON.stringify(
    {
      anchor: diagnostics.anchor,
      safeAreaApplied: diagnostics.safeAreaApplied,
      resolvedLayout: diagnostics.resolvedLayout,
    },
    null,
    2,
  );
}

/** Logs caption layout diagnostics in development builds only. */
export function logCaptionLayoutDiagnostics(
  scene: Pick<FootieScene, "id" | "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): void {
  if (!isTimelineDevDiagnosticsEnabled) {
    return;
  }

  console.info(
    `[FootieBitz caption layout] scene=${scene.id ?? "unknown"}`,
    formatCaptionLayoutDiagnosticsForDev(scene, script),
  );
}
