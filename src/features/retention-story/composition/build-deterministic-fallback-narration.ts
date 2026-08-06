/**
 * Deterministic topic-aware fallback narration — Sprint 10H.3 / 10H.3A.
 * Used only when model composition/Hook rescue cannot deliver a complete story.
 * Claim-aware: prefers plan-authorized premise/verified claims with exact text.
 * Never invents scores, stats, names, dates, or competition details.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { RETENTION_WORDS_PER_SECOND } from "../planning/retention-story-plan.constants";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import {
  buildRetentionParticipantCoverage,
  evaluateRetentionParticipantCoverage,
  narrationCoversRetentionParticipantGroup,
} from "../strategy/retention-matchup-participant-coverage";
import {
  extractOrderedRetentionSubjectTokens,
  resolveRetentionDeterministicSubjectAnchor,
} from "../strategy/resolve-retention-deterministic-subject-anchor";
import { claimRefSupportsNarrationStatement } from "../strategy/retention-claim-support";
import { assembleRetentionNarrationCandidate } from "./assemble-retention-narration-candidate";
import type { RetentionNarrationCandidate } from "./retention-narration-candidate.types";
import type { RetentionSegmentDraft } from "./assemble-retention-narration-candidate";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";

export interface DeterministicFallbackBuildResult {
  readonly title: string;
  readonly candidate: RetentionNarrationCandidate;
  /** Eligible premise/verified claim IDs that could not safely fit. */
  readonly omittedClaimIds: readonly string[];
  readonly usedClaimIds: readonly string[];
}

/** Function words + result/framing verbs — never used as rescue subject anchors. */
const OPENING_SKIP = new Set([
  "a",
  "an",
  "the",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
  "this",
  "that",
  "these",
  "those",
  "can",
  "with",
  "from",
  "into",
  "onto",
  "under",
  "about",
  "without",
  "beat",
  "beats",
  "defeated",
  "wins",
  "won",
  "lost",
  "drew",
  "inventing",
  "invent",
  "redefine",
  "decides",
  "decide",
  "resets",
  "feels",
  "still",
  "dramatic",
  "match",
  "review",
  "preview",
  "pressure",
  "press",
  "scoreline",
  "result",
  "story",
  "tone",
  "news",
  "breaking",
]);

function resolveSafeSubject(topic: string): string {
  return (
    resolveRetentionDeterministicSubjectAnchor(topic) ??
    "This contest"
  );
}

/** Prefer capitalized creator name tokens; fall back to first non-skip tokens. */
function shortSubjectLabel(topic: string, subject: string): string {
  // `subject` has already removed creator-direction prefixes and unsafe topic
  // detail. Deriving the spoken label from raw topic text can otherwise turn
  // "Explain ..." or "Tell ..." into the apparent entity.
  const ordered = extractOrderedRetentionSubjectTokens(subject);
  const properNameRuns = subject
    .normalize("NFC")
    .match(/(?:\b[\p{Lu}][\p{L}\p{N}'’-]*\b(?:\s+|$)){1,3}/gu)
    ?.map((run) => run.trim())
    .filter((run) =>
      run
        .split(/\s+/)
        .some((word) => word.length >= 3 && !OPENING_SKIP.has(word.toLowerCase())),
    )
    .sort((a, b) => {
      const byWords = b.split(/\s+/).length - a.split(/\s+/).length;
      return byWords !== 0 ? byWords : subject.indexOf(a) - subject.indexOf(b);
    });
  if (properNameRuns?.[0]) return properNameRuns[0];
  const capitalized = ordered.filter(
    (t) =>
      t.folded.length >= 3 &&
      !OPENING_SKIP.has(t.folded) &&
      /^[\p{Lu}]/u.test(t.display),
  );
  const pool = capitalized.length > 0 ? capitalized : ordered;
  const picks = pool
    .filter((t) => t.folded.length >= 3 && !OPENING_SKIP.has(t.folded))
    .slice(0, 2)
    .map((t) => t.display);
  if (picks.length > 0) return picks.join(" ");
  const fallback = subject
    .split(/\s+/)
    .filter((w) => {
      const f = w.toLowerCase();
      return f.length >= 3 && !OPENING_SKIP.has(f);
    })
    .slice(0, 2);
  return fallback.join(" ") || "This contest";
}

/** Topic-anchored fallback question with conflict and a body-payoff promise. */
function topicAnchoredOpening(topic: string, subject: string): string {
  const short = shortSubjectLabel(topic, subject)
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
  const possessive = /s$/iu.test(short) ? `${short}'` : `${short}'s`;
  return `What decides ${possessive} outcome?`;
}

function qualitativeUtterance(input: {
  readonly index: number;
  readonly total: number;
  readonly purpose: string;
  readonly subject: string;
  readonly topic: string;
  readonly scriptMode: NormalizedStoryContract["scriptMode"];
  readonly opponentLabel?: string | null;
}): string {
  const { index, total, purpose, subject, topic, scriptMode, opponentLabel } = input;
  const spokenSubject = shortSubjectLabel(topic, subject);
  if (index === 0) {
    return topicAnchoredOpening(topic, subject);
  }
  if (index === 1 && opponentLabel) {
    return `${spokenSubject} met ${opponentLabel}.`;
  }
  if (index === total - 1) {
    if (opponentLabel) {
      return `Together, those details bring ${spokenSubject} against ${opponentLabel} into focus.`;
    }
    if (scriptMode === "tactical_review") {
      return `Together, those details show what decides the tactical outcome for ${spokenSubject}.`;
    }
    if (scriptMode === "historical_explainer") {
      return `Together, those details explain why ${spokenSubject}'s turning point still matters.`;
    }
    if (scriptMode === "opinion_debate") {
      return `Together, those details leave the argument around ${spokenSubject} open to judgment.`;
    }
    return `Together, those details bring ${spokenSubject}'s central idea into focus.`;
  }
  if (purpose === "setup" || index === total - 2) {
    return `That connection brings the central question around ${spokenSubject} into focus.`;
  }
  if (scriptMode === "tactical_review") {
    return [
      `For ${spokenSubject}, space and timing define the first tactical problem.`,
      `The next decision for ${spokenSubject} changes which option remains available.`,
      `That sequence shows how ${spokenSubject} can turn one opening into another.`,
    ][(index - 1) % 3]!;
  }
  if (scriptMode === "historical_explainer") {
    return [
      `For ${spokenSubject}, the earlier context gives the turning point its meaning.`,
      `What followed changed how ${spokenSubject} should be understood.`,
      `The consequence connects that moment to the wider story of ${spokenSubject}.`,
    ][(index - 1) % 3]!;
  }
  if (scriptMode === "player_analysis") {
    return [
      `${spokenSubject} comes into focus through the first decision.`,
      `Execution changes the value of the next choice for ${spokenSubject}.`,
      `The consequence shows what matters most in judging ${spokenSubject}.`,
    ][(index - 1) % 3]!;
  }
  if (scriptMode === "opinion_debate") {
    return [
      `The case for ${spokenSubject} begins with the strongest available reason.`,
      `A competing view changes how that reason should be weighed.`,
      `The tension around ${spokenSubject} grows when both readings remain possible.`,
    ][(index - 1) % 3]!;
  }
  if (scriptMode === "top_5") {
    return [
      `${spokenSubject} first has to be judged by impact.`,
      `Context changes how that impact should be ranked.`,
      `The final position for ${spokenSubject} depends on consequence as well as impression.`,
    ][(index - 1) % 3]!;
  }
  if (scriptMode === "match_preview") {
    return [
      `${spokenSubject} begins with the first matchup choice.`,
      `That choice changes the space available in the next phase.`,
      `The response then shapes what ${spokenSubject} can become.`,
    ][(index - 1) % 3]!;
  }
  if (scriptMode === "match_recap") {
    return [
      `${spokenSubject} becomes clearer through the first shift in control.`,
      `The response gave the next moment a different consequence.`,
      `That sequence reveals how the story of ${spokenSubject} changed.`,
    ][(index - 1) % 3]!;
  }
  return [
    `${spokenSubject} begins with a choice whose consequence keeps growing.`,
    `The response changes which path remains open for ${spokenSubject}.`,
    `That connection gives the next part of ${spokenSubject} its meaning.`,
  ][(index - 1) % 3]!;
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/u.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

/**
 * Safe connective language for duration rescue. These sentences advance the
 * existing question/pressure/payoff relationship without adding people,
 * numbers, outcomes, or other factual claims.
 */
function durationBridges(
  scriptMode: NormalizedStoryContract["scriptMode"],
): readonly string[] {
  if (scriptMode === "tactical_review") {
    return Object.freeze([
      "The tactical picture changes as those details connect space, timing, and the next available choice.",
      "The next detail shows how one decision opens or closes another option.",
      "That relationship is the key to the tactical answer.",
    ]);
  }
  if (scriptMode === "historical_explainer") {
    return Object.freeze([
      "Each detail changes how the turning point and everything that followed should be understood.",
      "The earlier context gives the next moment a different meaning.",
      "That connection keeps the wider story moving forward.",
    ]);
  }
  if (scriptMode === "opinion_debate") {
    return Object.freeze([
      "The argument shifts as each new detail changes the weight of the evidence.",
      "That tension leaves room for a competing interpretation.",
      "The final judgment depends on how those details connect.",
    ]);
  }
  return Object.freeze([
    "The central question stays open because each new detail changes the options and consequences that follow.",
    "From there, the earlier detail gains a different consequence.",
    "That connection changes what can happen next.",
  ]);
}

function fallbackTitle(
  scriptMode: NormalizedStoryContract["scriptMode"],
  topic: string,
  subject: string,
): string {
  const label = shortSubjectLabel(topic, subject);
  if (scriptMode === "tactical_review") return `${label}: the tactical question`;
  if (scriptMode === "historical_explainer") return `${label}: the turning point`;
  if (scriptMode === "player_analysis") return `${label}: choices under pressure`;
  if (scriptMode === "opinion_debate") return `${label}: the case in question`;
  if (scriptMode === "top_5") return `${label}: ranking the impact`;
  if (scriptMode === "match_preview") return `${label}: what could decide it`;
  if (scriptMode === "match_recap") return `${label}: how control shifted`;
  return `${label}: the central question`;
}

/**
 * Build a complete, duration-aware fallback candidate from plan beat IDs.
 * Prefer exact plan-authorized claim text; otherwise qualitative fallback.
 */
export function buildDeterministicFallbackNarrationCandidate(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding?: RetentionGroundingContext | null;
  readonly title?: string;
  /**
   * Sprint 10H.3B — Write My Own body rescue: force the first spoken segment
   * to this exact opening (byte-for-byte after terminal punctuation normalize).
   */
  readonly preserveOpeningText?: string | null;
}): DeterministicFallbackBuildResult {
  const subject = resolveSafeSubject(input.contract.topic);
  const participantCoverage = buildRetentionParticipantCoverage(input.contract);
  const opponentLabel =
    participantCoverage.required && participantCoverage.groups.length >= 2
      ? participantCoverage.groups[1]!.displayLabel
      : null;
  const primaryLabel =
    participantCoverage.required && participantCoverage.groups.length >= 2
      ? participantCoverage.groups[0]!.displayLabel
      : subject;
  const beats = input.plan.beatPlan.beats;
  const preservedOpening =
    typeof input.preserveOpeningText === "string" &&
    input.preserveOpeningText.trim().length > 0
      ? ensureTerminalPunctuation(input.preserveOpeningText.trim())
      : null;
  const hardBudget = input.plan.compressionGoals.targetWordBudget;
  const targetWords = Math.min(
    hardBudget,
    Math.max(
      beats.length * 5,
      Math.floor(input.contract.durationSec * RETENTION_WORDS_PER_SECOND * 0.92),
    ),
  );
  const claimsById = new Map(
    (input.grounding?.claims ?? []).map((c) => [c.claimId, c]),
  );

  const usedClaimIds: string[] = [];
  const authorizedClaimIds = new Set<string>();
  for (const beat of beats) {
    for (const ref of beat.groundingClaimRefs) {
      authorizedClaimIds.add(ref);
    }
  }

  const drafts: RetentionSegmentDraft[] = beats.map((beat, index) => {
    let text = "";
    let claimRefs: string[] = [];

    if (index === 0 && preservedOpening) {
      text = preservedOpening;
      return Object.freeze({
        beatId: beat.id,
        text,
        claimRefs: Object.freeze([]) as readonly string[],
        factualRisk: detectRetentionFactualRisk(text).risky,
      });
    }

    // Prefer a single plan-authorized claim with exact text support.
    const grounding = input.grounding;
    for (const ref of beat.groundingClaimRefs) {
      const claim = claimsById.get(ref);
      if (!claim || !claim.permittedFactualUse || claim.forbidden) continue;
      if (!grounding) continue;
      const statement = ensureTerminalPunctuation(claim.text);
      if (
        !claimRefSupportsNarrationStatement(
          grounding,
          claim.claimId,
          statement,
          input.contract.factHandlingMode ?? "verified_facts_only",
        )
      ) {
        continue;
      }
      const withClaimWords = countRetentionNarrationWords(statement);
      // Leave headroom for opening/payoff qualitative beats.
      if (withClaimWords > Math.max(8, Math.floor(hardBudget / beats.length) + 4)) {
        continue;
      }
      text = statement;
      claimRefs = [claim.claimId];
      if (!usedClaimIds.includes(claim.claimId)) {
        usedClaimIds.push(claim.claimId);
      }
      break;
    }

    if (!text) {
      text = qualitativeUtterance({
        index,
        total: beats.length,
        purpose: beat.purpose,
        subject: primaryLabel,
        topic: input.contract.topic,
        scriptMode: input.contract.scriptMode,
        opponentLabel,
      });
    }

    text = ensureTerminalPunctuation(text);

    // Deterministic fallback must not introduce unsupported factual risk without refs.
    let risk = detectRetentionFactualRisk(text).risky;
    if (risk && claimRefs.length === 0) {
      text =
        beat.id === beats[beats.length - 1]?.id
          ? `The lasting edge belongs to whoever keeps advancing.`
          : index === 0
            ? qualitativeUtterance({
                index: 0,
                total: beats.length,
                purpose: beat.purpose,
                subject,
                topic: input.contract.topic,
                scriptMode: input.contract.scriptMode,
              })
            : `The contest tightens through pressure and resolve.`;
      text = ensureTerminalPunctuation(text);
      risk = detectRetentionFactualRisk(text).risky;
    }

    return Object.freeze({
      beatId: beat.id,
      text,
      claimRefs: Object.freeze(claimRefs) as readonly string[],
      // Must match detectRetentionFactualRisk for candidate coherence.
      factualRisk: risk,
    });
  });

  // If assembled narration exceeds hard budget, drop optional middle claim
  // segments to qualitative (preserve opening + payoff + claim refs when possible).
  let working = drafts;
  const assembledPreview = () =>
    working.map((d) => d.text).join(" ").trim();
  if (countRetentionNarrationWords(assembledPreview()) > hardBudget) {
    working = drafts.map((d, index) => {
      if (index === 0 || index === drafts.length - 1) return d;
      if (d.claimRefs.length === 0) return d;
      const qualitative = ensureTerminalPunctuation(
        qualitativeUtterance({
          index,
          total: drafts.length,
          purpose: beats[index]!.purpose,
          subject: primaryLabel,
          topic: input.contract.topic,
          scriptMode: input.contract.scriptMode,
          opponentLabel,
        }),
      );
      return Object.freeze({
        beatId: d.beatId,
        text: qualitative,
        claimRefs: Object.freeze([]) as readonly string[],
        factualRisk: false,
      });
    });
  }

  // Ensure matchup participant coverage after claim/budget swaps.
  if (participantCoverage.required && opponentLabel) {
    const preview = assembledPreview();
    const coverageEval = evaluateRetentionParticipantCoverage({
      coverage: participantCoverage,
      narration: preview,
    });
    if (!coverageEval.passed) {
      const spokenPrimary = shortSubjectLabel(
        input.contract.topic,
        primaryLabel,
      );
      const insert = ensureTerminalPunctuation(
        `${spokenPrimary} met ${opponentLabel}`,
      );
      const targetIndex = working.length >= 2 ? 1 : 0;
      const current = working[targetIndex]!;
      working = working.map((d, i) =>
        i === targetIndex
          ? Object.freeze({
              beatId: d.beatId,
              text: ensureTerminalPunctuation(`${insert} ${current.text}`),
              claimRefs: d.claimRefs,
              factualRisk: detectRetentionFactualRisk(
                `${insert} ${current.text}`,
              ).risky,
            })
          : d,
      );
    }
  }

  // Final short-duration fit: shrink middle beats to minimal complete sentences.
  if (countRetentionNarrationWords(assembledPreview()) > hardBudget) {
    working = working.map((d, index) => {
      if (index === 0 || index === working.length - 1) return d;
      // Keep beat 1 when it carries the opposing matchup participant.
      if (
        index === 1 &&
        participantCoverage.required &&
        opponentLabel &&
        narrationCoversRetentionParticipantGroup(
          d.text,
          participantCoverage.groups[1]!,
        )
      ) {
        return Object.freeze({
          beatId: d.beatId,
          text: ensureTerminalPunctuation(
            `${shortSubjectLabel(input.contract.topic, primaryLabel)} met ${opponentLabel}`,
          ),
          claimRefs: Object.freeze([]) as readonly string[],
          factualRisk: false,
        });
      }
      return Object.freeze({
        beatId: d.beatId,
        text: "The contest tightens through pressure and resolve.",
        claimRefs: Object.freeze([]) as readonly string[],
        factualRisk: false,
      });
    });
  }

  // Duration fidelity for deterministic rescue: add at most a small number of
  // complete connective sentences to qualitative middle beats. Never repeat
  // supplied facts, alter claim refs, split utterances, or cross the hard word
  // budget. This keeps beats invisible beneath one continuous narration.
  const availableDurationBridges = durationBridges(input.contract.scriptMode);
  let bridgeCursor = 0;
  while (
    countRetentionNarrationWords(assembledPreview()) < targetWords &&
    bridgeCursor < availableDurationBridges.length
  ) {
    const currentWords = countRetentionNarrationWords(assembledPreview());
    const remainingBudget = hardBudget - currentWords;
    const remainingTarget = targetWords - currentWords;
    const bridgeOptions = availableDurationBridges.slice(bridgeCursor)
      .map((text, offset) => ({
        text,
        index: bridgeCursor + offset,
        words: countRetentionNarrationWords(text),
      }))
      .filter((option) => option.words <= remainingBudget)
      .sort((a, b) => {
        const aDistance = Math.abs(a.words - remainingTarget);
        const bDistance = Math.abs(b.words - remainingTarget);
        return aDistance !== bDistance ? aDistance - bDistance : b.words - a.words;
      });
    const selected = bridgeOptions[0];
    if (!selected) break;

    const targetIndex = working.findIndex(
      (draft, index) =>
        index > 0 &&
        index < working.length - 1 &&
        draft.claimRefs.length === 0,
    );
    if (targetIndex < 0) break;

    working = working.map((draft, index) => {
      if (index !== targetIndex) return draft;
      const text = ensureTerminalPunctuation(`${draft.text} ${selected.text}`);
      return Object.freeze({
        beatId: draft.beatId,
        text,
        claimRefs: draft.claimRefs,
        factualRisk: detectRetentionFactualRisk(text).risky,
      });
    });
    bridgeCursor = selected.index + 1;
  }

  const finalUsed = new Set<string>();
  for (const d of working) {
    for (const ref of d.claimRefs) finalUsed.add(ref);
  }
  const omittedClaimIds = [...authorizedClaimIds].filter(
    (id) => !finalUsed.has(id),
  );

  const candidate = assembleRetentionNarrationCandidate({
    origin: "final",
    planFingerprint: input.plan.planFingerprint,
    orderedBeatIds: beats.map((b) => b.id),
    segments: working.map((d) =>
      Object.freeze({
        beatId: d.beatId,
        text: d.text,
        claimRefs: d.claimRefs,
        factualRisk: d.factualRisk,
      }),
    ),
  });

  return {
    title:
      input.title?.trim() ||
      fallbackTitle(input.contract.scriptMode, input.contract.topic, primaryLabel),
    candidate,
    omittedClaimIds: Object.freeze(omittedClaimIds),
    usedClaimIds: Object.freeze([...finalUsed]),
  };
}
