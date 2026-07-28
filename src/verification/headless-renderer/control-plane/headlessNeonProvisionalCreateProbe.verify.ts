/**
 * Sprint 11E Phase 2B.2D — isolated Neon provisional-create probe.
 * Run: HEADLESS_NEON_QA=1 DATABASE_URL=… npm run test:headless-neon-provisional-create-probe
 */

import { runProvisionalCreateProbe } from "../neon-live/provisional-create-probe";

async function main(): Promise<void> {
  const { exitCode } = await runProvisionalCreateProbe(process.env);
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — provisional create probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
