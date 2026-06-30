"use client";

import type { AssetValidationResult } from "@/features/asset-intelligence/validator/asset-validator.types";
import {
  creatorAssetSectionClass,
  formatPlanningScore,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetValidationCardProps {
  validationResult: AssetValidationResult;
}

interface QualityMetric {
  label: string;
  value: number;
}

function QualityMetricCard({ label, value }: QualityMetric) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;

  return (
    <div className="rounded-xl bg-background/25 px-3.5 py-3 ring-1 ring-border/15">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground/90">{label}</p>
        <p className="text-xs font-semibold tabular-nums text-muted">{formatPlanningScore(value)}</p>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-elevated/50 ring-1 ring-border/15"
        role="progressbar"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width }}
        />
      </div>
    </div>
  );
}

/**
 * Quality assessment card — planning audit scores only.
 */
export default function CreatorAssetValidationCard({
  validationResult,
}: CreatorAssetValidationCardProps) {
  const metrics: QualityMetric[] = [
    { label: "Recommendation Quality", value: validationResult.recommendationQualityScore },
    { label: "Entity Coverage", value: validationResult.entityCoverageScore },
    { label: "Provider Match", value: validationResult.providerQualityScore },
    { label: "Visual Diversity", value: validationResult.visualDiversityScore },
  ];

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className={studioShellSectionTitle}>Quality Assessment</p>
          <p className={studioSubtleText}>Planning quality signals — read only</p>
        </div>
        <span className="inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/20">
          {formatPlanningScore(validationResult.validationScore)}
        </span>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {metrics.map((metric) => (
          <QualityMetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      {validationResult.warnings.length > 0 ? (
        <div className="mt-4 rounded-xl bg-amber-500/5 px-3.5 py-3 ring-1 ring-amber-500/15">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
            Notes
          </p>
          <ul className="mt-2 space-y-1.5">
            {validationResult.warnings.slice(0, 3).map((warning) => (
              <li key={warning} className="text-xs leading-relaxed text-foreground/80">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
