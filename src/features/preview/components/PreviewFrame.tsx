"use client";

import SceneFrameMedia from "@/features/editor/components/SceneFrameMedia";
import { sceneHasMedia } from "@/features/story/utils";
import {
  studioPreviewDevice,
  studioPreviewScreen,
} from "@/lib/utils/studioUi";
import type { FootieScene, SceneType } from "@/features/story/types";

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
}) {
  const sceneTypeMeta =
    scene.sceneType && scene.sceneType !== "transition"
      ? SCENE_TYPE_META[scene.sceneType]
      : null;
  const hasMedia = sceneHasMedia(scene);

  return (
    <div className="absolute inset-0 overflow-hidden" style={style}>
      {hasMedia && !hideImage ? (
        <SceneFrameMedia
          scene={scene}
          alt={`Scene ${sceneIndex + 1}`}
          sceneElapsedMs={sceneElapsedMs}
          sceneDurationMs={sceneDurationMs}
          isPlaying={isPlaying}
          isActive={isActive}
          transformOffset={transformOffset}
          isDragging={isDragging}
        />
      ) : !hasMedia ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-surface via-background to-background px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
            <Film className="h-5 w-5 text-white/40" />
          </div>
          {sceneTypeMeta ? (
            <p className={`text-[10px] font-medium uppercase tracking-widest ${sceneTypeMeta.color}`}>
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

export function PreviewDeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className={studioPreviewDevice}>
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
}: PreviewFrameProps) {
  const transitionStyles = transitionOverlay
    ? transitionStateToPreviewLayerStyles(
        transitionOverlay.effect,
        transitionOverlay.transitionState,
      )
    : null;

  return (
    <PreviewDeviceFrame>
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
          />
          <SceneBackdrop
            scene={transitionOverlay.toScene}
            sceneIndex={transitionOverlay.toSceneIndex}
            style={transitionStyles.to}
            sceneElapsedMs={transitionToSceneElapsedMs}
            sceneDurationMs={transitionToSceneDurationMs}
            isPlaying={false}
            isActive={false}
          />
        </>
      ) : (
        <SceneBackdrop
          scene={previewFrame.scene}
          sceneIndex={previewFrame.sceneIndex}
          hideImage={hideSceneImage}
          sceneElapsedMs={sceneElapsedMs}
          sceneDurationMs={sceneDurationMs}
          isPlaying={isPlaying}
          isActive
          transformOffset={framingDragOffset ?? undefined}
          isDragging={Boolean(framingDragOffset)}
        />
      )}

      {editLayer}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" />

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
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
          FootieBitz
        </p>
        <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-white/95">
          {title}
        </h3>
      </div>

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
