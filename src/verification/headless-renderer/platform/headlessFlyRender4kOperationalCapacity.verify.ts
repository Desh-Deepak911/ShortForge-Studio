/**
 * Sprint 11E Phase 2E.2D.8L — hosted 4K operational-duration matrix entrypoint.
 * Run: npm run test:headless-fly-render-4k-operational-capacity
 *
 * Gate: HEADLESS_FLY_RENDER_4K_QA=1
 * Gate-off → NOT_TESTED / exit 0 / zero provider connections.
 * Writes separate operational evidence — never overwrites short functional PASS.
 */

import { runFlyRender4kCapacityHarness } from "../fly-render-4k-capacity/run-fly-render-4k-capacity-harness";

async function main() {
  const result = await runFlyRender4kCapacityHarness({
    mode: "operational_duration",
  });
  if (result.overall === "PASS") {
    console.log("\nHosted 4K operational capacity matrix: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log("\nHosted 4K operational capacity matrix: NOT_TESTED (gate off)\n");
  } else {
    console.error(`\nHosted 4K operational capacity matrix: ${result.overall}\n`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
