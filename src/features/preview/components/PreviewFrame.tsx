"use client";

import SceneFrameImage from "@/features/editor/components/SceneFrameImage";
import type { TimelineImageMotionInput } from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import { sceneHasImage } from "@/features/story/utils";
import {
  studioPreviewDevice,
  studioPreviewScreen,
} from "@/lib/studioUi";
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
  timelineImageMotion = null,
}: {
  scene: FootieScene;
  sceneIndex: number;
  style?: CSSProperties;
  timelineImageMotion?: TimelineImageMotionInput | null;
}) {
  const sceneTypeMeta = scene.sceneType ? SCENE_TYPE_META[scene.sceneType] : null;
  const hasImage = sceneHasImage(scene);

  return (
    <div className="absolute inset-0 overflow-hidden" style={style}>
      {hasImage ? (
        <SceneFrameImage
          scene={scene}
          alt={`Scene ${sceneIndex + 1}`}
          timelineImageMotion={timelineImageMotion}
        />
      ) : (
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
      )}
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
  sceneTimelineImageMotion?: TimelineImageMotionInput | null;
  transitionFromTimelineImageMotion?: TimelineImageMotionInput | null;
  transitionToTimelineImageMotion?: TimelineImageMotionInput | null;
  overlay?: ReactNode;
  footer?: ReactNode;
}

export default function PreviewFrame({
  title,
  previewFrame,
  transitionOverlay = null,
  sceneTimelineImageMotion = null,
  transitionFromTimelineImageMotion = null,
  transitionToTimelineImageMotion = null,
  overlay,
  footer,
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
            timelineImageMotion={transitionFromTimelineImageMotion}
          />
          <SceneBackdrop
            scene={transitionOverlay.toScene}
            sceneIndex={transitionOverlay.toSceneIndex}
            style={transitionStyles.to}
            timelineImageMotion={transitionToTimelineImageMotion}
          />
        </>
      ) : (
        <SceneBackdrop
          scene={previewFrame.scene}
          sceneIndex={previewFrame.sceneIndex}
          timelineImageMotion={sceneTimelineImageMotion}
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" />

      <div className="absolute inset-x-0 top-0 z-10 px-4 pb-2 pt-11">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
          FootieBitz
        </p>
        <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-white/95">
          {title}
        </h3>
      </div>

      {overlay}

      {footer ? (
        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-4 pb-4">{footer}</div>
      ) : null}
    </PreviewDeviceFrame>
  );
}
