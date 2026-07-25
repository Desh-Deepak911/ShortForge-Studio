/**
 * Explicit test-only import surface for Sprint 11C.1 / 11C.1A.
 * Production Route Handlers must not import from this barrel.
 */

export {
  composeTestHeadlessControlPlane,
  type HeadlessTestControlPlaneStack,
} from "./compose-test-control-plane";
export {
  seedOwnedJsonObject,
  seedOwnedManifestAndBundle,
  asMemoryStorage,
} from "./seed-owned-objects";
export { MemoryHeadlessStorageAdapter } from "../adapters/memory-storage.adapter";
export { memoryStorageLocatorKey } from "../adapters/memory-storage.adapter";
export { MemoryHeadlessJobStoreAdapter } from "../adapters/memory-job-store.adapter";
export { MemoryHeadlessQueueAdapter } from "../adapters/memory-queue.adapter";
export { MemoryHeadlessStreamQueueAdapter } from "../adapters/memory-stream-queue.adapter";
export {
  FakeRedisStreams,
  createFakeUpstashRestClient,
  createFakeIoredisLike,
} from "./fake-redis-streams";
export { MemoryHeadlessArtifactCleanupAdapter } from "../adapters/memory-artifact-cleanup.adapter";
export { MemoryHeadlessRenderDispatchOutboxAdapter } from "../adapters/memory-render-dispatch-outbox.adapter";
export { TestHeadlessPrincipalAdapter } from "../adapters/test-principal.adapter";
export { TestHeadlessProjectAuthorizationAdapter } from "../adapters/test-project-authorization.adapter";
export { MemoryHeadlessProjectOwnershipAdapter } from "../adapters/memory-project-ownership.adapter";
export {
  ScriptedHeadlessSqlExecutor,
  InMemoryHeadlessSqlFixture,
  assertExplicitJobSelectColumns,
  assertExplicitOwnedObjectSelectColumns,
  type FakeSqlCapturedQuery,
  type FakeSqlScriptedResult,
} from "./fake-sql-executor";
export { NeonHeadlessProjectAuthorizationAdapter } from "../adapters/neon-project-authorization.adapter";
export { NeonHeadlessJobStoreAdapter } from "../adapters/neon-job-store.adapter";
export { NeonHeadlessOwnedObjectStoreAdapter } from "../adapters/neon-owned-object-store.adapter";
export { MemoryHeadlessOwnedObjectStoreAdapter } from "../adapters/memory-owned-object-store.adapter";
export {
  FakeHeadlessMigrationClient,
  createFakeMigrationClientFactory,
} from "./fake-migration-client";
export { HeadlessFakeWorker } from "../fake-worker/fake-worker";
export { processHeadlessArtifactCleanupOnce } from "../services/process-artifact-cleanup";
export { validateHeadlessArtifactCleanupIntent } from "../services/validate-artifact-cleanup-intent";
export {
  stableHeadlessCleanupId,
  stableHeadlessCleanupIdempotencyKey,
} from "../services/stable-cleanup-id";
/** QA/testing — promotion attribution surfaces (not public Headless barrel). */
export {
  HEADLESS_PROMOTION_SAFE_STAGES,
  HEADLESS_PROMOTION_RESULT_KINDS,
  HEADLESS_STORE_VERSION_DELTA_CLASSES,
  emptyPromotionAttribution,
  sanitizePromotionAttribution,
  isHeadlessPromotionSafeStage,
  type HeadlessPromotionSafeStage,
  type HeadlessPromotionResultKind,
  type HeadlessStoreVersionDeltaClass,
  type HeadlessPromotionStageClass,
  type HeadlessPromotionAttribution,
  type HeadlessPromotionAttributedResult,
} from "../services/promotion-attribution";
export {
  HEADLESS_PROMOTION_REASON_IDS,
  sanitizeHeadlessPromotionReasonId,
  isHeadlessPromotionReasonId,
  type HeadlessPromotionReasonId,
} from "../services/promotion-reason-ids";
export {
  evaluateHeadlessPromotionPreflight,
  type HeadlessPromotionPreflightResult,
} from "../services/promotion-preflight-authority";
