/**
 * Hosted worker startup ordering — delivery events cannot precede schema PASS.
 * Authority-only contract; production worker behavior unchanged.
 */

export const HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT = true as const;

export const HOSTED_WORKER_CANONICAL_STARTUP_ORDER = Object.freeze([
  "hosted.schema.preflight",
  "hosted.loop.started",
  "hosted.loop.delivery",
] as const);
