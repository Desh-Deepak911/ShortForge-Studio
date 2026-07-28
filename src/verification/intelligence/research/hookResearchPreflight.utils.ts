/**
 * Sprint 7E.4A — Hook live research preflight evidence (QA-only).
 * Authentication alone must never authorize live Hook QA.
 * Never logs secrets, claim text, or raw provider payloads.
 */

export interface HookResearchPreflightEvidence {
  readonly credentialsPresent: boolean;
  readonly authenticationValid: boolean;
  readonly entityResolved: boolean;
  readonly fixtureResolved: boolean;
  readonly structuredProviderPayloadReturned: boolean;
  readonly eligibleVerifiedStatisticAvailable: boolean;
  /** True only when every gate above is true. */
  readonly liveQaAuthorized: boolean;
  readonly safeErrorCategory:
    | "server_configuration"
    | "research_unavailable"
    | "model_or_api_failure"
    | null;
}

export interface HookResearchPreflightInput {
  readonly credentialsPresent: boolean;
  readonly httpSuccess: boolean;
  readonly executionStatus?: string;
  readonly warnings?: readonly string[];
  readonly diagnosticBlobs?: readonly string[];
  readonly entityCount?: number;
  readonly fixtureCount?: number;
  readonly statisticCount?: number;
  readonly verifiedFactCount?: number;
  readonly rankingCount?: number;
  readonly eventCount?: number;
  readonly lineupCount?: number;
  /** Count of verified facts that look like numeric/statistic evidence. */
  readonly eligibleVerifiedStatisticCount?: number;
}

function joinSignals(input: HookResearchPreflightInput): string {
  return [
    ...(input.warnings ?? []),
    ...(input.diagnosticBlobs ?? []),
    input.executionStatus ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function isAuthInvalid(signal: string): boolean {
  return /missing application key|api_football_key is not configured|error\/missing application key|invalid api key|unauthorized\b|\b401\b|\b403\b/.test(
    signal,
  );
}

/**
 * Evaluate structured preflight gates for authorizing HOOK_LIVE_QA.
 * Does not invent research — only classifies provided counts/signals.
 */
export function evaluateHookResearchPreflight(
  input: HookResearchPreflightInput,
): HookResearchPreflightEvidence {
  const signal = joinSignals(input);
  const authenticationValid =
    input.credentialsPresent && input.httpSuccess && !isAuthInvalid(signal);

  const entityResolved = (input.entityCount ?? 0) > 0;
  const fixtureResolved = (input.fixtureCount ?? 0) > 0;

  const structuredProviderPayloadReturned =
    (input.verifiedFactCount ?? 0) > 0 ||
    (input.statisticCount ?? 0) > 0 ||
    (input.fixtureCount ?? 0) > 0 ||
    (input.eventCount ?? 0) > 0 ||
    (input.lineupCount ?? 0) > 0 ||
    (input.rankingCount ?? 0) > 0;

  // Require an explicit eligible verified statistic count — raw statistic rows
  // alone (or auth alone) must never authorize live Hook QA.
  const eligibleVerifiedStatisticAvailable =
    (input.eligibleVerifiedStatisticCount ?? 0) > 0;

  const liveQaAuthorized =
    authenticationValid &&
    entityResolved &&
    fixtureResolved &&
    structuredProviderPayloadReturned &&
    eligibleVerifiedStatisticAvailable;

  let safeErrorCategory: HookResearchPreflightEvidence["safeErrorCategory"] = null;
  if (!input.httpSuccess) {
    safeErrorCategory = "model_or_api_failure";
  } else if (!input.credentialsPresent || isAuthInvalid(signal)) {
    safeErrorCategory = "server_configuration";
  } else if (!liveQaAuthorized) {
    safeErrorCategory = "research_unavailable";
  }

  return {
    credentialsPresent: input.credentialsPresent,
    authenticationValid,
    entityResolved,
    fixtureResolved,
    structuredProviderPayloadReturned,
    eligibleVerifiedStatisticAvailable,
    liveQaAuthorized,
    safeErrorCategory,
  };
}
