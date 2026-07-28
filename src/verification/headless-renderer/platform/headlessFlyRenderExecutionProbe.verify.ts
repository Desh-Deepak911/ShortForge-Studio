/**
 * Sprint 11E Phase 2E.2D.8F — Fly render execution probe entrypoint.
 * Run: npm run test:headless-fly-render-execution-probe
 */

import { runFlyRenderExecutionProbe } from "../fly-render-live/claimed-render-execution-probe";

runFlyRenderExecutionProbe()
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
