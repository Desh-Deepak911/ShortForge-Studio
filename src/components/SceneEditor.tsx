"use client";

import {
  ArrowLeftRight,
  ChevronRight,
  Clock,
  Layers,
  PlusCircle,
  SkipBack,
  SkipForward,
  Workflow,
} from "lucide-react";
import { useEffect, useRef } from "react";

import SceneStoryboardCard from "@/components/SceneStoryboardCard";
import TransitionConnector from "@/components/TransitionConnector";

import {
  createEmptyScene,
  duplicateScene,
} from "@/lib/timeline";
import {
  ensureTimelineItems,
  getSceneFromTimeline,
  getTransitionsFromTimeline,
  isTransitionTimelineItem,
} from "@/lib/timelineItems";
import {
  studioBadge,
  studioCompactButton,
  studioFieldLabel,
  studioPanel,
  studioSectionDesc,
  studioSectionTitle,
  studioStatBar,
  studioStepLabel,
  studioSubtleText,
} from "@/lib/studioUi";
import {
  applySceneUpdate,
  applyScenesUpdate,
  applyTransitionUpdate,
} from "@/lib/voiceover";
import type {
  FootieScene,
  FootieScript,
  SceneType,
  TransitionEffect,
} from "@/types/footiebitz";

const SCENE_TYPE_OPTIONS: { value: SceneType; label: string }[] = [
  { value: "intro", label: "Intro" },
  { value: "context", label: "Context" },
  { value: "match", label: "Match" },
  { value: "transition", label: "Transition" },
  { value: "ending", label: "Ending" },
];

interface SceneEditorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  /** Index of the scene currently selected in the preview (used for Add Transition). */
  selectedSceneIndex?: number;
  variant?: "default" | "storyboard";
}

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

export default function SceneEditor({
  script,
  onScriptChange,
  selectedSceneIndex,
  variant = "default",
}: SceneEditorProps) {
  const managedBlobUrls = useRef<Set<string>>(new Set());

  const scenes = script.scenes;
  const timelineItems = ensureTimelineItems(scenes, script.timelineItems);
  const totalDuration = script.totalDuration;
  const transitionCount = getTransitionsFromTimeline(timelineItems).length;
  const uploadedCount = scenes.filter((s) => s.uploadedImage).length;
  const uploadProgress = scenes.length
    ? Math.round((uploadedCount / scenes.length) * 100)
    : 0;

  // Commit an updated scene array — recalculates timings then syncs timeline state.
  const commitScenes = (next: FootieScene[]) => {
    onScriptChange(applyScenesUpdate(script, next));
  };

  const updateScene = (id: string, patch: Partial<FootieScene>) => {
    onScriptChange(applySceneUpdate(script, id, patch));
  };

  const updateTransition = (
    id: string,
    patch: { effect?: TransitionEffect; durationMs?: number },
  ) => {
    onScriptChange(applyTransitionUpdate(script, id, patch));
  };

  // ── Quick buffer scene inserts ───────────────────────────────────────────────

  const addIntroBuffer = () => {
    const intro = { ...createEmptyScene("intro"), duration: 3, subtitle: "Intro" };
    commitScenes([intro, ...scenes]);
  };

  const addContextBuffer = () => {
    const context = { ...createEmptyScene("context"), duration: 4, subtitle: "Context" };
    const insertAt = Math.min(1, scenes.length);
    const next = [...scenes];
    next.splice(insertAt, 0, context);
    commitScenes(next);
  };

  const addTransitionBuffer = () => {
    const transition = { ...createEmptyScene("transition"), duration: 2, subtitle: "Transition" };
    // Insert after selectedSceneIndex if valid, otherwise append.
    const insertAfter =
      selectedSceneIndex !== undefined && selectedSceneIndex >= 0 && selectedSceneIndex < scenes.length
        ? selectedSceneIndex
        : scenes.length - 1;
    const next = [...scenes];
    next.splice(insertAfter + 1, 0, transition);
    commitScenes(next);
  };

  const addEndingBuffer = () => {
    const ending = { ...createEmptyScene("ending"), duration: 4, subtitle: "Ending" };
    commitScenes([...scenes, ending]);
  };

  // ── Scene order / structure operations ──────────────────────────────────────

  const addBefore = (index: number) => {
    const next = [...scenes];
    next.splice(index, 0, createEmptyScene("transition"));
    commitScenes(next);
  };

  const addAfter = (index: number) => {
    const next = [...scenes];
    next.splice(index + 1, 0, createEmptyScene("transition"));
    commitScenes(next);
  };

  const duplicate = (index: number) => {
    const next = [...scenes];
    next.splice(index + 1, 0, duplicateScene(scenes[index]));
    commitScenes(next);
  };

  const deleteScene = (index: number) => {
    if (scenes.length <= 1) return;
    const removed = scenes[index];
    const imgUrl = removed.uploadedImage;
    // Only revoke the blob URL if no other scene shares it (e.g. after a duplicate).
    const isShared = imgUrl && scenes.some((s, i) => i !== index && s.uploadedImage === imgUrl);
    if (!isShared) revokeBlobUrl(imgUrl);
    commitScenes(scenes.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...scenes];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    commitScenes(next);
  };

  const moveDown = (index: number) => {
    if (index === scenes.length - 1) return;
    const next = [...scenes];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    commitScenes(next);
  };

  // ── Image helpers ────────────────────────────────────────────────────────────

  const revokeBlobUrl = (url: string | undefined) => {
    if (url && isBlobUrl(url) && managedBlobUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      managedBlobUrls.current.delete(url);
    }
  };

  const handleImageUpload = (id: string, file: File | null) => {
    if (!file) return;
    const existing = scenes.find((s) => s.id === id)?.uploadedImage;
    revokeBlobUrl(existing);

    try {
      const objectUrl = URL.createObjectURL(file);
      managedBlobUrls.current.add(objectUrl);
      updateScene(id, { uploadedImage: objectUrl });
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        updateScene(id, { uploadedImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (id: string) => {
    const existing = scenes.find((s) => s.id === id)?.uploadedImage;
    revokeBlobUrl(existing);
    updateScene(id, { uploadedImage: undefined });
  };

  useEffect(() => {
    const blobs = managedBlobUrls.current;
    return () => {
      blobs.forEach((url) => URL.revokeObjectURL(url));
      blobs.clear();
    };
  }, []);

  const isStoryboard = variant === "storyboard";

  return (
    <div className={isStoryboard ? "space-y-4 sm:space-y-6" : "space-y-5 sm:space-y-7"}>
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={studioStepLabel}>{isStoryboard ? "Timeline" : "Step 3"}</p>
          <h2 className={studioSectionTitle}>
            {isStoryboard ? "Scene timeline" : "Production Timeline"}
          </h2>
          {!isStoryboard ? (
            <p className={studioSectionDesc}>
              Adjust timing, subtitles, and images. Add, remove, or reorder scenes freely.
            </p>
          ) : (
            <p className={studioSectionDesc}>
              Scenes stack vertically — adjust timing, subtitles, images, and transitions.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className={studioBadge}>
            <Layers className="h-3.5 w-3.5" />
            {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}
          </span>
          {transitionCount > 0 && (
            <span className={studioBadge}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {transitionCount} {transitionCount === 1 ? "transition" : "transitions"}
            </span>
          )}
          <span className={studioBadge}>
            <Clock className="h-3.5 w-3.5" />
            {totalDuration}s
          </span>
        </div>
      </div>

      {/* ── Helper note ── */}
      {isStoryboard ? (
        <details className={`${studioPanel} group`}>
          <summary className={`${studioSubtleText} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <span className="font-medium text-foreground/80">About the timeline</span>
            <span className="ml-2 text-muted/80 group-open:hidden">· Show tips</span>
          </summary>
          <div className={`${studioSubtleText} mt-3 space-y-1.5`}>
            <p>
              FootieBitz creates a first draft timeline. Add intro, context, transition, or ending
              scenes to better match your narration.
            </p>
            <p>
              Visual scenes do not change the narration. Transitions between scenes are visual only.
            </p>
          </div>
        </details>
      ) : (
        <div className={`${studioPanel} space-y-1.5 ${studioSubtleText}`}>
          <p>
            FootieBitz creates a first draft timeline. You can add intro, context, transition, or
            ending scenes to better match your narration.
          </p>
          <p>
            Visual scenes do not change the narration. They control when images and subtitles appear.
            Transitions between scenes are visual only — no narration or media required.
          </p>
        </div>
      )}

      {/* ── Quick buffer inserts ── */}
      <div className={studioPanel}>
        <div className="mb-2.5 flex items-center gap-2 sm:mb-3">
          <Workflow className="h-3.5 w-3.5 text-muted" />
          <p className={`${studioFieldLabel} mb-0`}>Quick add</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button type="button" onClick={addIntroBuffer} title="Insert a 3s intro scene at the beginning" className={studioCompactButton}>
            <SkipBack className="h-3.5 w-3.5" />
            Add Intro Buffer
          </button>

          <button type="button" onClick={addContextBuffer} title="Insert a 4s context scene after the first scene" className={studioCompactButton}>
            <PlusCircle className="h-3.5 w-3.5" />
            Add Context Buffer
          </button>

          <button
            type="button"
            onClick={addTransitionBuffer}
            title={
              selectedSceneIndex !== undefined
                ? `Insert a 2s transition after scene ${selectedSceneIndex + 1}`
                : "Insert a 2s transition at the end"
            }
            className={studioCompactButton}
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Add Transition
          </button>

          <button type="button" onClick={addEndingBuffer} title="Append a 4s ending scene at the end" className={studioCompactButton}>
            <SkipForward className="h-3.5 w-3.5" />
            Add Ending
          </button>
        </div>
      </div>

      {/* ── Total timeline duration ── */}
      <div className={`${studioStatBar} flex items-center justify-between`}>
        <span className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <Clock className="h-4 w-4 text-muted" />
          Total timeline
        </span>
        <span className="font-mono text-sm font-semibold text-foreground/90">
          {totalDuration}s
        </span>
      </div>

      {/* ── Upload progress ── */}
      <div className={`${studioStatBar} p-4`}>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-muted">Images uploaded</span>
          <span className="text-accent">
            {uploadedCount}/{scenes.length}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent/55 to-accent/35 transition-all duration-500"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>

      {/* ── Timeline list ── */}
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:gap-6">
        {timelineItems.map((item) => {
          if (isTransitionTimelineItem(item)) {
            return (
              <TransitionConnector
                key={item.id}
                item={item}
                onUpdate={(patch) => updateTransition(item.id, patch)}
              />
            );
          }

          const scene =
            getSceneFromTimeline(timelineItems, item.scene.id) ??
            scenes.find((entry) => entry.id === item.scene.id) ??
            item.scene;
          const index = scenes.findIndex((s) => s.id === scene.id);
          if (index < 0) return null;

          return (
            <div key={item.id} className="relative">
              <SceneStoryboardCard
                scene={scene}
                index={index}
                sceneCount={scenes.length}
                onUpdate={(patch) => updateScene(scene.id, patch)}
                onImageUpload={(file) => handleImageUpload(scene.id, file)}
                onRemoveImage={() => removeImage(scene.id)}
                onAddBefore={() => addBefore(index)}
                onAddAfter={() => addAfter(index)}
                onDuplicate={() => duplicate(index)}
                onMoveUp={() => moveUp(index)}
                onMoveDown={() => moveDown(index)}
                onDelete={() => deleteScene(index)}
                sceneTypeOptions={SCENE_TYPE_OPTIONS}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
