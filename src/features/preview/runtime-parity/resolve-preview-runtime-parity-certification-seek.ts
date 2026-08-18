/**
 * Deterministic certification Preview seek.
 * Uses the canonical master timeline. Does not mutate the frozen story.
 */

import { resolveBrandStingFrame } from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { resolveEngagementOverlayFrame } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import { resolvePreviewPlaybackState } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolvePreviewTransitionOverlay } from "@/features/preview/utils/previewTransitionOverlay";
import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import {
  composeIntraSceneTransitionPreview,
  resolveIntraSceneTransitionProgressCheckpoint,
} from "@/features/scene-media-transitions/preview";
import type { FootieScript } from "@/features/story/types";

import { buildCertificationPreviewMasterTimeline } from "./apply-preview-runtime-parity-certification-scene-timing";
import { resolvePreviewPresentationAuthority } from "./resolve-preview-presentation-authority";
import {
  resolvePreviewRuntimeParityCertificationBounds,
  type PreviewRuntimeParityCertificationBounds,
} from "./resolve-preview-runtime-parity-certification-bounds";

export interface PreviewRuntimeParityCertificationSeekSnapshot {
  readonly timelineMs: number;
  readonly sceneId: string | null;
  readonly sceneIndex: number;
  readonly sceneLocalMs: number;
  readonly activeMediaId: string | null;
  readonly outgoingMediaId: string | null;
  readonly transition: {
    readonly kind: "none" | "intra-scene" | "inter-scene";
    readonly effect: string | null;
    readonly progress: number | null;
    readonly phase: string | null;
  };
  readonly caption: {
    readonly visible: boolean;
    readonly anchor: string | null;
    readonly textAlign: string | null;
  };
  readonly cta: {
    readonly visible: boolean;
    readonly kind: string | null;
    readonly segment: string | null;
    readonly label: string | null;
  };
  readonly brandSting: {
    readonly active: boolean;
    readonly elapsedMs: number;
    readonly phase: string | null;
    readonly visible: boolean;
  };
  readonly terminalHidden: boolean;
  readonly inspectionActive: false;
  readonly storyMutated: false;
}

export function resolvePreviewRuntimeParityCertificationSeek(
  story: FootieScript,
  timelineMs: number,
  bounds: PreviewRuntimeParityCertificationBounds = resolvePreviewRuntimeParityCertificationBounds(
    story,
  ),
): PreviewRuntimeParityCertificationSeekSnapshot {
  const clampedMs = Math.max(0, timelineMs);
  const masterTimeline = buildCertificationPreviewMasterTimeline(story);
  const playback = resolvePreviewPlaybackState(masterTimeline, story.scenes, clampedMs);
  const scene = playback?.scene ?? story.scenes[story.scenes.length - 1] ?? null;
  const sceneIndex = playback?.sceneIndex ?? Math.max(0, story.scenes.length - 1);
  const sceneLocalMs = playback?.sceneElapsedMs ?? 0;
  const sting = getShortForgeBrandSting(story.visualRetentionExtensions);
  const brandStingActive =
    sting?.enabled === true &&
    clampedMs >= bounds.brandStingStartMs &&
    clampedMs < bounds.brandStingEndMs;
  const terminalHidden = sting?.enabled === true && clampedMs >= bounds.brandStingEndMs;
  const stingElapsedMs = brandStingActive
    ? Math.max(0, clampedMs - bounds.brandStingStartMs)
    : 0;
  const stingFrame = resolveBrandStingFrame({
    sting,
    elapsedMs: stingElapsedMs,
  });
  const inter = !brandStingActive && !terminalHidden
    ? resolvePreviewTransitionOverlay(masterTimeline, story.scenes, clampedMs)
    : null;
  const intra =
    scene && !inter && !brandStingActive && !terminalHidden
      ? composeIntraSceneTransitionPreview(scene, sceneLocalMs, {
          mixedMediaScenesEnabled: true,
        })
      : null;
  const presentation =
    scene && !brandStingActive && !terminalHidden
      ? resolvePreviewPresentationAuthority({
          scene,
          sceneElapsedMs: sceneLocalMs,
          isPlaying: false,
          selectedMediaItemId: null,
          mixedMediaScenesEnabled: true,
          timelineMs: clampedMs,
          brandStingActive,
          interSceneTransitionActive: Boolean(inter),
        })
      : null;
  const overlay = scene
    ? getSceneEngagementOverlay(story, scene.id)
    : null;
  const ctaFrame =
    overlay && scene && !brandStingActive && !terminalHidden && !inter
      ? resolveEngagementOverlayFrame({
          overlay,
          sceneDurationMs: playback?.sceneDurationMs ?? 0,
          sceneElapsedMs: sceneLocalMs,
          captionCollision: {
            present: true,
            sceneLayout: scene.captionLayout,
          },
        })
      : null;

  const interIncomingId = inter
    ? resolveActiveSceneMediaRenderView(
        inter.toScene,
        Math.max(0, clampedMs - (inter.toScene.startMs ?? 0)),
        { mixedMediaScenesEnabled: true },
      ).mediaItemId
    : null;
  const interOutgoingId = inter
    ? resolveActiveSceneMediaRenderView(
        inter.fromScene,
        Math.max(0, clampedMs - (inter.fromScene.startMs ?? 0)),
        { mixedMediaScenesEnabled: true },
      ).mediaItemId
    : null;

  return {
    timelineMs: clampedMs,
    sceneId: scene?.id ?? null,
    sceneIndex,
    sceneLocalMs,
    activeMediaId: brandStingActive || terminalHidden
      ? null
      : (interIncomingId ?? presentation?.playbackMedia.mediaItemId ?? null),
    outgoingMediaId: brandStingActive || terminalHidden
      ? null
      : (interOutgoingId ??
        presentation?.outgoingTransitionMedia?.mediaItemId ??
        intra?.fromMediaItemId ??
        null),
    transition: inter
      ? {
          kind: "inter-scene",
          effect: inter.effect,
          progress: inter.progress,
          phase: "inter-transition",
        }
      : intra
        ? {
            kind: "intra-scene",
            effect: intra.effect,
            progress: intra.progress,
            phase: resolveIntraSceneTransitionProgressCheckpoint(intra.progress),
          }
      : {
          kind: "none",
          effect: null,
          progress: null,
          phase: null,
        },
    caption: {
      visible: Boolean(scene?.subtitle) && !brandStingActive && !terminalHidden && !inter,
      anchor: scene?.captionLayout?.anchor ?? null,
      textAlign: scene?.captionLayout?.textAlign ?? null,
    },
    cta: {
      visible: ctaFrame?.visible === true,
      kind: overlay?.kind ?? null,
      segment: ctaFrame?.visible ? (ctaFrame.phase ?? null) : null,
      label: ctaFrame?.visible
        ? (ctaFrame.segments.find((segment) => segment.active)?.label ??
          ctaFrame.labels[ctaFrame.labels.length - 1] ??
          null)
        : null,
    },
    brandSting: {
      active: brandStingActive,
      elapsedMs: stingElapsedMs,
      phase: brandStingActive ? stingFrame.phase : null,
      visible: brandStingActive && stingFrame.visible,
    },
    terminalHidden,
    inspectionActive: false,
    storyMutated: false,
  };
}
