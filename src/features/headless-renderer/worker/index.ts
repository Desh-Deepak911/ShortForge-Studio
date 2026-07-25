/**
 * Sprint 11D — Isolated Chromium + native FFmpeg worker.
 * Production app/client roots and Route Handlers must not import this barrel.
 */

export {
  HEADLESS_WORKER_RENDERER_BUILD_ID,
  HEADLESS_WORKER_PHASE3_SUPPORTED,
  HEADLESS_WORKER_PHASE2_SUPPORTED,
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerBinaries,
  type HeadlessWorkerLimits,
  type HeadlessWorkerRunResult,
  type HeadlessWorkerArtifactEvidence,
} from "./runtime/worker-types";
export {
  HEADLESS_OUTPUT_PROFILES,
  HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
  resolveHeadlessOutputProfile,
  headlessOutputProfileId,
  headlessMaxFramesForRenderDurationMs,
  type HeadlessOutputProfile,
  type HeadlessOutputProfileId,
} from "./runtime/output-profiles";
export { buildHeadlessFramePlan } from "./runtime/frame-plan";
export { assertClaimedWorkerJob } from "./runtime/claim-gate";
export {
  assertPhase3WorkerCapability,
  assertPhase2WorkerCapability,
  assertPhase1WorkerCapability,
} from "./runtime/capability-preflight";
export { executeHeadlessRenderJob } from "./runtime/execute-render-job";
export {
  executeClaimedRender,
  CLAIMED_RENDER_EXECUTOR_ID,
  mapClaimedRenderToHostedResult,
  type ClaimedRenderExecutionResult,
  type HostedClaimedRenderResult,
  type HeadlessOrphanCleanupReport,
} from "./runtime/execute-claimed-render";
export { confirmDurableClaimCoherence } from "./runtime/confirm-durable-claim-coherence";
export { LocalHeadlessWorkerRunner } from "./runtime/local-worker-runner";
export { resolveSystemChromeExecutable } from "./chromium/chrome-executable";
export { resolveNativeFfmpegBinaries } from "./ffmpeg/resolve-ffmpeg-binaries";
export { startStreamedPngEncode } from "./ffmpeg/encode-png-stream";
export { spawnFixedArgv, redactSpawnDiagnostics } from "./ffmpeg/spawn-process";
// Legacy PNG-directory encode is test/reference-only via worker/testing/reference-encode.
export { createHeadlessWorkerWorkspace } from "./assets/workspace";
export { buildHeadlessAudioPlan } from "./audio/build-headless-audio-plan";
export type { HeadlessAudioPlan } from "./audio/audio-plan.types";
export {
  applyHeadlessFormatToManifest,
  applyHeadlessOutputProfileToManifest,
} from "./testing/apply-output-profile";
export {
  assertHeadlessDurationAuthority,
  assertHeadlessManifestTargetCompatibility,
  resolveHeadlessRenderTarget,
  type HeadlessRenderTarget,
} from "./runtime/render-target";
export {
  HEADLESS_PROVIDER_CAPACITY_DEFAULTS,
  HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS,
  HEADLESS_PROVIDER_OWNED_LIMIT_KEYS,
  mergeValidatedDefaultsAndOverrides,
  intersectProfileAndProviderLimits,
  assertProviderCapacityForProfile,
  resolveEffectiveWorkerLimits,
} from "./runtime/resolve-worker-limits";
