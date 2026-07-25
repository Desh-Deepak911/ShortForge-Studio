/**
 * Sprint 11E Phase 2E.2D.8K.2 — 4K capacity cleanup recovery verify entrypoint.
 * Run: npm run test:headless-fly-render-4k-capacity-cleanup-recovery
 */

import { runFlyRender4kCapacityCleanupRecoveryHarness } from "./fly-render-4k-capacity/run-fly-render-4k-capacity-cleanup-recovery";

async function main() {
  const result = await runFlyRender4kCapacityCleanupRecoveryHarness();
  console.log(`\n4K capacity cleanup recovery: ${result.overall}\n`);
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
