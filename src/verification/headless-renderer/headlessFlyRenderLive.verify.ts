/**
 * Sprint 11E Phase 2E.2D.8A — Hosted Fly render live matrix entrypoint.
 * Run: npm run test:headless-fly-render-live
 *
 * Gate: HEADLESS_FLY_RENDER_QA=1
 * Gate-off → NOT_TESTED / exit 0 / zero provider connections.
 */

import { runFlyRenderLiveHarness } from "./fly-render-live/run-fly-render-live-harness";

async function main() {
  const result = await runFlyRenderLiveHarness();
  if (result.overall === "PASS") {
    console.log("\nHosted Fly render live matrix: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log("\nHosted Fly render live matrix: NOT_TESTED (gate off)\n");
  } else {
    console.error(`\nHosted Fly render live matrix: ${result.overall}\n`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
