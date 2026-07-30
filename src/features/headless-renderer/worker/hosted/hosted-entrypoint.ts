/**
 * Dedicated Node entrypoint for the hosted headless worker (outside Next.js).
 *
 * Phase 2E.2C.2 startup authority:
 * 1. classify hosted environment
 * 2. verify deployable image/build manifest
 * 3. native binary and codec preflight
 * 4. materialize bounded production adapters
 * 5. exact Neon schema preflight (embedded fingerprint)
 * 6. only after schema PASS: Redis groups / outbox / queue / R2 I/O
 * 7. selected verify|render loop
 * 8. drain and close adapters on shutdown
 */

import { createRenderDispatchOutboxScheduler } from "../../control-plane/services/dispatch-render-outbox";
import { createHeadlessExportMaintenanceScheduler } from "../../control-plane/services/headless-export-maintenance-scheduler";
import { createR2ArtifactObjectIO } from "../../control-plane/adapters/r2-artifact-object-io.adapter";
import { HEADLESS_EXPORT_MAINTENANCE_ENABLE_ENV } from "../../domain/headless-export-maintenance-enablement";
import { embeddedSchemaFingerprintAsPreflightSources } from "../../control-plane/migrations/embedded-schema-fingerprint";
import { runHeadlessSchemaPreflight } from "../../control-plane/runtime/neon-schema-preflight";
import type { HeadlessSqlExecutor } from "../../control-plane/runtime/sql-client";
import { composeHostedHeadlessWorker } from "./compose-hosted-worker";
import { runHostedBinaryPreflight } from "./hosted-binary-preflight";
import {
  assertDeployableWorkerImage,
  buildHeadlessHostedBuildManifest,
} from "./hosted-image-classification";
import {
  createStdoutHostedWorkerEventSink,
  emitHostedWorkerEvent,
  type HeadlessHostedWorkerEventSink,
} from "./hosted-events";
import { createHostedWorkerLoop } from "./hosted-worker-loop";
import { materializeHostedWorkerAdapters } from "./materialize-hosted-worker-adapters";
import { createHostedShutdownLifecycle } from "./hosted-shutdown-lifecycle";
import { executionAttributionToSafeTelemetryFacts } from "../runtime/claimed-render-execution-attribution";

export type HostedEntrypointOptions = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly eventSink?: HeadlessHostedWorkerEventSink;
  readonly installSignalHandlers?: boolean;
  readonly skipBinaryPreflight?: boolean;
  readonly skipDeployableImageAssert?: boolean;
  /**
   * Test-only schema preflight injection. Production path uses embedded
   * fingerprint against Neon. Must not ship fake adapters in the artifact.
   */
  readonly runSchemaPreflight?: (
    sql: HeadlessSqlExecutor,
  ) => ReturnType<typeof runHeadlessSchemaPreflight>;
  /**
   * Test-only adapter materialization. Production uses
   * materializeHostedWorkerAdapters.
   */
  readonly materializeAdapters?: typeof materializeHostedWorkerAdapters;
  readonly onInstallShutdownControls?: (controls: {
    readonly signalShutdown: () => void;
  }) => void;
};

export type HostedEntrypointResult = {
  readonly exitCode: number;
  readonly reasonId: string;
};

export async function runHostedWorkerEntrypoint(
  options: HostedEntrypointOptions = {},
): Promise<HostedEntrypointResult> {
  const env = options.env ?? process.env;
  const eventSink =
    options.eventSink ?? createStdoutHostedWorkerEventSink();
  const nowMs = () => Date.now();

  // 1. Classify hosted environment
  const composition = composeHostedHeadlessWorker(env);
  emitHostedWorkerEvent(eventSink, {
    name: "hosted.env.classified",
    atMs: nowMs(),
    status: composition.environment.status,
    reasonId: composition.environment.reasonId,
    mode: composition.config?.mode,
  });

  if (composition.environment.status === "unconfigured") {
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      reasonId: "environment_unconfigured",
      status: "failed",
    });
    return { exitCode: 1, reasonId: "environment_unconfigured" };
  }

  if (
    composition.environment.status !== "configured" ||
    composition.config == null
  ) {
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      reasonId: composition.reasonId,
      status: "failed",
    });
    return { exitCode: 1, reasonId: composition.reasonId };
  }

  const config = composition.config;

  // 2. Verify deployable image/build manifest
  if (!options.skipDeployableImageAssert) {
    try {
      assertDeployableWorkerImage(buildHeadlessHostedBuildManifest());
    } catch {
      emitHostedWorkerEvent(eventSink, {
        name: "hosted.process.exit",
        atMs: nowMs(),
        mode: config.mode,
        reasonId: "deployable_image_assert_failed",
        status: "failed",
      });
      return { exitCode: 1, reasonId: "deployable_image_assert_failed" };
    }
  }

  // 3. Native binary and codec preflight
  if (!options.skipBinaryPreflight) {
    const preflight = runHostedBinaryPreflight(config);
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.binary.preflight",
      atMs: nowMs(),
      mode: config.mode,
      status: preflight.ok ? "ok" : "failed",
      reasonId: preflight.ok ? "binary_preflight_ok" : preflight.reasonId,
      facts: preflight.ok
        ? {
            chromePresent: true,
            ffmpegPresent: true,
            ffprobePresent: true,
            encoderCount: preflight.facts.encoders.length,
            noSandboxDefault: false,
            noSandboxAllowed: preflight.facts.noSandboxAllowed,
          }
        : preflight.facts,
    });
    if (!preflight.ok) {
      emitHostedWorkerEvent(eventSink, {
        name: "hosted.process.exit",
        atMs: nowMs(),
        mode: config.mode,
        reasonId: preflight.reasonId,
        status: "failed",
      });
      return { exitCode: 1, reasonId: preflight.reasonId };
    }
  }

  if (!composition.canStartConsumerLoop) {
    const blockedReason =
      composition.reasonId === "composition_packaging_blocked"
        ? "composition_packaging_blocked"
        : "composition_seam_blocked";
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.composition.blocked",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: blockedReason,
      facts: {
        seamCount: composition.seams.length,
        seam0: composition.seams[0] ?? null,
        seam1: composition.seams[1] ?? null,
        trustedVerifyPromotion:
          composition.compositionMap?.trustedVerifyPromotion === true,
      },
    });
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: blockedReason,
      status: "failed",
    });
    return { exitCode: 1, reasonId: blockedReason };
  }

  emitHostedWorkerEvent(eventSink, {
    name: "hosted.composition.ready",
    atMs: nowMs(),
    mode: config.mode,
    reasonId: "composition_ready",
  });

  // 4. Materialize bounded production adapters
  const materialize =
    options.materializeAdapters ?? materializeHostedWorkerAdapters;
  let adapters: ReturnType<typeof materializeHostedWorkerAdapters>;
  try {
    adapters = materialize({
      config,
      env,
      eventSink,
      observationBoundaryMs: nowMs(),
    });
  } catch {
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: "adapter_materialize_failed",
      status: "failed",
    });
    return { exitCode: 1, reasonId: "adapter_materialize_failed" };
  }

  let adaptersClosed = false;
  const closeAdaptersSafely = async (): Promise<{ readonly ok: boolean }> => {
    if (adaptersClosed) return { ok: true };
    adaptersClosed = true;
    try {
      await adapters.close();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

  // Fail closed before intake when required execution hooks are missing.
  if (config.mode === "render" && typeof adapters.createOnClaimedRender !== "function") {
    const closed = await closeAdaptersSafely();
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: closed.ok
        ? "missing_claimed_render_hook"
        : "adapter_close_failed",
      status: "failed",
    });
    return {
      exitCode: 1,
      reasonId: closed.ok
        ? "missing_claimed_render_hook"
        : "adapter_close_failed",
    };
  }
  if (config.mode === "verify" && typeof adapters.createOnClaimedVerify !== "function") {
    const closed = await closeAdaptersSafely();
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: closed.ok
        ? "missing_claimed_verify_hook"
        : "adapter_close_failed",
      status: "failed",
    });
    return {
      exitCode: 1,
      reasonId: closed.ok
        ? "missing_claimed_verify_hook"
        : "adapter_close_failed",
    };
  }

  // 5. Exact Neon schema preflight using embedded fingerprint
  const schemaRunner =
    options.runSchemaPreflight ??
    ((sql: HeadlessSqlExecutor) =>
      runHeadlessSchemaPreflight({
        sql,
        expectedSources: embeddedSchemaFingerprintAsPreflightSources(),
      }));

  let schemaResult: Awaited<ReturnType<typeof runHeadlessSchemaPreflight>>;
  try {
    schemaResult = await schemaRunner(adapters.sql);
  } catch {
    const closed = await closeAdaptersSafely();
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: closed.ok ? "schema_preflight_failed" : "adapter_close_failed",
      status: "failed",
    });
    return {
      exitCode: 1,
      reasonId: closed.ok ? "schema_preflight_failed" : "adapter_close_failed",
    };
  }

  emitHostedWorkerEvent(eventSink, {
    name: "hosted.schema.preflight",
    atMs: nowMs(),
    mode: config.mode,
    status: schemaResult.ok ? "ok" : "failed",
    reasonId: schemaResult.ok
      ? "schema_preflight_ok"
      : schemaResult.code.toLowerCase(),
  });

  if (!schemaResult.ok) {
    // Schema failure: bounded non-zero exit; zero Upstash/R2/Chromium work.
    const closed = await closeAdaptersSafely();
    const reasonId = closed.ok
      ? `schema_${schemaResult.code.toLowerCase()}`
      : "adapter_close_failed";
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId,
      status: "failed",
    });
    return { exitCode: 1, reasonId };
  }

  // 6–7. Only after schema PASS: outbox recovery + selected loop (groups/reads)
  const onClaimedRender =
    config.mode === "render"
      ? async (hookInput: Parameters<
          ReturnType<typeof adapters.createOnClaimedRender>
        >[0]) => {
          const run = adapters.createOnClaimedRender();
          const result = await run(hookInput);
          emitHostedWorkerEvent(eventSink, {
            name: "hosted.loop.delivery",
            atMs: nowMs(),
            mode: "render",
            reasonId: result.kind,
            action: result.kind,
            facts:
              result.executionAttribution != null
                ? executionAttributionToSafeTelemetryFacts(
                    result.executionAttribution,
                  )
                : undefined,
          });
          return result;
        }
      : undefined;

  const onClaimedVerify =
    config.mode === "verify"
      ? async (hookInput: Parameters<
          ReturnType<typeof adapters.createOnClaimedVerify>
        >[0]) => {
          const run = adapters.createOnClaimedVerify();
          const result = await run(hookInput);
          emitHostedWorkerEvent(eventSink, {
            name: "hosted.loop.delivery",
            atMs: nowMs(),
            mode: "verify",
            reasonId: result.reasonId,
            action: result.kind,
          });
        }
      : undefined;

  const loop = createHostedWorkerLoop({
    mode: config.mode,
    streamQueue: adapters.streamQueue,
    jobStore: adapters.jobStore,
    ownedObjectStore:
      config.mode === "verify" ? adapters.ownedObjectStore : undefined,
    leaseSettings: adapters.leaseSettings,
    concurrency: config.concurrency,
    eventSink,
    nowMs,
    onClaimedRender,
    onClaimedVerify,
  });

  let startupDispatchActive = false;
  const dispatch = createRenderDispatchOutboxScheduler({
    outbox: adapters.dispatchOutbox,
    jobStore: adapters.jobStore,
    streamQueue: adapters.streamQueue,
    nowMs,
    onSweep: (result) => {
      emitHostedWorkerEvent(eventSink, {
        name: "hosted.loop.delivery",
        atMs: nowMs(),
        mode: config.mode,
        reasonId: result.ok
          ? "dispatch_outbox_sweep"
          : "dispatch_outbox_sweep_failed",
        action: result.ok ? "dispatch_sweep" : "dispatch_failed",
        facts: result.ok
          ? {
              scanned: result.value.scanned,
              dispatched: result.value.dispatched,
              rescheduled: result.value.rescheduled,
              unconfirmed: result.value.unconfirmed,
            }
          : { failed: 1 },
      });
    },
  });

  const maintenance =
    config.mode === "verify"
      ? createHeadlessExportMaintenanceScheduler({
          envName: config.envName,
          maintenanceEnabledFlag:
            typeof env[HEADLESS_EXPORT_MAINTENANCE_ENABLE_ENV] === "string"
              ? (env[HEADLESS_EXPORT_MAINTENANCE_ENABLE_ENV] as string)
              : null,
          leasePort: adapters.maintenanceLease,
          maintenanceState: adapters.maintenanceState,
          cleanup: adapters.artifactCleanup,
          ownedObjectStore: adapters.ownedObjectStore,
          jobStore: adapters.jobStore,
          objectIo: createR2ArtifactObjectIO(adapters.r2ObjectIo),
          nowMs,
          onSweep: (telemetry) => {
            emitHostedWorkerEvent(eventSink, {
              name: "hosted.loop.delivery",
              atMs: nowMs(),
              mode: "verify",
              reasonId: telemetry.status,
              action: telemetry.action,
              facts: {
                processed: telemetry.processed,
                leaseContention: telemetry.leaseContention ? 1 : 0,
              },
            });
          },
        })
      : null;

  const unifiedBusy = () =>
    loop.isBusy() ||
    dispatch.isSweepActive() ||
    startupDispatchActive;

  const shutdown = createHostedShutdownLifecycle({
    gracefulShutdownDeadlineMs: config.gracefulShutdownDeadlineMs,
    requestShutdown: () => {
      loop.requestShutdown();
      void dispatch.stop({
        drainDeadlineMs: config.gracefulShutdownDeadlineMs,
      });
    },
    requestForcedAbort: () => {
      loop.requestForcedAbort();
      dispatch.requestForcedAbort();
    },
    isBusy: unifiedBusy,
    onFirstSignal: () => {
      void dispatch.stop({
        drainDeadlineMs: config.gracefulShutdownDeadlineMs,
      });
    },
  });

  let signalInstalled = false;
  if (options.installSignalHandlers !== false) {
    process.on("SIGTERM", shutdown.handleSignal);
    process.on("SIGINT", shutdown.handleSignal);
    signalInstalled = true;
  }
  options.onInstallShutdownControls?.({
    signalShutdown: shutdown.handleSignal,
  });

  try {
    startupDispatchActive = true;
    await dispatch.runOnce();
    startupDispatchActive = false;
    dispatch.start();
    maintenance?.start();

    const result = await loop.run();
    shutdown.clearDeadline();
    maintenance?.stop();
    const drain = await dispatch.stop({
      drainDeadlineMs: config.gracefulShutdownDeadlineMs,
    });

    const closed = await closeAdaptersSafely();
    if (!closed.ok) {
      emitHostedWorkerEvent(eventSink, {
        name: "hosted.process.exit",
        atMs: nowMs(),
        mode: config.mode,
        reasonId: "adapter_close_failed",
        status: "failed",
      });
      return { exitCode: 1, reasonId: "adapter_close_failed" };
    }

    if (drain === "deadline_exceeded") {
      emitHostedWorkerEvent(eventSink, {
        name: "hosted.process.exit",
        atMs: nowMs(),
        mode: config.mode,
        reasonId: "shutdown_drain_deadline",
        status: "failed",
      });
      return { exitCode: 1, reasonId: "shutdown_drain_deadline" };
    }

    const reasonId = result.exitCode === 0 ? "clean_exit" : "fatal_loop";
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId,
      status: result.exitCode === 0 ? "ok" : "failed",
    });
    return { exitCode: result.exitCode, reasonId };
  } catch {
    shutdown.clearDeadline();
    startupDispatchActive = false;
    await dispatch
      .stop({ drainDeadlineMs: Math.min(config.gracefulShutdownDeadlineMs, 5_000) })
      .catch(() => undefined);
    const closed = await closeAdaptersSafely();
    emitHostedWorkerEvent(eventSink, {
      name: "hosted.process.exit",
      atMs: nowMs(),
      mode: config.mode,
      reasonId: closed.ok ? "entrypoint_failed" : "adapter_close_failed",
      status: "failed",
    });
    return {
      exitCode: 1,
      reasonId: closed.ok ? "entrypoint_failed" : "adapter_close_failed",
    };
  } finally {
    shutdown.clearDeadline();
    startupDispatchActive = false;
    await dispatch
      .stop({ drainDeadlineMs: 5_000 })
      .catch(() => undefined);
    await closeAdaptersSafely();
    if (signalInstalled) {
      process.off("SIGTERM", shutdown.handleSignal);
      process.off("SIGINT", shutdown.handleSignal);
    }
  }
}

export async function main(): Promise<void> {
  const result = await runHostedWorkerEntrypoint({
    installSignalHandlers: true,
  });
  process.exitCode = result.exitCode;
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}
