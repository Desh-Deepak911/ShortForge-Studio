/**
 * Server-only helper: resolve visual-beat-density-v1 from an env snapshot.
 * Never import this into client bundles that must not see process.env.
 */

import { isVisualBeatDensityCapabilityEnabled } from "../domain/visual-beat-density-capability";
import { resolveVisualRetentionGatesFromEnvironment } from "../domain/visual-retention-environment";

export function resolveVisualBeatDensityEnabledFromEnvironment(
  env: Readonly<Record<string, unknown>>,
): boolean {
  return isVisualBeatDensityCapabilityEnabled(
    resolveVisualRetentionGatesFromEnvironment(env),
  );
}
