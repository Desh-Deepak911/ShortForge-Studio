/**
 * Sprint 11E Phase 2D.1E — gated Upstash targeted claim/ACK probe entrypoint.
 * Run: npm run test:headless-upstash-claim-ack-probe
 *
 * Gate: HEADLESS_UPSTASH_QA_CLAIM_ACK_PROBE=1 + DATABASE_URL + Upstash REST+TCP + staging
 * Gate-off: zero connections; preserve prior evidence; NOT_TESTED.
 * Never overwrites docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.
 */

import { runUpstashClaimAckProbe } from "./upstash-live/claim-ack-probe";

async function main(): Promise<void> {
  const { exitCode } = await runUpstashClaimAckProbe({ env: process.env });
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — claim/ACK probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
