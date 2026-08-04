"use client";

import {
  getMediaMotionPreset,
  MEDIA_MOTION_EASING_OPTIONS,
  MEDIA_MOTION_HELPER_COPY,
  MEDIA_MOTION_INSPECTOR_CATEGORIES,
  MEDIA_MOTION_INTENSITY_MAX,
  MEDIA_MOTION_INTENSITY_MIN,
  MEDIA_MOTION_INTENSITY_STEP,
  MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE,
  resolveMediaMotionAuthoringTarget,
  type MediaMotionEasing,
  type SceneMediaMotion,
} from "@/features/media-motion";
import MediaMotionKeyframeEditor from "@/features/media-motion/editor/MediaMotionKeyframeEditor";
import MediaVisualEffectControls from "@/features/media-motion/editor/MediaVisualEffectControls";
import type { SceneMedia } from "@/features/story/types";
import {
  useKeyframedVisualEffectsEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { StudioSwitch } from "@/components/ui";
import {
  studioFieldLabel,
  studioSecondaryButton,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface MediaMotionInspectorPanelProps {
  controlId: string;
  motion: SceneMediaMotion;
  /** Winning media target for look presets (same target as motion/keyframes). */
  media?: SceneMedia | null;
  disabled?: boolean;
  /** Item-local media window duration for keyframe timing. */
  mediaWindowDurationMs?: number;
  /** Stable media-item id when editing a projected item; null for scene media. */
  mediaItemId?: string | null;
  /**
   * Mixed-media scenes with no selected visual. When keyframed capability is
   * ready/true, the entire motion authoring area requires a visual selection.
   * Capability off preserves legacy scene.media preset writing.
   */
  requiresMediaItemSelection?: boolean;
  onMotionChange: (patch: Partial<SceneMediaMotion>) => void;
  /** Commit look-preset media writes without altering motion/keyframes. */
  onVisualEffectMediaChange?: (media: SceneMedia) => void;
  onReset: () => void;
}

function formatIntensity(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function easingLabel(easing: MediaMotionEasing | undefined): string {
  const match = MEDIA_MOTION_EASING_OPTIONS.find((option) => option.value === easing);
  return match?.label ?? "Linear";
}

/**
 * Shared Motion inspector for image and video — writes scene.media.motion only.
 * Presentation only; parent commits via buildMediaMotionPatch + intent media.
 */
export default function MediaMotionInspectorPanel({
  controlId,
  motion,
  media,
  disabled = false,
  mediaWindowDurationMs = 0,
  mediaItemId = null,
  requiresMediaItemSelection = false,
  onMotionChange,
  onVisualEffectMediaChange,
  onReset,
}: MediaMotionInspectorPanelProps) {
  const capabilitiesReady = useVisualRetentionCapabilitiesReady();
  const keyframedVisualEffectsEnabled = useKeyframedVisualEffectsEnabled();
  const keyframesCapable =
    capabilitiesReady && keyframedVisualEffectsEnabled === true;
  const authoringTarget = resolveMediaMotionAuthoringTarget({
    keyframedVisualEffectsEnabled: keyframesCapable ? true : false,
    requiresMediaItemSelection,
    mediaItemId,
    mediaWindowDurationMs,
  });
  const blockForSelection =
    keyframesCapable && authoringTarget.status === "needs_selection";
  const showKeyframeEditor = keyframesCapable && !blockForSelection;
  const showVisualEffectControls =
    keyframesCapable &&
    !blockForSelection &&
    !!media &&
    media.type !== "placeholder" &&
    typeof onVisualEffectMediaChange === "function";
  const enabled = motion.enabled !== false && motion.presetId !== "static";
  const presetId = motion.presetId ?? "static";
  const preset = getMediaMotionPreset(presetId);
  const intensity =
    typeof motion.intensity === "number" && Number.isFinite(motion.intensity)
      ? Math.min(MEDIA_MOTION_INTENSITY_MAX, Math.max(MEDIA_MOTION_INTENSITY_MIN, motion.intensity))
      : preset.defaultIntensity;
  const easing = (motion.easing ?? preset.defaultEasing ?? "linear") as MediaMotionEasing;

  const categoryPresets = MEDIA_MOTION_INSPECTOR_CATEGORIES;

  const summary = enabled
    ? `${preset.label} · Intensity ${intensity.toFixed(1)} · ${easingLabel(easing)}`
    : "Motion Disabled";

  const handleEnableChange = (nextEnabled: boolean) => {
    if (!nextEnabled) {
      onMotionChange({
        version: 1,
        enabled: false,
        presetId: "static",
        intensity: 0,
        easing: "linear",
        // Keep authored keyframes on the disabled record (dormant until re-enabled).
        ...(motion.keyframes ? { keyframes: motion.keyframes } : {}),
        startTransform: motion.startTransform,
        endTransform: motion.endTransform,
      });
      return;
    }

    // Re-enable with existing keyframes without replacing them with a preset.
    if (motion.keyframes && motion.keyframes.length >= 2) {
      onMotionChange({
        version: 1,
        enabled: true,
        presetId: presetId === "static" ? "custom" : presetId,
        intensity: intensity > 0 ? intensity : 1,
        easing,
        startTransform: motion.startTransform,
        endTransform: motion.endTransform,
        keyframes: motion.keyframes,
      });
      return;
    }

    const nextPresetId = presetId === "static" ? "slow-zoom-in" : presetId;
    const nextPreset = getMediaMotionPreset(nextPresetId);
    onMotionChange({
      version: 1,
      enabled: true,
      presetId: nextPreset.id,
      intensity: nextPreset.defaultIntensity > 0 ? nextPreset.defaultIntensity : 1,
      easing: nextPreset.defaultEasing,
      startTransform: nextPreset.startDelta,
      endTransform: nextPreset.endDelta,
      ...(motion.keyframes ? { keyframes: motion.keyframes } : {}),
    });
  };

  const handlePresetChange = (nextPresetId: string) => {
    if (nextPresetId === "static") {
      handleEnableChange(false);
      return;
    }
    const nextPreset = getMediaMotionPreset(nextPresetId);
    onMotionChange({
      version: 1,
      enabled: true,
      presetId: nextPreset.id,
      intensity: intensity > 0 ? intensity : nextPreset.defaultIntensity || 1,
      easing: motion.easing ?? nextPreset.defaultEasing,
      startTransform: nextPreset.startDelta,
      endTransform: nextPreset.endDelta,
    });
  };

  if (blockForSelection) {
    // Keyframes and look controls share the same selection gate.
    return (
      <div
        className="min-w-0 space-y-2"
        data-media-motion-panel="blocked"
        data-media-motion-target-status="needs_selection"
        data-media-motion-target-item=""
        data-media-motion-target-duration={String(authoringTarget.mediaWindowDurationMs)}
        data-media-visual-effect-controls="blocked"
      >
        <p className={studioSubtleText} role="status">
          {MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE}
        </p>
      </div>
    );
  }

  const targetItemAttr =
    authoringTarget.mediaItemId && authoringTarget.mediaItemId.length > 0
      ? authoringTarget.mediaItemId
      : "scene";

  return (
    <div
      className="space-y-3"
      data-media-motion-panel="true"
      data-media-motion-target-status={authoringTarget.status}
      data-media-motion-target-item={targetItemAttr}
      data-media-motion-target-duration={String(authoringTarget.mediaWindowDurationMs)}
    >
      <StudioSwitch
        id={`${controlId}-enable`}
        checked={enabled}
        disabled={disabled}
        onChange={(event) => handleEnableChange(event.target.checked)}
        data-media-motion-enable="true"
        label="Motion"
        description={summary}
      />

      {enabled ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor={`${controlId}-preset`} className={studioFieldLabel}>
              Preset
            </label>
            <select
              id={`${controlId}-preset`}
              className={studioSelectCompact}
              value={presetId}
              disabled={disabled}
              onChange={(event) => handlePresetChange(event.target.value)}
              data-media-motion-preset="true"
            >
              {categoryPresets.map((category) => (
                <optgroup key={category.id} label={category.label}>
                  {category.presetIds.map((id) => {
                    const entry = getMediaMotionPreset(id);
                    return (
                      <option key={id} value={id}>
                        {entry.label}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${controlId}-intensity`} className={studioFieldLabel}>
                Intensity
              </label>
              <span className="text-[10px] tabular-nums text-muted" data-media-motion-intensity-value>
                {formatIntensity(intensity)}
              </span>
            </div>
            <input
              id={`${controlId}-intensity`}
              type="range"
              min={MEDIA_MOTION_INTENSITY_MIN}
              max={MEDIA_MOTION_INTENSITY_MAX}
              step={MEDIA_MOTION_INTENSITY_STEP}
              value={intensity}
              disabled={disabled}
              onChange={(event) =>
                onMotionChange({
                  intensity: Number(event.target.value),
                  enabled: true,
                  presetId,
                })
              }
              data-media-motion-intensity="true"
              className="w-full accent-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${controlId}-easing`} className={studioFieldLabel}>
              Easing
            </label>
            <select
              id={`${controlId}-easing`}
              className={studioSelectCompact}
              value={easing}
              disabled={disabled}
              onChange={(event) =>
                onMotionChange({
                  easing: event.target.value as MediaMotionEasing,
                  enabled: true,
                  presetId,
                })
              }
              data-media-motion-easing="true"
            >
              {MEDIA_MOTION_EASING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {showKeyframeEditor ? (
            <MediaMotionKeyframeEditor
              controlId={`${controlId}-keyframes`}
              motion={motion}
              mediaWindowDurationMs={authoringTarget.mediaWindowDurationMs}
              mediaItemId={authoringTarget.mediaItemId}
              keyframedVisualEffectsEnabled
              disabled={disabled}
              requiresMediaItemSelection={false}
              onMotionCommit={(result) => {
                onMotionChange(result.motion);
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <p className={studioSubtleText}>Static media — enable motion to choose a preset.</p>
          {showKeyframeEditor ? (
            <MediaMotionKeyframeEditor
              controlId={`${controlId}-keyframes`}
              motion={motion}
              mediaWindowDurationMs={authoringTarget.mediaWindowDurationMs}
              mediaItemId={authoringTarget.mediaItemId}
              keyframedVisualEffectsEnabled
              disabled={disabled}
              requiresMediaItemSelection={false}
              onMotionCommit={(result) => {
                onMotionChange(result.motion);
              }}
            />
          ) : null}
        </>
      )}

      {showVisualEffectControls && media && onVisualEffectMediaChange ? (
        <MediaVisualEffectControls
          controlId={`${controlId}-look`}
          media={media}
          disabled={disabled}
          keyframedVisualEffectsEnabled
          requiresMediaItemSelection={false}
          mediaItemId={authoringTarget.mediaItemId}
          mediaWindowDurationMs={authoringTarget.mediaWindowDurationMs}
          onMediaCommit={(result) => {
            onVisualEffectMediaChange(result.media);
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className={studioSecondaryButton}
          disabled={disabled}
          onClick={onReset}
          data-media-motion-reset="true"
        >
          Reset Motion
        </button>
      </div>

      <p className={studioSubtleText}>{MEDIA_MOTION_HELPER_COPY}</p>
    </div>
  );
}
