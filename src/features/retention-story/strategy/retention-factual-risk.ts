/**
 * Retention-owned factual-risk classifier — Sprint 10C / 10D.1A / 10D.1B.
 * Identifies traceability risk only; does not prove truth.
 *
 * Bare match-result language is risky even without a numeric score.
 * Tactical/idiomatic "beat the press/clock/odds/…" exclusions are explicit and
 * bounded — opponents like "the Netherlands" remain result risk.
 * Conservative false positives may reduce deterministic topic text to a safe
 * subject anchor; they never grant factual authority.
 */

export interface RetentionFactualRiskResult {
  readonly risky: boolean;
  readonly signals: readonly string[];
}

/** Explicit non-result / tactical objects after transitive result verbs. */
const TACTICAL_THE_OBJECTS = String.raw`the\s+(?:press|high\s+press|low\s+block|offside\s+trap|odds|clock|system)\b`;

/** Match/competition objects for won/lost/drew (not ball/defender/etc.). */
const COMPETITION_OBJECTS_WON_LOST = String.raw`(?:final|match|game|tie|tournament|cup|league|title)`;
const COMPETITION_OBJECTS_DREW = String.raw`(?:match|game|fixture|tie)`;

/**
 * Match-result / score language, including bare result vocabulary without digits.
 */
const MATCH_RESULT_RE = new RegExp(
  [
    // Numeric / nil scores and "n all"
    String.raw`\b\d{1,2}\s*[-–]\s*(?:\d{1,2}|nil)\b`,
    String.raw`\bnil\s*[-–]\s*(?:\d{1,2}|nil)\b`,
    String.raw`\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+all\b`,
    // Result verbs with explicit opposition prepositions
    String.raw`\b(?:won|win)\s+(?:against|over)\b`,
    String.raw`\blost\s+to\b`,
    String.raw`\bdrew\s+(?:with|against)\b`,
    String.raw`\bbeaten\s+by\b`,
    // Past-result verbs + match/competition objects (not "won/lost the ball")
    String.raw`\b(?:won|lost)\s+the\s+${COMPETITION_OBJECTS_WON_LOST}\b`,
    String.raw`\bdrew\s+the\s+${COMPETITION_OBJECTS_DREW}\b`,
    // Transitive result verbs + opponent (incl. "the Netherlands"), excluding
    // bounded tactical/idiomatic "the …" objects only.
    String.raw`\b[\p{L}]{2,}\s+(?:beat|defeated|schooled|edged|thrashed|routed)\s+(?!${TACTICAL_THE_OBJECTS})(?:the\s+)?[\p{L}]{2,}\b`,
    // Result-noun constructions (asserted outcomes, not bare "win"/"loss")
    String.raw`\b(?:secured|claimed)\s+(?:a\s+|the\s+)?victory\b`,
    String.raw`\bsealed\s+(?:a\s+|the\s+)?win\b`,
    String.raw`\bearned\s+(?:a\s+|the\s+)?draw\b`,
    String.raw`\brecorded\s+(?:a\s+|the\s+)?win\b`,
    String.raw`\bsuffered\s+(?:a\s+|the\s+)?(?:defeat|loss)\b`,
    String.raw`\bslumped\s+to\s+(?:a\s+|the\s+)?defeat\b`,
    // Result nouns in matchup framing
    String.raw`\b(?:victory|defeat|win|loss|draw)\s+(?:over|against|to)\b`,
    String.raw`\b(?:a|an|the)\s+(?:narrow\s+|famous\s+|historic\s+|shock\s+)?(?:victory|defeat|win|loss|draw)\b`,
    // Elimination language
    String.raw`\b(?:knocked\s+out|eliminated)\b`,
    // Result verb near a number (legacy numeric-score adjacency)
    String.raw`\b(?:won|beat|defeated|drew|lost)\b[\s\S]{0,40}?\b\d`,
  ].join("|"),
  "iu",
);

/**
 * Month names except May — those forms are unambiguous even in lowercase.
 * Modal "may" ("may struggle", "may return") is uncertainty, not a date.
 * Month "May" is a date only with supporting date context.
 */
const RETENTION_UNAMBIGUOUS_MONTH_OR_YEAR_RE =
  /\b(?:19|20)\d{2}\b|\b(?:january|february|march|april|june|july|august|september|october|november|december)\b/i;

const MAY_WITH_DAY_OR_YEAR =
  /\bMay\s+(?:\d{1,2}(?:st|nd|rd|th)?|(?:19|20)\d{2})\b/;
const DAY_THEN_MAY = /\b\d{1,2}(?:st|nd|rd|th)?\s+May\b/;
const IN_MAY = /\bin\s+May\b/gi;

function windowHasSupportingDateStructure(window: string): boolean {
  const withoutInMay = window.replace(/\bin\s+May\b/gi, " ");
  return (
    /\b(?:19|20)\d{2}\b/.test(withoutInMay) ||
    /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(withoutInMay) ||
    RETENTION_UNAMBIGUOUS_MONTH_OR_YEAR_RE.test(withoutInMay)
  );
}

/**
 * True when text contains a date signal. Modal "may" is never enough.
 * Case alone does not make "May" a month.
 */
export function statementHasRetentionDateSignal(statement: string): boolean {
  if (!statement) return false;
  if (RETENTION_UNAMBIGUOUS_MONTH_OR_YEAR_RE.test(statement)) return true;
  if (MAY_WITH_DAY_OR_YEAR.test(statement) || DAY_THEN_MAY.test(statement)) {
    return true;
  }
  IN_MAY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IN_MAY.exec(statement)) != null) {
    const start = Math.max(0, match.index - 28);
    const end = Math.min(
      statement.length,
      match.index + match[0].length + 28,
    );
    if (windowHasSupportingDateStructure(statement.slice(start, end))) {
      return true;
    }
  }
  return false;
}

const SIGNAL_PATTERNS: readonly { readonly id: string; readonly re: RegExp }[] =
  Object.freeze([
    { id: "percentage", re: /\d+(?:\.\d+)?\s*%/ },
    {
      id: "currency_fee",
      re: /(?:£|€|\$|usd|eur|gbp)\s*\d|\d+\s*(?:million|billion|\bm\b|\bbn\b)/i,
    },
    { id: "ranking", re: /\b(?:rank(?:ed|ing)?|top\s*\d+|#[1-9]\d*)\b/i },
    {
      id: "date",
      re: RETENTION_UNAMBIGUOUS_MONTH_OR_YEAR_RE,
    },
    {
      id: "quote",
      re: /["“”'][^"“”']{3,}["“”']|\b(?:said|says|claimed|according to)\b/i,
    },
    {
      id: "record_stat",
      re: /\b(?:record|goals?|assists?|clean sheets?|xg|possession|pass(?:ing)? accuracy)\b/i,
    },
    { id: "exact_count", re: /\b\d{1,3}\b/ },
    { id: "match_result", re: MATCH_RESULT_RE },
    {
      id: "superlative",
      re: /\b(?:greatest|best ever|first ever|only ever|most ever|worst ever|all[- ]time)\b/i,
    },
    {
      id: "unqualified_superlative",
      re: /\b(?:the\s+)?(?:best|worst|greatest)\s+(?:player|team|club|side|striker|midfielder|defender|goalkeeper|manager|coach)\b|\b(?:first|only)\s+(?:player|team|club|side|manager|goal)\b/i,
    },
    {
      // Universal audience-belief claims are not harmless hook decoration.
      // They assert unsupported social consensus unless a supplied claim backs
      // them (for example, "Nobody saw Brighton coming").
      id: "universal_belief_attribution",
      re: /\b(?:nobody|no\s+one|everyone|everybody)\s+(?:saw|expected|believed|thought|knew)\b/i,
    },
  ]);

/**
 * Classify whether text carries factual traceability risk.
 */
export function detectRetentionFactualRisk(
  statement: string,
): RetentionFactualRiskResult {
  if (!statement || typeof statement !== "string") {
    return Object.freeze({ risky: false, signals: Object.freeze([]) });
  }
  const signals: string[] = [];
  const interrogative =
    /^(?:why|how|what|when|where|who|can|does|do|is|are|will|should|whether)\b/iu.test(
      statement.trim(),
    ) && /[?]$/u.test(statement.trim());
  for (const pattern of SIGNAL_PATTERNS) {
    if (pattern.id === "date") {
      if (statementHasRetentionDateSignal(statement)) signals.push(pattern.id);
      continue;
    }
    // A question can mention "goals" or "ranking" without asserting a stat.
    if (
      interrogative &&
      (pattern.id === "record_stat" || pattern.id === "ranking")
    ) {
      continue;
    }
    if (pattern.re.test(statement)) {
      signals.push(pattern.id);
    }
  }
  return Object.freeze({
    risky: signals.length > 0,
    signals: Object.freeze(signals),
  });
}
