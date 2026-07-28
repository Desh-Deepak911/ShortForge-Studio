/**
 * Sprint 11E Phase 2D.1H — gated Upstash targeted concurrency probe entrypoint.
 * Run: npm run test:headless-upstash-concurrency-probe
 *
 * Gate: HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE=1 + DATABASE_URL + Upstash REST+TCP + staging
 * Gate-off: zero connections; preserve prior evidence; NOT_TESTED.
 * Never overwrites progressive or official live evidence.
 */

import { runUpstashConcurrencyProbe } from "../upstash-live/concurrency-probe";

async function main(): Promise<void> {
  const { exitCode } = await runUpstashConcurrencyProbe({ env: process.env });
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — concurrency probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
