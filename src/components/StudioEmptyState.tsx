"use client";

import { Sparkles } from "lucide-react";

import {
  studioEmptyStateCard,
  studioEmptyStateDesc,
  studioEmptyStateIcon,
  studioEmptyStateTitle,
  studioPrimaryButton,
} from "@/lib/studioUi";

interface StudioEmptyStateProps {
  onGenerate: () => void;
}

export default function StudioEmptyState({ onGenerate }: StudioEmptyStateProps) {
  return (
    <section aria-label="Get started" className="mb-6 min-w-0 sm:mb-10">
      <div className={studioEmptyStateCard}>
        <div className={studioEmptyStateIcon} aria-hidden>
          <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-xl" />
          <Sparkles className="relative h-7 w-7 text-accent" strokeWidth={1.5} />
        </div>

        <h1 className={studioEmptyStateTitle}>
          Start with an idea. We&apos;ll turn it into a visual story.
        </h1>

        <p className={studioEmptyStateDesc}>
          Describe a football moment, pick a tone, and FootieBitz builds scenes, narration, and a
          timeline-ready storyboard.
        </p>

        <button
          type="button"
          onClick={onGenerate}
          className={`${studioPrimaryButton} mt-6 w-full min-h-[2.75rem] sm:mt-8 sm:w-auto sm:min-w-[11rem]`}
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          Generate Story
        </button>
      </div>
    </section>
  );
}
