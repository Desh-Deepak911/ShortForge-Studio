/**
 * Visual-retention staging-only feature-gate authority.
 *
 * Pure domain: callers provide deployment facts. This module never reads
 * process.env, contacts providers, or infers staging from NODE_ENV.
 */

export const VISUAL_RETENTION_PHASE_IDS = [
  "12A",
  "12B",
  "12C",
  "12D",
  "12E",
  "12F",
  "12G",
] as const;

export type VisualRetentionPhaseId =
  (typeof VISUAL_RETENTION_PHASE_IDS)[number];

export type VisualRetentionDeploymentTarget =
  | "local"
  | "staging"
  | "production"
  | "unknown";

export type VisualRetentionGateRejectionReason =
  | "not_requested"
  | "invalid_request"
  | "non_staging_environment"
  | "main_branch_rejected"
  | "production_deployment_rejected"
  | "staging_development_branch_rejected"
  | "dependency_not_enabled";

/**
 * Closed staging-development branch allowlist.
 * Do not broaden to arbitrary feature branches — add explicit
 * staging-development names only when a visual-retention branch is authorized.
 */
export const VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES = Object.freeze([
  "staging",
  "sprint12-staging-compat-safety-foundation",
  "sprint12c-staging-visual-beat-density",
  "staging-source-quality-intelligence",
  "staging-keyframed-motion-overlays",
] as const);

export interface VisualRetentionPhaseGateState {
  readonly enabled: boolean;
  readonly reason: VisualRetentionGateRejectionReason | null;
}
export interface VisualRetentionPhaseGateSnapshotV1 {
  readonly version: 1;
  readonly deploymentTarget: VisualRetentionDeploymentTarget;
  readonly sourceBranch: string | null;
  readonly valid: boolean;
  readonly phases: Readonly<
    Record<VisualRetentionPhaseId, VisualRetentionPhaseGateState>
  >;
  readonly issues: readonly string[];
}

export interface ResolveVisualRetentionPhaseGatesInput {
  readonly deploymentTarget: VisualRetentionDeploymentTarget;
  readonly sourceBranch?: string | null;
  /** Exact comma-separated phase IDs, for example `12A,12B`. */
  readonly requestedPhases?: string | null;
}

const PHASE_SET = new Set<string>(VISUAL_RETENTION_PHASE_IDS);

function disabledPhaseMap(
  reason: VisualRetentionGateRejectionReason,
): Record<VisualRetentionPhaseId, VisualRetentionPhaseGateState> {
  return Object.fromEntries(
    VISUAL_RETENTION_PHASE_IDS.map((phase) => [
      phase,
      Object.freeze({ enabled: false, reason }),
    ]),
  ) as Record<VisualRetentionPhaseId, VisualRetentionPhaseGateState>;
}

function normalizeBranch(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^refs\/heads\//, "");
  return normalized || null;
}

function isMainBranch(branch: string | null): boolean {
  return branch === "main" || branch === "master";
}

const STAGING_DEVELOPMENT_BRANCH_SET = new Set<string>(
  VISUAL_RETENTION_STAGING_DEVELOPMENT_BRANCHES,
);

/** True only for the closed staging / staging-development branch allowlist. */
export function isAllowedVisualRetentionStagingDevelopmentBranch(
  branch: string | null | undefined,
): boolean {
  const normalized = normalizeBranch(branch ?? null);
  return normalized !== null && STAGING_DEVELOPMENT_BRANCH_SET.has(normalized);
}

function parseRequestedPhases(value: string | null | undefined):
  | { readonly ok: true; readonly phases: ReadonlySet<VisualRetentionPhaseId> }
  | { readonly ok: false; readonly issues: readonly string[] } {
  if (value === null || value === undefined || value.trim() === "") {
    return { ok: true, phases: new Set<VisualRetentionPhaseId>() };
  }

  const raw = value.split(",").map((item) => item.trim());
  const invalid = raw.filter((item) => !PHASE_SET.has(item));
  if (invalid.length > 0) {
    return {
      ok: false,
      issues: invalid.map((item) => `Unknown visual-retention phase: ${item || "<empty>"}.`),
    };
  }

  return {
    ok: true,
    phases: new Set(raw as VisualRetentionPhaseId[]),
  };
}

/**
 * Resolves a detached, serializable phase snapshot.
 *
 * Gates are active only on staging with an allowlisted staging-development
 * branch. Main/master and production are hard-off even if every phase is
 * requested. Later phases require all earlier phases; missing dependencies
 * fail closed rather than creating partial behavior.
 */
export function resolveVisualRetentionPhaseGates(
  input: ResolveVisualRetentionPhaseGatesInput,
): VisualRetentionPhaseGateSnapshotV1 {
  const sourceBranch = normalizeBranch(input.sourceBranch);

  if (isMainBranch(sourceBranch)) {
    return Object.freeze({
      version: 1 as const,
      deploymentTarget: input.deploymentTarget,
      sourceBranch,
      valid: false,
      phases: Object.freeze(disabledPhaseMap("main_branch_rejected")),
      issues: Object.freeze(["Visual retention is forbidden on main/master."]),
    });
  }

  if (input.deploymentTarget === "production") {
    return Object.freeze({
      version: 1 as const,
      deploymentTarget: input.deploymentTarget,
      sourceBranch,
      valid: false,
      phases: Object.freeze(
        disabledPhaseMap("production_deployment_rejected"),
      ),
      issues: Object.freeze(["Visual retention is forbidden in production."]),
    });
  }

  if (input.deploymentTarget !== "staging") {
    return Object.freeze({
      version: 1 as const,
      deploymentTarget: input.deploymentTarget,
      sourceBranch,
      valid: false,
      phases: Object.freeze(disabledPhaseMap("non_staging_environment")),
      issues: Object.freeze(["Visual retention requires explicit staging authority."]),
    });
  }

  if (!isAllowedVisualRetentionStagingDevelopmentBranch(sourceBranch)) {
    return Object.freeze({
      version: 1 as const,
      deploymentTarget: input.deploymentTarget,
      sourceBranch,
      valid: false,
      phases: Object.freeze(
        disabledPhaseMap("staging_development_branch_rejected"),
      ),
      issues: Object.freeze([
        "Visual retention requires an allowlisted staging-development branch.",
      ]),
    });
  }

  const requested = parseRequestedPhases(input.requestedPhases);
  if (!requested.ok) {
    return Object.freeze({
      version: 1 as const,
      deploymentTarget: input.deploymentTarget,
      sourceBranch,
      valid: false,
      phases: Object.freeze(disabledPhaseMap("invalid_request")),
      issues: Object.freeze([...requested.issues]),
    });
  }

  const phases = {} as Record<
    VisualRetentionPhaseId,
    VisualRetentionPhaseGateState
  >;
  const issues: string[] = [];
  let dependencyChainEnabled = true;

  for (const phase of VISUAL_RETENTION_PHASE_IDS) {
    const phaseRequested = requested.phases.has(phase);
    if (!phaseRequested) {
      phases[phase] = Object.freeze({
        enabled: false,
        reason: "not_requested" as const,
      });
      dependencyChainEnabled = false;
      continue;
    }

    if (!dependencyChainEnabled) {
      phases[phase] = Object.freeze({
        enabled: false,
        reason: "dependency_not_enabled" as const,
      });
      issues.push(`${phase} requires every earlier visual-retention phase to be enabled.`);
      continue;
    }

    phases[phase] = Object.freeze({ enabled: true, reason: null });
  }

  return Object.freeze({
    version: 1 as const,
    deploymentTarget: input.deploymentTarget,
    sourceBranch,
    valid: issues.length === 0,
    phases: Object.freeze(phases),
    issues: Object.freeze(issues),
  });
}
