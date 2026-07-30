/**
 * Sprint 11C / 11C.1 / 11C.1A — Headless control plane (provider-neutral).
 * Production routes are configuration-blocked until auth + durable adapters exist.
 * QA seeding, memory adapters, and fake worker live in the sibling testing package only.
 */

export {
  HEADLESS_CONTROL_PLANE_TRANSPORT_VERSION,
  HEADLESS_MANIFEST_MAX_BYTES,
  HEADLESS_JOB_REQUEST_MAX_BYTES,
  HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS,
  cpFail,
  cpOk,
  type HeadlessCreateJobTransportV1,
  type HeadlessPublicJobViewV1,
  type HeadlessControlPlaneResult,
  type HeadlessCreateJobResult,
  type HeadlessControlPlaneErrorCode,
  type HeadlessControlPlaneIssue,
} from "./types/control-plane.types";

export type {
  HeadlessAuthenticatedPrincipal,
  HeadlessTrustedPrincipal,
  HeadlessPrincipalPort,
} from "./ports/principal.port";
export type { HeadlessProjectAuthorizationPort } from "./ports/project-authorization.port";
export type {
  HeadlessStoragePort,
  HeadlessUploadSession,
  HeadlessObjectMetadata,
  HeadlessUploadPurpose,
} from "./ports/storage.port";
export type {
  HeadlessJobStorePort,
  HeadlessStoredJobRecord,
  HeadlessProvisionalStoredJobRecord,
  HeadlessCanonicalStoredJobRecord,
  HeadlessProvisionalStoreWrite,
  HeadlessCanonicalStoreWrite,
  HeadlessPromoteProvisionalInput,
  HeadlessPromoteProvisionalResult,
} from "./ports/job-store.port";
export {
  HEADLESS_STORED_JOB_RECORD_VERSION,
  isProvisionalStoredJobRecord,
  isCanonicalStoredJobRecord,
  narrowCanonicalStoredJobRecord,
  canonicalJobState,
  type HeadlessStoredJobStage,
  type HeadlessProvisionalJobState,
  type HeadlessProvisionalSnapshotClaimV1,
  type HeadlessProvisionalSlotClaimV1,
  type HeadlessProvisionalStagingObjectRefV1,
  type HeadlessProvisionalVerificationCoverageV1,
  type HeadlessProvisionalReasonId,
} from "./types/stored-job-record";
export {
  validateHeadlessProvisionalStoredJobRecord,
  validateHeadlessCanonicalStoredJobRecord,
  validateHeadlessStoredJobRecord,
  validateHeadlessProvisionalSnapshotClaim,
  validateHeadlessProvisionalStagingObjectRef,
  validateHeadlessProvisionalStagingObjectRefs,
  validateHeadlessProvisionalVerificationCoverage,
} from "./services/validate-provisional-stored-job";
export {
  createProvisionalMaterializingRecord,
  cancelProvisionalRecord,
  failProvisionalRecord,
  expireProvisionalRecord,
  updateProvisionalVerificationCoverage,
  appendProvisionalStagingObjectRefs,
  type CreateProvisionalMaterializingRecordInput,
  type ProvisionalLifecycleResult,
} from "./services/provisional-job-lifecycle";
export {
  validateHeadlessClaimableProjectId,
  isHeadlessClaimableProjectId,
} from "./services/validate-claimable-project-id";
export {
  deriveRequiredVerificationTargets,
  headlessAssetBytesVerificationTarget,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
} from "./services/provisional-verification-targets";
export type { HeadlessArtifactObjectBindingV1 } from "./types/artifact-object-binding";
export { HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION } from "./types/artifact-object-binding";
export {
  validateHeadlessArtifactObjectBinding,
  buildValidatedArtifactObjectBinding,
  assertArtifactObjectBindingCoherence,
  assertStoredBindingStateRules,
} from "./services/validate-artifact-object-binding";
export { evaluateArtifactObjectBindingCoherence } from "./services/evaluate-artifact-object-binding-coherence";
export {
  classifyArtifactObjectBindingFieldComparisons,
  classifyArtifactObjectBindingMismatchShape,
  buildProductionShapedArtifactObjectKey,
  productionShapedArtifactObjectKeyLength,
} from "./services/classify-artifact-object-binding-field-comparisons";
export type {
  HeadlessArtifactCleanupIntentV1,
  HeadlessArtifactCleanupReasonId,
  HeadlessArtifactCleanupIntentState,
  HeadlessArtifactCleanupNoDeleteDisposition,
} from "./types/artifact-cleanup-intent";
export {
  HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
  HEADLESS_ARTIFACT_CLEANUP_REASON_IDS,
  HEADLESS_ARTIFACT_CLEANUP_NO_DELETE_DISPOSITIONS,
  HEADLESS_ARTIFACT_CLEANUP_TERMINAL_STATES,
  isHeadlessArtifactCleanupTerminalState,
} from "./types/artifact-cleanup-intent";
export type {
  HeadlessArtifactCleanupPort,
  HeadlessStoredCleanupIntent,
} from "./ports/artifact-cleanup.port";
export { validateHeadlessArtifactCleanupIntent } from "./services/validate-artifact-cleanup-intent";
export {
  stableHeadlessCleanupId,
  stableHeadlessCleanupIdempotencyKey,
} from "./services/stable-cleanup-id";
export { processHeadlessArtifactCleanupOnce } from "./services/process-artifact-cleanup";
export { deleteArtifactUnderDurableAuthority } from "./services/delete-artifact-under-durable-authority";
export type {
  ArtifactDeletionSagaResult,
  ArtifactDeletionSagaStatus,
} from "./services/delete-artifact-under-durable-authority";
export type {
  HeadlessArtifactObjectIOPort,
  HeadlessArtifactObjectPresence,
} from "./ports/artifact-object-io.port";
export { createR2ArtifactObjectIO } from "./adapters/r2-artifact-object-io.adapter";
export type {
  HeadlessQueuePort,
  HeadlessQueueMessage,
  HeadlessDeliveryKind,
  HeadlessVerifyQueueMessage,
  HeadlessRenderQueueMessage,
  HeadlessStreamQueueEntry,
} from "./ports/queue.port";
export { validateHeadlessStreamQueueEntry } from "./ports/queue.port";
export type {
  HeadlessStreamQueuePort,
  HeadlessStreamQueueReadItem,
} from "./ports/stream-queue.port";
export {
  HEADLESS_QUEUE_DLQ_CLASSES,
  validateHeadlessQueueDlqEntry,
  type HeadlessQueueDlqClass,
  type HeadlessQueueDlqEntry,
} from "./types/queue-dlq-entry";

export { UnavailableHeadlessPrincipalAdapter } from "./adapters/unavailable-principal.adapter";
export { UnavailableHeadlessProjectAuthorizationAdapter } from "./adapters/unavailable-project-authorization.adapter";
export { UnavailableUpstashRestQueueProducerAdapter } from "./adapters/unavailable-upstash-rest-queue-producer.adapter";
export {
  ClerkHeadlessPrincipalAdapter,
  createProductionClerkAuthReader,
  type ClerkAuthReader,
  type ClerkAuthSnapshot,
} from "./adapters/clerk-principal.adapter";
export { validateHeadlessAuthenticatedPrincipal } from "./services/validate-authenticated-principal";
export { validateClerkAuthSnapshot } from "./services/validate-clerk-auth-snapshot";
export {
  classifyClerkEnvironment,
  isClerkEnvironmentConfigured,
  CLERK_ENV_KEY_MAX_LENGTH,
  type ClerkEnvironmentStatus,
} from "./runtime/clerk-environment";
export {
  classifyHeadlessNeonEnvironment,
  isHeadlessNeonEnvironmentConfigured,
  HEADLESS_DATABASE_URL_MAX_LENGTH,
  type HeadlessNeonEnvironmentStatus,
} from "./runtime/neon-environment";
export {
  classifyHeadlessR2Environment,
  isHeadlessR2EnvironmentConfigured,
  readConfiguredHeadlessAllowedOrigins,
  HEADLESS_R2_ACCOUNT_ID_MAX_LENGTH,
  HEADLESS_R2_ACCESS_KEY_ID_MAX_LENGTH,
  HEADLESS_R2_SECRET_ACCESS_KEY_MAX_LENGTH,
  HEADLESS_R2_BUCKET_MAX_LENGTH,
  HEADLESS_R2_ENDPOINT_MAX_LENGTH,
  HEADLESS_R2_ALLOWED_ORIGINS_MAX_LENGTH,
  type HeadlessR2EnvironmentStatus,
} from "./runtime/r2-environment";
export {
  classifyHeadlessUpstashProducerEnvironment,
  classifyHeadlessUpstashConsumerEnvironment,
  isHeadlessUpstashProducerEnvironmentConfigured,
  isHeadlessUpstashConsumerEnvironmentConfigured,
  readHeadlessQueueLeaseSettings,
  HEADLESS_QUEUE_PROTOCOL_VERSION,
  HEADLESS_UPSTASH_REST_URL_MAX_LENGTH,
  HEADLESS_UPSTASH_REST_TOKEN_MAX_LENGTH,
  HEADLESS_UPSTASH_TCP_URL_MAX_LENGTH,
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  type HeadlessEnvName,
  type HeadlessUpstashProducerEnvironmentStatus,
  type HeadlessUpstashConsumerEnvironmentStatus,
  type HeadlessQueueLeaseSettings,
} from "./runtime/upstash-environment";
export {
  deriveHeadlessQueueStreamNames,
  type HeadlessQueueStreamNames,
} from "./services/headless-queue-stream-names";
export {
  consumeRenderDeliveryOnce,
  type DualLeaseRenderConsumeAction,
  type DualLeaseRenderConsumeSuccess,
  type ConsumeRenderDeliveryOnceInput,
} from "./services/dual-lease-render-consume";
export {
  consumeVerifyDeliveryOnce,
  type DualLeaseVerifyConsumeAction,
  type DualLeaseVerifyConsumeSuccess,
  type ConsumeVerifyDeliveryOnceInput,
} from "./services/dual-lease-verify-consume";
export {
  createDualLeaseDlqAckObservation,
  freezeDlqAckObservation,
  type DualLeaseDlqAckObservation,
  type DualLeaseMalformedDlqAction,
} from "./services/dual-lease-dlq-ack-disposition";
export {
  recoverExpiredRenderClaimAndRequeue,
  recoverExpiredVerifyClaimAndRequeue,
  type RecoverExpiredRenderClaimInput,
  type RecoverExpiredRenderClaimSuccess,
  type RecoverExpiredVerifyClaimInput,
  type RecoverExpiredVerifyClaimSuccess,
} from "./services/dual-lease-recovery";
export {
  HEADLESS_OWNED_OBJECT_RECORD_VERSION,
  toHeadlessPublicOwnedObjectView,
  type HeadlessOwnedObjectPurpose,
  type HeadlessOwnedObjectRecordV1,
  type HeadlessStagingOwnedObjectRecordV1,
  type HeadlessFinalizedOwnedObjectRecordV1,
  type HeadlessRejectedOwnedObjectRecordV1,
  type HeadlessCleanupPendingOwnedObjectRecordV1,
  type HeadlessPublicOwnedObjectViewV1,
  type HeadlessOwnedObjectStoreId,
} from "./types/owned-object-record";
export { validateHeadlessOwnedObjectRecord } from "./services/validate-owned-object-record";
export {
  deriveHeadlessR2ObjectKey,
  recomputeHeadlessR2ObjectKey,
  type HeadlessR2ObjectKeyInput,
  type HeadlessR2ObjectKeyResult,
} from "./services/r2-object-key-authority";
export {
  verifyAndFinalizeR2OwnedObject,
  verifyAndFinalizeR2OwnedObjectUnderClaim,
  HEADLESS_R2_VERIFY_ALLOWED_MIME_TYPES,
  type HeadlessVerifyR2OwnedObjectInput,
  type HeadlessVerifyR2OwnedObjectUnderClaimInput,
  type HeadlessVerifyR2OwnedObjectSuccess,
  type HeadlessVerifyFailureDisposition,
} from "./services/verify-r2-owned-object";
export {
  executeTrustedVerifyPromotion,
  type ExecuteTrustedVerifyPromotionInput,
  type TrustedVerifyPromotionOutcome,
  type TrustedVerifyPromotionOutcomeKind,
} from "./services/execute-trusted-verify-promotion";
export {
  terminalizeProvisionalMaterializationRejection,
  type ProvisionalMaterializationTerminalizationResult,
} from "./services/terminalize-provisional-materialization-rejection";
export {
  materializeCanonicalFromFinalizedCoverage,
  type HeadlessCanonicalMaterializationSuccess,
} from "./services/materialize-canonical-from-finalized-coverage";
export { loadFinalizedOwnedObjectBytes } from "./services/load-finalized-owned-object-bytes";
export {
  verifyFinalizedOwnedObjectStream,
  preflightFinalizedAssetByteBudgets,
  type VerifyFinalizedOwnedObjectStreamSuccess,
} from "./services/verify-finalized-owned-object-stream";
export {
  recoverQueuedRenderDispatchesOnce,
  createQueuedDispatchRecoveryScheduler,
  HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_BATCH,
  HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_INTERVAL_MS,
  type RecoverQueuedRenderDispatchesOnceSuccess,
} from "./services/recover-queued-render-dispatches";
export {
  dispatchRenderOutboxOnce,
  dispatchRenderOutboxIntentOnce,
  createRenderDispatchOutboxScheduler,
  HEADLESS_DISPATCH_OUTBOX_DEFAULT_BATCH,
  HEADLESS_DISPATCH_OUTBOX_DEFAULT_INTERVAL_MS,
  HEADLESS_DISPATCH_OUTBOX_CLAIM_LEASE_MS,
  type DispatchRenderOutboxOnceSuccess,
  type DispatchSingleOutboxResult,
  type DispatchSingleOutboxResultKind,
} from "./services/dispatch-render-outbox";
export { ensureDispatchIntentForQueuedJob } from "./services/ensure-dispatch-intent-for-queued-job";
export type { HeadlessRenderDispatchOutboxPort } from "./ports/render-dispatch-outbox.port";
export type {
  HeadlessStoredRenderDispatchOutbox,
  HeadlessRenderDispatchOutboxState,
} from "./types/render-dispatch-outbox";
export { headlessDispatchBackoffMs } from "./types/render-dispatch-outbox";
export { NeonHeadlessRenderDispatchOutboxAdapter } from "./adapters/neon-render-dispatch-outbox.adapter";
export {
  parseHeadlessPgSafeInteger,
  parseHeadlessPgSafeIntegerOrNull,
} from "./services/parse-headless-pg-safe-integer";
export {
  reconcileFinalizedOwnedObjectCoverage,
  type HeadlessReconcileFinalizedCoverageResult,
} from "./services/reconcile-finalized-owned-object-coverage";
export type {
  HeadlessOwnedObjectStorePort,
  HeadlessStoredOwnedObject,
  HeadlessCreateStagingOwnedObjectInput,
  HeadlessFinalizeStagingOwnedObjectInput,
} from "./ports/owned-object-store.port";
export type {
  HeadlessUploadCapabilityPort,
  HeadlessIssuedUploadCapabilityV1,
} from "./ports/upload-capability.port";
export { UnavailableHeadlessUploadCapabilityAdapter } from "./ports/upload-capability.port";
export type {
  HeadlessDownloadCapabilityPort,
  HeadlessIssuedDownloadCapabilityV1,
} from "./ports/download-capability.port";
export { UnavailableHeadlessDownloadCapabilityAdapter } from "./ports/download-capability.port";
export type {
  HeadlessR2ObjectIOPort,
  HeadlessR2ObjectLocator,
  HeadlessR2ObjectMetadata,
} from "./ports/r2-object-io.port";
export {
  classifyHeadlessNeonMigrationEnvironment,
  isHeadlessNeonMigrationEnvironmentConfigured,
  isHeadlessNeonMigrateGateEnabled,
  isPostgresPoolerHostname,
  type HeadlessNeonMigrationEnvironmentStatus,
} from "./runtime/neon-migration-environment";
export type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
  HeadlessSqlQueryResult,
} from "./runtime/sql-client";
export {
  gateHeadlessRouteAuth,
  headlessRouteErrorBody,
  type HeadlessRouteAuthGateResult,
} from "./runtime/headless-route-auth-gate";
export {
  runHeadlessClerkProxy,
  type HeadlessClerkProxyDeps,
  type HeadlessProxyHandler,
} from "./runtime/headless-clerk-proxy";

export { HeadlessControlPlaneService } from "./services/control-plane.service";
export {
  toHeadlessPublicJobView,
  toHeadlessPublicJobViewFromStore,
} from "./services/safe-job-view";
export {
  parseHeadlessCreateJobTransport,
  rejectMediaPayloadInTransportBody,
} from "./services/transport-validate";
export {
  assertHeadlessMaterializationPolicy,
  classifyHeadlessMaterializationRequirement,
  rejectUnrestrictedRemoteFetchAuthority,
  isAssetsMaterializeRouteHeadlessAuthority,
} from "./services/materialization-policy";
export {
  verifyOwnedAssetBytes,
  headlessMinExpiryDeadline,
} from "./services/verify-owned-assets";
export {
  stableHeadlessDeliveryId,
  stableHeadlessVerifyDeliveryId,
} from "./services/stable-delivery-id";

export {
  evaluateOwnedObjectDeletionAuthority,
  type HeadlessOwnedObjectDeletionDecision,
  type HeadlessOwnedObjectDeletionExpectation,
} from "./services/evaluate-owned-object-deletion-authority";
export {
  runHeadlessTerminalCleanupCoordinator,
  type HeadlessTerminalCleanupLocalHooks,
  type HeadlessTerminalCleanupOrphanTarget,
  type HeadlessTerminalCleanupResult,
} from "./services/headless-terminal-cleanup-coordinator";
export {
  claimHeadlessMaintenanceLease,
  releaseHeadlessMaintenanceLease,
  runHeadlessExportMaintenanceBatchOnce,
  HEADLESS_MAINTENANCE_DEFAULT_BATCH_SIZE,
  HEADLESS_MAINTENANCE_MAX_DELETIONS_PER_RUN,
  HEADLESS_MAINTENANCE_LEASE_MS,
  type HeadlessMaintenanceBatchCursor,
  type HeadlessMaintenanceBatchResult,
} from "./services/headless-export-maintenance-batch";
export {
  buildHeadlessExportCleanupMetrics,
  validateHeadlessExportCleanupMetricsPrivacy,
  type HeadlessExportCleanupMetricsV1,
} from "./services/headless-export-cleanup-metrics";

export { composeProductionHeadlessControlPlane } from "./runtime/compose-production-control-plane";
export {
  interpretExactXpendingResponse,
  pendingProbeToDeprecatedBoolean,
  type HeadlessPendingProbeResult,
} from "./runtime/pending-probe";
export {
  interpretExactXrangeResponse,
  type HeadlessStreamPresenceProbeResult,
} from "./runtime/stream-presence-probe";
export {
  interpretGroupPresence,
  interpretXinfoGroupsResponse,
  type HeadlessGroupListProbeResult,
  type HeadlessGroupPresenceProbeResult,
  type HeadlessQaGroupInfo,
} from "./runtime/group-presence-probe";
export {
  interpretDelResponse,
  interpretExistsResponse,
  type HeadlessKeyDeleteResult,
  type HeadlessKeyProbeResult,
} from "./runtime/key-presence-probe";
