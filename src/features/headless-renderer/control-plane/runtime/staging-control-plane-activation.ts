/**
 * Fail-closed website activation for the hosted headless control plane.
 *
 * The website control plane is intentionally available only for staging. A
 * Vercel production deployment is rejected even if variables are copied there.
 */

export type StagingHeadlessControlPlaneActivationStatus =
  | "active"
  | "disabled"
  | "wrong_headless_environment"
  | "production_deployment_rejected";

export function classifyStagingHeadlessControlPlaneActivation(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): StagingHeadlessControlPlaneActivationStatus {
  try {
    if (env.HEADLESS_CONTROL_PLANE_ENABLED !== "1") return "disabled";
    if (env.HEADLESS_ENV_NAME !== "staging") {
      return "wrong_headless_environment";
    }
    if (env.VERCEL_ENV === "production") {
      return "production_deployment_rejected";
    }
    return "active";
  } catch {
    return "disabled";
  }
}
