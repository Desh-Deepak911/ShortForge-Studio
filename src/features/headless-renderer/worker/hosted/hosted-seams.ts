/**
 * Honest hosted composition seams — Phase 2E.2C.2.
 * Render storage + durable cleanup + trusted verify→promotion closed locally.
 * Packaging/dynamic-module bundling resolved for deployable_worker.
 */

export type HeadlessHostedCompositionSeamId =
  /** Closed in 2E.2A.3 — durable staging before PutObject + fail-closed delete saga. */
  | "RENDER_STORAGE_PORT_SEAM"
  /** Closed in 2E.2A.3 — coherent cleanup + terminal protected/rejected no-delete. */
  | "ARTIFACT_CLEANUP_DURABLE_SEAM"
  /**
   * Closed in 2E.2B — trusted full-object verify → provisional coverage reconcile
   * → canonical promotion → stable render enqueue under the existing dual-lease claim.
   */
  | "VERIFY_PROMOTION_COMPOSITION_SEAM";

/** Seams closed locally — packaging resolved in 2E.2C.2 for deployable_worker. */
export const HEADLESS_HOSTED_CLOSED_SEAMS = Object.freeze([
  "RENDER_STORAGE_PORT_SEAM",
  "ARTIFACT_CLEANUP_DURABLE_SEAM",
  "VERIFY_PROMOTION_COMPOSITION_SEAM",
] as const satisfies readonly HeadlessHostedCompositionSeamId[]);

/**
 * Remaining open seams for render mode.
 * Empty after 2E.2A — functional seams closed.
 */
export const HEADLESS_HOSTED_RENDER_SEAMS = Object.freeze(
  [] as const satisfies readonly HeadlessHostedCompositionSeamId[],
);

/**
 * Remaining open seams for verify mode.
 * Empty after 2E.2B — functional seams closed.
 */
export const HEADLESS_HOSTED_VERIFY_SEAMS = Object.freeze(
  [] as const satisfies readonly HeadlessHostedCompositionSeamId[],
);
