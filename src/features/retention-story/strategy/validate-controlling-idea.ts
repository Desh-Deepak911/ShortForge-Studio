/**
 * Pure controlling-idea validation — Sprint 10C / 10C.1.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import {
  RETENTION_CONTROLLING_IDEA_FORBIDDEN_LABELS,
  RETENTION_CONTROLLING_IDEA_GENERIC_INTROS,
  RETENTION_MAX_CONTROLLING_IDEA_CHARS,
  RETENTION_MAX_CONTROLLING_IDEA_CLAIM_REFS,
  RETENTION_MAX_CONTROLLING_IDEA_WORDS,
  RETENTION_MIN_CONTROLLING_IDEA_WORDS,
} from "./retention-strategy.constants";
import {
  canonicalizeControllingIdeaClaimRefs,
  claimRefSupportsControllingIdeaStatement,
  isClaimEligibleForControllingIdeaSupport,
  normalizeRetentionControllingIdeaStatement,
} from "./retention-claim-support";
import { detectRetentionFactualRisk } from "./retention-factual-risk";
import type {
  ControllingIdeaValidationReason,
  ControllingIdeaValidationResult,
} from "./retention-strategy.types";
import {
  extractRetentionSubjectTokens,
  statementPreservesRetentionSubject,
} from "./retention-subject-tokens";

function countWords(statement: string): number {
  return statement.split(/\s+/).filter(Boolean).length;
}

function hasMultipleTheses(statement: string): boolean {
  if (
    /\b(?:but also|however also|on the other hand|meanwhile|not only\b.*\bbut also)\b/i.test(
      statement,
    )
  ) {
    return true;
  }
  if ((statement.match(/;/g) ?? []).length >= 1) {
    return true;
  }
  return false;
}

function isMultiSentence(statement: string): boolean {
  const trimmed = statement.trim();
  const withoutTrailing = trimmed.replace(/[.!?]+$/u, "");
  return /[.!?]/.test(withoutTrailing);
}

export interface ValidateControllingIdeaInput {
  readonly statement: string;
  readonly topic: string;
  readonly claimRefs?: readonly string[];
  readonly grounding: RetentionGroundingContext;
  readonly mustPreserveThroughCompression?: boolean;
}

/**
 * Validate a controlling-idea statement against hard Retention invariants.
 * Does not silently truncate; returns structured reasons.
 */
export function validateControllingIdea(
  input: ValidateControllingIdeaInput,
): ControllingIdeaValidationResult {
  const reasons: ControllingIdeaValidationReason[] = [];
  const statement = normalizeRetentionControllingIdeaStatement(
    input.statement ?? "",
  );

  if (!statement) {
    reasons.push("empty_statement");
    return Object.freeze({ ok: false, reasons: Object.freeze(reasons) });
  }

  if (
    input.mustPreserveThroughCompression != null &&
    input.mustPreserveThroughCompression !== true
  ) {
    reasons.push("must_preserve_flag_invalid");
  }

  if (statement.length > RETENTION_MAX_CONTROLLING_IDEA_CHARS) {
    reasons.push("too_many_chars");
  }

  const words = countWords(statement);
  if (words > RETENTION_MAX_CONTROLLING_IDEA_WORDS) {
    reasons.push("too_many_words");
  }
  if (words < RETENTION_MIN_CONTROLLING_IDEA_WORDS) {
    reasons.push("too_few_words");
  }

  const subjectTokens = extractRetentionSubjectTokens(input.topic);
  if (subjectTokens.length === 0) {
    reasons.push("no_subject_tokens");
  } else if (!statementPreservesRetentionSubject(input.topic, statement)) {
    reasons.push("missing_subject_anchor");
  }

  const lower = statement.toLowerCase();
  for (const label of RETENTION_CONTROLLING_IDEA_FORBIDDEN_LABELS) {
    if (lower.includes(label)) {
      reasons.push("forbidden_label");
      break;
    }
  }
  for (const intro of RETENTION_CONTROLLING_IDEA_GENERIC_INTROS) {
    if (lower.startsWith(intro) || lower.includes(`${intro} `)) {
      reasons.push("generic_introduction");
      break;
    }
  }

  if (isMultiSentence(statement)) reasons.push("multi_sentence");
  if (hasMultipleTheses(statement)) reasons.push("multiple_theses");

  const claimRefs = canonicalizeControllingIdeaClaimRefs(input.claimRefs ?? []);
  if (claimRefs == null) {
    reasons.push("too_many_claim_refs");
  } else {
    if (claimRefs.length > RETENTION_MAX_CONTROLLING_IDEA_CLAIM_REFS) {
      reasons.push("too_many_claim_refs");
    }

    for (const ref of claimRefs) {
      const claim = input.grounding.claims.find((c) => c.claimId === ref);
      if (!claim) {
        reasons.push("unknown_claim_ref");
        continue;
      }
      if (claim.forbidden || claim.verification === "forbidden") {
        reasons.push("ineligible_claim_ref");
      } else if (!isClaimEligibleForControllingIdeaSupport(input.grounding, ref)) {
        reasons.push("ineligible_claim_ref");
      }
    }

    // Forbidden claim text must never become a controlling idea.
    for (const claim of input.grounding.claims) {
      if (!claim.forbidden && claim.verification !== "forbidden") continue;
      const forbiddenText = normalizeRetentionControllingIdeaStatement(claim.text);
      if (forbiddenText && statement === forbiddenText) {
        reasons.push("forbidden_claim_text");
        break;
      }
    }

    const risk = detectRetentionFactualRisk(statement);
    if (risk.risky) {
      if (claimRefs.length === 0) {
        reasons.push("factual_risk_without_refs");
      } else {
        const eligibleRefs = claimRefs.filter((ref) =>
          isClaimEligibleForControllingIdeaSupport(input.grounding, ref),
        );
        if (eligibleRefs.length === 0) {
          reasons.push("factual_risk_without_refs");
        } else {
          for (const ref of eligibleRefs) {
            if (
              !claimRefSupportsControllingIdeaStatement(
                input.grounding,
                ref,
                statement,
              )
            ) {
              reasons.push("claim_ref_does_not_support_statement");
            }
          }
        }
      }
    }
  }

  const uniqueReasons = Object.freeze([...new Set(reasons)]);
  return Object.freeze({
    ok: uniqueReasons.length === 0,
    reasons: uniqueReasons,
  });
}

export { isClaimEligibleForControllingIdeaSupport } from "./retention-claim-support";
