/**
 * Optional gated Neon live integration harness.
 *
 * Gate off:
 *   npm run test:headless-neon-live
 *   → zero database calls, NOT TESTED, exit 0, preserve prior evidence
 *
 * Gate on (authorized evidence pass only — not run in Phase 2B.2B verification):
 *   HEADLESS_NEON_QA=1 DATABASE_URL=... npm run test:headless-neon-live
 *
 * Migrations are a separate operator action:
 *   HEADLESS_NEON_MIGRATE=1 DATABASE_URL_UNPOOLED=... npm run migrate:headless-neon
 *
 * Preserve failed QA rows (optional): HEADLESS_NEON_QA_PRESERVE=1
 */

import { runNeonLiveHarness } from "./neon-live/run-neon-live-harness";

async function main() {
  console.log("\nSprint 11E Phase 2B.2B — Neon live harness\n");
  const result = await runNeonLiveHarness();
  process.exitCode = result.exitCode;
  console.log("");
}

main().catch(() => {
  console.log("  FAIL — live harness terminated unexpectedly.\n");
  process.exitCode = 1;
});
