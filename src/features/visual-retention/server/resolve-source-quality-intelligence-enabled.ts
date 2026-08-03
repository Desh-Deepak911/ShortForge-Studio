/**
 * Server-only helper: resolve source-quality-intelligence-v1 from an env snapshot.
 * Never import this into client bundles that must not see process.env.
 */

import { isSourceQualityIntelligenceCapabilityEnabled } from "../domain/source-quality-intelligence-capability";
import { resolveVisualRetentionGatesFromEnvironment } from "../domain/visual-retention-environment";

export function resolveSourceQualityIntelligenceEnabledFromEnvironment(
  env: Readonly<Record<string, unknown>>,
): boolean {
  return isSourceQualityIntelligenceCapabilityEnabled(
    resolveVisualRetentionGatesFromEnvironment(env),
  );
}
