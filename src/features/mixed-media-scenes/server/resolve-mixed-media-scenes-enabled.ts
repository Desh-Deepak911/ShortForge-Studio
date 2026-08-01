/**
 * Server-only helper: resolve mixed-media-scenes-v1 from an env snapshot.
 * Never import this into client bundles that must not see process.env.
 */

import { resolveVisualRetentionGatesFromEnvironment } from "@/features/visual-retention";

import { isMixedMediaScenesCapabilityEnabled } from "../domain/mixed-media-scenes-capability";

export function resolveMixedMediaScenesEnabledFromEnvironment(
  env: Readonly<Record<string, unknown>>,
): boolean {
  return isMixedMediaScenesCapabilityEnabled(
    resolveVisualRetentionGatesFromEnvironment(env),
  );
}
