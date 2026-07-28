/**
 * Sprint 11E Phase 2E.2D.8C.1 — Fly render owned-object staging probe entrypoint.
 * Run: npm run test:headless-fly-render-owned-object-staging-probe
 */

import { runFlyRenderOwnedObjectStagingProbe } from "../fly-render-live/owned-object-staging-probe";

runFlyRenderOwnedObjectStagingProbe()
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
