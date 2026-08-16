/**
 * Spoken-duration fit — story-quality Prompt 12.
 * Duration is a composition target. A small spoken-duration miss is a warning,
 * not a reason to discard coherent grounded narration.
 *
 * Voice model: Retention-owned 2.4 words/second.
 * Slight band: ±2.5s from the hard budget.
 * Evidence band (complete grounded ranking only): +5s, from the Prompt 11
 * correct-number-one capture (84 words vs 72-word / 30s hard budget).
 */

import { RETENTION_WORDS_PER_SECOND } from "../planning/retention-story-plan.constants";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";

export type RetentionDurationQualityWarningId =
  | "duration_slightly_under_target"
  | "duration_slightly_over_target"
  | "duration_target_not_fully_met";

export interface RetentionDurationFit {
  readonly wordCount: number;
  readonly hardWordBudget: number;
  readonly targetWordBudget: number;
  readonly minimumUsefulWords: number;
  readonly durationSec: number;
  readonly estimatedSpokenSec: number;
  readonly slightSlackWords: number;
  readonly evidenceSlackWords: number;
  readonly acceptable: boolean;
  readonly underTarget: boolean;
  readonly overTarget: boolean;
  readonly materialOverrun: boolean;
  readonly warningIds: readonly RetentionDurationQualityWarningId[];
}

const SLIGHT_SECONDS = 2.5;
const EVIDENCE_OVERRUN_SECONDS = 5;

export function retentionDurationSlackWords(seconds: number): number {
  return Math.max(4, Math.round(RETENTION_WORDS_PER_SECOND * seconds));
}

export function evaluateRetentionDurationFit(input: {
  readonly narration: string;
  readonly hardWordBudget: number;
  readonly targetWordBudget: number;
  readonly minimumUsefulWords: number;
  readonly durationSec: number;
  /** Complete grounded ranking with correct number-one may use the evidence band. */
  readonly preserveCompleteRanking?: boolean;
}): RetentionDurationFit {
  const wordCount = countRetentionNarrationWords(input.narration);
  const hard = Math.max(1, Math.floor(input.hardWordBudget));
  const slightSlackWords = retentionDurationSlackWords(SLIGHT_SECONDS);
  const evidenceSlackWords = retentionDurationSlackWords(EVIDENCE_OVERRUN_SECONDS);
  const estimatedSpokenSec = wordCount / RETENTION_WORDS_PER_SECOND;
  const overBy = wordCount - hard;
  const underUseful = wordCount < input.minimumUsefulWords;
  const warningIds: RetentionDurationQualityWarningId[] = [];

  let acceptable = wordCount > 0 && wordCount <= hard;
  if (wordCount > 0 && overBy > 0 && overBy <= slightSlackWords) {
    acceptable = true;
    warningIds.push("duration_slightly_over_target");
  } else if (
    wordCount > 0 &&
    input.preserveCompleteRanking === true &&
    overBy > slightSlackWords &&
    overBy <= evidenceSlackWords
  ) {
    acceptable = true;
    warningIds.push("duration_target_not_fully_met");
  }

  if (acceptable && underUseful && wordCount > 0) {
    warningIds.push("duration_slightly_under_target");
  } else if (
    acceptable &&
    !underUseful &&
    wordCount < input.targetWordBudget &&
    input.targetWordBudget - wordCount > slightSlackWords &&
    !warningIds.includes("duration_slightly_over_target") &&
    !warningIds.includes("duration_target_not_fully_met")
  ) {
    warningIds.push("duration_slightly_under_target");
  }

  return Object.freeze({
    wordCount,
    hardWordBudget: hard,
    targetWordBudget: input.targetWordBudget,
    minimumUsefulWords: input.minimumUsefulWords,
    durationSec: input.durationSec,
    estimatedSpokenSec,
    slightSlackWords,
    evidenceSlackWords,
    acceptable,
    underTarget: wordCount < input.targetWordBudget,
    overTarget: wordCount > hard,
    materialOverrun: overBy > slightSlackWords,
    warningIds: Object.freeze([...warningIds]),
  });
}
