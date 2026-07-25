/**
 * Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live matrix entrypoint.
 * Run: npm run test:headless-fly-verify-live
 *
 * Gate: HEADLESS_FLY_VERIFY_QA=1
 * Gate-off → NOT_TESTED / exit 0 / zero provider connections.
 */

import { runFlyVerifyLiveHarness } from "./fly-verify-live/run-fly-verify-live-harness";

async function main() {
  const result = await runFlyVerifyLiveHarness();
  if (result.overall === "PASS") {
    console.log("\nHosted Fly verifier live matrix: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log("\nHosted Fly verifier live matrix: NOT_TESTED (gate off)\n");
  } else {
    console.error(`\nHosted Fly verifier live matrix: ${result.overall}\n`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
