/**
 * Exact QA run-scoped stream key shape (Sprint 11E 2D.1F).
 * Server/harness validation only — not exported from the production barrel.
 * Never accepts client-supplied arbitrary stream names.
 */

const QA_RUN_STREAM_KEY_RE =
  /^hfq:qa-run:v1:(render|verify|render-dlq|verify-dlq):(local|staging|production):[a-f0-9]{32}$/;

/**
 * True only for exact `hfq:qa-run:v1:…` keys with a 32-hex digest.
 */
export function isExactQaRunScopedStreamKey(streamKey: string): boolean {
  return typeof streamKey === "string" && QA_RUN_STREAM_KEY_RE.test(streamKey);
}
