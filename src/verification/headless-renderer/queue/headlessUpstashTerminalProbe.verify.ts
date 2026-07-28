/**
 * Sprint 11E Phase 2D.1C — gated Upstash targeted terminal probe entrypoint.
 * Run: npm run test:headless-upstash-terminal-probe
 *
 * Gate: HEADLESS_UPSTASH_QA_TERMINAL_PROBE=1 + DATABASE_URL + Upstash REST+TCP + staging
 * Gate-off: zero connections; preserve prior evidence; NOT_TESTED.
 * Never overwrites docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.
 */

import { runUpstashTerminalProbe } from "../upstash-live/terminal-probe";

async function main(): Promise<void> {
  const { exitCode } = await runUpstashTerminalProbe({ env: process.env });
  process.exitCode = exitCode;
}

main().catch(() => {
  console.log("\n  FAIL — terminal probe terminated unexpectedly.\n");
  process.exitCode = 1;
});
