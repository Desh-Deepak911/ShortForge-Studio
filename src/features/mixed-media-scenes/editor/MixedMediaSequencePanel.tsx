"use client";

import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Trash2,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";

import { StudioNumberStepper } from "@/components/ui";
import { useEditorSelectionOptional } from "@/features/editor/selection";
import {
  readMixedMediaSequenceItems,
  reorderMixedMediaSequenceItem,
  updateMixedMediaSequenceBoundary,
  updateMixedMediaSequenceItemDuration,
} from "@/features/mixed-media-scenes";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  studioDestructiveButton,
  studioFieldLabel,
  studioSubtleText,
  studioUploadButton,
} from "@/lib/utils/studioUi";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";

import { useMixedMediaSequenceUpload } from "./useMixedMediaSequenceUpload";

export interface MixedMediaSequencePanelProps {
  readonly script: FootieScript;
  readonly scene: FootieScene;
  readonly onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  readonly mixedMediaScenesEnabled: boolean;
}

function commitScenePatch(
  script: FootieScript,
  sceneId: string,
  scene: FootieScene,
  onScriptChange: MixedMediaSequencePanelProps["onScriptChange"],
) {
  const next: FootieScript = {
    ...script,
    scenes: script.scenes.map((entry) => (entry.id === sceneId ? scene : entry)),
  };
  onScriptChange(next, { intent: "media" });
}

export default function MixedMediaSequencePanel({
  script,
  scene,
  onScriptChange,
  mixedMediaScenesEnabled,
}: MixedMediaSequencePanelProps) {
  const selection = useEditorSelectionOptional();
  const items = useMemo(() => readMixedMediaSequenceItems(scene), [scene]);
  const [warningText, setWarningText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = useMixedMediaSequenceUpload({
    script,
    scene,
    onScriptChange,
    mixedMediaScenesEnabled,
    onSelectMediaItem: (sceneId, mediaItemId) => {
      if (mediaItemId) {
        selection?.selectSceneMediaItem(sceneId, mediaItemId);
      }
    },
  });

  if (!mixedMediaScenesEnabled) {
    return null;
  }

  const showWarnings = (warnings: readonly { message: string }[]) => {
    const messages = warnings.map((warning) => warning.message);
    setWarningText(messages.length > 0 ? messages.slice(0, 3).join(" ") : null);
  };

  const handleReorder = (mediaItemId: string, toIndex: number) => {
    try {
      const result = reorderMixedMediaSequenceItem(scene, mediaItemId, toIndex, {
        mixedMediaScenesEnabled: true,
      });
      commitScenePatch(script, scene.id, result.scene, onScriptChange);
      if (result.selectedMediaItemId) {
        selection?.selectSceneMediaItem(scene.id, result.selectedMediaItemId);
      }
      showWarnings(result.warnings);
    } catch (error) {
      setWarningText(
        error instanceof Error ? error.message : "Could not reorder item.",
      );
    }
  };

  return (
    <div className="space-y-3" data-mixed-media-sequence-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground/85">
          Visual sequence · {items.length} item{items.length === 1 ? "" : "s"}
        </p>
        <label className={studioUploadButton}>
          <ImagePlus className="h-3.5 w-3.5" />
          Add image or video
          <input
            type="file"
            accept={upload.accept}
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              if (!file || busy) return;
              setBusy(true);
              void upload
                .appendMediaFile(file)
                .then((result) => showWarnings(result.warnings))
                .catch((error: unknown) => {
                  setWarningText(
                    error instanceof Error
                      ? error.message
                      : "Could not add media item.",
                  );
                })
                .finally(() => setBusy(false));
            }}
          />
        </label>
      </div>
      <p className={studioSubtleText}>
        Items play back-to-back inside this scene’s narration duration. The first
        item always starts at 0; later start times move the boundary with the
        previous item. Music does not control visual timing.
      </p>

      {items.length === 0 ? (
        <p className={studioSubtleText}>No visual items yet. Add an image or video.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const startSec = item.startOffsetMs / 1000;
            const durationSec = item.durationMs / 1000;
            return (
              <li
                key={item.id}
                className="rounded-xl bg-background/25 px-3 py-3 ring-1 ring-border/30"
                data-mixed-media-sequence-item={item.id}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground/90">
                    {index + 1}. {item.media.type === "video" ? "Video" : "Image"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={studioUploadButton}
                      aria-label="Move earlier"
                      disabled={index === 0 || busy}
                      onClick={() => handleReorder(item.id, index - 1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={studioUploadButton}
                      aria-label="Move later"
                      disabled={index >= items.length - 1 || busy}
                      onClick={() => handleReorder(item.id, index + 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={studioDestructiveButton}
                      aria-label="Remove item"
                      disabled={busy}
                      onClick={() => {
                        try {
                          const result = upload.removeOwnedMediaItem(item.id);
                          showWarnings(result.warnings);
                        } catch (error) {
                          setWarningText(
                            error instanceof Error
                              ? error.message
                              : "Could not remove item.",
                          );
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className={studioFieldLabel}>
                      {index === 0 ? "Start (fixed)" : "Boundary start (s)"}
                    </span>
                    {index === 0 ? (
                      <p
                        className="flex h-9 items-center rounded-xl border border-border/25 bg-background/30 px-3 text-sm text-foreground/80"
                        data-mixed-media-first-start-fixed
                      >
                        0.00
                      </p>
                    ) : (
                      <StudioNumberStepper
                        value={Number(startSec.toFixed(2))}
                        min={0}
                        step={0.1}
                        compact
                        inputMode="decimal"
                        aria-label={`Boundary start for item ${index + 1}`}
                        data-mixed-media-boundary-start={item.id}
                        onStepValue={(next) => {
                          try {
                            const result = updateMixedMediaSequenceBoundary(
                              scene,
                              item.id,
                              Math.round(next * 1000),
                              { mixedMediaScenesEnabled: true },
                            );
                            commitScenePatch(
                              script,
                              scene.id,
                              result.scene,
                              onScriptChange,
                            );
                            if (result.selectedMediaItemId) {
                              selection?.selectSceneMediaItem(
                                scene.id,
                                result.selectedMediaItemId,
                              );
                            }
                            showWarnings(result.warnings);
                          } catch (error) {
                            setWarningText(
                              error instanceof Error
                                ? error.message
                                : "Could not update boundary.",
                            );
                          }
                        }}
                      />
                    )}
                  </label>
                  <label className="space-y-1">
                    <span className={studioFieldLabel}>Duration (s)</span>
                    <StudioNumberStepper
                      value={Number(durationSec.toFixed(2))}
                      min={0.5}
                      step={0.1}
                      compact
                      inputMode="decimal"
                      aria-label={`Duration for item ${index + 1}`}
                      data-mixed-media-item-duration={item.id}
                      onStepValue={(next) => {
                        try {
                          const result = updateMixedMediaSequenceItemDuration(
                            scene,
                            item.id,
                            Math.round(next * 1000),
                            { mixedMediaScenesEnabled: true },
                          );
                          commitScenePatch(
                            script,
                            scene.id,
                            result.scene,
                            onScriptChange,
                          );
                          if (result.selectedMediaItemId) {
                            selection?.selectSceneMediaItem(
                              scene.id,
                              result.selectedMediaItemId,
                            );
                          }
                          showWarnings(result.warnings);
                        } catch (error) {
                          setWarningText(
                            error instanceof Error
                              ? error.message
                              : "Could not update duration.",
                          );
                        }
                      }}
                    />
                  </label>
                </div>
                {item.media.type === "video" ? (
                  <p className={`${studioSubtleText} mt-2 flex items-center gap-1`}>
                    <Video className="h-3.5 w-3.5" />
                    Video clip timing follows this sequence slot.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {warningText ? (
        <p
          className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-100 ring-1 ring-amber-400/30"
          data-mixed-media-sequence-warnings
        >
          {warningText}
        </p>
      ) : null}
    </div>
  );
}
