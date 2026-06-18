"use client";

import { ChevronLeft, ChevronRight, Play, Smartphone } from "lucide-react";

import type { FootieScript } from "@/types/footiebitz";

interface VideoPreviewProps {
  script: FootieScript | null;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
}

export default function VideoPreview({
  script,
  selectedSceneIndex,
  onSelectedSceneChange,
}: VideoPreviewProps) {
  const scenes = script?.scenes ?? [];
  const sceneCount = scenes.length;
  const safeIndex = sceneCount > 0 ? Math.min(selectedSceneIndex, sceneCount - 1) : 0;
  const scene = scenes[safeIndex];

  const goPrevious = () => {
    if (safeIndex > 0) onSelectedSceneChange(safeIndex - 1);
  };

  const goNext = () => {
    if (safeIndex < sceneCount - 1) onSelectedSceneChange(safeIndex + 1);
  };

  if (!script || sceneCount === 0) {
    return (
      <div className="relative mx-auto w-full max-w-[300px]">
        <div className="rounded-[2rem] border border-white/10 bg-[#0a0f18] p-3 shadow-2xl shadow-black/40">
          <div className="flex aspect-[9/16] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-gradient-to-b from-emerald-950/30 via-[#0a0f18] to-black px-8 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <Smartphone className="h-7 w-7 text-emerald-400/70" />
            </div>
            <p className="text-sm font-semibold text-zinc-300">Preview your short</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Generate a script and your 9:16 storyboard will appear here scene by scene.
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-500">
              <Play className="h-3 w-3" />
              Visual preview only
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[300px] flex-col gap-5">
      <div className="rounded-[2rem] border border-white/10 bg-[#0a0f18] p-3 shadow-2xl shadow-black/50 ring-1 ring-white/5">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[1.5rem] bg-black">
          <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
            <div className="h-1 w-16 rounded-full bg-white/20" />
          </div>

          {scene.uploadedImage ? (
            <img
              src={scene.uploadedImage}
              alt={`Scene ${safeIndex + 1}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-emerald-950/80 via-zinc-900 to-black px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Smartphone className="h-5 w-5 text-emerald-400/60" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">
                Awaiting image
              </p>
              <p className="mt-3 line-clamp-5 text-[11px] leading-relaxed text-zinc-500">
                {scene.imagePrompt}
              </p>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-black/55" />

          <div className="absolute inset-x-0 top-0 z-10 p-5 pt-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">
              FootieBitz
            </p>
            <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-white">
              {script.title}
            </h3>
            {script.hook && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-300/90">
                {script.hook}
              </p>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 p-5">
            <p className="text-center text-[15px] font-bold leading-snug text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
              {scene.subtitle}
            </p>
            <p className="mt-2 text-center text-[10px] font-medium text-zinc-400">
              Scene {safeIndex + 1} · {scene.duration}s
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {scenes.map((s, index) => (
          <button
            key={`${s.id}-${index}`}
            type="button"
            onClick={() => onSelectedSceneChange(index)}
            aria-label={`Scene ${index + 1}`}
            aria-current={index === safeIndex ? "true" : undefined}
            className={`rounded-full transition-all duration-200 ${
              index === safeIndex
                ? "h-2 w-7 bg-emerald-400 shadow-sm shadow-emerald-400/40"
                : s.uploadedImage
                  ? "h-2 w-2 bg-emerald-500/50 hover:bg-emerald-400/70"
                  : "h-2 w-2 bg-white/20 hover:bg-white/35"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrevious}
          disabled={safeIndex === 0}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <span className="shrink-0 rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-400">
          {safeIndex + 1}/{sceneCount}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex >= sceneCount - 1}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
