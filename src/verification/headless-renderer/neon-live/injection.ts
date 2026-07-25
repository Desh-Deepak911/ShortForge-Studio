/**
 * Deterministic exception-injection points for progressive matrix attribution.
 * Never carries provider text — throw markers are anonymous.
 */

export const NEON_LIVE_INJECTION_POINTS = Object.freeze([
  "live_fixture_construction",
  "staging_append",
  "provisional_cas",
  "canonical_pair_construction",
  "promotion",
  "queue_listing",
  "claim",
  "transition",
  "recovery_helper",
  "malformed_row_probe",
] as const);

export type NeonLiveInjectionPoint = (typeof NEON_LIVE_INJECTION_POINTS)[number];

/** Expected active required case when a point throws. */
export const INJECTION_EXPECTED_CASE = Object.freeze({
  live_fixture_construction: "job.provisional_create",
  staging_append: "job.provisional_cas_staging",
  provisional_cas: "job.provisional_cas_staging",
  canonical_pair_construction: "job.promote_atomic",
  promotion: "job.promote_atomic",
  queue_listing: "job.queue_listing",
  claim: "job.claim_race",
  transition: "job.stale_cas",
  recovery_helper: "job.recovery_live_claim_not_stolen",
  malformed_row_probe: "job.malformed_json_fail_closed",
} as const satisfies Record<NeonLiveInjectionPoint, string>);

export const PROGRESSIVE_SAFE_STAGES = Object.freeze([
  "matrix_bootstrap",
  "schema_preflight",
  "ownership",
  "fixture_construction",
  "provisional_create",
  "staging_append",
  "provisional_cas",
  "canonical_pair",
  "canonical_pair_construction",
  "promotion_record_read",
  "promotion_preflight",
  "promotion_update",
  "promotion_rehydrate",
  "promotion_post_write",
  "promotion",
  "queue_listing",
  "claim",
  "transition",
  "recovery",
  "malformed_probe",
  "cleanup",
  "case_step",
] as const);

export type ProgressiveSafeStage = (typeof PROGRESSIVE_SAFE_STAGES)[number];

export const INJECTION_SAFE_STAGE = Object.freeze({
  live_fixture_construction: "fixture_construction",
  staging_append: "staging_append",
  provisional_cas: "provisional_cas",
  canonical_pair_construction: "canonical_pair_construction",
  promotion: "promotion",
  queue_listing: "queue_listing",
  claim: "claim",
  transition: "transition",
  recovery_helper: "recovery",
  malformed_row_probe: "malformed_probe",
} as const satisfies Record<NeonLiveInjectionPoint, ProgressiveSafeStage>);

const STAGE_SET = new Set<string>(PROGRESSIVE_SAFE_STAGES);

export function isProgressiveSafeStage(value: unknown): value is ProgressiveSafeStage {
  return typeof value === "string" && STAGE_SET.has(value);
}

export function maybeInjectThrow(
  injectThrowAt: NeonLiveInjectionPoint | undefined,
  point: NeonLiveInjectionPoint,
): void {
  if (injectThrowAt === point) {
    throw new Error("NEON_LIVE_INJECTED");
  }
}

/** Map required case ID → allowlisted diagnostic stage (no secrets). */
export function defaultSafeStageForCase(caseId: string): ProgressiveSafeStage {
  if (caseId.startsWith("ownership.")) return "ownership";
  if (caseId === "job.provisional_create") return "provisional_create";
  // Default for this case is append-construction; CAS failures set provisional_cas explicitly.
  if (caseId === "job.provisional_cas_staging") return "staging_append";
  if (
    caseId === "job.promote_atomic" ||
    caseId.startsWith("job.forged_") ||
    caseId === "job.already_promoted_replay"
  ) {
    return "promotion";
  }
  if (caseId === "job.queue_listing") return "queue_listing";
  if (caseId === "job.claim_race") return "claim";
  if (caseId === "job.stale_cas" || caseId === "job.terminal_immutability") {
    return "transition";
  }
  if (caseId.startsWith("job.recovery_")) return "recovery";
  if (caseId === "job.malformed_json_fail_closed") return "malformed_probe";
  if (caseId === "job.verification_coverage") return "provisional_cas";
  return "case_step";
}
