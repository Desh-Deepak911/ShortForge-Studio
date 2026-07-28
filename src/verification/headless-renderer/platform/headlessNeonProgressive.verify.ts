/**
 * Gated progressive Neon diagnostic entrypoint.
 * Gate: HEADLESS_NEON_QA_PROGRESSIVE=1 + DATABASE_URL
 * Never overwrites official live evidence.
 */

import { runNeonProgressiveDiagnostic } from "../neon-live/run-neon-progressive-diagnostic";

async function main(): Promise<void> {
  console.log("\nSprint 11E Phase 2B.2D.1 — Neon progressive diagnostic\n");
  const result = await runNeonProgressiveDiagnostic();
  process.exitCode = result.exitCode;
}

main().catch(() => {
  console.log("\nFAIL — progressive diagnostic terminated unexpectedly.\n");
  process.exitCode = 1;
});
