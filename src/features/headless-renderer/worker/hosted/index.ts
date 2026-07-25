/**
 * Hosted Fly worker composition — server-only.
 * Product routes, Next.js Route Handlers, and browser code must not import this barrel.
 */

export {
  classifyHeadlessHostedWorkerEnvironment,
  isHeadlessHostedWorkerEnvironmentConfigured,
  readConfiguredHeadlessHostedWorkerEnvironment,
  HEADLESS_HOSTED_FLY_SECRET_NAMES,
  HEADLESS_HOSTED_FLY_NONSECRET_ENV_NAMES,
  type HeadlessHostedWorkerMode,
  type HeadlessHostedEnvName,
  type HeadlessHostedWorkerEnvironmentStatus,
  type HeadlessHostedWorkerEnvironmentReasonId,
  type HeadlessConfiguredHostedWorkerEnvironment,
  type HeadlessHostedWorkerEnvironmentClassification,
} from "./hosted-environment";
export {
  composeHostedHeadlessWorker,
  type HostedWorkerComposition,
  type HostedWorkerCompositionMap,
} from "./compose-hosted-worker";
export { materializeHostedWorkerAdapters } from "./materialize-hosted-worker-adapters";
export {
  HEADLESS_HOSTED_CLOSED_SEAMS,
  HEADLESS_HOSTED_RENDER_SEAMS,
  HEADLESS_HOSTED_VERIFY_SEAMS,
  type HeadlessHostedCompositionSeamId,
} from "./hosted-seams";
export {
  HEADLESS_HOSTED_NODE_MAJOR,
  HEADLESS_HOSTED_REJECTED_NODE_MAJORS,
  HEADLESS_HOSTED_IMAGE_CLASS,
  HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES,
  HEADLESS_HOSTED_UNRESOLVED_COMPOSITION_SEAMS,
  buildHeadlessHostedFoundationManifest,
  buildHeadlessHostedBuildManifest,
  serializeHeadlessHostedBuildManifest,
  assertFoundationImageNotDeployable,
  assertDeployableWorkerImage,
  type HeadlessHostedBuildManifest,
  type HeadlessHostedImageClass,
} from "./hosted-image-classification";
export { runHostedBinaryPreflight } from "./hosted-binary-preflight";
export {
  createHostedWorkerLoop,
  type HostedWorkerLoopDeps,
  type HostedWorkerLoopHandle,
  type HostedClaimedRenderHookInput,
} from "./hosted-worker-loop";
export {
  createHostedShutdownLifecycle,
  type HostedShutdownLifecycle,
} from "./hosted-shutdown-lifecycle";
export {
  runHostedWorkerEntrypoint,
  main as runHostedWorkerMain,
  type HostedEntrypointOptions,
  type HostedEntrypointResult,
} from "./hosted-entrypoint";
export {
  emitHostedWorkerEvent,
  createStdoutHostedWorkerEventSink,
  type HeadlessHostedWorkerEvent,
  type HeadlessHostedWorkerEventName,
  type HeadlessHostedWorkerEventSink,
} from "./hosted-events";
export * from "./fly-staging";
