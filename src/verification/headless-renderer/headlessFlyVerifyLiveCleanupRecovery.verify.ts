/**
 * Sprint 11E Phase 2E.2D.7A.2 — Cleanup recovery entrypoint (separately gated).
 */

import { runFlyVerifyCleanupRecoveryHarness } from "./fly-verify-live/run-fly-verify-cleanup-recovery";

async function main() {
  const result = await runFlyVerifyCleanupRecoveryHarness();
  if (result.overall === "PASS") {
    console.log("\nHosted Fly verifier cleanup recovery: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log("\nHosted Fly verifier cleanup recovery: NOT_TESTED (gate off)\n");
  } else if (result.overall === "PARTIAL") {
    console.error("\nHosted Fly verifier cleanup recovery: PARTIAL\n");
  } else {
    console.error(`\nHosted Fly verifier cleanup recovery: ${result.overall}\n`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
