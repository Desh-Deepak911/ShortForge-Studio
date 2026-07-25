/**
 * Sprint 11E Phase 2E.2D.4 — Fly staging topology authority (local only).
 * No Fly API contact. No secret values.
 */

import { HEADLESS_PHASE3_RENDERER_BUILD_ID } from "../../runtime/renderer-build-id";

/** Staging org slug accepted for the first authorized deployment. */
export const HEADLESS_FLY_STAGING_ORG = "personal" as const;

/** Staging primary region — pinned; not a placeholder. */
export const HEADLESS_FLY_STAGING_PRIMARY_REGION = "iad" as const;

/** Immutable image class for verify + render process groups. */
export const HEADLESS_FLY_STAGING_IMAGE_CLASS = "deployable_worker" as const;

/** Process group ids — commands supersede image CMD; ENTRYPOINT retained. */
export const HEADLESS_FLY_STAGING_PROCESS_GROUPS = Object.freeze([
  "verify",
  "render",
] as const);

export type HeadlessFlyStagingProcessGroup =
  (typeof HEADLESS_FLY_STAGING_PROCESS_GROUPS)[number];

export type HeadlessFlyStagingVmSpec = {
  readonly processGroup: HeadlessFlyStagingProcessGroup;
  readonly cpuKind: "shared" | "performance";
  readonly cpus: number;
  readonly memoryMb: number;
  readonly concurrency: 1;
};

export const HEADLESS_FLY_STAGING_VERIFY_VM = Object.freeze({
  processGroup: "verify",
  cpuKind: "shared",
  cpus: 1,
  memoryMb: 2048,
  concurrency: 1,
} as const satisfies HeadlessFlyStagingVmSpec);

export const HEADLESS_FLY_STAGING_RENDER_VM = Object.freeze({
  processGroup: "render",
  cpuKind: "performance",
  cpus: 4,
  memoryMb: 8192,
  concurrency: 1,
} as const satisfies HeadlessFlyStagingVmSpec);

/** SIGTERM drain window (ms) — must fit under Fly kill_timeout seconds. */
export const HEADLESS_FLY_STAGING_GRACEFUL_SHUTDOWN_MS = 25_000;

/** Fly kill_timeout seconds (forced abort after SIGTERM drain). */
export const HEADLESS_FLY_STAGING_KILL_TIMEOUT_SECONDS = 30;

export const HEADLESS_FLY_STAGING_KILL_SIGNAL = "SIGTERM" as const;

export const HEADLESS_FLY_STAGING_RENDERER_BUILD_ID =
  HEADLESS_PHASE3_RENDERER_BUILD_ID;

export const HEADLESS_FLY_STAGING_BINARY_PATHS = Object.freeze({
  chrome: "/usr/bin/chromium",
  ffmpeg: "/usr/bin/ffmpeg",
  ffprobe: "/usr/bin/ffprobe",
  workspaceRoot: "/tmp/footiebitz-headless-worker",
} as const);

/**
 * Zero-consumer deployment mechanism (Phase 2E.2D.5C / 2E.2D.5E).
 * Build/push the immutable image, then prove exact zero Machines via successful
 * `fly machine list`. Pre-first-Machine: not Launch `fly scale count/show` and
 * not `fly config show` (region/public-service from local materialized config).
 */
export const HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM =
  "build_only_release_then_exact_zero_machine_authority" as const;

/**
 * Non-consuming preflight — one-shot Machine or local schema preflight.
 * Must never start verify/render consumer process groups.
 */
export const HEADLESS_FLY_STAGING_PREFLIGHT_PROCESS =
  "one_shot_schema_preflight_no_consumer" as const;

export type HeadlessFlyStagingTopology = {
  readonly org: typeof HEADLESS_FLY_STAGING_ORG;
  readonly primaryRegion: typeof HEADLESS_FLY_STAGING_PRIMARY_REGION;
  readonly imageClass: typeof HEADLESS_FLY_STAGING_IMAGE_CLASS;
  readonly processGroups: typeof HEADLESS_FLY_STAGING_PROCESS_GROUPS;
  readonly verifyVm: typeof HEADLESS_FLY_STAGING_VERIFY_VM;
  readonly renderVm: typeof HEADLESS_FLY_STAGING_RENDER_VM;
  readonly concurrency: 1;
  readonly killSignal: typeof HEADLESS_FLY_STAGING_KILL_SIGNAL;
  readonly killTimeoutSeconds: typeof HEADLESS_FLY_STAGING_KILL_TIMEOUT_SECONDS;
  readonly gracefulShutdownMs: typeof HEADLESS_FLY_STAGING_GRACEFUL_SHUTDOWN_MS;
  readonly rendererBuildId: typeof HEADLESS_FLY_STAGING_RENDERER_BUILD_ID;
  readonly binaryPaths: typeof HEADLESS_FLY_STAGING_BINARY_PATHS;
  readonly publicServicesAllowed: false;
  readonly httpListenerAllowed: false;
  readonly zeroConsumerMechanism: typeof HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM;
  readonly preflightProcess: typeof HEADLESS_FLY_STAGING_PREFLIGHT_PROCESS;
};

export const HEADLESS_FLY_STAGING_TOPOLOGY: HeadlessFlyStagingTopology =
  Object.freeze({
    org: HEADLESS_FLY_STAGING_ORG,
    primaryRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
    imageClass: HEADLESS_FLY_STAGING_IMAGE_CLASS,
    processGroups: HEADLESS_FLY_STAGING_PROCESS_GROUPS,
    verifyVm: HEADLESS_FLY_STAGING_VERIFY_VM,
    renderVm: HEADLESS_FLY_STAGING_RENDER_VM,
    concurrency: 1,
    killSignal: HEADLESS_FLY_STAGING_KILL_SIGNAL,
    killTimeoutSeconds: HEADLESS_FLY_STAGING_KILL_TIMEOUT_SECONDS,
    gracefulShutdownMs: HEADLESS_FLY_STAGING_GRACEFUL_SHUTDOWN_MS,
    rendererBuildId: HEADLESS_FLY_STAGING_RENDERER_BUILD_ID,
    binaryPaths: HEADLESS_FLY_STAGING_BINARY_PATHS,
    publicServicesAllowed: false,
    httpListenerAllowed: false,
    zeroConsumerMechanism: HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM,
    preflightProcess: HEADLESS_FLY_STAGING_PREFLIGHT_PROCESS,
  });
