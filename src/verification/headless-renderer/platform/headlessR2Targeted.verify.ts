/**
 * Sprint 11E Phase 2C.1B — R2 targeted harness entry (gated).
 * Run: npm run test:headless-r2-targeted
 *
 * Gate-off (default): NOT_TESTED, exit 0, zero Neon/R2 connections.
 * Gate-on requires HEADLESS_R2_QA_TARGETED=1 + DATABASE_URL + R2 configured.
 * NEVER migrates. NEVER uses DATABASE_URL_UNPOOLED.
 * NEVER writes official docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md.
 */

import { runR2TargetedHarness } from "../r2-targeted/run-r2-targeted-harness";

async function main() {
  const result = await runR2TargetedHarness();
  if (result.overall === "NOT_TESTED") {
    console.log(
      "\nSprint 11E Phase 2C.1B — R2 targeted: NOT_TESTED (gate off)\n",
    );
  } else {
    console.log(
      `\nSprint 11E Phase 2C.1B — R2 targeted: ${result.overall} (exit ${result.exitCode})\n`,
    );
  }
  process.exit(result.exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
