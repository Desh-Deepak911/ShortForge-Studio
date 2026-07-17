/**
 * Hook-type-free PI resolver for explicit evidence-led-surprise creator intent.
 * Sprint 7D.3 / 7E — production reachability + semantic fact vs statistic preference.
 *
 * Does not import Hook types.
 */

export type EvidenceLedSurprisePreferenceKind =
  | "evidence_fact"
  | "evidence_statistic";

export interface ResolveEvidenceLedSurprisePreferenceInput {
  readonly topic?: string;
  /** Creator notes / manual context — never inferred from research payloads alone. */
  readonly context?: string;
}

/** Statistic-preferring phrases (checked before generic fact phrases). */
const EVIDENCE_STATISTIC_PHRASES: readonly RegExp[] = Object.freeze([
  /\bsurprising\s+stat(?:istic)?s?\b/i,
  /\bunexpected\s+(?:numbers?|stat(?:istic)?s?)\b/i,
  /\bshocking\s+stat(?:istic)?s?\b/i,
  /\bcounterintuitive\s+stat(?:istic)?s?\b/i,
]);

/** Generic evidence-fact phrases. */
const EVIDENCE_FACT_PHRASES: readonly RegExp[] = Object.freeze([
  /\bsurprising\s+facts?\b/i,
  /\bcounterintuitive\s+facts?\b/i,
]);

function normalizeCreatorText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Returns a typed preference only when the creator explicitly requests
 * evidence-led surprise via a narrowly defined phrase.
 * Bare “surprise me”, rankings, or ordinary scorelines do not match.
 */
export function resolveEvidenceLedSurprisePreference(
  input: ResolveEvidenceLedSurprisePreferenceInput,
): EvidenceLedSurprisePreferenceKind | undefined {
  const haystack = [normalizeCreatorText(input.topic), normalizeCreatorText(input.context)]
    .filter(Boolean)
    .join("\n");

  if (!haystack) {
    return undefined;
  }

  if (EVIDENCE_STATISTIC_PHRASES.some((pattern) => pattern.test(haystack))) {
    return "evidence_statistic";
  }

  if (EVIDENCE_FACT_PHRASES.some((pattern) => pattern.test(haystack))) {
    return "evidence_fact";
  }

  return undefined;
}

/** True when any evidence-led surprise preference is present. */
export function hasEvidenceLedSurprisePreference(
  preference: EvidenceLedSurprisePreferenceKind | boolean | undefined,
): boolean {
  return (
    preference === true ||
    preference === "evidence_fact" ||
    preference === "evidence_statistic"
  );
}

export function normalizeEvidenceLedSurprisePreference(
  preference: EvidenceLedSurprisePreferenceKind | boolean | undefined,
): EvidenceLedSurprisePreferenceKind | undefined {
  if (preference === true || preference === "evidence_fact") {
    return "evidence_fact";
  }
  if (preference === "evidence_statistic") {
    return "evidence_statistic";
  }
  return undefined;
}
