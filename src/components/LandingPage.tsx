import {
  ArrowLeftRight,
  Download,
  FolderOpen,
  Mic,
  Move,
  Sparkles,
  Subtitles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import {
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioStepLabel,
} from "@/lib/studioUi";

const FEATURES: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Script generation",
    description: "Turn a football brief into a documentary-style narration and timed scene plan.",
    icon: Wand2,
  },
  {
    title: "Voiceover",
    description: "Generate spoken audio with story-level voice and speed controls.",
    icon: Mic,
  },
  {
    title: "Subtitles",
    description: "Timed captions with fade-up, typewriter, and highlight effects.",
    icon: Subtitles,
  },
  {
    title: "Image motion",
    description: "Ken Burns-style zoom on scene images while text stays crisp and stable.",
    icon: Move,
  },
  {
    title: "Transitions",
    description: "Fade, slide, zoom, and blur overlays between scenes in preview and export.",
    icon: ArrowLeftRight,
  },
  {
    title: "Export",
    description: "Download a vertical MP4 with narration and background music mixed in-browser.",
    icon: Download,
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto min-w-0 max-w-5xl">
      {/* Hero */}
      <section
        aria-label="FootieBitz hero"
        className="relative overflow-hidden px-1 pb-16 pt-4 text-center sm:pb-20 sm:pt-8 lg:pb-24 lg:pt-12"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[min(100%,42rem)] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl"
        />

        <p className={`${studioStepLabel} relative`}>Football documentary shorts</p>

        <h1 className="relative mt-4 text-[2rem] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl sm:leading-[1.05] lg:text-[3.25rem]">
          From idea to narrated short.
          <span className="mt-2 block text-muted sm:mt-3">Built for vertical storytelling.</span>
        </h1>

        <p className="relative mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:mt-6 sm:text-lg sm:leading-relaxed">
          FootieBitz is a story-first studio for 9:16 football content — script, voiceover,
          timeline, preview, and export in one calm workflow.
        </p>

        <div className="relative mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center">
          <Link
            href="/create"
            className={`${studioPrimaryButton} w-full px-6 py-3 text-[15px] sm:w-auto sm:min-w-[12.5rem]`}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            Create a Story
          </Link>
          <Link
            href="/drafts"
            className={`${studioSecondaryButton} w-full px-6 py-3 text-[15px] sm:w-auto sm:min-w-[12.5rem]`}
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
            View Drafts
          </Link>
        </div>
      </section>

      {/* Feature highlights */}
      <section aria-label="Product features" className="border-t border-border/20 px-1 pt-14 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className={studioStepLabel}>Features</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            Everything in one studio.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[15px]">
            Generate once, refine in the timeline, preview in 9:16, and export when it feels right.
          </p>
        </div>

        <ul className="mt-10 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;

            return (
              <li key={feature.title}>
                <article
                  className={`${studioPanel} flex h-full flex-col px-5 py-5 transition hover:bg-surface-elevated/35 hover:ring-border/30 sm:px-6 sm:py-6`}
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft ring-1 ring-accent/15">
                    <Icon className="h-[1.125rem] w-[1.125rem] text-accent" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-foreground/95">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{feature.description}</p>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Closing CTA */}
      <section
        aria-label="Get started"
        className="mt-14 rounded-2xl bg-surface/35 px-6 py-10 text-center ring-1 ring-border/20 backdrop-blur-xl sm:mt-16 sm:px-10 sm:py-12"
      >
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Ready when you are.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-[15px]">
          Start with a topic, or pick up a saved draft and keep editing.
        </p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link href="/create" className={`${studioPrimaryButton} w-full sm:w-auto`}>
            Create a Story
          </Link>
          <Link href="/drafts" className={`${studioSecondaryButton} w-full sm:w-auto`}>
            View Drafts
          </Link>
        </div>
      </section>
    </div>
  );
}
