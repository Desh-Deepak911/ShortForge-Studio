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
  const ordered = extractOrderedRetentionSubjectTokens(topic);
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

/** Short ≤5-word question opening using a meaningful topic token (not articles). */
function topicAnchoredOpening(topic: string, subject: string): string {
  const short = shortSubjectLabel(topic, subject)
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
  return `Why does ${short} matter?`;
}

function qualitativeUtterance(input: {
  readonly index: number;
  readonly total: number;
  readonly purpose: string;
  readonly subject: string;
  readonly topic: string;
  readonly opponentLabel?: string | null;
}): string {
  const { index, total, purpose, subject, topic, opponentLabel } = input;
  const spokenSubject = shortSubjectLabel(topic, subject);
  if (index === 0) {
    return topicAnchoredOpening(topic, subject);
  }
  if (index === 1 && opponentLabel) {
    return `${spokenSubject} met ${opponentLabel}.`;
  }
  if (index === total - 1) {
    return opponentLabel
      ? `In the end, ${spokenSubject} against ${opponentLabel} is defined by who keeps pushing.`
      : `In the end, ${spokenSubject} is defined by who keeps pushing.`;
  }
  if (purpose === "setup" || index === total - 2) {
    return `That contrast sets up the real verdict on ${spokenSubject}.`;
  }
  const middles = [
    `Physical duels tighten and the tempo snaps.`,
    `One side keeps asking questions; the other starts protecting space.`,
    `Momentum swings with every collision and reset.`,
    `Tension rises as the contest becomes a fight for control.`,
    `The pattern is clear: push forward, or shrink from the fight.`,
  ];
  return middles[(index - 1) % middles.length]!;
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/u.test(trimmed)) return trimmed;
  return `${trimmed}.`;
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
  const targetWords = Math.max(
    beats.length * 5,
    Math.floor(input.contract.durationSec * RETENTION_WORDS_PER_SECOND * 0.72),
  );
  const hardBudget = input.plan.compressionGoals.targetWordBudget;
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
        opponentLabel,
      });
      // Light pad with complete second sentence when under share.
      const share = Math.max(5, Math.floor(targetWords / beats.length));
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      if (words + 4 <= share && index > 0 && index < beats.length - 1) {
        text = `${text} The stakes stay live.`;
      }
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
      `${primaryLabel}: pressure tells the truth`,
    candidate,
    omittedClaimIds: Object.freeze(omittedClaimIds),
    usedClaimIds: Object.freeze([...finalUsed]),
  };
}
