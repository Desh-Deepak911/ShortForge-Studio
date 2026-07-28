/**
 * Sprint 11E Phase 2D.1D — progressive Upstash live diagnostic entry.
 * Run: npm run test:headless-upstash-progressive
 * Gate: HEADLESS_UPSTASH_QA_PROGRESSIVE=1
 * Never overwrites docs/evidence/headless/current/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.
 */

import { runUpstashProgressiveHarness } from "../upstash-live/run-upstash-progressive-harness";

async function main() {
  const result = await runUpstashProgressiveHarness();
  if (result.overall === "NOT_TESTED") {
    console.log(
      "  NOT TESTED — set HEADLESS_UPSTASH_QA_PROGRESSIVE=1 with DATABASE_URL + Upstash REST/TCP + HEADLESS_ENV_NAME=staging.",
    );
  } else {
    console.log(`  Overall: ${result.overall}`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
