"use client";

/**
 * Per-media Inspector (Sprint 8C / 8C.1).
 * Edits a Scene Media Timeline item by stable mediaItemId.
 * When the multi-image gate is ON, Preview follows Scene Media Timeline playback.
 */

import { useState } from "react";

import SceneImageInspector from "@/features/editor/components/SceneImageInspector";
import MediaMotionInspectorPanel from "@/features/editor/components/media/MediaMotionInspectorPanel";
import MediaVisualAdjustmentsPanel from "@/features/editor/components/media/MediaVisualAdjustmentsPanel";
import SceneVideoInspector from "@/features/editor/components/media/SceneVideoInspector";
import { useEditorSelection } from "@/features/editor/selection";
import { SelectionPhase } from "@/features/editor/selection/selection.types";
import {
  buildMediaFramingPatch,
  buildResetMediaFramingPatch,
  resolveSceneMediaFraming,
  type SceneMediaFramingPatch,
} from "@/features/media-framing";
import {
  buildMediaMotionPatch,
  buildResetMediaMotionPatch,
  resolveSceneMediaMotion,
  type SceneMediaMotion,
} from "@/features/media-motion";
import {
  patchSceneMediaVisualAdjustments,
  resetSceneMediaVisualAdjustments,
} from "@/features/media-visual-adjustments";
import {
  buildResetVideoTrimPatch,
  buildVideoTrimPatch,
} from "@/features/media-playback";
import {
  buildPosterTimePatch,
  buildResetPosterPatch,
} from "@/features/media-thumbnails";
import {
  projectSceneMediaTimeline,
  resolveProjectedSceneMediaWindows,
  runSceneMediaItemTempEdit,
  SCENE_MEDIA_ITEM_INSPECTOR_PREVIEW_NOTICE,
  updateSceneMediaItemMedia,
  type SceneMediaItemTempScene,
} from "@/features/scene-media-timeline";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";
import { studioFieldLabel, studioSubtleText } from "@/lib/utils/studioUi";
import {
  applySceneUpdate,
  type StoryScriptChangeOptions,
} from "@/lib/utils/voiceover";

export interface SceneMediaItemInspectorProps {
  script: FootieScript;
  scene: FootieScene;
  mediaItemId: string;
  onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  /** UI-only grouping; edit and commit paths remain identical. */
  section?: "all" | "media" | "adjust";
}

type SafeInspectorError = "rejected_edit" | "playback_locked";

const SAFE_ERROR_MESSAGES: Record<SafeInspectorError, string> = {
  rejected_edit: "That media edit could not be applied.",
  playback_locked: "Pause playback to edit this media item.",
};

function formatWindowMs(ms: number): string {
  const seconds = ms / 1000;
  if (!Number.isFinite(seconds)) {
    return "0s";
  }
  return `${seconds.toFixed(seconds < 10 && seconds % 1 !== 0 ? 2 : 1)}s`;
}

export default function SceneMediaItemInspector({
  script,
  scene,
  mediaItemId,
  onScriptChange,
  section = "all",
}: SceneMediaItemInspectorProps) {
  const selection = useEditorSelection();
  const playbackLocked = selection.phase === SelectionPhase.PlaybackLocked;
  const [error, setError] = useState<SafeInspectorError | null>(null);

  const projected = projectSceneMediaTimeline(scene);
  const windows = resolveProjectedSceneMediaWindows(scene);
  const itemIndex = projected.items.findIndex(
    (item) => item.id === mediaItemId,
  );
  const item = itemIndex >= 0 ? projected.items[itemIndex] : null;
  const window = itemIndex >= 0 ? windows[itemIndex] : null;
  const itemCount = projected.items.length;
  const media = item?.media ?? null;
  const sceneDurationMs = getSceneDurationMs(scene);

  const commitItemMedia = (nextMedia: SceneMedia): boolean => {
    if (playbackLocked) {
      setError("playback_locked");
      return false;
    }
    try {
      const result = updateSceneMediaItemMedia(scene, mediaItemId, nextMedia);
      const next = applySceneUpdate(script, scene.id, {
        media: result.scene.media,
        mediaTimeline: result.scene.mediaTimeline,
        image: result.scene.image,
        uploadedImage: result.scene.uploadedImage,
      });
      onScriptChange(next, { intent: "media" });
      setError(null);
      return true;
    } catch {
      setError("rejected_edit");
      return false;
    }
  };

  const runWithTempScene = (
    build: (tempScene: SceneMediaItemTempScene) => { media: SceneMedia } | null,
  ): boolean => {
    if (playbackLocked) {
      setError("playback_locked");
    }
    const ok = runSceneMediaItemTempEdit({
      media,
      playbackLocked,
      scene,
      build,
      commit: commitItemMedia,
    });
    if (!ok && !playbackLocked) {
      setError("rejected_edit");
    }
    if (ok) {
      setError(null);
    }
    return ok;
  };

  if (!item || !media || itemIndex < 0) {
    return (
      <p className={studioSubtleText} role="status">
        Selected media item is no longer available.
      </p>
    );
  }

  const framing = resolveSceneMediaFraming({ media }, { media });
  const motion = resolveSceneMediaMotion({ media });
  const typeLabel =
    media.type === "video"
      ? "Video"
      : media.type === "image"
        ? "Image"
        : "Media";
  const controlsDisabled = playbackLocked;
  const thumbLabel = `Selected ${typeLabel.toLowerCase()} thumbnail`;
  const imageThumbUrl =
    media.type === "image" && typeof media.url === "string" && media.url.trim()
      ? media.url.trim()
      : null;
  const videoThumbUrl =
    media.type === "video" && typeof media.url === "string" && media.url.trim()
      ? media.url.trim()
      : null;
  const videoPosterUrl =
    media.type === "video" &&
    typeof media.posterUrl === "string" &&
    media.posterUrl.trim()
      ? media.posterUrl.trim()
      : undefined;

  return (
    <div
      className="space-y-3"
      data-scene-media-item-inspector={mediaItemId}
      data-scene-media-item-index={itemIndex}
    >
      <div className="rounded-xl bg-background/25 px-3 py-3 ring-1 ring-border/30">
        <p className={`${studioFieldLabel} mb-0`}>
          Media {itemIndex + 1} of {itemCount}
        </p>
        <p className={`${studioSubtleText} mt-1`}>
          {typeLabel}
          {window
            ? ` · ${formatWindowMs(window.startMs)}–${formatWindowMs(window.endMs)} · ${formatWindowMs(window.durationMs)}`
            : null}
        </p>
        {imageThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- editor-local thumbnail, not Preview authority
          <img
            src={imageThumbUrl}
            alt={thumbLabel}
            className="mt-2 h-20 w-full rounded-lg object-cover ring-1 ring-border/25"
            data-scene-media-item-thumb="image"
          />
        ) : videoThumbUrl ? (
          <video
            src={videoThumbUrl}
            poster={videoPosterUrl}
            muted
            playsInline
            preload="metadata"
            aria-label={thumbLabel}
            className="mt-2 h-20 w-full rounded-lg object-cover ring-1 ring-border/25"
            data-scene-media-item-thumb="video"
          />
        ) : (
          <div
            className="mt-2 flex h-20 items-center justify-center rounded-lg bg-surface-elevated/40 text-[11px] text-muted ring-1 ring-border/25"
            data-scene-media-item-thumb="empty"
            role="status"
          >
            No preview
          </div>
        )}
        <p
          className={`${studioSubtleText} mt-2 text-[11px] leading-snug`}
          role="status"
          data-scene-media-item-preview-notice="true"
        >
          {SCENE_MEDIA_ITEM_INSPECTOR_PREVIEW_NOTICE}
        </p>
      </div>

      {error ? (
        <p className="text-[11px] leading-snug text-red-300/90" role="alert">
          {SAFE_ERROR_MESSAGES[error]}
        </p>
      ) : null}

      {section !== "adjust" && media.type === "video" ? (
        <SceneVideoInspector
          media={media}
          sceneId={scene.id}
          sceneDurationMs={sceneDurationMs}
          hideSourceActions
          onReplace={() => {
            /* Source replace owned by timeline lane — hidden. */
          }}
          onRemove={() => {
            /* Source remove owned by timeline lane — hidden. */
          }}
          onSetPoster={(posterTimeMs) => {
            runWithTempScene((temp) => {
              const patch = buildPosterTimePatch(temp, posterTimeMs);
              return patch?.media ? { media: patch.media } : null;
            });
          }}
          onResetPoster={() => {
            runWithTempScene((temp) => {
              const patch = buildResetPosterPatch(temp);
              return patch?.media ? { media: patch.media } : null;
            });
          }}
          onApplyTrim={(trim) =>
            runWithTempScene((temp) => {
              const result = buildVideoTrimPatch(temp, trim);
              return result?.media ? { media: result.media } : null;
            })
          }
          onResetTrim={() =>
            runWithTempScene((temp) => {
              const result = buildResetVideoTrimPatch(temp);
              return result?.media ? { media: result.media } : null;
            })
          }
          onFramingChange={(patch) => {
            runWithTempScene((temp) => {
              const result = buildMediaFramingPatch(
                temp,
                patch as SceneMediaFramingPatch,
              );
              return result?.media ? { media: result.media } : null;
            });
          }}
          onResetFraming={() => {
            runWithTempScene((temp) => {
              const result = buildResetMediaFramingPatch(temp);
              return result?.media ? { media: result.media } : null;
            });
          }}
        />
      ) : section !== "adjust" && media.type === "image" ? (
        <SceneImageInspector
          variant="standalone"
          showHeader={false}
          hideMotion
          showSmartEdit={false}
          sceneId={scene.id}
          controlId={`inspector-media-item-zoom-${scene.id}-${mediaItemId}`}
          scale={framing.zoom}
          positionX={framing.positionX}
          positionY={framing.positionY}
          rotationDeg={framing.rotationDeg}
          fitMode={framing.fitMode === "fill" ? "fill" : "fit"}
          onScaleChange={(scale) => {
            if (controlsDisabled) {
              setError("playback_locked");
              return;
            }
            runWithTempScene((temp) => {
              const result = buildMediaFramingPatch(temp, { zoom: scale });
              return result?.media ? { media: result.media } : null;
            });
          }}
          onFitModeChange={(fitMode) => {
            runWithTempScene((temp) => {
              const result = buildMediaFramingPatch(temp, { fitMode });
              return result?.media ? { media: result.media } : null;
            });
          }}
          onPositionChange={(position) => {
            runWithTempScene((temp) => {
              const result = buildMediaFramingPatch(temp, {
                ...(position.x !== undefined ? { positionX: position.x } : {}),
                ...(position.y !== undefined ? { positionY: position.y } : {}),
              });
              return result?.media ? { media: result.media } : null;
            });
          }}
          onReset={() => {
            runWithTempScene((temp) => {
              const result = buildResetMediaFramingPatch(temp);
              return result?.media ? { media: result.media } : null;
            });
          }}
        />
      ) : section !== "adjust" ? (
        <p className={studioSubtleText}>
          This media type cannot be edited here yet.
        </p>
      ) : null}

      {section !== "media" &&
      (media.type === "image" || media.type === "video") ? (
        <>
          <MediaMotionInspectorPanel
            controlId={`inspector-media-item-motion-${scene.id}-${mediaItemId}`}
            motion={motion}
            disabled={controlsDisabled}
            onMotionChange={(patch: Partial<SceneMediaMotion>) => {
              runWithTempScene((temp) => {
                const result = buildMediaMotionPatch(temp, patch);
                return result?.media ? { media: result.media } : null;
              });
            }}
            onReset={() => {
              runWithTempScene((temp) => {
                const result = buildResetMediaMotionPatch(temp);
                return result?.media ? { media: result.media } : null;
              });
            }}
          />
          <MediaVisualAdjustmentsPanel
            media={media}
            disabled={controlsDisabled}
            onChange={(patch) =>
              commitItemMedia(patchSceneMediaVisualAdjustments(media, patch))
            }
            onReset={() =>
              commitItemMedia(resetSceneMediaVisualAdjustments(media))
            }
          />
        </>
      ) : null}
    </div>
  );
}
