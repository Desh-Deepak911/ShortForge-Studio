#!/usr/bin/env -S npx tsx
/**
 * Sprint 11E Phase 2G.24G.1 — digest-bound deployment pair CLI for shell orchestrators.
 * Emits only safe classifications — never secret values.
 */

import {
  buildHeadlessFlyStagingPublicEnvironmentForImageDigestSha256,
  classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence,
  resolveHeadlessFlyStagingCurrentDeploymentPairDigestSha256,
  resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";

const [command, ...args] = process.argv.slice(2);

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

switch (command) {
  case "resolve-build-id": {
    const digest = args[0];
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(digest);
    if (!resolved.ok) die(resolved.reasonId);
    console.log(resolved.pair.rendererBuildId);
    break;
  }
  case "resolve-current-build-id": {
    const digest = resolveHeadlessFlyStagingCurrentDeploymentPairDigestSha256();
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(digest);
    if (!resolved.ok) die(resolved.reasonId);
    console.log(resolved.pair.rendererBuildId);
    break;
  }
  case "resolve-current-digest": {
    console.log(resolveHeadlessFlyStagingCurrentDeploymentPairDigestSha256());
    break;
  }
  case "validate-coherence": {
    const [digest, buildId, materializedBuildId] = args;
    const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
      imageDigestSha256: digest,
      rendererBuildId: buildId,
      materializedRendererBuildId: materializedBuildId ?? buildId,
    });
    if (!coherence.ok) die(coherence.reasonId);
    console.log("ok");
    break;
  }
  case "resolve-public-env-build-id": {
    const digest = args[0];
    const resolved = buildHeadlessFlyStagingPublicEnvironmentForImageDigestSha256(digest);
    if (!resolved.ok) die(resolved.reasonId);
    console.log(resolved.publicEnvironment.HEADLESS_RENDERER_BUILD_ID);
    break;
  }
  default:
    die("hostile_input");
}
