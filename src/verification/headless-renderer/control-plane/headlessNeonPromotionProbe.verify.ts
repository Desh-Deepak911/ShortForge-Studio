/**
 * Sprint 11E Phase 2B.2D.3 — gated Neon promotion probe entrypoint.
 * Run: npm run test:headless-neon-promotion-probe
 *
 * Gate: HEADLESS_NEON_QA_PROMOTION_PROBE=1 + DATABASE_URL
 * Gate-off: zero Neon connections; preserve prior evidence; NOT_TESTED.
 */

import { runNeonPromotionProbe } from "../neon-live/promotion-probe";

async function main(): Promise<void> {
  const { exitCode } = await runNeonPromotionProbe(process.env);
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — promotion probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
