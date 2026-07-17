"use client";

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

  return (
    <StudioSection
      title="Story intelligence"
      description="How ShortForge shaped this short-form story — read-only."
    >
      <StudioPanel>
        {!model.available ? (
          <p className={studioSubtleText} role="status">
            {model.unavailableMessage}
          </p>
        ) : (
          <>
            <dl className="grid gap-3">
              {model.rows.map((row) => (
                <div key={row.id} className="space-y-1">
                  <dt className={studioFieldLabel}>{row.label}</dt>
                  <dd className="text-sm text-foreground/90">{row.value}</dd>
                  {row.description ? (
                    <p className={studioSubtleText}>{row.description}</p>
                  ) : null}
                </div>
              ))}
            </dl>

            {model.warningNotes.length > 0 ? (
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
                  {model.warningNotes.map((note, index) => (
                    <li key={`${index}:${note.slice(0, 24)}`}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className={`${studioSubtleText} mt-4`} role="status">
                No validation warnings.
              </p>
            )}
          </>
        )}
      </StudioPanel>
    </StudioSection>
  );
}
