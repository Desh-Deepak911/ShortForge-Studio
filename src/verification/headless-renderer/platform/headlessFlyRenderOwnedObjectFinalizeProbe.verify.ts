/**
 * Sprint 11E Phase 2E.2D.8E — Fly render owned-object finalize probe entrypoint.
 * Run: npm run test:headless-fly-render-owned-object-finalize-probe
 */

import { runFlyRenderOwnedObjectFinalizeProbe } from "../fly-render-live/owned-object-finalize-probe";

runFlyRenderOwnedObjectFinalizeProbe()
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
