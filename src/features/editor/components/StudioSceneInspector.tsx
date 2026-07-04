"use client";

import { ImagePlus, Timer, Trash2, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearPendingSceneCaptionDraft,
  registerPendingSceneCaptionDraft,
  registerSceneCaptionDraftCancel,
} from "@/features/editor/scene-caption-drafts/scene-caption-draft-registry";

import InspectorEmptyState from "@/components/studio-shell/InspectorEmptyState";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import StudioAccordion from "@/components/studio-shell/StudioAccordion";
import CaptionModeControl from "@/features/editor/components/CaptionModeControl";
import CreatorAssetStudio from "@/features/editor/components/creator-asset-studio/CreatorAssetStudio";
import SceneImageInspector from "@/features/editor/components/SceneImageInspector";
import SceneImageMotionControl from "@/features/editor/components/SceneImageMotionControl";
import {
  buildSceneCaptionPresetPatch,
  buildSceneSubtitleEffectPatch,
  CaptionPresetPanel,
} from "@/features/caption-engine";
import SubtitleEffectControl from "@/features/editor/components/SubtitleEffectControl";
import TransitionCard from "@/features/editor/components/TransitionCard";
import SmartEditImageAction, {
  SMART_EDIT_HAS_IMAGE_COPY,
} from "@/features/tool/components/SmartEditImageAction";
import { useSceneImageUpload } from "@/features/editor/hooks/useSceneImageUpload";
import { useInspectorContext } from "@/features/editor/inspector/InspectorContext";
import { useEditorSelection } from "@/features/editor/selection";
import { resolveSafeSceneIndex } from "@/features/editor/selection/selection.utils";
import {
  buildCaptionModeSwitchPatch,
  DEFAULT_SCENE_SUBTITLE,
  ensureTimelineItems,
  getSceneImage,
  isTransitionTimelineItem,
  normalizeCaptionMode,
  sceneHasImage,
  type SceneImageTransformPatch,
} from "@/features/story/utils";
import {
  formatDisplayDurationSec,
  formatDisplayTimeRangeSec,
} from "@/lib/utils/formatDisplayDuration.utils";
import {
  studioBadge,
  studioDestructiveButton,
  studioFieldLabel,
  studioInputCompact,
  studioInspectorStack,
  studioInspectorSummaryStrip,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioStoryboardMeta,
  studioStoryboardScenePill,
  studioSubtleText,
  studioTextarea,
  studioUploadButton,
  studioUploadZone,
} from "@/lib/utils/studioUi";
import {
  applyResetSceneImageSettings,
  applySceneImageSettings,
  applySceneUpdate,
  applyTransitionUpdate,
} from "@/lib/utils/voiceover";
import type {
  CaptionMode,
  FootieScript,
  SceneImage,
  SceneType,
  TransitionTimelineItem,
} from "@/features/story/types";
import type { TimelineItem } from "@/features/story/types";

const SCENE_TYPE_OPTIONS: { value: SceneType; label: string }[] = [
  { value: "intro", label: "Intro" },
  { value: "context", label: "Context" },
  { value: "match", label: "Match" },
  { value: "transition", label: "Transition" },
  { value: "ending", label: "Ending" },
];

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  intro: "Intro",
  context: "Context",
  match: "Match",
  transition: "Transition",
  ending: "Ending",
};

const CAPTION_FIELD_DEBOUNCE_MS = 300;

function resolvePlaceholderCaptionInput(storedValue: string, inputValue: string): string {
  if (storedValue.trim() !== DEFAULT_SCENE_SUBTITLE) {
    return inputValue;
  }

  if (inputValue === DEFAULT_SCENE_SUBTITLE) {
    return inputValue;
  }

  if (inputValue.startsWith(DEFAULT_SCENE_SUBTITLE)) {
    const withoutPlaceholder = inputValue.slice(DEFAULT_SCENE_SUBTITLE.length);
    return withoutPlaceholder.length > 0 ? withoutPlaceholder : inputValue;
  }

  return inputValue;
}

function useDebouncedSceneFieldCommit(
  sceneId: string,
  onCommit: (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => void,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{
    sceneId: string;
    patch: Partial<FootieScript["scenes"][number]>;
  } | null>(null);

  const cancelPending = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const pending = pendingRef.current;
    if (!pending) {
      return;
    }

    onCommit(pending.sceneId, pending.patch);
    clearPendingSceneCaptionDraft(pending.sceneId);
    pendingRef.current = null;
  }, [onCommit]);

  const schedule = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      pendingRef.current = { sceneId: targetSceneId, patch };
      registerPendingSceneCaptionDraft(targetSceneId, patch);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        flush();
      }, CAPTION_FIELD_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    return registerSceneCaptionDraftCancel(cancelPending);
  }, [cancelPending]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [sceneId, flush]);

  return { schedule, flush };
}

interface SceneCaptionTextFieldsProps {
  scene: FootieScript["scenes"][number];
  isSubtitlesMode: boolean;
  onCommit: (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => void;
}

function SceneCaptionTextFields({ scene, isSubtitlesMode, onCommit }: SceneCaptionTextFieldsProps) {
  const { schedule, flush } = useDebouncedSceneFieldCommit(scene.id, onCommit);
  const [generatedCaptionDraft, setGeneratedCaptionDraft] = useState(scene.subtitle ?? "");
  const [subtitleTextDraft, setSubtitleTextDraft] = useState(
    scene.subtitleText || scene.narration || "",
  );

  if (isSubtitlesMode) {
    return (
      <div>
        <label htmlFor={`inspector-subtitle-text-${scene.id}`} className={studioFieldLabel}>
          Subtitle text
        </label>
        <textarea
          id={`inspector-subtitle-text-${scene.id}`}
          value={subtitleTextDraft}
          onChange={(event) => {
            const next = resolvePlaceholderCaptionInput(
              scene.subtitleText || scene.narration || "",
              event.target.value,
            );
            setSubtitleTextDraft(next);
            schedule(scene.id, { subtitleText: next });
          }}
          onBlur={flush}
          rows={3}
          placeholder="On-screen subtitle for this scene"
          className={`${studioTextarea} mt-1.5 min-h-[4.5rem]`}
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`inspector-caption-${scene.id}`} className={studioFieldLabel}>
        Caption
      </label>
      <textarea
        id={`inspector-caption-${scene.id}`}
        value={generatedCaptionDraft}
        onChange={(event) => {
          const next = resolvePlaceholderCaptionInput(scene.subtitle, event.target.value);
          setGeneratedCaptionDraft(next);
          schedule(scene.id, { subtitle: next });
        }}
        onBlur={flush}
        rows={3}
        placeholder="On-screen text for this scene"
        className={`${studioTextarea} mt-1.5 min-h-[4.5rem]`}
      />
    </div>
  );
}

export interface StudioSceneInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

function formatTimeRange(start: number, end: number): string {
  return formatDisplayTimeRangeSec(start, end);
}

function getTransitionAfterScene(
  timelineItems: TimelineItem[],
  sceneId: string,
): TransitionTimelineItem | null {
  const sceneItemIndex = timelineItems.findIndex(
    (item) => item.type === "scene" && item.id === sceneId,
  );

  if (sceneItemIndex < 0 || sceneItemIndex >= timelineItems.length - 1) {
    return null;
  }

  const nextItem = timelineItems[sceneItemIndex + 1];
  return isTransitionTimelineItem(nextItem) ? nextItem : null;
}

function resolveSceneStatus(scene: FootieScript["scenes"][number]): string {
  if (scene.sceneType) {
    return SCENE_TYPE_LABELS[scene.sceneType];
  }

  if (sceneHasImage(scene)) {
    return "Image ready";
  }

  return "Needs image";
}

/**
 * Context-aware scene inspector — reuses existing editor controls for the selected scene.
 */
export default function StudioSceneInspector({
  script,
  onScriptChange,
}: StudioSceneInspectorProps) {
  const { selectedSceneIndex, inspectorImageEditing } = useEditorSelection();
  const { assetPlanning, creatorAssetStudioVisible } = useInspectorContext();
  const { replaceSceneImage, removeSceneImage } = useSceneImageUpload({ script, onScriptChange });
  const scenes = script.scenes;
  const timelineItems = ensureTimelineItems(scenes, script.timelineItems);
  const safeIndex = resolveSafeSceneIndex(scenes, selectedSceneIndex);
  const scene = safeIndex >= 0 ? scenes[safeIndex] : null;

  const commitScenePatch = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      onScriptChange(applySceneUpdate(script, targetSceneId, patch));
    },
    [onScriptChange, script],
  );

  const updateScene = useCallback(
    (targetSceneId: string, patch: Partial<FootieScript["scenes"][number]>) => {
      onScriptChange(applySceneUpdate(script, targetSceneId, patch));
    },
    [onScriptChange, script],
  );

  const handleImageSettingsChange = useCallback(
    (sceneId: string, updates: SceneImageTransformPatch | SceneImage) => {
      onScriptChange(applySceneImageSettings(script, sceneId, updates));
    },
    [onScriptChange, script],
  );

  const handleImageReset = useCallback(
    (sceneId: string) => {
      onScriptChange(applyResetSceneImageSettings(script, sceneId));
    },
    [onScriptChange, script],
  );

  const updateTransition = useCallback(
    (transitionId: string, patch: { effect?: TransitionTimelineItem["effect"]; durationMs?: number }) => {
      onScriptChange(applyTransitionUpdate(script, transitionId, patch));
    },
    [onScriptChange, script],
  );

  const sceneId = scene?.id;

  const handleImageTransformChange = useCallback(
    (patch: SceneImageTransformPatch) => {
      if (!sceneId) {
        return;
      }
      handleImageSettingsChange(sceneId, patch);
    },
    [handleImageSettingsChange, sceneId],
  );

  const handleFitModeChange = useCallback(
    (fitMode: NonNullable<SceneImage["fitMode"]>) => {
      if (!sceneId) {
        return;
      }
      handleImageSettingsChange(sceneId, { fitMode });
    },
    [handleImageSettingsChange, sceneId],
  );

  const handleImageMotionChange = useCallback(
    (patch: Partial<NonNullable<SceneImage["imageMotion"]>>) => {
      if (!sceneId) {
        return;
      }
      handleImageSettingsChange(sceneId, { imageMotion: patch });
    },
    [handleImageSettingsChange, sceneId],
  );

  const handleCaptionModeChange = useCallback(
    (mode: CaptionMode) => {
      if (!sceneId || !scene) {
        return;
      }
      updateScene(sceneId, buildCaptionModeSwitchPatch(scene, mode));
    },
    [scene, sceneId, updateScene],
  );

  const handleImageUpload = (uploadSceneId: string, file: File | null) => {
    if (!file) {
      return;
    }

    replaceSceneImage(uploadSceneId, file);
  };

  const removeImage = (removeSceneId: string) => {
    removeSceneImage(removeSceneId);
  };

  if (!scene || safeIndex < 0 || !sceneId) {
    return <InspectorEmptyState />;
  }

  const sceneImage = getSceneImage(scene);
  const hasImage = sceneHasImage(scene);
  const captionMode = normalizeCaptionMode(scene.captionMode);
  const isSubtitlesMode = captionMode === "subtitles";
  const transitionAfterScene = getTransitionAfterScene(timelineItems, sceneId);

  return (
    <div className={`${studioInspectorStack} pb-1`}>
      <div className={studioInspectorSummaryStrip}>
        <div className="flex items-start gap-2.5">
          <span className={studioStoryboardScenePill} aria-label={`Scene ${safeIndex + 1}`}>
            {safeIndex + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight text-foreground/95">
              Scene {safeIndex + 1}
            </p>
            <p className={`${studioStoryboardMeta} mt-0.5`}>
              {formatTimeRange(scene.start, scene.end)} · {formatDisplayDurationSec(scene.duration)}
            </p>
            <span className={`${studioBadge} mt-2 inline-flex`}>{resolveSceneStatus(scene)}</span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-border/15 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Timer className="h-3.5 w-3.5 text-muted" aria-hidden />
            <label htmlFor={`inspector-duration-${scene.id}`} className={studioFieldLabel}>
              Duration
            </label>
            <input
              id={`inspector-duration-${scene.id}`}
              type="number"
              min={1}
              max={20}
              value={scene.duration}
              onChange={(event) => {
                const raw = Number(event.target.value);
                const clamped = Math.min(20, Math.max(1, Math.round(raw)));
                updateScene(scene.id, {
                  duration: Number.isFinite(raw) && raw > 0 ? clamped : scene.duration,
                });
              }}
              className={`${studioInputCompact} w-14 min-h-[2rem]`}
            />
            <span className="text-[11px] text-muted">sec</span>
          </div>
          <p className={`${studioSubtleText} text-[11px] leading-snug`}>
            Drag scene edges on the timeline for faster timing edits.
          </p>
        </div>

        <div className="mt-3">
          <label htmlFor={`inspector-scene-type-${scene.id}`} className={studioFieldLabel}>
            Scene type
          </label>
          <div className="relative mt-1.5 w-full">
            <select
              id={`inspector-scene-type-${scene.id}`}
              value={scene.sceneType ?? ""}
              onChange={(event) =>
                updateScene(scene.id, {
                  sceneType: event.target.value ? (event.target.value as SceneType) : undefined,
                })
              }
              className={studioSelectCompact}
            >
              <option value="">General</option>
              {SCENE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} aria-hidden />
          </div>
        </div>
      </div>

      <InspectorSection
        title="Image"
        description="Upload, frame, zoom, and position."
        defaultOpen
        open={inspectorImageEditing ? true : undefined}
      >
        {hasImage ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <SmartEditImageAction hasImage buttonOnly sceneId={scene.id} />
              <label className={studioUploadButton}>
                <ImagePlus className="h-3.5 w-3.5" />
                Replace
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    handleImageUpload(scene.id, event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => removeImage(scene.id)}
                className={studioDestructiveButton}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
            <p className={studioSubtleText}>{SMART_EDIT_HAS_IMAGE_COPY}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className={studioUploadZone}>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated/50 ring-1 ring-border/25">
                <ImagePlus className="h-4 w-4 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground/85">Add scene image</p>
              <p className="mt-1 text-xs text-muted">Portrait 9:16 · PNG, JPG, or WEBP</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  handleImageUpload(scene.id, event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
            <SmartEditImageAction hasImage={false} sceneId={scene.id} />
          </div>
        )}

        {sceneImage ? (
          <SceneImageInspector
            variant="standalone"
            showHeader={false}
            hideMotion
            showSmartEdit={false}
            controlId={`inspector-scene-image-zoom-${scene.id}`}
            scale={sceneImage.scale}
            fitMode={sceneImage.fitMode}
            imageMotion={sceneImage.imageMotion}
            onScaleChange={(scale) => handleImageTransformChange({ scale })}
            onFitModeChange={handleFitModeChange}
            onMotionChange={handleImageMotionChange}
            onReset={() => handleImageReset(scene.id)}
          />
        ) : (
          <p className={studioSubtleText}>Add an image to adjust frame, zoom, and position.</p>
        )}
      </InspectorSection>

      <InspectorSection
        title="Motion"
        description="Pan and zoom animation presets."
        defaultOpen
        open={inspectorImageEditing ? true : undefined}
      >
        {sceneImage ? (
          <SceneImageMotionControl
            variant="inspector"
            controlId={`inspector-scene-image-motion-${scene.id}`}
            imageMotion={sceneImage.imageMotion}
            onMotionChange={handleImageMotionChange}
          />
        ) : (
          <p className={studioSubtleText}>Add an image to configure motion.</p>
        )}
      </InspectorSection>

      <InspectorSection
        title="Captions"
        description="On-screen text and subtitle style."
        open={inspectorImageEditing ? false : undefined}
      >
        <CaptionModeControl value={captionMode} onChange={handleCaptionModeChange} />

        {isSubtitlesMode ? (
          <>
            <CaptionPresetPanel
              compact
              captionPreset={scene.captionPreset}
              subtitleEffect={scene.subtitleEffect}
              onPresetSelect={(presetId) =>
                updateScene(scene.id, buildSceneCaptionPresetPatch(presetId))
              }
            />
            <StudioAccordion variant="nested" title="Advanced subtitle effect">
              <SubtitleEffectControl
                value={scene.subtitleEffect}
                onChange={(effect) =>
                  updateScene(scene.id, buildSceneSubtitleEffectPatch(effect))
                }
              />
            </StudioAccordion>
            <SceneCaptionTextFields
              key={scene.id}
              scene={scene}
              isSubtitlesMode={isSubtitlesMode}
              onCommit={commitScenePatch}
            />
          </>
        ) : (
          <SceneCaptionTextFields
            key={scene.id}
            scene={scene}
            isSubtitlesMode={false}
            onCommit={commitScenePatch}
          />
        )}
      </InspectorSection>

      <InspectorSection
        title="Transition"
        description="Effect to the next scene."
        open={inspectorImageEditing ? false : undefined}
      >
        {transitionAfterScene ? (
          <TransitionCard
            variant="inline"
            item={transitionAfterScene}
            onUpdate={(patch) => updateTransition(transitionAfterScene.id, patch)}
          />
        ) : (
          <p className={studioSubtleText}>No transition after this scene.</p>
        )}
      </InspectorSection>

      <InspectorSection
        title="Narration"
        description="Voiceover timing for this scene."
        open={inspectorImageEditing ? false : undefined}
      >
        <div className="rounded-xl bg-background/25 px-3 py-3 ring-1 ring-border/30">
          <p className="text-sm leading-relaxed text-foreground/90">
            Plays during voiceover at{" "}
            <span className="font-medium tabular-nums">{formatTimeRange(scene.start, scene.end)}</span>
          </p>
          <p className={`${studioSubtleText} mt-1.5`}>
            Visuals and captions appear while story narration continues. Click the image on the
            preview to adjust focus when playback is stopped.
          </p>
        </div>
      </InspectorSection>

      {creatorAssetStudioVisible ? (
        <CreatorAssetStudio sceneIndex={safeIndex} planning={assetPlanning ?? null} compact />
      ) : null}
    </div>
  );
}
