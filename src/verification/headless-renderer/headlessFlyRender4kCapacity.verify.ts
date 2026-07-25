/**
 * Sprint 11E Phase 2E.2D.8K.1 — hosted 4K capacity matrix entrypoint.
 * Run: npm run test:headless-fly-render-4k-capacity
 *
 * Gate: HEADLESS_FLY_RENDER_4K_QA=1
 * Gate-off → NOT_TESTED / exit 0 / zero provider connections.
 */

import { runFlyRender4kCapacityHarness } from "./fly-render-4k-capacity/run-fly-render-4k-capacity-harness";

async function main() {
  const result = await runFlyRender4kCapacityHarness();
  if (result.overall === "PASS") {
    console.log("\nHosted 4K capacity matrix: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log("\nHosted 4K capacity matrix: NOT_TESTED (gate off)\n");
  } else {
    console.error(`\nHosted 4K capacity matrix: ${result.overall}\n`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
