/**
 * Leaf renderer build identity — safe for hosted env classification bundles.
 * Do not import domain/export barrels from this file.
 */

/** Canonical image2pipe streaming renderer identity (Phase 3.2 / 3.2A). */
export const HEADLESS_PHASE3_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.24e" as const;

/**
 * Schema-008 rollback bridge build identity — accepted only with
 * HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE=rollback_bridge_007_008.
 */
export const HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.24e-bridge008" as const;

/**
 * Cleanup-runtime integration build identity — accepted only on schema 008 with
 * maintenance explicitly gated off until controlled rollout activation.
 */
export const HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime" as const;

/**
 * Caption/trim parity hosted identity — accepted additively so a later
 * staging image can advertise it. Does not replace 24e or 25.
 */
export const HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.26-caption-trim-parity" as const;

/** Hosted env accepted set — historical IDs stay valid after this additive ID. */
export const HEADLESS_HOSTED_ACCEPTED_RENDERER_BUILD_IDS = Object.freeze([
  HEADLESS_PHASE3_RENDERER_BUILD_ID,
  HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
  HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
] as const);

/**
 * Artifact / capability / diagnostic identity set.
 * Default job identity remains 24e so existing web jobs stay compatible
 * before the caption/trim worker is deployed.
 */
export const HEADLESS_ACCEPTED_WORKER_RENDERER_BUILD_IDS = Object.freeze([
  HEADLESS_PHASE3_RENDERER_BUILD_ID,
  HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
] as const);

export function isAcceptedHostedRendererBuildId(buildId: unknown): boolean {
  return (
    typeof buildId === "string" &&
    (HEADLESS_HOSTED_ACCEPTED_RENDERER_BUILD_IDS as readonly string[]).includes(
      buildId,
    )
  );
}

export function isAcceptedHeadlessWorkerRendererBuildId(
  buildId: unknown,
): boolean {
  return (
    typeof buildId === "string" &&
    (HEADLESS_ACCEPTED_WORKER_RENDERER_BUILD_IDS as readonly string[]).includes(
      buildId,
    )
  );
}

/**
 * Superseded PNG-sequence / Phase 3.1A identity — fail closed where build
 * coherence is required; never accepted by the Phase 3.2 worker.
 */
export const HEADLESS_PHASE3_LEGACY_BUILD_ID =
  "headless-local-chromium-ffmpeg-11d-phase3.1a" as const;

/** @deprecated Prefer HEADLESS_PHASE3_LEGACY_BUILD_ID */
export const HEADLESS_PHASE3_LEGACY_BUILD_ID_3_1 =
  "headless-local-chromium-ffmpeg-11d-phase3.1" as const;
