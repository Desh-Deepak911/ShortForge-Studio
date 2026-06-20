"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  ImagePlus,
  PlusCircle,
  Timer,
  Trash2,
} from "lucide-react";

import {
  studioCompactButton,
  studioDestructiveButton,
  studioFieldLabel,
  studioInputCompact,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioStoryboardCard,
  studioStoryboardMediaFrame,
  studioStoryboardMeta,
  studioStoryboardScenePill,
  studioStoryboardSceneTitle,
  studioTextarea,
  studioUploadButton,
  studioUploadZone,
} from "@/lib/studioUi";
import type { FootieScene, SceneType } from "@/types/footiebitz";

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  intro: "Intro",
  context: "Context",
  match: "Match",
  transition: "Transition",
  ending: "Ending",
};

function formatTimeRange(start: number, end: number): string {
  return `${start}s – ${end}s`;
}

function getSceneTitle(scene: FootieScene, index: number): string {
  if (scene.sceneType) {
    return SCENE_TYPE_LABELS[scene.sceneType];
  }
  return `Scene ${index + 1}`;
}

export interface SceneStoryboardCardProps {
  scene: FootieScene;
  index: number;
  sceneCount: number;
  onUpdate: (patch: Partial<FootieScene>) => void;
  onImageUpload: (file: File | null) => void;
  onRemoveImage: () => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  sceneTypeOptions: { value: SceneType; label: string }[];
}

export default function SceneStoryboardCard({
  scene,
  index,
  sceneCount,
  onUpdate,
  onImageUpload,
  onRemoveImage,
  onAddBefore,
  onAddAfter,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  sceneTypeOptions,
}: SceneStoryboardCardProps) {
  const title = getSceneTitle(scene, index);

  return (
    <article className={studioStoryboardCard}>
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border/30 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
          <span className={studioStoryboardScenePill} aria-label={`Scene ${index + 1}`}>
            {index + 1}
          </span>
          <div className="min-w-0">
            <h3 className={studioStoryboardSceneTitle}>{title}</h3>
            <p className={`${studioStoryboardMeta} mt-0.5`}>
              {formatTimeRange(scene.start, scene.end)} · {scene.duration}s
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-muted sm:ml-auto">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          <label htmlFor={`duration-${scene.id}`} className="sr-only">
            Duration in seconds
          </label>
          <input
            id={`duration-${scene.id}`}
            type="number"
            min={1}
            max={20}
            value={scene.duration}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const clamped = Math.min(20, Math.max(1, Math.round(raw)));
              onUpdate({
                duration: Number.isFinite(raw) && raw > 0 ? clamped : scene.duration,
              });
            }}
            className={`${studioInputCompact} w-14 min-h-[2rem] sm:min-h-0`}
          />
          <span className="text-[11px] text-muted">sec</span>
        </div>
      </header>

      <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-5">
        {/* Media */}
        <section aria-label="Scene media">
          <p className={studioFieldLabel}>Media</p>
          {scene.uploadedImage ? (
            <div className="space-y-3">
              <div className={`${studioStoryboardMediaFrame} group`}>
                <img
                  src={scene.uploadedImage}
                  alt={`${title} visual`}
                  className="aspect-[9/16] max-h-56 w-full object-cover sm:aspect-[16/10] sm:max-h-52"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <label className={studioUploadButton}>
                  <ImagePlus className="h-3.5 w-3.5" />
                  Replace
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onImageUpload(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" onClick={onRemoveImage} className={studioDestructiveButton}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className={studioUploadZone}>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated/50 ring-1 ring-border/25">
                <ImagePlus className="h-4 w-4 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground/85">Attach image</p>
              <p className="mt-1 text-xs text-muted">PNG, JPG, or WEBP · 9:16 recommended</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onImageUpload(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </section>

        {/* Narration timing — read-only context for voiceover window */}
        <section aria-label="Narration timing">
          <p className={studioFieldLabel}>Narration</p>
          <div className="rounded-xl bg-background/25 px-3.5 py-3 ring-1 ring-border/30">
            <p className="text-sm leading-relaxed text-foreground/90">
              Plays during voiceover at{" "}
              <span className="font-medium tabular-nums">{formatTimeRange(scene.start, scene.end)}</span>
            </p>
            <p className={`${studioStoryboardMeta} mt-1.5`}>
              This scene&apos;s visuals and caption appear while the story narration continues.
            </p>
          </div>
        </section>

        {/* Caption — on-screen subtitle */}
        <section aria-label="Scene caption">
          <label htmlFor={`subtitle-${scene.id}`} className={studioFieldLabel}>
            Caption
          </label>
          <textarea
            id={`subtitle-${scene.id}`}
            value={scene.subtitle}
            onChange={(e) => onUpdate({ subtitle: e.target.value })}
            rows={3}
            placeholder="On-screen text for this scene"
            className={`${studioTextarea} min-h-[5rem]`}
          />
        </section>

        {/* Secondary: scene type */}
        <section aria-label="Scene type">
          <label htmlFor={`scene-type-${scene.id}`} className={studioFieldLabel}>
            Type
          </label>
          <div className="relative w-full max-w-xs">
            <select
              id={`scene-type-${scene.id}`}
              value={scene.sceneType ?? ""}
              onChange={(e) =>
                onUpdate({
                  sceneType: e.target.value ? (e.target.value as SceneType) : undefined,
                })
              }
              className={studioSelectCompact}
            >
              <option value="">General</option>
              {sceneTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronRight className={`${studioSelectChevronCompact} rotate-90`} />
          </div>
        </section>
      </div>

      {/* Footer controls — secondary */}
      <footer className="grid grid-cols-3 gap-1.5 border-t border-border/25 px-2.5 py-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1 sm:px-4">
        <button type="button" onClick={onAddBefore} title="Add scene before" className={studioCompactButton}>
          <PlusCircle className="h-3.5 w-3.5" />
          Before
        </button>
        <button type="button" onClick={onAddAfter} title="Add scene after" className={studioCompactButton}>
          <ChevronRight className="h-3.5 w-3.5" />
          After
        </button>
        <button type="button" onClick={onDuplicate} title="Duplicate scene" className={studioCompactButton}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
          className={studioCompactButton}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === sceneCount - 1}
          title="Move down"
          className={studioCompactButton}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={sceneCount <= 1}
          title="Delete scene"
          className={`${studioDestructiveButton} col-span-3 min-h-[2.25rem] justify-center sm:col-span-1 sm:ml-auto sm:min-h-0`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </footer>
    </article>
  );
}
