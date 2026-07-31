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
 * Superseded PNG-sequence / Phase 3.1A identity — fail closed where build
 * coherence is required; never accepted by the Phase 3.2 worker.
 */
export const HEADLESS_PHASE3_LEGACY_BUILD_ID =
  "headless-local-chromium-ffmpeg-11d-phase3.1a" as const;

/** @deprecated Prefer HEADLESS_PHASE3_LEGACY_BUILD_ID */
export const HEADLESS_PHASE3_LEGACY_BUILD_ID_3_1 =
  "headless-local-chromium-ffmpeg-11d-phase3.1" as const;
