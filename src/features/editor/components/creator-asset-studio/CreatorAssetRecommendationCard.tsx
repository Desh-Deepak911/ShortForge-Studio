"use client";

import { Pin, Sparkles } from "lucide-react";

import type { ProviderRecommendation } from "@/features/asset-intelligence/providers/asset-provider.types";
import type { AssetRecommendation } from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type { RecommendationConfidence } from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import {
  buildRecommendationExplanation,
  confidenceBadgeClass,
  creatorAssetBadgeClass,
  creatorAssetHeroClass,
  formatConfidenceWithPercent,
  formatImportanceLabel,
  formatNarrativeRoleLabel,
  formatProviderLabel,
  formatRecommendationTypeLabel,
  importanceBadgeClass,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionDesc, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetRecommendationCardProps {
  recommendation: AssetRecommendation;
  sceneConfidence: RecommendationConfidence;
  reasoning?: readonly string[];
  primaryProvider?: ProviderRecommendation;
  isPinned?: boolean;
}

function MetaBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-all duration-300 hover:scale-[1.03] motion-reduce:transform-none ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * Hero AI recommendation card — planning metadata only.
 */
export default function CreatorAssetRecommendationCard({
  recommendation,
  sceneConfidence,
  reasoning = [],
  primaryProvider,
  isPinned = false,
}: CreatorAssetRecommendationCardProps) {
  const confidence = formatConfidenceWithPercent(sceneConfidence, recommendation.score);
  const importance = formatImportanceLabel(recommendation.score);
  const recommendationType = formatRecommendationTypeLabel(recommendation);
  const narrativeRole = formatNarrativeRoleLabel(recommendation.semanticRole);
  const explanation = buildRecommendationExplanation({ recommendation, reasoning });

  return (
    <section className={creatorAssetHeroClass}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/25">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent/90">
                  AI Recommendation
                </p>
                {isPinned ? (
                  <span className={`inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent ring-1 ring-accent/20 ${creatorAssetBadgeClass}`}>
                    <Pin className="h-3 w-3" aria-hidden />
                    Pinned
                  </span>
                ) : null}
              </div>
              <p className={studioShellSectionDesc}>Best match for this scene — planning only.</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <MetaBadge
              label={confidence.label}
              className={confidenceBadgeClass(sceneConfidence)}
            />
            <span className="text-[11px] font-medium tabular-nums text-muted">{confidence.percent}</span>
          </div>
        </div>

        <div className="rounded-xl bg-background/35 px-4 py-3.5 ring-1 ring-border/20">
          <p className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {recommendation.query}
          </p>
          {recommendation.entityNames.length > 0 ? (
            <p className={`${studioSubtleText} mt-2`}>
              {recommendation.entityNames.join(" · ")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <MetaBadge label={importance} className={importanceBadgeClass(recommendation.score)} />
          <MetaBadge
            label={recommendationType}
            className="bg-surface-elevated/55 text-foreground/85 ring-border/25"
          />
          {primaryProvider ? (
            <MetaBadge
              label={formatProviderLabel(primaryProvider.providerId)}
              className="bg-accent/10 text-accent ring-accent/20"
            />
          ) : null}
          {narrativeRole ? (
            <MetaBadge
              label={narrativeRole}
              className="bg-indigo-500/10 text-indigo-200 ring-indigo-500/20"
            />
          ) : null}
        </div>

        <div className="rounded-xl bg-background/25 px-4 py-3.5 ring-1 ring-border/15">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Why this recommendation?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{explanation}</p>
        </div>
      </div>
    </section>
  );
}
