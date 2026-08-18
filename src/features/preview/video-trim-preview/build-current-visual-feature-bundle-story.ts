/**
 * Frozen Prompt 2B story: per-media trim + transparent captions + CTA + sting.
 * Client-safe — does not import the Node fixture helper.
 */

import { enableBrandSting, setBrandStingDurationMs } from "@/features/brand-sting/editor/brand-sting.commands";
import {
  addEngagementOverlay,
  setEngagementOverlayDurationMs,
  setEngagementOverlayKind,
  setEngagementOverlayPosition,
  setEngagementOverlayScale,
  setEngagementOverlaySize,
  setEngagementOverlayStartMs,
} from "@/features/engagement-overlays/editor/engagement-overlay.commands";
import { applyVideoTrimToMediaItem } from "@/features/scene-media-timeline/editor/scene-media-timeline.commands";
import { setSceneMediaTransitionBoundary } from "@/features/scene-media-transitions";
import type { FootieScript } from "@/features/story/types";

import { buildPerMediaVideoTrimStory } from "./build-per-media-video-trim-story";
import {
  CURRENT_VISUAL_FEATURE_BUNDLE_A,
  CURRENT_VISUAL_FEATURE_BUNDLE_B,
  CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS,
  CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
  CURRENT_VISUAL_FEATURE_BUNDLE_CTA,
  CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_A_ID,
  CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID,
  CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
  CURRENT_VISUAL_FEATURE_BUNDLE_STORY_ID,
  CURRENT_VISUAL_FEATURE_BUNDLE_TRANSITION_MS,
} from "./current-visual-feature-bundle-contract";

function requireOk<T extends { status: string; message?: string }>(
  result: T,
  label: string,
): T {
  if (result.status !== "ok" && result.status !== "recoverable") {
    throw new Error(`${label}: ${result.message ?? result.status}`);
  }
  return result;
}

export function buildCurrentVisualFeatureBundleStory(): FootieScript {
  let script = buildPerMediaVideoTrimStory();
  const scene = script.scenes[0];
  if (!scene) {
    throw new Error("Frozen visual-bundle story is missing its scene.");
  }

  const trimmedA = applyVideoTrimToMediaItem(
    scene,
    CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_A_ID,
    CURRENT_VISUAL_FEATURE_BUNDLE_A,
  );
  if (!trimmedA) {
    throw new Error("Failed to apply item A trim.");
  }
  const trimmedB = applyVideoTrimToMediaItem(
    trimmedA.scene,
    CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID,
    CURRENT_VISUAL_FEATURE_BUNDLE_B,
  );
  if (!trimmedB) {
    throw new Error("Failed to apply item B trim.");
  }
  const faded = setSceneMediaTransitionBoundary(
    trimmedB.scene,
    CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_A_ID,
    CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID,
    "fade",
    CURRENT_VISUAL_FEATURE_BUNDLE_TRANSITION_MS,
  );
  script = {
    ...script,
    title: CURRENT_VISUAL_FEATURE_BUNDLE_STORY_ID,
    scenes: [faded.scene],
    exportSettings: {
      fileName: CURRENT_VISUAL_FEATURE_BUNDLE_STORY_ID,
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  };

  const added = requireOk(
    addEngagementOverlay(
      script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "add CTA",
  );
  const kinded = requireOk(
    setEngagementOverlayKind(
      added.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.kind,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "CTA kind",
  );
  const positioned = requireOk(
    setEngagementOverlayPosition(
      kinded.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.position,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "CTA position",
  );
  const sized = requireOk(
    setEngagementOverlaySize(
      positioned.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.size,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "CTA size",
  );
  const scaled = requireOk(
    setEngagementOverlayScale(
      sized.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.scale,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "CTA scale",
  );
  const started = requireOk(
    setEngagementOverlayStartMs(
      scaled.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "CTA start",
  );
  const lasting = requireOk(
    setEngagementOverlayDurationMs(
      started.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
      CURRENT_VISUAL_FEATURE_BUNDLE_CTA.durationMs,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "CTA duration",
  );
  const sting = requireOk(
    enableBrandSting(lasting.script, CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY),
    "enable Brand Sting",
  );
  const durationed = requireOk(
    setBrandStingDurationMs(
      sting.script,
      CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS,
      CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
    ),
    "Brand Sting duration",
  );
  return durationed.script;
}
