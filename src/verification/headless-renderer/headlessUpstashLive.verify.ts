/**
 * Sprint 11E Phase 2D.1 — Upstash dual-lease live harness entry (gated).
 * Run: npm run test:headless-upstash-live
 * DO NOT run with HEADLESS_UPSTASH_QA=1 in Phase 2D.1 (no remote contact).
 */

import { runUpstashLiveHarness } from "./upstash-live/run-upstash-live-harness";

async function main() {
  const result = await runUpstashLiveHarness();
  if (result.overall === "NOT_TESTED") {
    console.log(
      "\nSprint 11E Phase 2D.1 — Upstash live: NOT_TESTED (gate off)\n",
    );
  } else {
    console.log(
      `\nSprint 11E Phase 2D.1 — Upstash live: ${result.overall} (exit ${result.exitCode})\n`,
    );
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
