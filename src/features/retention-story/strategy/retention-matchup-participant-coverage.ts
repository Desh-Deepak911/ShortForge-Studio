/**
 * Matchup participant-coverage authority — Sprint 10H.4B / 10H.4B.1.
 *
 * Derived only from explicit creator topic matchup framing for match_preview /
 * match_recap. Never inferred from research, claims, or model output.
 * Canonical identity tokens exclude result/framing prose. Matching proves
 * participant identity — not incidental vocabulary.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import { extractRetentionSubjectTokens } from "./retention-subject-tokens";

/** Bump when canonical identity token rules change (plan fingerprint sensitive). */
export const RETENTION_PARTICIPANT_COVERAGE_POLICY_VERSION =
  "participant-coverage/2" as const;

const MATCHUP_SCRIPT_MODES = new Set([
  "match_preview",
  "match_recap",
]);

/** Organizational short prefixes — optional for coverage when a core name exists. */
const OPTIONAL_ORG_PREFIXES = new Set([
  "fc",
  "ac",
  "as",
  "ai",
  "cf",
  "sc",
  "af",
  "nk",
  "fk",
  "sk",
  "us",
  "cd",
  "ud",
  "rc",
  "bv",
]);

/**
 * Never participant identity — result verbs, connectives, framing, score prose.
 * Matching and parsing must ignore these entirely.
 */
const PARTICIPANT_NON_IDENTITY = new Set([
  // Result / outcome verbs
  "wins",
  "won",
  "win",
  "beat",
  "beats",
  "beaten",
  "defeated",
  "defeat",
  "lost",
  "lose",
  "loses",
  "drew",
  "draw",
  "draws",
  // Connectives / prepositions
  "with",
  "by",
  "from",
  "over",
  "into",
  "onto",
  "under",
  "after",
  "before",
  "between",
  "among",
  "versus",
  "against",
  "and",
  "the",
  "for",
  "can",
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
  // Framing / editorial prose
  "dramatic",
  "match",
  "matches",
  "review",
  "preview",
  "recap",
  "tactical",
  "analysis",
  "story",
  "stories",
  "finish",
  "finished",
  "unfinished",
  "narrow",
  "late",
  "pressure",
  "press",
  "foul",
  "fouls",
  "tackle",
  "tackles",
  "result",
  "results",
  "score",
  "scores",
  "scoreline",
  "highlight",
  "highlights",
  "clash",
  "derby",
  "fixture",
  "tonight",
  "today",
  "still",
  "feels",
  "feel",
  "leaves",
  "open",
  "question",
  "meeting",
  "next",
  "game",
  "contest",
  "battle",
  "war",
  "rivalry",
  "in",
  "a",
  "an",
]);

function foldToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Strip trailing creator prose after em-dash / colon / spaced hyphen. */
function stripTrailingTopicProse(side: string): string {
  const nfc = side.normalize("NFC").replace(/\s+/g, " ").trim();
  const cut = nfc.split(/\s+[—–|:]\s+|\s+-\s+/)[0] ?? nfc;
  return cut.trim();
}

export interface RetentionParticipantGroup {
  readonly groupId: string;
  /**
   * Sorted unique folded identity tokens (includes optional org prefixes).
   * Used for fingerprinting; coverage matching uses requiredIdentityTokens.
   */
  readonly tokens: readonly string[];
  /**
   * Non-prefix identity tokens that must all appear for coverage.
   * When empty (e.g. AI FC), all `tokens` are required.
   */
  readonly requiredIdentityTokens: readonly string[];
  /** Creator-facing bounded participant label (NFC, ordered identity words only). */
  readonly displayLabel: string;
}

export interface RetentionParticipantCoverage {
  readonly version: 1;
  readonly policyVersion: typeof RETENTION_PARTICIPANT_COVERAGE_POLICY_VERSION;
  readonly required: boolean;
  readonly groups: readonly RetentionParticipantGroup[];
}

/** Fingerprintable / plan-stamped summary (no private prose beyond labels). */
export interface RetentionParticipantCoverageSummary {
  readonly policyVersion: typeof RETENTION_PARTICIPANT_COVERAGE_POLICY_VERSION;
  readonly required: boolean;
  readonly groupTokenSets: readonly (readonly string[])[];
}

function freezeCoverage(
  value: RetentionParticipantCoverage,
): RetentionParticipantCoverage {
  return Object.freeze({
    version: 1 as const,
    policyVersion: value.policyVersion,
    required: value.required,
    groups: Object.freeze(
      value.groups.map((g) =>
        Object.freeze({
          groupId: g.groupId,
          tokens: Object.freeze([...g.tokens]),
          requiredIdentityTokens: Object.freeze([...g.requiredIdentityTokens]),
          displayLabel: g.displayLabel,
        }),
      ),
    ),
  });
}

function emptyCoverage(required = false): RetentionParticipantCoverage {
  return freezeCoverage({
    version: 1,
    policyVersion: RETENTION_PARTICIPANT_COVERAGE_POLICY_VERSION,
    required,
    groups: [],
  });
}

/**
 * Ordered display tokens for one matchup participant name only.
 * Drops result/framing/connective prose; never treats those as identity.
 */
function extractSideDisplayTokens(side: string): {
  readonly display: readonly string[];
  readonly folded: readonly string[];
} {
  const nfc = stripTrailingTopicProse(side);
  if (!nfc) return { display: [], folded: [] };
  const parts = nfc.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const display: string[] = [];
  const folded: string[] = [];
  const seen = new Set<string>();
  let collectedStrongName = false;
  for (const part of parts) {
    const f = foldToken(part);
    if (!f) continue;
    if (PARTICIPANT_NON_IDENTITY.has(f)) {
      if (collectedStrongName) break;
      // Non-identity before a name — skip (e.g. leading "the") or fail closed later.
      continue;
    }
    const keep = f.length >= 3 || OPTIONAL_ORG_PREFIXES.has(f);
    if (!keep) continue;
    if (seen.has(f)) continue;
    seen.add(f);
    display.push(part.normalize("NFC"));
    folded.push(f);
    if (f.length >= 3 && !OPTIONAL_ORG_PREFIXES.has(f)) {
      collectedStrongName = true;
    } else if (OPTIONAL_ORG_PREFIXES.has(f) && display.length >= 2) {
      // "AI FC" / "AC Milan" — short prefix + following token completes name.
      collectedStrongName = true;
    }
  }
  return { display, folded };
}

function requiredIdentityFromFolded(
  folded: readonly string[],
): readonly string[] {
  const core = folded.filter((t) => !OPTIONAL_ORG_PREFIXES.has(t));
  if (core.length > 0) {
    return Object.freeze([...core].sort((a, b) => a.localeCompare(b)));
  }
  // Short-only clubs (AI FC): every token is required identity.
  return Object.freeze([...folded].sort((a, b) => a.localeCompare(b)));
}

function buildGroup(
  groupId: string,
  side: string,
): RetentionParticipantGroup | null {
  const { display, folded } = extractSideDisplayTokens(side);
  if (folded.length === 0) return null;
  const tokens = [...folded].sort((a, b) => a.localeCompare(b));
  const requiredIdentityTokens = requiredIdentityFromFolded(folded);
  if (requiredIdentityTokens.length === 0) return null;
  return Object.freeze({
    groupId,
    tokens: Object.freeze(tokens),
    requiredIdentityTokens,
    displayLabel: display.join(" "),
  });
}

/**
 * Parse explicit matchup participant groups from a creator topic.
 * Returns null when the topic is not an explicit two-sided matchup.
 */
export function parseRetentionMatchupParticipantGroups(
  topic: string,
  scriptMode: string,
): readonly RetentionParticipantGroup[] | null {
  if (!MATCHUP_SCRIPT_MODES.has(scriptMode)) return null;
  if (topic == null || typeof topic !== "string") return null;
  const normalized = topic.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  // Count all separator matches — more than one is ambiguous / malformed.
  // Fresh regex each call (avoid sticky /g lastIndex on a module constant).
  const separatorMatches = [
    ...normalized.matchAll(
      /\s+(versus|vs\.?|v\.?|against|defeated|beats|beat)\s+/giu,
    ),
  ];
  if (separatorMatches.length !== 1) return null;
  const match = separatorMatches[0]!;
  if (match.index == null) return null;

  const left = normalized.slice(0, match.index).trim();
  const right = normalized.slice(match.index + match[0].length).trim();
  if (!left || !right) return null;

  // Reject sides that still begin with / contain a separator (e.g. "versus versus").
  const residualSeparator =
    /(?:^|\s)(versus|vs\.?|v\.?|against|defeated|beats|beat)(?:\s|$)/iu;
  if (residualSeparator.test(left) || residualSeparator.test(right)) {
    return null;
  }

  const groupA = buildGroup("g0", left);
  const groupB = buildGroup("g1", right);
  if (!groupA || !groupB) return null;

  // Fail closed when sides collapse to the same required identity (ambiguous).
  if (
    groupA.requiredIdentityTokens.length ===
      groupB.requiredIdentityTokens.length &&
    groupA.requiredIdentityTokens.every(
      (t, i) => t === groupB.requiredIdentityTokens[i],
    )
  ) {
    return null;
  }

  return Object.freeze([groupA, groupB]);
}

/**
 * Build Retention-owned participant coverage from the normalized contract.
 */
export function buildRetentionParticipantCoverage(
  contract: Pick<NormalizedStoryContract, "topic" | "scriptMode">,
): RetentionParticipantCoverage {
  const groups = parseRetentionMatchupParticipantGroups(
    contract.topic,
    contract.scriptMode,
  );
  if (groups == null || groups.length < 2) {
    return emptyCoverage(false);
  }
  return freezeCoverage({
    version: 1,
    policyVersion: RETENTION_PARTICIPANT_COVERAGE_POLICY_VERSION,
    required: true,
    groups,
  });
}

export function toRetentionParticipantCoverageSummary(
  coverage: RetentionParticipantCoverage,
): RetentionParticipantCoverageSummary {
  // Fingerprint required identity sets so forged optional-only groups fail closed.
  return Object.freeze({
    policyVersion: coverage.policyVersion,
    required: coverage.required,
    groupTokenSets: Object.freeze(
      coverage.groups.map((g) =>
        Object.freeze([...g.requiredIdentityTokens]),
      ),
    ),
  });
}

/**
 * Exact normalized-token identity match — not substring, not any-token.
 * Every required identity token must appear; org prefixes are optional when a
 * core name exists (AC Milan → Milan; AI FC → both short tokens required).
 */
export function narrationCoversRetentionParticipantGroup(
  narration: string,
  group: RetentionParticipantGroup,
): boolean {
  if (!narration || typeof narration !== "string") return false;
  const narrationTokens = new Set(extractRetentionSubjectTokens(narration));
  if (narrationTokens.size === 0) return false;
  const required =
    group.requiredIdentityTokens.length > 0
      ? group.requiredIdentityTokens
      : group.tokens;
  if (required.length === 0) return false;
  return required.every((token) => narrationTokens.has(token));
}

export function evaluateRetentionParticipantCoverage(input: {
  readonly coverage: RetentionParticipantCoverage;
  readonly narration: string;
}): {
  readonly required: boolean;
  readonly passed: boolean;
  readonly missingGroupIds: readonly string[];
} {
  const { coverage, narration } = input;
  if (!coverage.required || coverage.groups.length === 0) {
    return Object.freeze({
      required: false,
      passed: true,
      missingGroupIds: Object.freeze([] as string[]),
    });
  }
  const missing: string[] = [];
  for (const group of coverage.groups) {
    if (!narrationCoversRetentionParticipantGroup(narration, group)) {
      missing.push(group.groupId);
    }
  }
  return Object.freeze({
    required: true,
    passed: missing.length === 0,
    missingGroupIds: Object.freeze(missing),
  });
}

/** True when sentence text is the sole coverage for any still-required group. */
export function sentenceIsSoleParticipantCoverage(input: {
  readonly coverage: RetentionParticipantCoverage;
  readonly fullNarration: string;
  readonly sentence: string;
}): boolean {
  const { coverage, fullNarration, sentence } = input;
  if (!coverage.required) return false;
  const without = fullNarration.replace(sentence, " ");
  for (const group of coverage.groups) {
    const coversFull = narrationCoversRetentionParticipantGroup(
      fullNarration,
      group,
    );
    const coversWithout = narrationCoversRetentionParticipantGroup(
      without,
      group,
    );
    const coversSentence = narrationCoversRetentionParticipantGroup(
      sentence,
      group,
    );
    if (coversFull && coversSentence && !coversWithout) {
      return true;
    }
  }
  return false;
}

/**
 * Fingerprintable coverage payload for plan identity.
 * Forged or stale group sets change the plan fingerprint.
 */
export function buildParticipantCoverageFingerprintPayload(
  coverage: RetentionParticipantCoverage,
): RetentionParticipantCoverageSummary {
  return toRetentionParticipantCoverageSummary(coverage);
}
