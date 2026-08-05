/**
 * Read-only Retention Story intelligence explainability — Sprint 10G / 10G.1.
 * Total over unknown runtime input. Never echoes raw malformed values.
 * Fingerprints stay off the creator panel.
 */

import {
  isCreatorStoryStrategyCoherentWithPlan,
  validateRetentionExplainabilityEnvelope,
} from "../production/validate-retention-persistence";
import { resolvedFormatStrategyLabel } from "./story-strategy-selection";

export interface RetentionExplainabilityRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Optional plain-language help under the value. */
  readonly description?: string;
}

export interface RetentionExplainabilityModel {
  readonly available: boolean;
  /** Concise message when snapshots are absent (legacy / failed gen). */
  readonly unavailableMessage: string | null;
  readonly rows: readonly RetentionExplainabilityRow[];
  readonly warningNotes: readonly string[];
}

const UNAVAILABLE_LEGACY =
  "Story intelligence details aren’t available for this older draft.";

const UNAVAILABLE_UNSAFE =
  "Story intelligence details aren’t available for this draft.";

function unavailable(message: string): RetentionExplainabilityModel {
  return Object.freeze({
    available: false,
    unavailableMessage: message,
    rows: Object.freeze([]),
    warningNotes: Object.freeze([]),
  });
}

function pacingLabel(
  value: "front_loaded" | "escalating" | "reveal_late",
): string {
  switch (value) {
    case "front_loaded":
      return "Front-loaded — key beats arrive early";
    case "escalating":
      return "Escalating — tension builds toward the end";
    case "reveal_late":
      return "Late reveal — payoff lands near the close";
  }
}

function endingLabel(
  value: "payoff_reveal" | "challenge" | "resolution" | "open_loop",
): string {
  switch (value) {
    case "payoff_reveal":
      return "Payoff reveal";
    case "challenge":
      return "Challenge";
    case "resolution":
      return "Conventional resolution";
    case "open_loop":
      return "Open loop";
  }
}

function infoDensityLabel(value: "sparse" | "balanced" | "dense"): string {
  switch (value) {
    case "dense":
      return "Dense";
    case "balanced":
      return "Balanced";
    case "sparse":
      return "Sparse";
  }
}

function visualDensityLabel(value: "low" | "medium" | "high"): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

function emotionLabel(value: string): string {
  if (!value.trim()) return "Not specified";
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Scores are editorial readiness — never “predicted retention”. */
function confidenceLabel(score: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  if (pct >= 85) return `Strong (${pct}%)`;
  if (pct >= 70) return `Solid (${pct}%)`;
  if (pct >= 55) return `Moderate (${pct}%)`;
  return `Developing (${pct}%)`;
}

function readinessLabel(score: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  if (pct >= 85) return `Ready (${pct}%)`;
  if (pct >= 70) return `Mostly ready (${pct}%)`;
  if (pct >= 55) return `Needs polish (${pct}%)`;
  return `Not ready (${pct}%)`;
}

function complianceLabel(score: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  if (pct >= 90) return `Fully met (${pct}%)`;
  if (pct >= 75) return `Mostly met (${pct}%)`;
  return `Partial (${pct}%)`;
}

function readBriefField(input: unknown, key: string): unknown {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  try {
    return Reflect.get(input, key);
  } catch {
    return undefined;
  }
}

/**
 * Build creator-facing explainability from persisted safe snapshots only.
 * Total over unknown: malformed / stale / partial / mismatched → unavailable.
 * Rewrite evidence comes only from the linked validation summary.
 */
export function buildRetentionExplainabilityModel(
  input: unknown,
): RetentionExplainabilityModel {
  try {
    const retentionPlan = readBriefField(input, "retentionPlan");
    const retentionValidation = readBriefField(input, "retentionValidation");
    // Standalone retentionRewriteUsed is never authoritative (10G.1).
    const formatStrategyId = readBriefField(input, "formatStrategyId");
    const durationSec =
      readBriefField(input, "durationSec") ?? readBriefField(input, "duration");

    const envelope = validateRetentionExplainabilityEnvelope({
      retentionPlan,
      retentionValidation,
    });

    if (!envelope.ok) {
      if (
        envelope.reason === "absent" ||
        envelope.reason === "legacy_unlinked"
      ) {
        return unavailable(UNAVAILABLE_LEGACY);
      }
      return unavailable(UNAVAILABLE_UNSAFE);
    }

    const { plan, validation } = envelope;

    if (
      !isCreatorStoryStrategyCoherentWithPlan({
        formatStrategyId,
        durationSec,
        resolvedFormatStrategyId: plan.formatStrategyId,
      })
    ) {
      return unavailable(UNAVAILABLE_UNSAFE);
    }

    const resolvedLabel = resolvedFormatStrategyLabel(plan.formatStrategyId);
    if (resolvedLabel === "Custom") {
      return unavailable(UNAVAILABLE_UNSAFE);
    }

    const rows: RetentionExplainabilityRow[] = [
      {
        id: "resolved_strategy",
        label: "Resolved strategy",
        value: resolvedLabel,
        description:
          "How ShortForge structured pacing and payoff for this duration.",
      },
      {
        id: "controlling_idea",
        label: "Controlling idea",
        value: plan.controllingIdea || "Not specified",
      },
      {
        id: "primary_emotion",
        label: "Primary emotion",
        value: emotionLabel(plan.primaryEmotion),
      },
    ];

    if (plan.secondaryEmotion) {
      rows.push({
        id: "secondary_emotion",
        label: "Secondary emotion",
        value: emotionLabel(plan.secondaryEmotion),
      });
    }

    rows.push(
      {
        id: "beat_count",
        label: "Beat count",
        value: String(plan.beatCount),
      },
      {
        id: "pacing",
        label: "Pacing",
        value: pacingLabel(plan.pacingProfile),
      },
      {
        id: "ending_style",
        label: "Ending style",
        value: endingLabel(plan.endingStrategy),
      },
      {
        id: "information_density",
        label: "Information density",
        value: infoDensityLabel(plan.informationDensity),
      },
      {
        id: "visual_density",
        label: "Visual density",
        value: visualDensityLabel(plan.visualDensity),
      },
      {
        id: "retention_readiness",
        label: "Retention readiness",
        value: readinessLabel(validation.retentionReadiness),
        description:
          "Editorial readiness for a short-form story — not a performance forecast.",
      },
      {
        id: "story_quality",
        label: "Story quality confidence",
        value: confidenceLabel(validation.storyQualityConfidence),
        description: "How complete and coherent the narration structure looks.",
      },
      {
        id: "framework_compliance",
        label: "Framework compliance",
        value: complianceLabel(validation.frameworkCompliance),
        description: "Whether required story structure checks were satisfied.",
      },
      {
        id: "studio_rewrite",
        label: "Studio rewrite",
        value: validation.rewriteUsed
          ? "Used — Studio polish pass applied"
          : "Not used",
        description:
          "Whether a Studio quality rewrite improved the body narration.",
      },
    );

    const dispositionRaw = readBriefField(input, "generationDisposition");
    if (dispositionRaw != null && typeof dispositionRaw === "object") {
      const d = dispositionRaw as Record<string, unknown>;
      const disposition =
        d.disposition === "optimal" ||
        d.disposition === "acceptable" ||
        d.disposition === "fallback"
          ? d.disposition
          : null;
      if (disposition) {
        rows.unshift({
          id: "generation_disposition",
          label: "Generation disposition",
          value:
            disposition === "optimal"
              ? "Optimal"
              : disposition === "acceptable"
                ? "Acceptable — adaptations applied"
                : "Fallback — guaranteed complete story",
          description:
            "How reliably ShortForge finished this brief (not a retention score).",
        });
      }
      if (Array.isArray(d.adaptations) && d.adaptations.length > 0) {
        const labels = d.adaptations
          .filter((id): id is string => typeof id === "string")
          .slice(0, 8)
          .map((id) => id.replace(/_/g, " "));
        if (labels.length > 0) {
          rows.push({
            id: "adaptations",
            label: "Adaptations made",
            value: labels.join("; "),
          });
        }
      }
      if (
        typeof d.approximateWordCount === "number" &&
        typeof d.targetWordBudget === "number"
      ) {
        rows.push({
          id: "word_duration_fit",
          label: "Word / duration fit",
          value: `~${d.approximateWordCount} words (target ~${d.targetWordBudget})`,
        });
      }
      if (Array.isArray(d.creatorFacingNotes)) {
        for (const note of d.creatorFacingNotes.slice(0, 4)) {
          if (typeof note === "string" && note.trim()) {
            rows.push({
              id: `disposition_note_${rows.length}`,
              label: "Note",
              value: note.trim(),
            });
          }
        }
      }
    }

    const factHandling = readBriefField(input, "factHandlingMode");
    const adaptationIds =
      dispositionRaw != null &&
      typeof dispositionRaw === "object" &&
      Array.isArray((dispositionRaw as Record<string, unknown>).adaptations)
        ? (
            (dispositionRaw as Record<string, unknown>).adaptations as unknown[]
          ).filter((id): id is string => typeof id === "string")
        : [];
    const premiseUsed = adaptationIds.includes("creative_premise_used");
    const unsupportedOmitted = adaptationIds.includes(
      "unsupported_facts_omitted",
    );
    const reliabilityFallback = adaptationIds.includes(
      "deterministic_story_fallback_used",
    );

    if (factHandling === "creative_premise") {
      rows.push({
        id: "creator_premise",
        label: "Fact Handling",
        value: "Creative Premise",
        description:
          "Creator-supplied story-world facts (not independently verified).",
      });
      rows.push({
        id: "creator_premise_usage",
        label: "Premise facts used",
        value: premiseUsed
          ? "Yes — at least one premise fact appears in the narration"
          : "No — premise details were empty or could not safely fit",
      });
    } else if (factHandling === "verified_facts_only") {
      rows.push({
        id: "creator_premise",
        label: "Fact Handling",
        value: "Grounded story",
        description:
          "Uses creator-supplied brief details and verified research when available.",
      });
    }
    if (unsupportedOmitted) {
      rows.push({
        id: "unsupported_facts",
        label: "Unsupported facts",
        value: "Some unsupported details were omitted or reframed",
      });
    }
    if (reliabilityFallback) {
      rows.push({
        id: "reliability_fallback",
        label: "Reliability fallback",
        value: "Yes — guaranteed safe narration path was used",
      });
    }

    const selectedStrategy = readBriefField(input, "formatStrategyId");
    if (
      typeof selectedStrategy === "string" &&
      selectedStrategy &&
      selectedStrategy !== "auto"
    ) {
      rows.unshift({
        id: "selected_vs_resolved",
        label: "Selected vs resolved strategy",
        value: `${selectedStrategy.replace(/_/g, " ")} → ${resolvedLabel}`,
      });
    }

    const warningNotes = [...validation.warningNotes];
    if (
      warningNotes.includes("quality_below_target") ||
      warningNotes.includes("validation_pass_with_quality_warning")
    ) {
      warningNotes.push(
        "Suggestion: add clearer context or try Studio for a stronger editorial pass.",
      );
    }

    return Object.freeze({
      available: true,
      unavailableMessage: null,
      rows: Object.freeze(rows),
      warningNotes: Object.freeze(warningNotes),
    });
  } catch {
    return unavailable(UNAVAILABLE_UNSAFE);
  }
}

/** Forbidden creator-facing phrases for score language policy. */
export const RETENTION_EXPLAINABILITY_FORBIDDEN_PHRASES = Object.freeze([
  "predicted retention",
  "predict retention",
  "scientific",
  "guaranteed views",
  "will go viral",
] as const);

export function explainabilityTextContainsForbiddenScoreLanguage(
  text: string,
): boolean {
  const lower = text.toLowerCase();
  return RETENTION_EXPLAINABILITY_FORBIDDEN_PHRASES.some((phrase) =>
    lower.includes(phrase),
  );
}
