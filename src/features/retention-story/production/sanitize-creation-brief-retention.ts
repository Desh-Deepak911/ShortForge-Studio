/**
 * Draft-load Retention persistence sanitizer — Sprint 10G.1 / 10G.1A.
 * Total over hostile briefs. Validates or removes malformed Retention fields.
 * Never touches narration. Never throws.
 */

import type {
  RetentionStoryPlanSnapshot,
  RetentionValidationSummary,
} from "./retention-persistence.types";
import { validateRetentionExplainabilityEnvelope } from "./validate-retention-persistence";

export type SanitizedStoryStrategySelection = "short_retention" | "short_standard";

export interface CreationBriefRetentionSlice {
  readonly formatStrategyId?: SanitizedStoryStrategySelection | "auto" | string;
  readonly retentionPlan?: RetentionStoryPlanSnapshot;
  readonly retentionValidation?: RetentionValidationSummary;
  /** Legacy standalone rewrite flag — ignored for authority; stripped on sanitize. */
  readonly retentionRewriteUsed?: boolean;
}

const ACCESS_FAILED = Symbol("retention.sanitize.access_failed");

function safeGet(record: object, key: string): unknown {
  try {
    return Reflect.get(record, key);
  } catch {
    return ACCESS_FAILED;
  }
}

function isExplicitCreatorStoryStrategy(
  value: unknown,
): value is SanitizedStoryStrategySelection {
  return value === "short_retention" || value === "short_standard";
}

/**
 * Sanitize Retention fields on a creation brief at draft-load.
 * Returns a new slice (never mutates input). Omits unsafe Retention evidence.
 */
export function sanitizeCreationBriefRetentionPersistence(
  brief: CreationBriefRetentionSlice | null | undefined,
): {
  readonly formatStrategyId?: SanitizedStoryStrategySelection;
  readonly retentionPlan?: RetentionStoryPlanSnapshot;
  readonly retentionValidation?: RetentionValidationSummary;
} {
  try {
    if (brief == null || typeof brief !== "object") {
      return Object.freeze({});
    }

    const retentionPlan = safeGet(brief, "retentionPlan");
    const retentionValidation = safeGet(brief, "retentionValidation");
    const formatStrategyIdRaw = safeGet(brief, "formatStrategyId");
    // Touch legacy rewrite flag only to prove safe inspection — never trust it.
    const legacyRewrite = safeGet(brief, "retentionRewriteUsed");
    if (
      retentionPlan === ACCESS_FAILED ||
      retentionValidation === ACCESS_FAILED ||
      formatStrategyIdRaw === ACCESS_FAILED ||
      legacyRewrite === ACCESS_FAILED
    ) {
      return Object.freeze({});
    }

    const envelope = validateRetentionExplainabilityEnvelope({
      retentionPlan,
      retentionValidation,
    });

    const formatStrategyId = isExplicitCreatorStoryStrategy(formatStrategyIdRaw)
      ? formatStrategyIdRaw
      : undefined;

    if (!envelope.ok) {
      return Object.freeze({
        ...(formatStrategyId ? { formatStrategyId } : {}),
      });
    }

    return Object.freeze({
      ...(formatStrategyId ? { formatStrategyId } : {}),
      retentionPlan: envelope.plan,
      retentionValidation: envelope.validation,
    });
  } catch {
    return Object.freeze({});
  }
}
