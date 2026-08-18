/**
 * Frozen Prompt 6 integrated-certification story.
 * One snapshot for Studio canonical Preview, Browser export, and Headless export.
 */

import { enableBrandSting } from "@/features/brand-sting/editor/brand-sting.commands";
import { ENGAGEMENT_OVERLAY_PRESET_ID } from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import { setEngagementOverlayPosition } from "@/features/engagement-overlays/editor/engagement-overlay.commands";
import {
  appendSceneMediaImageItem,
  moveSceneMediaItemLeft,
  removeSceneMediaItem,
  resolvePreviewSceneMediaWindows,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import { applyTransitionUpdate } from "@/lib/utils/voiceover";
import type { FootieScript, SceneMedia } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import {
  buildClockLifecycleSecondScene,
  buildFramingCoverageScene,
  buildMixedImageVideoScene,
  buildPreviewRuntimeParityHarnessStory,
  buildThreeVideoIntraSceneTransitionScene,
  PREVIEW_RUNTIME_PARITY_STORY_TITLE,
} from "./build-preview-runtime-parity-story";
import { applyPreviewRuntimeParityCertificationSceneTiming } from "./apply-preview-runtime-parity-certification-scene-timing";
import {
  previewRuntimeParityEncodedPublicUrl,
  type PreviewRuntimeParityEncodedFixtureId,
} from "./preview-runtime-parity-encoded-fixture-ids";
import {
  PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES,
  PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES,
  previewRuntimeParityPublicUrl,
} from "./preview-runtime-parity-fixture-identities";

export const PREVIEW_RUNTIME_PARITY_INTEGRATED_STORY_ID =
  "preview-runtime-parity-integrated-certification" as const;

const CAPABILITY = {
  engagementOverlaysEnabled: true,
  shortForgeBrandStingEnabled: true,
} as const;

function encodedUrlForPublicUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  for (const identity of PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES) {
    if (url === previewRuntimeParityPublicUrl(identity.fileName)) {
      return previewRuntimeParityEncodedPublicUrl(
        identity.fileName.replace(".svg", "") as PreviewRuntimeParityEncodedFixtureId,
      );
    }
  }
  for (const identity of PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES) {
    if (url === previewRuntimeParityPublicUrl(identity.fileName)) {
      return previewRuntimeParityEncodedPublicUrl(
        identity.fileName.replace(".svg", "") as PreviewRuntimeParityEncodedFixtureId,
      );
    }
  }
  return url;
}

function rewriteSceneMedia(media: SceneMedia): SceneMedia {
  const nextUrl = encodedUrlForPublicUrl(media.url);
  if (media.type === "video") {
    return {
      ...media,
      url: nextUrl,
      mimeType: "video/mp4",
      durationMs: 6_000,
    };
  }
  return {
    ...media,
    url: nextUrl,
    mimeType: "image/png",
  };
}

function rewriteStoryMediaToEncodedFixtures(script: FootieScript): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => ({
      ...scene,
      media: scene.media ? rewriteSceneMedia(scene.media) : scene.media,
      mediaTimeline: scene.mediaTimeline
        ? {
            ...scene.mediaTimeline,
            items: scene.mediaTimeline.items.map((item) => ({
              ...item,
              media: rewriteSceneMedia(item.media),
            })),
          }
        : scene.mediaTimeline,
    })),
  };
}

function replaceScene(script: FootieScript, sceneId: string, scene: FootieScript["scenes"][number]): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((entry) => (entry.id === sceneId ? scene : entry)),
  };
}

export interface PreviewRuntimeParityIntegratedCertificationStory {
  readonly story: FootieScript;
  readonly storyId: typeof PREVIEW_RUNTIME_PARITY_INTEGRATED_STORY_ID;
  readonly title: typeof PREVIEW_RUNTIME_PARITY_STORY_TITLE;
  readonly sceneIds: readonly string[];
  readonly mediaItemIds: readonly string[];
  readonly removedMediaItemIds: readonly string[];
  readonly replacedMediaItemId: string;
  readonly reorderedSceneId: string;
  readonly ctaSceneId: string;
  readonly intraSceneTransitionSceneId: string;
  readonly brandStingEnabled: boolean;
  readonly contentDurationMs: number;
}

export function buildPreviewRuntimeParityIntegratedCertificationStory(): PreviewRuntimeParityIntegratedCertificationStory {
  let script = buildPreviewRuntimeParityHarnessStory();
  script = rewriteStoryMediaToEncodedFixtures(script);

  const transitionScene = script.scenes.find(
    (scene) => scene.id === buildThreeVideoIntraSceneTransitionScene().id,
  );
  const mixedScene = script.scenes.find(
    (scene) => scene.id === buildMixedImageVideoScene().id,
  );
  const framingScene = script.scenes.find(
    (scene) => scene.id === buildFramingCoverageScene().id,
  );
  const clockScene = script.scenes.find(
    (scene) => scene.id === buildClockLifecycleSecondScene().id,
  );
  if (!transitionScene || !mixedScene || !framingScene || !clockScene) {
    throw new Error("Integrated certification story is missing a required corpus scene.");
  }

  script = replaceScene(script, transitionScene.id, {
    ...transitionScene,
    subtitle:
      "An intra-scene fade crosses the first video boundary and this longer subtitle wraps across more than one line for certification.",
    captionLayout: {
      ...transitionScene.captionLayout,
      version: 2,
      anchor: "bottom_center",
      textAlign: "center",
    },
    captionAnimation: { preset: "typewriter" },
    subtitleEffect: "typewriter",
  });
  const ctaMoved = setEngagementOverlayPosition(
    script,
    transitionScene.id,
    "bottom-center",
    CAPABILITY,
  );
  if (ctaMoved.status !== "ok") {
    throw new Error(ctaMoved.message ?? "Failed to place CTA for caption collision.");
  }
  script = ctaMoved.script;

  const mixedWindows = resolvePreviewSceneMediaWindows(mixedScene, {
    mixedMediaScenesEnabled: true,
  });
  const reorderTarget = mixedWindows[1]?.itemId;
  if (!reorderTarget) {
    throw new Error("Mixed scene has no second item to reorder.");
  }
  const reordered = moveSceneMediaItemLeft(mixedScene, reorderTarget);
  script = replaceScene(script, mixedScene.id, reordered.scene);

  const framingWindows = resolvePreviewSceneMediaWindows(framingScene, {
    mixedMediaScenesEnabled: true,
  });
  const replaceTarget = framingWindows[0]?.itemId;
  if (!replaceTarget) {
    throw new Error("Framing scene has no first item to replace.");
  }
  const replacementUrl = previewRuntimeParityEncodedPublicUrl("image-q");
  const replaced = updateSceneMediaItemMedia(framingScene, replaceTarget, {
    type: "image",
    url: replacementUrl,
    source: "upload",
    mimeType: "image/png",
    width: 1080,
    height: 1920,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  });
  const withMotion = updateSceneMediaItemMedia(
    replaced.scene,
    framingWindows[2]?.itemId ?? replaceTarget,
    {
      ...((replaced.scene.mediaTimeline?.items.find(
        (item) => item.id === (framingWindows[2]?.itemId ?? replaceTarget),
      )?.media) ?? replaced.scene.media!),
      trimStartMs: 400,
      trimEndMs: 5_200,
      motion: {
        version: 1,
        enabled: true,
        presetId: "zoom-in",
        intensity: 1,
      },
    },
  );
  script = replaceScene(script, framingScene.id, withMotion.scene);

  const appended = appendSceneMediaImageItem(
    clockScene,
    {
      type: "image",
      url: previewRuntimeParityEncodedPublicUrl("image-p"),
      source: "upload",
      mimeType: "image/png",
      width: 1080,
      height: 1920,
      fitMode: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    { generateId: () => "parity-removed-extra-image" },
  );
  const extraId = appended.selectedMediaItemId;
  if (!extraId) {
    throw new Error("Failed to append a removable extra item.");
  }
  const removed = removeSceneMediaItem(appended.scene, extraId);
  script = replaceScene(script, clockScene.id, removed.scene);

  const firstTransition = script.timelineItems?.find(
    (item) => item.type === "transition" && item.fromSceneId === transitionScene.id,
  );
  if (firstTransition && firstTransition.type === "transition") {
    script = applyTransitionUpdate(script, firstTransition.id, {
      effect: "fade",
      durationMs: 500,
    });
  }

  const sting = enableBrandSting(script, CAPABILITY);
  if (sting.status !== "ok") {
    throw new Error(sting.message ?? "Failed to enable Brand Sting.");
  }
  script = {
    ...sting.script,
    title: PREVIEW_RUNTIME_PARITY_STORY_TITLE,
    exportSettings: {
      fileName: PREVIEW_RUNTIME_PARITY_INTEGRATED_STORY_ID,
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    visualRetentionExtensions: {
      ...sting.script.visualRetentionExtensions,
      version: 1,
      engagementOverlaysBySceneId: {
        ...(sting.script.visualRetentionExtensions?.engagementOverlaysBySceneId ?? {}),
        [transitionScene.id]: [
          {
            version: 1,
            id: `parity-cta-${transitionScene.id}`,
            kind: "combined",
            startOffsetMs: 400,
            durationMs: 2_500,
            position: "bottom-center",
            size: "medium",
            scale: 1,
            presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
          },
        ],
      },
    },
  };

  script = applyPreviewRuntimeParityCertificationSceneTiming(script);

  const mediaItemIds = script.scenes.flatMap((scene) =>
    resolvePreviewSceneMediaWindows(scene, { mixedMediaScenesEnabled: true }).map(
      (window) => window.itemId,
    ),
  );
  const contentDurationMs =
    script.scenes[script.scenes.length - 1]?.endMs ??
    script.scenes.reduce((sum, scene) => sum + getSceneDurationMs(scene), 0);

  return {
    story: script,
    storyId: PREVIEW_RUNTIME_PARITY_INTEGRATED_STORY_ID,
    title: PREVIEW_RUNTIME_PARITY_STORY_TITLE,
    sceneIds: script.scenes.map((scene) => scene.id),
    mediaItemIds,
    removedMediaItemIds: extraId ? [extraId] : [],
    replacedMediaItemId: replaceTarget,
    reorderedSceneId: mixedScene.id,
    ctaSceneId: transitionScene.id,
    intraSceneTransitionSceneId: transitionScene.id,
    brandStingEnabled: sting.brandSting?.enabled === true,
    contentDurationMs,
  };
}

export function collectIntegratedCertificationMediaIds(
  story: FootieScript,
): readonly string[] {
  return story.scenes.flatMap((scene) =>
    resolvePreviewSceneMediaWindows(scene, { mixedMediaScenesEnabled: true }).map(
      (window) => window.itemId,
    ),
  );
}
