import {
  Download,
  FolderOpen,
  Layers,
  Mic,
  PenLine,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { PRODUCT_NAME } from "@/lib/constants/product-brand";
import { WORKFLOW_STEPS } from "@/lib/constants/studioConstants";
import {
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioStepLabel,
} from "@/lib/utils/studioUi";

const FEATURES: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Research",
    description: "Find relevant facts automatically.",
    icon: Search,
  },
  {
    title: "Story",
    description: "Turn ideas into engaging narratives.",
    icon: Wand2,
  },
  {
    title: "Narration",
    description: "Generate natural voiceovers.",
    icon: Mic,
  },
  {
    title: "Storyboard",
    description: "Split stories into editable scenes.",
    icon: Layers,
  },
  {
    title: "Editor",
    description: "Adjust every scene visually.",
    icon: PenLine,
  },
  {
    title: "Export",
    description: "Download production-ready videos.",
    icon: Download,
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto min-w-0 max-w-5xl">
      {/* Hero */}
      <section
        aria-label={`${PRODUCT_NAME} hero`}
        className="relative overflow-hidden px-1 pb-16 pt-4 text-center sm:pb-20 sm:pt-8 lg:pb-24 lg:pt-12"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[min(100%,42rem)] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl"
        />

        <p className={`${studioStepLabel} relative`}>{PRODUCT_NAME}</p>

        <h1 className="relative mx-auto mt-4 max-w-3xl text-[2rem] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl sm:leading-[1.05] lg:text-[3.25rem]">
          Create cinematic short-form videos from ideas, events and research.
        </h1>

        <p className="relative mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:mt-6 sm:text-lg sm:leading-relaxed">
          Write stories, create narration, build storyboards and export polished short-form videos
          in minutes.
        </p>

        <div className="relative mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center">
          <Link
            href="/create"
            className={`${studioPrimaryButton} w-full px-6 py-3 text-[15px] sm:w-auto sm:min-w-[12.5rem]`}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            Create Story
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
            Everything you need to publish.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[15px]">
            From research to export — one calm path for short-form video.
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

      {/* Documentation */}
      <section
        id="documentation"
        aria-label="Documentation"
        className="mt-14 border-t border-border/20 px-1 pt-14 sm:pt-16"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className={studioStepLabel}>Documentation</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            How {PRODUCT_NAME} works
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[15px]">
            A simple path from brief to finished short — no editing suite required.
          </p>
        </div>

        <ol className="mx-auto mt-10 grid max-w-3xl gap-2.5 sm:grid-cols-2 sm:gap-3">
          {WORKFLOW_STEPS.map((item) => (
            <li
              key={item.title}
              className={`${studioPanel} px-5 py-4 sm:px-6 sm:py-5`}
            >
              <p className="text-sm font-medium text-foreground/90">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.desc}</p>
            </li>
          ))}
        </ol>
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
            Create Story
          </Link>
          <Link href="/drafts" className={`${studioSecondaryButton} w-full sm:w-auto`}>
            View Drafts
          </Link>
        </div>
      </section>
    </div>
  );
}
