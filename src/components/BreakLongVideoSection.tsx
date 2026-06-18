"use client";

import {
  AudioLines,
  Clapperboard,
  FileVideo,
  Scissors,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const COMING_SOON_MESSAGE =
  "Coming soon: FootieBitz will extract audio, detect key moments, generate captions, and create multiple shorts.";

const PIPELINE_STEPS = [
  { step: "1", title: "Upload video", icon: Upload },
  { step: "2", title: "Extract audio", icon: AudioLines },
  { step: "3", title: "Transcribe", icon: FileVideo },
  { step: "4", title: "Detect best moments", icon: Wand2 },
  { step: "5", title: "Generate short scripts", icon: Sparkles },
  { step: "6", title: "Export multiple clips", icon: Clapperboard },
] as const;

export default function BreakLongVideoSection() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);
  const managedBlobUrl = useRef<string | null>(null);

  const revokeVideoUrl = () => {
    if (managedBlobUrl.current) {
      URL.revokeObjectURL(managedBlobUrl.current);
      managedBlobUrl.current = null;
    }
  };

  const handleVideoUpload = (file: File | null) => {
    revokeVideoUrl();
    setAnalyzeMessage(null);

    if (!file) {
      setVideoUrl(null);
      setVideoName(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    managedBlobUrl.current = objectUrl;
    setVideoUrl(objectUrl);
    setVideoName(file.name);
  };

  useEffect(() => {
    return () => revokeVideoUrl();
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-xl shadow-black/25 backdrop-blur-md sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
            <Scissors className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
              Coming soon
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Break Long Video into Shorts
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Upload a full match or podcast clip and turn highlights into multiple
              vertical shorts.
            </p>
          </div>
        </div>
        <span className="self-start rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-300">
          UI preview
        </span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Source video
            </p>

            {videoUrl ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                  <video
                    src={videoUrl}
                    controls
                    className="aspect-video w-full bg-black object-contain"
                  >
                    Your browser does not support video preview.
                  </video>
                </div>
                {videoName && (
                  <p className="truncate text-xs text-zinc-500">{videoName}</p>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-violet-500/40 hover:text-white">
                  <Upload className="h-4 w-4" />
                  Replace video
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      handleVideoUpload(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-12 text-center transition hover:border-violet-500/40 hover:bg-violet-500/[0.04]">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20 transition group-hover:bg-violet-500/15">
                  <Upload className="h-6 w-6 text-violet-400" />
                </div>
                <p className="text-sm font-semibold text-zinc-200">Upload a video file</p>
                <p className="mt-1.5 text-xs text-zinc-500">MP4, MOV, or WEBM · processed in your browser</p>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    handleVideoUpload(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAnalyzeMessage(COMING_SOON_MESSAGE)}
            disabled={!videoUrl}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-6 py-3.5 text-sm font-bold text-violet-200 transition hover:border-violet-500/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Wand2 className="h-4 w-4" />
            Analyze Video
          </button>

          {analyzeMessage && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3.5">
              <p className="text-sm leading-relaxed text-violet-100/90">{analyzeMessage}</p>
            </div>
          )}
        </div>

        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Future pipeline
          </p>
          <ol className="space-y-2.5">
            {PIPELINE_STEPS.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.step}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#0a0f18]/80 px-4 py-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-bold text-violet-400 ring-1 ring-violet-500/20">
                    {item.step}
                  </span>
                  <Icon className="h-4 w-4 shrink-0 text-zinc-600" />
                  <span className="text-sm font-medium text-zinc-300">{item.title}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
            No OpenAI tokens used yet. Video analysis will run client-side or via
            dedicated APIs in a future release.
          </p>
        </div>
      </div>
    </section>
  );
}
