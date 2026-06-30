"use client";

import { ChevronDown } from "lucide-react";

import type { ProviderRecommendation } from "@/features/asset-intelligence/providers/asset-provider.types";
import type {
  AssetRecommendation,
  RecommendedAssetCandidate,
  RecommendationConfidence,
} from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import {
  buildCurrentComparisonMetrics,
  buildRecommendationComparisonMetrics,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.workflow.utils";
import {
  creatorAssetSectionClass,
  formatPlanningScore,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioCompactButton, studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetRecommendationComparisonProps {
  current: AssetRecommendation;
  alternative: RecommendedAssetCandidate;
  sceneConfidence: RecommendationConfidence;
  primaryProvider?: ProviderRecommendation;
  secondaryProvider?: ProviderRecommendation;
  expanded: boolean;
  onToggle: () => void;
}

function FitBar({ label, value }: { label: string; value: number }) {
  const width = `${Math.round(value * 100)}%`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground/85">{label}</p>
        <p className="text-[11px] tabular-nums text-muted">{formatPlanningScore(value)}</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-elevated/50 ring-1 ring-border/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent/50 to-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width }}
          role="presentation"
        />
      </div>
    </div>
  );
}

function ComparisonColumn({
  title,
  query,
  metrics,
}: {
  title: string;
  query: string;
  metrics: ReturnType<typeof buildRecommendationComparisonMetrics>;
}) {
  return (
    <div className="rounded-xl bg-background/30 p-3.5 ring-1 ring-border/15 transition-all duration-300 hover:-translate-y-0.5 hover:ring-border/25 motion-reduce:transform-none">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-2 text-sm font-medium leading-snug text-foreground/95">{query}</p>

      <div className="mt-3 space-y-2.5">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-surface-elevated/55 px-2 py-0.5 font-medium text-foreground/85 ring-1 ring-border/20 transition-transform duration-300">
            {metrics.confidenceLabel} · {metrics.confidencePercent}
          </span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent ring-1 ring-accent/20 transition-transform duration-300">
            {metrics.providerLabel}
          </span>
        </div>
        <FitBar label="Visual fit" value={metrics.visualFit} />
        <FitBar label="Narrative fit" value={metrics.narrativeFit} />
      </div>
    </div>
  );
}

/**
 * Expandable current vs alternative recommendation comparison.
 */
export default function CreatorAssetRecommendationComparison({
  current,
  alternative,
  sceneConfidence,
  primaryProvider,
  secondaryProvider,
  expanded,
  onToggle,
}: CreatorAssetRecommendationComparisonProps) {
  const currentMetrics = buildCurrentComparisonMetrics({
    current,
    sceneConfidence,
    provider: primaryProvider,
  });
  const alternativeMetrics = buildRecommendationComparisonMetrics({
    candidate: alternative,
    current,
    provider: primaryProvider,
    fallbackProvider: secondaryProvider,
  });

  return (
    <section className={creatorAssetSectionClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={studioShellSectionTitle}>Recommendation Comparison</p>
          <p className={studioSubtleText}>Compare the current recommendation with an alternative</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`${studioCompactButton} shrink-0`}
        >
          {expanded ? "Hide" : "Compare"}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
          expanded ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-2.5 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            <ComparisonColumn title="Current Recommendation" query={current.query} metrics={currentMetrics} />

            <div className="hidden items-center justify-center px-1 lg:flex">
              <span className="rounded-full bg-surface-elevated/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-border/20">
                vs
              </span>
            </div>

            <ComparisonColumn title="Alternative" query={alternative.query} metrics={alternativeMetrics} />
          </div>
        </div>
      </div>
    </section>
  );
}
