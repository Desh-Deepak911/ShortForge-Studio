"use client";

import {
  ChevronDown,
  Clapperboard,
  Loader2,
  Sparkles,
  Trophy,
  Wand2,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import CopyButton from "@/components/CopyButton";
import ExportPanel from "@/components/ExportPanel";
import SceneEditor from "@/components/SceneEditor";
import VideoPreview from "@/components/VideoPreview";
import { formatFullScript, formatHashtags } from "@/lib/formatScript";
import type { FootieScript, GenerateScriptResponse, Tone } from "@/types/footiebitz";

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "dramatic", label: "Dramatic", description: "High stakes, cinematic" },
  { value: "funny", label: "Funny", description: "Witty and banter-led" },
  { value: "tactical", label: "Tactical", description: "Insight and analysis" },
  { value: "news", label: "News", description: "Headline-style recap" },
  { value: "emotional", label: "Emotional", description: "Passion and feeling" },
];

const DURATION_OPTIONS = [30, 45, 60] as const;

const SAMPLE_TOPICS = [
  "Real Madrid comeback",
  "Messi masterclass",
  "Champions League final drama",
  "Last-minute winner",
  "Derby day chaos",
  "Penalty shootout thriller",
] as const;

const WORKFLOW_STEPS = [
  { step: "01", title: "Describe the moment", desc: "Enter a match, goal, or talking point" },
  { step: "02", title: "Generate script", desc: "AI writes scenes, hooks, and captions" },
  { step: "03", title: "Upload & export", desc: "Add images and download your short" },
];

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-xl shadow-black/25 backdrop-blur-md sm:p-8 ${className}`}
    >
      {children}
    </section>
  );
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("dramatic");
  const [duration, setDuration] = useState<number>(30);
  const [script, setScript] = useState<FootieScript | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDuration =
    script?.scenes.reduce((sum, scene) => sum + scene.duration, 0) ?? 0;

  const previewSceneIndex =
    script && script.scenes.length > 0
      ? Math.min(selectedSceneIndex, script.scenes.length - 1)
      : 0;

  const generateScript = async () => {
    if (!topic.trim()) {
      setError("Enter a match or topic first.");
      return;
    }

    setLoading(true);
    setError(null);
    setScript(null);
    setSelectedSceneIndex(0);

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), tone, duration }),
      });

      let data: GenerateScriptResponse;
      try {
        data = (await response.json()) as GenerateScriptResponse;
      } catch {
        throw new Error("Invalid response from server");
      }

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error ?? "Failed to generate script");
      }

      setScript(data.data);
      setSelectedSceneIndex(0);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(16,185,129,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.035)_1px,transparent_1px)] bg-[size:40px_40px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.18),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.08),transparent_45%)]"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#06080f]/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-lg shadow-emerald-900/50">
                <Trophy className="h-5 w-5 text-white" />
                <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-white">FootieBitz</p>
                <p className="text-xs font-medium text-emerald-400/90">AI Football Shorts Studio</p>
              </div>
            </div>

            {script ? (
              <div className="flex max-w-[min(100%,280px)] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 sm:max-w-none sm:px-4">
                <Clapperboard className="hidden h-4 w-4 shrink-0 text-emerald-400 sm:block" />
                <div className="min-w-0 text-right sm:text-left">
                  <p className="truncate text-sm font-medium text-white">{script.title}</p>
                  <p className="text-xs text-zinc-500">
                    {totalDuration}s · {script.scenes.length} scenes
                  </p>
                </div>
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                {["9:16", "AI Script", "WebM Export"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <section className="mb-8 lg:mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
              <Zap className="h-3.5 w-3.5" />
              YouTube Shorts · TikTok · Reels
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              Create football shorts{" "}
              <span className="bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-600 bg-clip-text text-transparent">
                in minutes
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              The AI creator studio for football content. Generate scripts, build
              scene-by-scene storyboards, preview vertically, and export — all in
              one flow.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
            <div className="order-2 space-y-6 lg:order-1">
              <Card>
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
                    <Wand2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
                      Step 1 · Create
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">New short</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      Describe the match or topic, pick a tone, and generate your script.
                    </p>
                  </div>
                </div>

                <form
                  className="mt-8 space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    generateScript();
                  }}
                >
                  <div>
                    <label htmlFor="topic" className="mb-2 block text-sm font-medium text-zinc-300">
                      Match / topic
                    </label>
                    <input
                      id="topic"
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder='e.g. "Arsenal 3-1 Chelsea" or "Haaland hat-trick vs Wolves"'
                      disabled={loading}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0f18] px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50"
                    />
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium text-zinc-500">Quick samples</p>
                      <div className="flex flex-wrap gap-2">
                        {SAMPLE_TOPICS.map((sample) => (
                          <button
                            key={sample}
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              setTopic(sample);
                              setError(null);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              topic === sample
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"
                            }`}
                          >
                            {sample}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="tone" className="mb-2 block text-sm font-medium text-zinc-300">
                        Tone
                      </label>
                      <div className="relative">
                        <select
                          id="tone"
                          value={tone}
                          onChange={(e) => setTone(e.target.value as Tone)}
                          disabled={loading}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-[#0a0f18] px-4 py-3.5 pr-10 text-sm text-white outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50"
                        >
                          {TONE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label} — {option.description}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="duration" className="mb-2 block text-sm font-medium text-zinc-300">
                        Duration
                      </label>
                      <div className="relative">
                        <select
                          id="duration"
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          disabled={loading}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-[#0a0f18] px-4 py-3.5 pr-10 text-sm text-white outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50"
                        >
                          {DURATION_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option} seconds
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating script...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 transition group-hover:scale-110" />
                        Generate Script
                      </>
                    )}
                  </button>

                  {error && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      {error}
                    </div>
                  )}
                </form>
              </Card>

              {!script && !loading && (
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
                    How it works
                  </p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    {WORKFLOW_STEPS.map((item) => (
                      <div
                        key={item.step}
                        className="rounded-xl border border-white/5 bg-[#0a0f18]/80 p-4"
                      >
                        <span className="text-xs font-bold text-emerald-500">{item.step}</span>
                        <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {loading && (
                <Card className="border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-emerald-500/[0.03]">
                  <div className="flex flex-col items-center py-4 text-center">
                    <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                      <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/15" />
                      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold text-white">Writing your short...</h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
                      Crafting a {duration}s {tone} script for &ldquo;{topic.trim()}&rdquo;
                    </p>
                    <div className="mt-8 grid w-full max-w-md gap-2">
                      {["Analysing topic", "Building scenes", "Polishing hook"].map((step) => (
                        <div
                          key={step}
                          className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-zinc-300"
                        >
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {script && !loading && (
                <div className="space-y-6">
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
                          Step 2 · Script
                        </p>
                        <h2 className="mt-2 text-2xl font-bold text-white">{script.title}</h2>
                      </div>
                      <CopyButton text={formatFullScript(script)} label="Copy script" />
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/5 bg-[#0a0f18] p-4 sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                          Hook
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{script.hook}</p>
                      </div>

                      {script.caption && (
                        <div className="rounded-xl border border-white/5 bg-[#0a0f18] p-4 sm:col-span-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                              YouTube caption
                            </p>
                            <CopyButton text={script.caption} label="Copy caption" />
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                            {script.caption}
                          </p>
                        </div>
                      )}

                      {script.hashtags.length > 0 && (
                        <div className="sm:col-span-2">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                              Hashtags
                            </p>
                            <CopyButton
                              text={formatHashtags(script.hashtags)}
                              label="Copy hashtags"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {script.hashtags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card>
                    <SceneEditor script={script} onScriptChange={setScript} />
                  </Card>

                  <ExportPanel script={script} />
                </div>
              )}
            </div>

            <aside className="order-1 lg:sticky lg:top-24 lg:order-2 lg:self-start">
              <Card className="overflow-hidden">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
                      Live preview
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Storyboard</h2>
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                    9:16
                  </span>
                </div>

                <VideoPreview
                  script={script}
                  selectedSceneIndex={previewSceneIndex}
                  onSelectedSceneChange={setSelectedSceneIndex}
                />
              </Card>
            </aside>
          </div>
        </main>

        <footer className="mt-auto border-t border-white/10 py-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
            <p className="text-sm font-medium text-zinc-500">FootieBitz</p>
            <p className="text-xs text-zinc-600">
              AI-powered football shorts for creators
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
