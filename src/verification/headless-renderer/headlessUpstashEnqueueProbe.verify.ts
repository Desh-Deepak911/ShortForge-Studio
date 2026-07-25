/**
 * Sprint 11E Phase 2D.1B — gated Upstash targeted enqueue probe entrypoint.
 * Run: npm run test:headless-upstash-enqueue-probe
 *
 * Gate: HEADLESS_UPSTASH_QA_ENQUEUE_PROBE=1 + DATABASE_URL + Upstash REST+TCP + staging
 * Gate-off: zero connections; preserve prior evidence; NOT_TESTED.
 * Never overwrites docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.
 */

import { runUpstashEnqueueProbe } from "./upstash-live/enqueue-probe";

async function main(): Promise<void> {
  const { exitCode } = await runUpstashEnqueueProbe({ env: process.env });
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — enqueue probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
