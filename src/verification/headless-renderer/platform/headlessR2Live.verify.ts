/**
 * Sprint 11E Phase 2C.1A — R2 live harness entry (gated).
 * Run: npm run test:headless-r2-live
 *
 * Gate-off (default): NOT_TESTED, exit 0, zero Neon/R2 connections.
 * Gate-on requires HEADLESS_R2_QA=1 + DATABASE_URL + R2 configured.
 * NEVER migrates. NEVER uses DATABASE_URL_UNPOOLED.
 */

import { runR2LiveHarness } from "../r2-live/run-r2-live-harness";

async function main() {
  const result = await runR2LiveHarness();
  if (result.overall === "NOT_TESTED") {
    console.log(
      "\nSprint 11E Phase 2C.1A — R2 live: NOT_TESTED (gate off)\n",
    );
  } else {
    console.log(
      `\nSprint 11E Phase 2C.1A — R2 live: ${result.overall} (exit ${result.exitCode})\n`,
    );
  }
  process.exit(result.exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
