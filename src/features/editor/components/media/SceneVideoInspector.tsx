"use client";

import {
  Clock3,
  Film,
  ImagePlus,
  Info,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  formatMediaDuration,
  formatMediaMimeType,
  formatMediaResolution,
  formatMediaSourceBadge,
  formatTrimPlaybackResult,
  formatTrimSeconds,
  formatTrimVsSceneDelta,
  formatTrimWindow,
  isSceneVideoTrimEditorAvailable,
  parseTrimSecondsToMs,
  resolveSceneVideoTimingSummary,
  SCENE_VIDEO_COMING_SOON_CONTROLS,
  SCENE_VIDEO_INSPECTOR_SAFETY_COPY,
  SCENE_VIDEO_TRIM_MIN_GAP_MS,
  SCENE_VIDEO_TRIM_SHIFT_STEP_SEC,
  SCENE_VIDEO_TRIM_STEP_SEC,
  validateSceneVideoTrimDraft,
} from "@/features/editor/components/media/scene-video-inspector.utils";
import VideoTrimRangeSlider from "@/features/editor/components/media/VideoTrimRangeSlider";
import type { VideoTrimRangeDraft } from "@/features/editor/components/media/video-trim-range-slider.utils";
import MediaFramingInspectorControls from "@/features/editor/components/MediaFramingInspectorControls";
import {
  resolveSceneMediaFraming,
  type SceneMediaFraming,
} from "@/features/media-framing";
import {
  formatPosterFrameTime,
  generateSceneMediaFilmstrip,
  generateSceneMediaPoster,
  resolvePosterPickerRange,
} from "@/features/media-thumbnails";
import {
  buildVideoTrimPreviewOverride,
  canCreateVideoTrimPreviewOverride,
  useVideoTrimPreviewOptional,
  type VideoTrimPreviewActiveHandle,
} from "@/features/preview/video-trim-preview";
import type { SceneMedia } from "@/features/story/types";
import { SCENE_MEDIA_FILE_ACCEPT } from "@/features/story/utils/scene-media-upload.utils";
import {
  studioDestructiveButton,
  studioFieldLabel,
  studioInputCompact,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
  studioUploadButton,
} from "@/lib/utils/studioUi";

export interface SceneVideoTrimCommitRequest {
  trimStartMs: number;
  trimEndMs: number;
}

export interface SceneVideoInspectorProps {
  media: SceneMedia;
  /** Active scene id — scopes temporary trim preview overrides. */
  sceneId: string;
  /** Active scene duration in ms (MasterTimeline / scene.durationMs). */
  sceneDurationMs: number;
  onReplace: (file: File) => void;
  onRemove: () => void;
  /** Commits a draft poster time (clamped) into scene.media.posterTimeMs. */
  onSetPoster?: (posterTimeMs: number) => void;
  /** Clears scene.media.posterTimeMs and posterUrl. */
  onResetPoster?: () => void;
  /**
   * Commits trim via buildVideoTrimPatch in the parent.
   * Returns false when the patch helper rejects the request.
   */
  onApplyTrim?: (trim: SceneVideoTrimCommitRequest) => boolean;
  /** Resets trim via buildResetVideoTrimPatch in the parent. */
  onResetTrim?: () => boolean;
  /** Persistent framing (fit/fill/pan/zoom) — shared with Preview/Export. */
  onFramingChange?: (patch: Partial<SceneMediaFraming>) => void;
  onResetFraming?: () => void;
  onReposition?: () => void;
  repositionActive?: boolean;
}

function InspectorSubsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <p className={`${studioFieldLabel} mb-0`}>{title}</p>
        {description ? <p className={`${studioSubtleText} mt-1`}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${studioSubtleText} text-[11px]`}>{label}</span>
      <span className="text-right text-[12px] font-medium text-foreground/90">{value}</span>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted ring-1 ring-border/25">
      {children}
    </span>
  );
}

/**
 * Video Inspector for scene.media.type === "video".
 * Numeric trim + range slider + live trim preview scrub (preview-only override).
 */
export default function SceneVideoInspector({
  media,
  sceneId,
  sceneDurationMs,
  onReplace,
  onRemove,
  onSetPoster,
  onResetPoster,
  onApplyTrim,
  onResetTrim,
  onFramingChange,
  onResetFraming,
  onReposition,
  repositionActive = false,
}: SceneVideoInspectorProps) {
  const trimPreview = useVideoTrimPreviewOptional();
  const framing = resolveSceneMediaFraming({ media }, { media });
  const trimWindow = formatTrimWindow(media);
  const timing = resolveSceneVideoTimingSummary(media, sceneDurationMs);
  const poster = generateSceneMediaPoster(media);
  const filmstrip = generateSceneMediaFilmstrip(media);
  const mimeLabel = formatMediaMimeType(media.mimeType);
  const resolutionLabel = formatMediaResolution(media.width, media.height);
  const sourceLabel = formatMediaSourceBadge(media.source);
  const isMuted = media.muted !== false;
  const posterRange = resolvePosterPickerRange(media);
  const pickerAvailable = posterRange.available;
  const trimEditorAvailable = isSceneVideoTrimEditorAvailable(media);
  const sourceDurationMs = trimWindow.sourceDurationMs;

  const committedPosterTimeMs = Math.min(
    posterRange.maxMs,
    Math.max(
      posterRange.minMs,
      typeof media.posterTimeMs === "number" && Number.isFinite(media.posterTimeMs)
        ? Math.round(media.posterTimeMs)
        : poster.posterTimeMs,
    ),
  );
  const posterSourceKey = `${media.url ?? ""}|${committedPosterTimeMs}|${posterRange.minMs}|${posterRange.maxMs}`;

  const [draftPosterTimeMs, setDraftPosterTimeMs] = useState(committedPosterTimeMs);
  const [draftPosterSourceKey, setDraftPosterSourceKey] = useState(posterSourceKey);

  if (draftPosterSourceKey !== posterSourceKey) {
    setDraftPosterSourceKey(posterSourceKey);
    setDraftPosterTimeMs(committedPosterTimeMs);
  }

  const committedTrimStartMs = trimWindow.trimStartMs;
  const committedTrimEndMs = trimWindow.trimEndMs;
  const trimSourceKey = `${media.url ?? ""}|${committedTrimStartMs}|${committedTrimEndMs}|${sourceDurationMs}`;

  const [draftTrimStartMs, setDraftTrimStartMs] = useState(committedTrimStartMs);
  const [draftTrimEndMs, setDraftTrimEndMs] = useState(committedTrimEndMs);
  const [draftTrimStartSec, setDraftTrimStartSec] = useState(
    formatTrimSeconds(committedTrimStartMs),
  );
  const [draftTrimEndSec, setDraftTrimEndSec] = useState(
    formatTrimSeconds(committedTrimEndMs),
  );
  const [draftTrimSourceKey, setDraftTrimSourceKey] = useState(trimSourceKey);
  const [trimStartFocused, setTrimStartFocused] = useState(false);
  const [trimEndFocused, setTrimEndFocused] = useState(false);
  const [trimSliderDragging, setTrimSliderDragging] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);

  const clearOverrideFn = trimPreview?.clearOverride;
  const setOverrideFn = trimPreview?.setOverride;

  const clearTrimPreviewOverride = () => {
    clearOverrideFn?.();
  };

  const publishTrimPreview = (
    draft: VideoTrimRangeDraft,
    activeHandle: VideoTrimPreviewActiveHandle,
  ) => {
    if (
      !canCreateVideoTrimPreviewOverride({
        mediaType: media.type,
        sourceDurationMs,
      })
    ) {
      return;
    }

    setOverrideFn?.(
      buildVideoTrimPreviewOverride({
        sceneId,
        trimStartMs: draft.trimStartMs,
        trimEndMs: draft.trimEndMs,
        activeHandle,
        sourceDurationMs,
        isActive: true,
        surface: "inspector",
      }),
    );
  };

  const syncDraftFromCommitted = () => {
    setDraftTrimStartMs(committedTrimStartMs);
    setDraftTrimEndMs(committedTrimEndMs);
    setDraftTrimStartSec(formatTrimSeconds(committedTrimStartMs));
    setDraftTrimEndSec(formatTrimSeconds(committedTrimEndMs));
    setTrimError(null);
  };

  // Timeline took ownership of the shared preview override — drop inspector drag.
  if (trimSliderDragging && trimPreview?.override?.surface === "timeline") {
    setTrimSliderDragging(false);
    syncDraftFromCommitted();
  }

  useEffect(() => {
    return () => {
      clearOverrideFn?.();
    };
  }, [sceneId, media.url, clearOverrideFn]);

  useEffect(() => {
    if (!media.url?.trim()) {
      clearOverrideFn?.();
    }
  }, [media.url, clearOverrideFn]);

  if (
    draftTrimSourceKey !== trimSourceKey &&
    !trimStartFocused &&
    !trimEndFocused &&
    !trimSliderDragging
  ) {
    setDraftTrimSourceKey(trimSourceKey);
    syncDraftFromCommitted();
  }

  const applyLocalTrimDraft = (next: VideoTrimRangeDraft) => {
    setDraftTrimStartMs(next.trimStartMs);
    setDraftTrimEndMs(next.trimEndMs);
    if (!trimStartFocused) {
      setDraftTrimStartSec(formatTrimSeconds(next.trimStartMs));
    }
    if (!trimEndFocused) {
      setDraftTrimEndSec(formatTrimSeconds(next.trimEndMs));
    }
    setTrimError(null);
  };

  const draftTrimValidation = validateSceneVideoTrimDraft(
    draftTrimStartSec,
    draftTrimEndSec,
    sourceDurationMs,
  );

  const publishNumericTrimPreview = () => {
    if (!draftTrimValidation.ok || draftTrimValidation.startMs == null || draftTrimValidation.endMs == null) {
      return;
    }
    publishTrimPreview(
      {
        trimStartMs: draftTrimValidation.startMs,
        trimEndMs: draftTrimValidation.endMs,
      },
      "numeric",
    );
  };

  const draftTrimDurationMs = Math.max(0, draftTrimEndMs - draftTrimStartMs);

  const trimDirty =
    draftTrimStartMs !== committedTrimStartMs || draftTrimEndMs !== committedTrimEndMs;
  const canApplyTrim =
    trimEditorAvailable &&
    typeof onApplyTrim === "function" &&
    trimDirty &&
    draftTrimValidation.ok;
  const canResetTrim =
    trimEditorAvailable &&
    typeof onResetTrim === "function" &&
    (committedTrimStartMs !== 0 || committedTrimEndMs !== sourceDurationMs);

  const startMaxSec =
    sourceDurationMs > SCENE_VIDEO_TRIM_MIN_GAP_MS
      ? (Math.max(SCENE_VIDEO_TRIM_MIN_GAP_MS, draftTrimEndMs) - SCENE_VIDEO_TRIM_MIN_GAP_MS) /
        1000
      : 0;
  const endMinSec =
    sourceDurationMs > SCENE_VIDEO_TRIM_MIN_GAP_MS
      ? (draftTrimStartMs + SCENE_VIDEO_TRIM_MIN_GAP_MS) / 1000
      : 0;
  const endMaxSec = sourceDurationMs / 1000;

  const canCommitPoster =
    pickerAvailable && typeof onSetPoster === "function" && draftPosterTimeMs !== committedPosterTimeMs;
  const canResetPoster =
    pickerAvailable &&
    typeof onResetPoster === "function" &&
    (typeof media.posterTimeMs === "number" || Boolean(media.posterUrl?.trim()));

  const commitTrimValues = (startMs: number, endMs: number): boolean => {
    const validation = validateSceneVideoTrimDraft(
      formatTrimSeconds(startMs),
      formatTrimSeconds(endMs),
      sourceDurationMs,
    );
    if (!validation.ok || validation.startMs == null || validation.endMs == null) {
      setTrimError(validation.errors[0] ?? "Invalid trim values.");
      return false;
    }

    if (!onApplyTrim) {
      setTrimError("Trim controls are unavailable.");
      return false;
    }

    const applied = onApplyTrim({
      trimStartMs: validation.startMs,
      trimEndMs: validation.endMs,
    });
    if (!applied) {
      setTrimError("Could not apply trim. Check the clip duration and try again.");
      return false;
    }

    setTrimError(null);
    return true;
  };

  const commitTrimDraft = (): boolean => {
    const validation = validateSceneVideoTrimDraft(
      draftTrimStartSec,
      draftTrimEndSec,
      sourceDurationMs,
    );
    if (!validation.ok || validation.startMs == null || validation.endMs == null) {
      setTrimError(validation.errors[0] ?? "Invalid trim values.");
      return false;
    }

    applyLocalTrimDraft({
      trimStartMs: validation.startMs,
      trimEndMs: validation.endMs,
    });
    publishNumericTrimPreview();
    const applied = commitTrimValues(validation.startMs, validation.endMs);
    clearTrimPreviewOverride();
    return applied;
  };

  const handleReplaceMedia = (file: File) => {
    clearTrimPreviewOverride();
    onReplace(file);
  };

  const handleRemoveMedia = () => {
    clearTrimPreviewOverride();
    onRemove();
  };

  const handleTrimKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTrimDraft();
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    const step = event.shiftKey ? SCENE_VIDEO_TRIM_SHIFT_STEP_SEC : SCENE_VIDEO_TRIM_STEP_SEC;
    const current = Number(event.currentTarget.value);
    if (!Number.isFinite(current)) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const next = Math.max(0, current + direction * step);
    const formatted = next.toFixed(3);
    const nextMs = parseTrimSecondsToMs(formatted);
    if (event.currentTarget.dataset.trimField === "start") {
      setDraftTrimStartSec(formatted);
      if (nextMs != null) {
        setDraftTrimStartMs(nextMs);
      }
    } else {
      setDraftTrimEndSec(formatted);
      if (nextMs != null) {
        setDraftTrimEndMs(nextMs);
      }
    }
    setTrimError(null);
  };

  return (
    <div
      className="space-y-4 rounded-xl bg-background/25 px-3 py-3 ring-1 ring-border/30"
      data-scene-video-inspector="true"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated/50 ring-1 ring-border/25">
          <Film className="h-4 w-4 text-muted" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground/90">Video clip</p>
            <p className={`${studioSubtleText} mt-0.5 text-[11px] leading-snug`}>
              Clip metadata and playback behavior for this scene.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{mimeLabel}</Badge>
            <Badge>{sourceLabel}</Badge>
            {isMuted ? (
              <Badge>
                <VolumeX className="h-3 w-3" aria-hidden />
                Muted
              </Badge>
            ) : (
              <Badge>
                <Volume2 className="h-3 w-3" aria-hidden />
                Unmuted
              </Badge>
            )}
          </div>
        </div>
      </div>

      {onFramingChange && onResetFraming ? (
        <MediaFramingInspectorControls
          framing={framing}
          mediaLabel="video"
          controlId={`scene-video-framing-${sceneId}`}
          repositionActive={repositionActive}
          onReposition={onReposition}
          onReset={onResetFraming}
          onFramingChange={onFramingChange}
        />
      ) : null}

      <InspectorSubsection title="Clip" description="Source file details.">
        <div className="space-y-1.5 rounded-lg bg-surface-elevated/25 px-2.5 py-2 ring-1 ring-border/20">
          <MetaRow label="Duration" value={formatMediaDuration(media.durationMs)} />
          <MetaRow label="Resolution" value={resolutionLabel} />
          <MetaRow label="Type" value={media.mimeType?.trim() || mimeLabel} />
          <MetaRow label="Source" value={sourceLabel} />
        </div>
      </InspectorSubsection>

      <InspectorSubsection
        title="Timing"
        description="Committed trim window vs scene length."
      >
        <div className="space-y-1.5 rounded-lg bg-surface-elevated/25 px-2.5 py-2 ring-1 ring-border/20">
          <MetaRow label="Trim start" value={formatMediaDuration(timing.trimStartMs)} />
          <MetaRow label="Trim end" value={formatMediaDuration(timing.trimEndMs)} />
          <MetaRow label="Trim duration" value={formatMediaDuration(timing.trimDurationMs)} />
          <MetaRow label="Scene duration" value={formatMediaDuration(timing.sceneDurationMs)} />
          <MetaRow
            label="Clip vs scene"
            value={formatTrimVsSceneDelta(timing.trimVsSceneDeltaMs)}
          />
          <p className={`${studioSubtleText} pt-1 text-[10px] leading-snug`}>
            Window: {trimWindow.label}
          </p>
        </div>
      </InspectorSubsection>

      <InspectorSubsection
        title="Trim"
        description="Edit the source-video window shown in this scene."
      >
        <div
          className="space-y-2.5 rounded-lg bg-surface-elevated/25 px-2.5 py-2 ring-1 ring-border/20"
          data-scene-video-trim="true"
        >
          {trimEditorAvailable ? (
            <>
              <VideoTrimRangeSlider
                sourceDurationMs={sourceDurationMs}
                trimStartMs={draftTrimStartMs}
                trimEndMs={draftTrimEndMs}
                filmstripMarkers={filmstrip.samples}
                posterTimeMs={poster.posterTimeMs}
                onDraftChange={(next) => {
                  setTrimSliderDragging(true);
                  applyLocalTrimDraft(next);
                }}
                onCommit={(next) => {
                  applyLocalTrimDraft(next);
                  commitTrimValues(next.trimStartMs, next.trimEndMs);
                  setTrimSliderDragging(false);
                }}
                onCancelDrag={() => {
                  setTrimSliderDragging(false);
                  syncDraftFromCommitted();
                }}
                onPreviewStart={(payload) => {
                  publishTrimPreview(
                    {
                      trimStartMs: payload.trimStartMs,
                      trimEndMs: payload.trimEndMs,
                    },
                    payload.handle,
                  );
                }}
                onPreviewChange={(payload) => {
                  publishTrimPreview(
                    {
                      trimStartMs: payload.trimStartMs,
                      trimEndMs: payload.trimEndMs,
                    },
                    payload.handle,
                  );
                }}
                onPreviewCommit={() => {
                  clearTrimPreviewOverride();
                }}
                onPreviewCancel={() => {
                  clearTrimPreviewOverride();
                }}
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className={`${studioSubtleText} text-[11px]`}>Trim start (s)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={startMaxSec}
                    step={SCENE_VIDEO_TRIM_STEP_SEC}
                    value={draftTrimStartSec}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraftTrimStartSec(value);
                      const parsed = parseTrimSecondsToMs(value);
                      if (parsed != null) {
                        setDraftTrimStartMs(parsed);
                      }
                      setTrimError(null);
                    }}
                    onFocus={() => setTrimStartFocused(true)}
                    onBlur={() => {
                      setTrimStartFocused(false);
                      if (!draftTrimValidation.ok) {
                        return;
                      }
                      if (trimDirty) {
                        commitTrimDraft();
                      }
                    }}
                    onKeyDown={handleTrimKeyDown}
                    data-trim-field="start"
                    data-scene-video-trim-start="true"
                    aria-label="Trim start in seconds"
                    aria-describedby="scene-video-trim-help"
                    className={`${studioInputCompact} w-full text-left`}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={`${studioSubtleText} text-[11px]`}>Trim end (s)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={endMinSec}
                    max={endMaxSec}
                    step={SCENE_VIDEO_TRIM_STEP_SEC}
                    value={draftTrimEndSec}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraftTrimEndSec(value);
                      const parsed = parseTrimSecondsToMs(value);
                      if (parsed != null) {
                        setDraftTrimEndMs(parsed);
                      }
                      setTrimError(null);
                    }}
                    onFocus={() => setTrimEndFocused(true)}
                    onBlur={() => {
                      setTrimEndFocused(false);
                      if (!draftTrimValidation.ok) {
                        return;
                      }
                      if (trimDirty) {
                        commitTrimDraft();
                      }
                    }}
                    onKeyDown={handleTrimKeyDown}
                    data-trim-field="end"
                    data-scene-video-trim-end="true"
                    aria-label="Trim end in seconds"
                    aria-describedby="scene-video-trim-help"
                    className={`${studioInputCompact} w-full text-left`}
                  />
                </label>
              </div>

              <p id="scene-video-trim-help" className={`${studioSubtleText} text-[10px] leading-snug`}>
                Absolute source times. Arrow keys nudge by 0.1s · Shift+Arrow by 1s · Enter applies.
              </p>

              <div className="space-y-1.5">
                <MetaRow
                  label="Trimmed duration"
                  value={formatMediaDuration(draftTrimDurationMs)}
                />
                <MetaRow
                  label="Scene duration"
                  value={formatMediaDuration(timing.sceneDurationMs)}
                />
                <p
                  className={`${studioSubtleText} text-[10px] leading-snug`}
                  data-scene-video-trim-playback-result="true"
                >
                  {formatTrimPlaybackResult(draftTrimDurationMs, timing.sceneDurationMs)}
                </p>
              </div>

              {trimError || (!draftTrimValidation.ok && trimDirty) ? (
                <p
                  className="text-[11px] leading-snug text-red-300/90"
                  data-scene-video-trim-error="true"
                  role="alert"
                >
                  {trimError ?? draftTrimValidation.errors[0]}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${studioPrimaryButton} px-3 py-1.5 text-[11px]`}
                  disabled={!canApplyTrim}
                  onClick={() => {
                    commitTrimDraft();
                  }}
                  data-scene-video-trim-apply="true"
                >
                  Apply Trim
                </button>
                <button
                  type="button"
                  className={`${studioSecondaryButton} px-3 py-1.5 text-[11px]`}
                  disabled={!canResetTrim}
                  onClick={() => {
                    clearTrimPreviewOverride();
                    const reset = onResetTrim?.();
                    if (reset === false) {
                      setTrimError("Could not reset trim.");
                      return;
                    }
                    setTrimError(null);
                  }}
                  data-scene-video-trim-reset="true"
                >
                  Reset Trim
                </button>
              </div>
            </>
          ) : (
            <p
              className={`${studioSubtleText} text-[11px] leading-snug`}
              data-scene-video-trim-unavailable="true"
            >
              Trim unavailable until video metadata is loaded.
            </p>
          )}
        </div>
      </InspectorSubsection>

      <InspectorSubsection
        title="Poster"
        description="Choose a representative frame for this clip."
      >
        <div
          className="space-y-2.5 rounded-lg bg-surface-elevated/25 px-2.5 py-2 ring-1 ring-border/20"
          data-scene-video-poster="true"
        >
          <MetaRow
            label="Current poster"
            value={formatPosterFrameTime(poster.posterTimeMs)}
          />

          {pickerAvailable ? (
            <div className="space-y-2" data-scene-video-poster-picker="true">
              <label className="block space-y-1.5">
                <span className={`${studioSubtleText} text-[11px]`}>
                  Poster frame: {formatPosterFrameTime(draftPosterTimeMs)}
                </span>
                <input
                  type="range"
                  min={posterRange.minMs}
                  max={posterRange.maxMs}
                  step={1}
                  value={Math.min(
                    posterRange.maxMs,
                    Math.max(posterRange.minMs, draftPosterTimeMs),
                  )}
                  onChange={(event) => {
                    setDraftPosterTimeMs(Number(event.target.value));
                  }}
                  className="w-full accent-accent"
                  aria-label="Poster frame time"
                  data-scene-video-poster-slider="true"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${studioPrimaryButton} px-3 py-1.5 text-[11px]`}
                  disabled={!canCommitPoster}
                  onClick={() => onSetPoster?.(draftPosterTimeMs)}
                  data-scene-video-poster-set="true"
                >
                  Set Poster
                </button>
                <button
                  type="button"
                  className={`${studioSecondaryButton} px-3 py-1.5 text-[11px]`}
                  disabled={!canResetPoster}
                  onClick={() => onResetPoster?.()}
                  data-scene-video-poster-reset="true"
                >
                  Reset Poster
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`${studioSubtleText} text-[11px] leading-snug`}
              data-scene-video-poster-unavailable="true"
            >
              Poster unavailable until video metadata is loaded.
            </p>
          )}

          <div className="flex gap-2.5">
            <div
              className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-background/40 text-[9px] uppercase tracking-wide text-muted/70 ring-1 ring-border/25"
              data-scene-video-poster-preview="true"
              aria-hidden
            >
              Poster
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className={`${studioSubtleText} text-[10px] leading-snug`}>
                Filmstrip ({filmstrip.count} samples)
              </p>
              <div
                className="grid grid-cols-8 gap-0.5"
                data-scene-video-filmstrip="true"
                aria-hidden
              >
                {filmstrip.samples.length > 0
                  ? filmstrip.samples.map((sample) => (
                      <div
                        key={sample.index}
                        className="flex aspect-[9/16] flex-col items-center justify-end rounded-[2px] bg-background/35 pb-0.5 ring-1 ring-border/20"
                        title={formatPosterFrameTime(sample.timeMs)}
                      >
                        <span className="text-[7px] leading-none text-muted/60">
                          {Math.round(sample.timeMs / 1000)}s
                        </span>
                      </div>
                    ))
                  : (
                      <div className="col-span-8 aspect-[9/16] max-h-10 rounded-[2px] bg-background/35 ring-1 ring-border/20" />
                    )}
              </div>
            </div>
          </div>
        </div>
      </InspectorSubsection>

      <InspectorSubsection title="Playback behavior">
        <ul className="space-y-1.5 rounded-lg bg-surface-elevated/25 px-2.5 py-2 text-[11px] leading-snug text-muted ring-1 ring-border/20">
          <li className="flex gap-2">
            <VolumeX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Muted by default — clip audio is not exported.</span>
          </li>
          <li className="flex gap-2">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {timing.holdsLastFrame
                ? "Clip is shorter than the scene — last frame holds until scene end."
                : "When the clip is shorter than the scene, the last frame holds until scene end."}
            </span>
          </li>
          <li className="flex gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Voiceover remains the primary audio track.</span>
          </li>
        </ul>
      </InspectorSubsection>

      <InspectorSubsection title="Coming soon" description="Reserved for future clip tools.">
        <div className="flex flex-wrap gap-1.5">
          {SCENE_VIDEO_COMING_SOON_CONTROLS.map((control) => (
            <button
              key={control.id}
              type="button"
              disabled
              className="cursor-not-allowed rounded-md bg-surface-elevated/30 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted/70 ring-1 ring-border/20"
              aria-disabled="true"
              title={control.hint}
            >
              {control.label}
              <span className="ml-1 opacity-60">· {control.hint}</span>
            </button>
          ))}
        </div>
      </InspectorSubsection>

      <div className="flex flex-wrap gap-2">
        <label className={studioUploadButton} data-scene-video-replace="true">
          <ImagePlus className="h-3.5 w-3.5" />
          Replace media
          <input
            type="file"
            accept={SCENE_MEDIA_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleReplaceMedia(file);
              }
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={handleRemoveMedia}
          className={studioDestructiveButton}
          data-scene-video-remove="true"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove media
        </button>
      </div>

      <p className={`${studioSubtleText} text-[11px] leading-snug`}>
        {SCENE_VIDEO_INSPECTOR_SAFETY_COPY}
      </p>
    </div>
  );
}
