"use client";

import type { ProviderRecommendation } from "@/features/asset-intelligence/providers/asset-provider.types";
import {
  creatorAssetSectionClass,
  formatProviderLabel,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetProviderListProps {
  rankedProviders: readonly ProviderRecommendation[];
}

function providerChipClass(priority: ProviderRecommendation["priority"]): string {
  switch (priority) {
    case "primary":
      return "bg-accent/15 text-accent ring-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
    case "secondary":
      return "bg-surface-elevated/60 text-foreground/90 ring-border/25";
    case "fallback":
      return "bg-background/35 text-foreground/80 ring-border/20";
    default:
      return "bg-background/25 text-muted ring-border/15";
  }
}

/**
 * Recommended providers as planning chips — no provider calls.
 */
export default function CreatorAssetProviderList({
  rankedProviders,
}: CreatorAssetProviderListProps) {
  if (rankedProviders.length === 0) {
    return (
      <section className={creatorAssetSectionClass}>
        <p className={studioShellSectionTitle}>Providers</p>
        <p className={`${studioSubtleText} mt-2`}>No provider ranking available for this scene.</p>
      </section>
    );
  }

  const primary = rankedProviders.filter((provider) => provider.priority === "primary");
  const secondary = rankedProviders.filter((provider) => provider.priority === "secondary");
  const fallback = rankedProviders.filter(
    (provider) => provider.priority === "fallback" || provider.priority === "planning_only",
  );

  const ordered = [...primary, ...secondary, ...fallback];

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-4">
        <p className={studioShellSectionTitle}>Providers</p>
        <p className={studioSubtleText}>Planning-only provider ranking for this scene</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {ordered.map((provider) => (
          <div
            key={`${provider.priority}-${provider.providerId}`}
            className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition hover:ring-border/35 focus-within:ring-accent/30 ${providerChipClass(provider.priority)}`}
          >
            <span className="truncate capitalize">{formatProviderLabel(provider.providerId)}</span>
            {provider.priority === "primary" ? (
              <span className="shrink-0 rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                Primary
              </span>
            ) : null}
            <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
              Planning
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
