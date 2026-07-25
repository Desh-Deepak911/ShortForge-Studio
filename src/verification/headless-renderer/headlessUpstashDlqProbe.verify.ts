/**
 * Sprint 11E Phase 2D.1G — gated Upstash targeted DLQ probe entrypoint.
 * Run: npm run test:headless-upstash-dlq-probe
 *
 * Gate: HEADLESS_UPSTASH_QA_DLQ_PROBE=1 + DATABASE_URL + Upstash REST+TCP + staging
 * Gate-off: zero connections; preserve prior evidence; NOT_TESTED.
 * Never overwrites progressive or official live evidence.
 */

import { runUpstashDlqProbe } from "./upstash-live/dlq-probe";

async function main(): Promise<void> {
  const { exitCode } = await runUpstashDlqProbe({ env: process.env });
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — DLQ probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
