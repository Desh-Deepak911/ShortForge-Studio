/**
 * Sprint 11E Phase 2E.2D.8B — Fly render targeted job-create probe entrypoint.
 * Run: HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE=1 npm run test:headless-fly-render-job-create-probe
 */

import { runFlyRenderJobCreateProbe } from "./fly-render-live/job-create-probe";

async function main() {
  const result = await runFlyRenderJobCreateProbe();
  if (result.overall === "PASS") {
    console.log("\nFly render job-create probe: PASS\n");
  } else if (result.overall === "NOT_TESTED") {
    console.log("\nFly render job-create probe: NOT_TESTED (gate off)\n");
  } else {
    console.error(`\nFly render job-create probe: ${result.overall}\n`);
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
