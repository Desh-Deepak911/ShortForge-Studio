"use client";

import { CheckCircle2, ChevronDown } from "lucide-react";

import { buildRetentionExplainabilityModel } from "@/features/retention-story/presentation";
import type { StoryCreationBrief } from "@/features/drafts";
import { StudioPanel, StudioSection } from "@/components/studio-shell";
import { studioFieldLabel, studioSubtleText } from "@/lib/utils/studioUi";

export interface StoryIntelligencePanelProps {
  creationBrief?: StoryCreationBrief;
}

/**
 * Review inspector — read-only Story intelligence explainability (Sprint 10G / 10G.1).
 * Snapshot-driven only; never edits plan / validation / scores.
 */
export default function StoryIntelligencePanel({
  creationBrief,
}: StoryIntelligencePanelProps) {
  const model = buildRetentionExplainabilityModel(
    creationBrief
      ? {
          retentionPlan: creationBrief.retentionPlan,
          retentionValidation: creationBrief.retentionValidation,
          formatStrategyId: creationBrief.formatStrategyId,
          duration: creationBrief.duration,
        }
      : null,
  );
  const summaryIds = new Set([
    "resolved_strategy",
    "primary_emotion",
    "pacing",
    "retention_readiness",
    "story_quality",
  ]);
  const summaryRows = model.available
    ? model.rows.filter((row) => summaryIds.has(row.id))
    : [];
  const detailRows = model.available
    ? model.rows.filter((row) => !summaryIds.has(row.id))
    : [];
  const actionableWarnings = model.available
    ? model.warningNotes.filter(
        (note) =>
          note !== "validation_pass" &&
          note !== "validation_pass_after_rewrite",
      )
    : [];

  return (
    <StudioSection
      title="Story intelligence"
      description="Structure, pacing, and readiness."
    >
      <StudioPanel>
        {!model.available ? (
          <p className={studioSubtleText} role="status">
            {model.unavailableMessage}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2">
              {summaryRows.map((row) => (
                <div
                  key={row.id}
                  className="min-w-0 rounded-xl bg-background/30 px-3 py-2.5 ring-1 ring-border/20"
                >
                  <dt className={studioFieldLabel}>{row.label}</dt>
                  <dd className="mt-1 text-sm leading-snug text-foreground/90">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <details className="group mt-3 border-t border-border/20 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-foreground/85 [&::-webkit-details-marker]:hidden">
                View all story intelligence
                <ChevronDown className="h-3.5 w-3.5 text-muted transition group-open:rotate-180" />
              </summary>
              <dl className="mt-3 grid gap-3">
                {detailRows.map((row) => (
                  <div key={row.id} className="space-y-1">
                    <dt className={studioFieldLabel}>{row.label}</dt>
                    <dd className="text-sm text-foreground/90">{row.value}</dd>
                    {row.description ? (
                      <p className={studioSubtleText}>{row.description}</p>
                    ) : null}
                  </div>
                ))}
              </dl>
            </details>

            {actionableWarnings.length > 0 ? (
              <div
                className="mt-4 border-t border-border/20 pt-4"
                role="region"
                aria-label="Validation warnings"
              >
                <p className={studioFieldLabel}>Validation warnings</p>
                <ul
                  className={`${studioSubtleText} mt-2 list-disc space-y-1.5 pl-5 text-amber-800 dark:text-amber-300`}
                  aria-live="polite"
                >
                  {actionableWarnings.map((note, index) => (
                    <li key={`${index}:${note.slice(0, 24)}`}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p
                className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300/90"
                role="status"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Story checks passed
              </p>
            )}
          </>
        )}
      </StudioPanel>
    </StudioSection>
  );
}
