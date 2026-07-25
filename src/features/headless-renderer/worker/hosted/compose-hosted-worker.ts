/**
 * Server-only hosted-worker composition root.
 * Classify + describe only — never constructs provider clients.
 * Adapter materialization lives in materialize-hosted-worker-adapters.ts
 * and is dynamically imported only when seams are closed.
 */

import {
  classifyHeadlessHostedWorkerEnvironment,
  type HeadlessConfiguredHostedWorkerEnvironment,
  type HeadlessHostedWorkerEnvironmentClassification,
  type HeadlessHostedWorkerMode,
} from "./hosted-environment";
import { HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES } from "./hosted-image-classification";
import {
  HEADLESS_HOSTED_RENDER_SEAMS,
  HEADLESS_HOSTED_VERIFY_SEAMS,
  type HeadlessHostedCompositionSeamId,
} from "./hosted-seams";

export type HostedWorkerCompositionMap = {
  readonly mode: HeadlessHostedWorkerMode;
  readonly neonJobStore: boolean;
  readonly neonOwnedObjectStore: boolean;
  readonly upstashTcpConsumer: boolean;
  readonly r2ObjectIo: boolean;
  readonly r2JobBoundStorage: boolean;
  readonly neonArtifactCleanup: boolean;
  readonly chromiumFfmpegRunner: boolean;
  readonly cleanupIntentSupport: boolean;
  readonly streamedArtifactFinalization: boolean;
  readonly trustedVerifyPromotion: boolean;
};

export type HostedWorkerComposition = {
  readonly environment: HeadlessHostedWorkerEnvironmentClassification;
  readonly config: HeadlessConfiguredHostedWorkerEnvironment | null;
  readonly seams: readonly HeadlessHostedCompositionSeamId[];
  /**
   * True only when environment is configured, every seam for the mode is
   * closed, AND packaging/dynamic modules are resolved.
   * Phase 2E.2C.2: packaging resolved for deployable_worker; still false for
   * unconfigured/invalid environments.
   */
  readonly canStartConsumerLoop: boolean;
  readonly compositionMap: HostedWorkerCompositionMap | null;
  readonly reasonId: string;
};

function seamsForMode(
  mode: HeadlessHostedWorkerMode,
): readonly HeadlessHostedCompositionSeamId[] {
  return mode === "render"
    ? HEADLESS_HOSTED_RENDER_SEAMS
    : HEADLESS_HOSTED_VERIFY_SEAMS;
}

function compositionMapForMode(
  mode: HeadlessHostedWorkerMode,
  seams: readonly HeadlessHostedCompositionSeamId[],
): HostedWorkerCompositionMap {
  const seamSet = new Set(seams);
  const storageClosed = !seamSet.has("RENDER_STORAGE_PORT_SEAM");
  const cleanupClosed = !seamSet.has("ARTIFACT_CLEANUP_DURABLE_SEAM");
  if (mode === "render") {
    return Object.freeze({
      mode,
      neonJobStore: true,
      neonOwnedObjectStore: storageClosed,
      upstashTcpConsumer: true,
      r2ObjectIo: true,
      r2JobBoundStorage: storageClosed,
      neonArtifactCleanup: cleanupClosed,
      chromiumFfmpegRunner: storageClosed,
      cleanupIntentSupport: cleanupClosed,
      streamedArtifactFinalization: storageClosed,
      // Verify-promotion is a verify-mode capability; render map stays false.
      trustedVerifyPromotion: false,
    });
  }
  return Object.freeze({
    mode,
    neonJobStore: true,
    neonOwnedObjectStore: true,
    upstashTcpConsumer: true,
    r2ObjectIo: true,
    r2JobBoundStorage: false,
    neonArtifactCleanup: cleanupClosed,
    chromiumFfmpegRunner: false,
    cleanupIntentSupport: cleanupClosed,
    streamedArtifactFinalization: false,
    trustedVerifyPromotion: !seamSet.has("VERIFY_PROMOTION_COMPOSITION_SEAM"),
  });
}

/**
 * Classify + describe hosted composition. Never constructs provider clients.
 * Never imports memory/test adapters or product/Next surfaces.
 */
export function composeHostedHeadlessWorker(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HostedWorkerComposition {
  const environment = classifyHeadlessHostedWorkerEnvironment(env);
  if (environment.status === "unconfigured") {
    return Object.freeze({
      environment,
      config: null,
      seams: Object.freeze([]),
      canStartConsumerLoop: false,
      compositionMap: null,
      reasonId: "environment_unconfigured",
    });
  }
  if (environment.status !== "configured" || environment.config == null) {
    return Object.freeze({
      environment,
      config: null,
      seams: Object.freeze([]),
      canStartConsumerLoop: false,
      compositionMap: null,
      reasonId: environment.reasonId,
    });
  }

  const config = environment.config;
  const seams = seamsForMode(config.mode);
  const compositionMap = compositionMapForMode(config.mode, seams);
  const packagingBlocked =
    HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES.length > 0;
  const canStartConsumerLoop = seams.length === 0 && !packagingBlocked;

  return Object.freeze({
    environment,
    config,
    seams,
    canStartConsumerLoop,
    compositionMap,
    reasonId: canStartConsumerLoop
      ? "composition_ready"
      : seams.length > 0
        ? "composition_seam_blocked"
        : "composition_packaging_blocked",
  });
}
