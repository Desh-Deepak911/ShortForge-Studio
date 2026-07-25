/**
 * Operator CLI: apply Headless Neon SQL migrations.
 *
 *   HEADLESS_NEON_MIGRATE=1 DATABASE_URL_UNPOOLED=... npm run migrate:headless-neon
 *
 * Never falls back to DATABASE_URL. Never runs on app startup.
 */

import { runHeadlessMigrations } from "./run-headless-migrations";

async function main() {
  console.log("\nSprint 11E Phase 2B.2B — Headless Neon migration runner\n");
  const result = await runHeadlessMigrations();
  if (!result.ok) {
    console.log(`  REFUSED/FAIL — ${result.code}`);
    console.log(`  ${result.message}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`  OK — applied=${result.applied.length} skipped=${result.skipped.length}`);
  for (const id of result.applied) {
    console.log(`    applied: ${id}`);
  }
  for (const id of result.skipped) {
    console.log(`    skipped: ${id}`);
  }
  console.log("");
}

main().catch(() => {
  console.log("  FAIL — migration runner terminated unexpectedly.\n");
  process.exitCode = 1;
});
