"use client";

import { Check } from "lucide-react";

import type { AssetRepairSuggestion } from "@/features/asset-intelligence/validator/asset-validator.types";
import {
  creatorAssetSectionClass,
  formatImprovementSuggestion,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetRepairSuggestionsProps {
  suggestions: readonly AssetRepairSuggestion[];
  maxItems?: number;
}

/**
 * Positive improvement suggestions — planning only, no auto-fix.
 */
export default function CreatorAssetRepairSuggestions({
  suggestions,
  maxItems = 6,
}: CreatorAssetRepairSuggestionsProps) {
  const items = suggestions.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <section className={creatorAssetSectionClass}>
        <p className={studioShellSectionTitle}>Ways to Improve</p>
        <p className={`${studioSubtleText} mt-2`}>
          Planning looks strong — no improvement suggestions for this scene.
        </p>
      </section>
    );
  }

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-4">
        <p className={studioShellSectionTitle}>Ways to Improve</p>
        <p className={studioSubtleText}>Optional ideas to strengthen visual planning</p>
      </header>

      <ul className="space-y-2">
        {items.map((suggestion) => (
          <li
            key={suggestion.id}
            className="flex items-start gap-2.5 rounded-xl bg-background/25 px-3.5 py-3 ring-1 ring-border/15 transition hover:bg-background/35 hover:ring-border/25"
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20"
            >
              <Check className="h-3 w-3 text-emerald-300" />
            </span>
            <p className="text-sm leading-relaxed text-foreground/90">
              {formatImprovementSuggestion(suggestion)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
