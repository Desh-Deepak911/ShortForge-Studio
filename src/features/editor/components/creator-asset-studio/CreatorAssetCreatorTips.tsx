"use client";

import { Lightbulb } from "lucide-react";

import type { CreatorTip } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.workflow.utils";
import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetCreatorTipsProps {
  tips: readonly CreatorTip[];
}

/**
 * Creator tips generated from validation metadata only.
 */
export default function CreatorAssetCreatorTips({ tips }: CreatorAssetCreatorTipsProps) {
  if (tips.length === 0) {
    return null;
  }

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
          <Lightbulb className="h-4 w-4 text-amber-200" aria-hidden />
        </span>
        <div>
          <p className={studioShellSectionTitle}>Creator Tips</p>
          <p className={studioSubtleText}>Smart tips from planning validation metadata</p>
        </div>
      </header>

      <ul className="space-y-2">
        {tips.map((tip) => (
          <li
            key={tip.id}
            className="rounded-xl bg-background/25 px-3.5 py-2.5 text-sm leading-relaxed text-foreground/90 ring-1 ring-border/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-background/35 hover:ring-border/25 motion-reduce:transform-none"
          >
            {tip.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
