"use client";

import SceneFrameMedia from "@/features/editor/components/SceneFrameMedia";
import {
  resolveActiveSceneMediaRenderView,
  type ActiveSceneMediaRenderView,
} from "@/features/scene-media-timeline";
import { planPreviewMediaLayers } from "@/features/scene-media-transitions/preview";
import { studioPreviewDevice, studioPreviewScreen } from "@/lib/utils/studioUi";
import type { FootieScene, SceneType } from "@/features/story/types";
import { resolveLegibilityLayerPlan } from "@/features/legibility-layer";

import type { PreviewSceneFrame } from "@/features/preview/utils";
import type { PreviewTransitionOverlay } from "@/features/preview/utils/previewTransitionOverlay";
import { transitionStateToPreviewLayerStyles } from "@/features/timeline-intelligence/resolve-transition-state.utils";
import { Film } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

const SCENE_TYPE_META: Record<SceneType, { label: string; color: string }> = {
  intro: { label: "Intro", color: "text-white/70" },
  context: { label: "Context", color: "text-white/70" },
  match: { label: "Match", color: "text-white/70" },
  transition: { label: "Transition", color: "text-white/60" },
  ending: { label: "Ending", color: "text-white/60" },
};

function activeViewIsDrawable(view: ActiveSceneMediaRenderView): boolean {
  const media = view.media;
  if (!media || media.type === "placeholder") {
    return false;
  }
  return typeof media.url === "string" && Boolean(media.url.trim());
}

export function SceneBackdrop({
  scene,
  sceneIndex,
  style,
  hideImage = false,
  sceneElapsedMs = 0,
  sceneDurationMs = 0,
  isPlaying = false,
  isActive = true,
  transformOffset,
  isDragging = false,
  multiImageScenesEnabled = true,
  mixedMediaScenesEnabled = false,
  /** When provided, skip ordinary active-item resolution (exact peer / test injection). */
  activeMediaView: activeMediaViewOverride,
  allowFramingDrag: allowFramingDragOverride,
}: {
  scene: FootieScene;
  sceneIndex: number;
  style?: CSSProperties;
  /** When true, skip rendering the scene media (e.g. edit layer renders it instead). */
  hideImage?: boolean;
  sceneElapsedMs?: number;
  sceneDurationMs?: number;
  isPlaying?: boolean;
  isActive?: boolean;
  /** Live framing drag offset (video reposition keeps the same video element). */
  transformOffset?: { x: number; y: number };
  isDragging?: boolean;
  /**
   * When false, first-item-only (regression tests). Default true — production multi-image.
   */
  multiImageScenesEnabled?: boolean;
  /**
   * Explicit mixed-media scenes capability. Default false (fail-closed).
   * Resolved once by VideoPreview from the workspace capability context.
   */
  mixedMediaScenesEnabled?: boolean;
  activeMediaView?: ActiveSceneMediaRenderView;
  allowFramingDrag?: boolean;
}) {
  const sceneTypeMeta =
    scene.sceneType && scene.sceneType !== "transition"
      ? SCENE_TYPE_META[scene.sceneType]
      : null;
  const multiEnabled = multiImageScenesEnabled !== false;
  // Duration is accepted for API parity with callers; active view uses scene timing.
  void sceneDurationMs;
  const activeMediaView =
    activeMediaViewOverride ??
    resolveActiveSceneMediaRenderView(scene, sceneElapsedMs, {
      multiImageScenesEnabled: multiEnabled,
      mixedMediaScenesEnabled: mixedMediaScenesEnabled === true,
    });
  const hasDrawableActive = activeViewIsDrawable(activeMediaView);
  const allowFramingDrag =
    allowFramingDragOverride ??
    (!multiEnabled || activeMediaView.itemIndex === 0);

  return (
    <div className="absolute inset-0 overflow-hidden" style={style}>
      {hasDrawableActive && !hideImage ? (
        <SceneFrameMedia
          scene={scene}
          activeMediaView={activeMediaView}
          alt={`Scene ${sceneIndex + 1}`}
          isPlaying={isPlaying}
          isActive={isActive}
          transformOffset={transformOffset}
          isDragging={isDragging}
          allowFramingDrag={allowFramingDrag}
        />
      ) : !hasDrawableActive ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-surface via-background to-background px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
            <Film className="h-5 w-5 text-white/40" />
          </div>
          {sceneTypeMeta ? (
            <p
              className={`text-[10px] font-medium uppercase tracking-widest ${sceneTypeMeta.color}`}
            >
              {sceneTypeMeta.label}
            </p>
          ) : (
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">
              Scene {sceneIndex + 1}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PreviewDeviceFrame({
  children,
  maxWidth,
}: {
  children: ReactNode;
  maxWidth?: string | number;
}) {
  return (
    <div
      className={studioPreviewDevice}
      style={maxWidth ? { maxWidth } : undefined}
    >
      <div className={studioPreviewScreen}>{children}</div>
    </div>
  );
}

export function DynamicIsland() {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2.5">
      <div className="h-[22px] w-[72px] rounded-full bg-black/80 ring-1 ring-white/[0.08]" />
    </div>
  );
}

interface PreviewFrameProps {
  title: string;
  previewFrame: PreviewSceneFrame;
  transitionOverlay?: PreviewTransitionOverlay | null;
  /** Transition from-scene local timing (motion + clip sync). */
  transitionFromSceneElapsedMs?: number;
  transitionFromSceneDurationMs?: number;
  /** Transition to-scene local timing (motion + clip sync). */
  transitionToSceneElapsedMs?: number;
  transitionToSceneDurationMs?: number;
  overlay?: ReactNode;
  /** Optional direct-manipulation layer mounted over the 9:16 frame (editor canvas edit). */
  editLayer?: ReactNode;
  /** When true, scene media is rendered by the edit layer instead of the backdrop. */
  hideSceneImage?: boolean;
  /** Live framing drag offset applied to the backdrop media (video reposition). */
  framingDragOffset?: { x: number; y: number } | null;
  /** Presentation-only — dims captions and enables chrome click-to-exit. */
  frameEditActive?: boolean;
  onExitFrameEdit?: () => void;
  footer?: ReactNode;
  /** Scene-local elapsed ms for video clip sync + media motion. */
  sceneElapsedMs?: number;
  /** Scene duration ms for shared media motion. */
  sceneDurationMs?: number;
  /** Preview playback active — drives muted video play/pause. */
  isPlaying?: boolean;
  maxWidth?: string | number;
  /**
   * Explicit mixed-media scenes capability. Default false (fail-closed).
   * Resolved once by VideoPreview — not fetched per frame.
   */
  mixedMediaScenesEnabled?: boolean;
  /** Absolute content/timeline time (ms) for shared title timing. */
  contentTimeMs?: number;
  /** Content duration (ms) excluding brand sting. */
  contentDurationMs?: number;
  /** Brand watermark visibility — matches export branding authority. */
  watermarkEnabled?: boolean;
}

export default function PreviewFrame({
  title,
  previewFrame,
  transitionOverlay = null,
  transitionFromSceneElapsedMs = 0,
  transitionFromSceneDurationMs = 0,
  transitionToSceneElapsedMs = 0,
  transitionToSceneDurationMs = 0,
  overlay,
  editLayer = null,
  hideSceneImage = false,
  framingDragOffset = null,
  frameEditActive = false,
  onExitFrameEdit,
  footer,
  sceneElapsedMs = 0,
  sceneDurationMs = 0,
  isPlaying = false,
  maxWidth,
  mixedMediaScenesEnabled = false,
  contentTimeMs = 0,
  contentDurationMs = 0,
  watermarkEnabled = true,
}: PreviewFrameProps) {
  void sceneDurationMs;
  const mixedMediaEnabled = mixedMediaScenesEnabled === true;

  const legibilityPlan = resolveLegibilityLayerPlan({
    absoluteContentTimeMs: contentTimeMs,
    contentDurationMs,
    storyTitle: title,
    hasActiveCaption: false,
    captionPlacement: "none",
    captionStyleBackgroundEnabled: true,
    captionStyleBackgroundOpacity: 45,
    watermarkEnabled,
    suppressCaptionOverlays: Boolean(transitionOverlay),
  });

  const brandingTextShadow =
    "0 1px 2px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.85)";
  const titleTextShadow =
    "0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)";

  const transitionStyles = transitionOverlay
    ? transitionStateToPreviewLayerStyles(
        transitionOverlay.effect,
        transitionOverlay.transitionState,
      )
    : null;

  // Scene-to-scene wins. Otherwise one stable media stack (primary + optional outgoing).
  const mediaLayerPlan = !transitionOverlay
    ? planPreviewMediaLayers({
        scene: previewFrame.scene,
        sceneElapsedMs,
        isPlaying,
        mixedMediaScenesEnabled: mixedMediaEnabled,
      })
    : null;

  return (
    <PreviewDeviceFrame maxWidth={maxWidth}>
      <DynamicIsland />

      {transitionOverlay && transitionStyles ? (
        <>
          <SceneBackdrop
            scene={transitionOverlay.fromScene}
            sceneIndex={transitionOverlay.fromSceneIndex}
            style={transitionStyles.from}
            sceneElapsedMs={transitionFromSceneElapsedMs}
            sceneDurationMs={transitionFromSceneDurationMs}
            isPlaying={false}
            isActive={false}
            mixedMediaScenesEnabled={mixedMediaEnabled}
          />
          <SceneBackdrop
            scene={transitionOverlay.toScene}
            sceneIndex={transitionOverlay.toSceneIndex}
            style={transitionStyles.to}
            sceneElapsedMs={transitionToSceneElapsedMs}
            sceneDurationMs={transitionToSceneDurationMs}
            isPlaying={false}
            isActive={false}
            mixedMediaScenesEnabled={mixedMediaEnabled}
          />
        </>
      ) : mediaLayerPlan ? (
        <div
          className="absolute inset-0 overflow-hidden"
          data-preview-stable-media-stack="true"
          data-intra-scene-transition-active={
            mediaLayerPlan.intraScene ? "true" : "false"
          }
          {...(mediaLayerPlan.intraScene
            ? {
                "data-intra-scene-transition-from":
                  mediaLayerPlan.intraScene.fromMediaItemId,
                "data-intra-scene-transition-to":
                  mediaLayerPlan.intraScene.toMediaItemId,
                "data-intra-scene-transition-effect":
                  mediaLayerPlan.intraScene.effect,
                "data-intra-scene-transition-progress":
                  mediaLayerPlan.intraScene.progress.toFixed(4),
                "data-intra-scene-transition-checkpoint":
                  mediaLayerPlan.intraScene.checkpoint,
                "data-intra-scene-transition-outgoing-paused": "true",
                "data-intra-scene-transition-incoming-active": isPlaying
                  ? "true"
                  : "false",
              }
            : {})}
        >
          {mediaLayerPlan.outgoing ? (
            <SceneBackdrop
              key={mediaLayerPlan.outgoing.stableKey}
              scene={previewFrame.scene}
              sceneIndex={previewFrame.sceneIndex}
              style={mediaLayerPlan.outgoing.style}
              activeMediaView={mediaLayerPlan.outgoing.view}
              sceneElapsedMs={sceneElapsedMs}
              sceneDurationMs={sceneDurationMs}
              isPlaying={mediaLayerPlan.outgoing.isPlaying}
              isActive={mediaLayerPlan.outgoing.isActive}
              allowFramingDrag={false}
            />
          ) : null}
          <SceneBackdrop
            key={mediaLayerPlan.primary.stableKey}
            scene={previewFrame.scene}
            sceneIndex={previewFrame.sceneIndex}
            style={mediaLayerPlan.primary.style}
            activeMediaView={mediaLayerPlan.primary.view}
            hideImage={hideSceneImage}
            sceneElapsedMs={sceneElapsedMs}
            sceneDurationMs={sceneDurationMs}
            isPlaying={mediaLayerPlan.primary.isPlaying}
            isActive={mediaLayerPlan.primary.isActive}
            allowFramingDrag={
              mediaLayerPlan.primary.allowFramingDrag &&
              !mediaLayerPlan.intraScene
            }
            transformOffset={
              mediaLayerPlan.intraScene
                ? undefined
                : (framingDragOffset ?? undefined)
            }
            isDragging={
              !mediaLayerPlan.intraScene && Boolean(framingDragOffset)
            }
          />
        </div>
      ) : null}

      {editLayer}

      {(legibilityPlan.branding.enabled || legibilityPlan.title.visible) && (
        <div
          className={`absolute inset-x-0 top-0 z-10 px-4 pb-2 pt-11 transition-opacity duration-150 ${
            frameEditActive ? "cursor-default opacity-80" : ""
          }`}
          onPointerDown={
            frameEditActive
              ? (event) => {
                  event.stopPropagation();
                  onExitFrameEdit?.();
                }
              : undefined
          }
        >
          {legibilityPlan.branding.enabled ? (
            <p
              className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70"
              style={{ textShadow: brandingTextShadow }}
            >
              FootieBitz
            </p>
          ) : null}
          {legibilityPlan.title.visible ? (
            <h3
              className="mt-1 line-clamp-2 max-w-full rounded-md bg-black/70 px-2 py-1 text-[13px] font-semibold leading-snug text-white/95"
              style={{
                opacity: legibilityPlan.title.opacity,
                textShadow: titleTextShadow,
              }}
            >
              {title}
            </h3>
          ) : null}
        </div>
      )}

      {overlay}

      {footer ? (
        <div
          className={`absolute inset-x-0 bottom-0 z-10 space-y-2 p-4 pb-4 transition-opacity duration-150 ${
            frameEditActive ? "cursor-default opacity-80" : ""
          }`}
          onPointerDown={
            frameEditActive
              ? (event) => {
                  event.stopPropagation();
                  onExitFrameEdit?.();
                }
              : undefined
          }
        >
          {footer}
        </div>
      ) : null}
    </PreviewDeviceFrame>
  );
}
