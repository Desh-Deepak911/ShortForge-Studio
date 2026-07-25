/**
 * Sprint 11E Phase 2E.2D.8I.3 — execution-probe cleanup recovery entrypoint.
 */

import { runFlyRenderExecutionProbeCleanupRecoveryHarness } from "./fly-render-live/run-fly-render-execution-probe-cleanup-recovery";

async function main() {
  const result = await runFlyRenderExecutionProbeCleanupRecoveryHarness();
  if (result.overall === "PASS") {
    console.log("\nHosted Fly render execution-probe cleanup recovery: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log(
      "\nHosted Fly render execution-probe cleanup recovery: NOT_TESTED (gate off)\n",
    );
  } else {
    console.error(
      `\nHosted Fly render execution-probe cleanup recovery: ${result.overall}\n`,
    );
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
