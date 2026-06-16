"use client";

import { Clock, ImagePlus, Layers, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import CopyButton from "@/components/CopyButton";
import type { FootieScene, FootieScript } from "@/types/footiebitz";

interface SceneEditorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

export default function SceneEditor({ script, onScriptChange }: SceneEditorProps) {
  const managedBlobUrls = useRef<Set<string>>(new Set());

  const totalDuration = script.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const uploadedCount = script.scenes.filter((s) => s.uploadedImage).length;
  const uploadProgress = script.scenes.length
    ? Math.round((uploadedCount / script.scenes.length) * 100)
    : 0;

  const updateScenes = (scenes: FootieScene[]) => {
    onScriptChange({ ...script, scenes });
  };

  const updateScene = (id: string, patch: Partial<FootieScene>) => {
    updateScenes(
      script.scenes.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)),
    );
  };

  const revokeBlobUrl = (url: string | undefined) => {
    if (url && isBlobUrl(url) && managedBlobUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      managedBlobUrls.current.delete(url);
    }
  };

  const handleImageUpload = (id: string, file: File | null) => {
    if (!file) return;

    const existing = script.scenes.find((scene) => scene.id === id)?.uploadedImage;
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
    const existing = script.scenes.find((scene) => scene.id === id)?.uploadedImage;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
            Step 3 · Storyboard
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Scene editor</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Edit subtitles, adjust timing, and upload one image per scene.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400">
            <Layers className="h-3.5 w-3.5" />
            {script.scenes.length} scenes
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            {totalDuration}s
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-[#0a0f18]/60 p-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-zinc-400">Image upload progress</span>
          <span className="text-emerald-400">{uploadedCount}/{script.scenes.length}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>

      <div className="space-y-5">
        {script.scenes.map((scene, index) => (
          <article
            key={scene.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f18] shadow-lg shadow-black/20"
          >
            <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-sm font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Scene {index + 1}</p>
                  <p className="text-xs text-zinc-500">{scene.duration}s on screen</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  scene.uploadedImage
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-white/5 text-zinc-500"
                }`}
              >
                {scene.uploadedImage ? "Ready" : "Needs image"}
              </span>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_120px]">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label
                      htmlFor={`subtitle-${scene.id}`}
                      className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500"
                    >
                      Subtitle
                    </label>
                    <CopyButton text={scene.subtitle} label="Copy" />
                  </div>
                  <textarea
                    id={`subtitle-${scene.id}`}
                    value={scene.subtitle}
                    onChange={(e) => updateScene(scene.id, { subtitle: e.target.value })}
                    rows={2}
                    placeholder="On-screen text for this scene"
                    className="w-full resize-none rounded-xl border border-white/10 bg-[#06080f] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`duration-${scene.id}`}
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500"
                  >
                    Duration
                  </label>
                  <input
                    id={`duration-${scene.id}`}
                    type="number"
                    min={3}
                    max={15}
                    value={scene.duration}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      updateScene(scene.id, {
                        duration: Number.isFinite(value) && value > 0 ? value : scene.duration,
                      });
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#06080f] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">seconds</p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-400/80">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI image prompt
                </div>
                <p className="text-sm leading-relaxed text-zinc-400">{scene.imagePrompt}</p>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Scene image
                </p>

                {scene.uploadedImage ? (
                  <div className="space-y-3">
                    <div className="group relative overflow-hidden rounded-xl border border-white/10">
                      <img
                        src={scene.uploadedImage}
                        alt={`Scene ${index + 1} uploaded preview`}
                        className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-emerald-500/40 hover:text-white">
                        <ImagePlus className="h-4 w-4" />
                        Replace
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleImageUpload(scene.id, e.target.files?.[0] ?? null);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeImage(scene.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/15"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-12 text-center transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 transition group-hover:bg-emerald-500/15">
                      <ImagePlus className="h-6 w-6 text-emerald-400" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-200">Drop or upload scene image</p>
                    <p className="mt-1.5 text-xs text-zinc-500">PNG, JPG, or WEBP · 9:16 recommended</p>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleImageUpload(scene.id, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
