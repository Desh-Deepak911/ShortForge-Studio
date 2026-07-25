/**
 * Sprint 11E Phase 1 — provider-neutral product dispatch (client-safe).
 * Does not export control-plane, worker, or testing fakes.
 */

export {
  PRODUCTION_HEADLESS_UNAVAILABLE,
  HEADLESS_AVAILABILITY_STATES,
  type HeadlessAvailabilityState,
  type HeadlessAvailabilityV1,
} from "./availability/availability.types";
export { validateHeadlessAvailabilityResponse } from "./availability/validate-availability-response";

export type {
  HeadlessRenderClient,
  HeadlessCreateJobClientBody,
} from "./client/headless-render-client.port";
export { createHttpHeadlessRenderClient, HttpHeadlessRenderClient } from "./client/http-headless-render.client";
export {
  creatorMessageForReasonId,
  creatorMessageForClientError,
  HEADLESS_EXPORT_INTRO,
  HEADLESS_4K_DURATION_COPY,
} from "./client/creator-messages";
export {
  validateHeadlessPublicJobView,
  validateHeadlessDownloadCapability,
} from "./client/validate-public-job-view";
export type {
  HeadlessPublicJobView,
  HeadlessDownloadCapabilityV1,
  HeadlessClientResult,
  HeadlessClientErrorCode,
  HeadlessPublicJobState,
} from "./client/public-job.types";

export {
  reduceHeadlessProduct,
  isHeadlessProductTerminal,
  statusLabelForProductState,
} from "./state/product-dispatch.machine";
export {
  createInitialProductModel,
  HEADLESS_PRODUCT_STATES,
  type HeadlessProductModel,
  type HeadlessProductEvent,
  type HeadlessProductState,
  type HeadlessProductSnapshotMeta,
  type HeadlessOutputSummary,
} from "./state/product-dispatch.types";

export {
  evaluateHeadlessOutputCompatibility,
  HEADLESS_PRODUCT_CONTENT_MAX_MS,
  HEADLESS_PRODUCT_RENDER_MAX_MS,
  headlessProfileId,
  type HeadlessOutputCompatibilityInput,
  type HeadlessOutputCompatibilityResult,
} from "./snapshot/output-compatibility";
export {
  freezeHeadlessClickAuthority,
  type FrozenHeadlessClickAuthority,
} from "./snapshot/freeze-export-snapshot";

export {
  validateActiveJobReference,
  readActiveJobReference,
  writeActiveJobReference,
  clearActiveJobReference,
  reconcileActiveJobReference,
  HEADLESS_ACTIVE_JOB_STORAGE_KEY,
  type HeadlessActiveJobReferenceV1,
} from "./persistence/active-job-reference";

export { startBoundedJobPoller, type BoundedPollerHandle } from "./polling/bounded-job-poller";

export {
  dispatchOwnedHeadlessJob,
  type DispatchOwnedHeadlessJobResult,
} from "./orchestration/dispatch-owned-headless-job";

export {
  UnavailableOwnedUploadAdapter,
  type OwnedUploadPort,
  type OwnedUploadResult,
} from "./upload/owned-upload.port";

export {
  HEADLESS_TEST_AUTHORITY_PREFIX,
  rejectProductionPlaceholderCreateJobBody,
  rejectPlaceholderOwnedUploadRequest,
  PRODUCTION_PLACEHOLDER_GUARD_MESSAGE,
} from "./authority/placeholder-production-guard";