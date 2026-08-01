import {
  resolveVisualRetentionPhaseGates,
  type VisualRetentionDeploymentTarget,
  type VisualRetentionPhaseGateSnapshotV1,
} from "./visual-retention-phase-gates";

export const VISUAL_RETENTION_PHASES_ENV =
  "SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES" as const;

/**
 * Server adapter input kept explicit for deterministic tests and client safety.
 * Callers may pass process.env from a server-only boundary; this module does not
 * read it itself.
 */
export function resolveVisualRetentionGatesFromEnvironment(
  env: Readonly<Record<string, unknown>>,
): VisualRetentionPhaseGateSnapshotV1 {
  const vercelEnvironment =
    typeof env.VERCEL_ENV === "string" ? env.VERCEL_ENV : null;
  const headlessEnvironment =
    typeof env.HEADLESS_ENV_NAME === "string" ? env.HEADLESS_ENV_NAME : null;

  const deploymentTarget: VisualRetentionDeploymentTarget =
    vercelEnvironment === "production"
      ? "production"
      : headlessEnvironment === "staging"
        ? "staging"
        : "unknown";

  return resolveVisualRetentionPhaseGates({
    deploymentTarget,
    sourceBranch:
      typeof env.VERCEL_GIT_COMMIT_REF === "string"
        ? env.VERCEL_GIT_COMMIT_REF
        : null,
    requestedPhases:
      typeof env[VISUAL_RETENTION_PHASES_ENV] === "string"
        ? (env[VISUAL_RETENTION_PHASES_ENV] as string)
        : null,
  });
}
