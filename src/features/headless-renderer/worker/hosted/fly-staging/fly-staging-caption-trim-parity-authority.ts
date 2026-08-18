/**
 * Caption/trim parity staging rollout authority.
 * QA / rollout only — never imported by the hosted worker runtime bundle.
 */

import { HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/renderer-build-id";
import { HEADLESS_FLY_STAGING_PUBLIC_ENV } from "./fly-staging-env-ledger";
import {
  materializeHeadlessFlyStagingToml,
  type HeadlessFlyStagingMaterializeResult,
} from "./fly-staging-template";

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_AUTHORITY_VERSION =
  1 as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME =
  "shortforge-hw-staging-4def8fa0" as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ORG = "personal" as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REGION = "iad" as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID =
  "d895d12a240938" as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID =
  "d895d16f264918" as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID =
  HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_QUEUE_PROVIDER =
  "neon" as const;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST =
  "0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Live phase2g.25 cleanup-runtime image currently on both Machines. */
export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST =
  "b003bf34f12e18cfa1d112c9e5396e43d987eca74d8e509635aecd003877babe" as const;

/**
 * Sealed candidate digest. Starts as the placeholder and is replaced only
 * after a successful build-only push. Never used as a deploy authority while
 * still the placeholder.
 */
export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST;

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REJECTED_DIGESTS =
  Object.freeze([
    "9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60",
    "e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916",
    "41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde",
    "7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206",
    "d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68",
  ] as const);

const DIGEST_RE = /^[a-f0-9]{64}$/;

export type HeadlessFlyStagingCaptionTrimParityPairRole =
  | "forward_candidate"
  | "rollback_anchor";

export type HeadlessFlyStagingCaptionTrimParityPair = {
  readonly pairId:
    | "caption_trim_parity_forward_candidate_pair"
    | "caption_trim_parity_rollback_anchor_pair";
  readonly role: HeadlessFlyStagingCaptionTrimParityPairRole;
  readonly appName: typeof HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME;
  readonly region: typeof HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REGION;
  readonly verifyMachineId: typeof HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID;
  readonly renderMachineId: typeof HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID;
  readonly rendererBuildId: string;
  readonly imageDigestSha256: string;
  readonly queueProvider: typeof HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_QUEUE_PROVIDER;
  readonly maintenanceEnabled: false;
  readonly verifyVm: { readonly cpuKind: "shared"; readonly cpus: 1; readonly memoryMb: 2048 };
  readonly renderVm: {
    readonly cpuKind: "performance";
    readonly cpus: 4;
    readonly memoryMb: 8192;
  };
};

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_FORWARD_PAIR =
  Object.freeze({
    pairId: "caption_trim_parity_forward_candidate_pair",
    role: "forward_candidate",
    appName: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
    region: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REGION,
    verifyMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID,
    renderMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID,
    rendererBuildId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
    imageDigestSha256:
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
    queueProvider: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_QUEUE_PROVIDER,
    maintenanceEnabled: false,
    verifyVm: { cpuKind: "shared", cpus: 1, memoryMb: 2048 },
    renderVm: { cpuKind: "performance", cpus: 4, memoryMb: 8192 },
  } satisfies HeadlessFlyStagingCaptionTrimParityPair);

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_PAIR =
  Object.freeze({
    pairId: "caption_trim_parity_rollback_anchor_pair",
    role: "rollback_anchor",
    appName: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
    region: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REGION,
    verifyMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID,
    renderMachineId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID,
    rendererBuildId:
      "headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST,
    queueProvider: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_QUEUE_PROVIDER,
    maintenanceEnabled: false,
    verifyVm: { cpuKind: "shared", cpus: 1, memoryMb: 2048 },
    renderVm: { cpuKind: "performance", cpus: 4, memoryMb: 8192 },
  } satisfies HeadlessFlyStagingCaptionTrimParityPair);

export function isHeadlessFlyStagingCaptionTrimPlaceholderDigest(
  digest: unknown,
): boolean {
  return digest === HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_PLACEHOLDER_IMAGE_DIGEST;
}

export function isHeadlessFlyStagingCaptionTrimRejectedDigest(
  digest: unknown,
): boolean {
  return (
    typeof digest === "string" &&
    (HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REJECTED_DIGESTS as readonly string[]).includes(
      digest,
    )
  );
}

export function isHeadlessFlyStagingCaptionTrimCandidateSealed(): boolean {
  return (
    DIGEST_RE.test(HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST) &&
    !isHeadlessFlyStagingCaptionTrimPlaceholderDigest(
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST,
    )
  );
}

export type HeadlessFlyStagingCaptionTrimParityReasonId =
  | "ok"
  | "placeholder_digest"
  | "rejected_digest"
  | "deployed_digest_forbidden"
  | "unknown_digest"
  | "wrong_renderer_build_id"
  | "wrong_topology"
  | "wrong_app"
  | "wrong_region"
  | "wrong_queue_provider"
  | "maintenance_enabled"
  | "attempt_budget_exhausted"
  | "not_sealed"
  | "hostile_input";

export function classifyHeadlessFlyStagingCaptionTrimForwardDigest(
  digest: unknown,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (isHeadlessFlyStagingCaptionTrimPlaceholderDigest(digest)) {
    return Object.freeze({ ok: false, reasonId: "placeholder_digest" });
  }
  if (digest === HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST) {
    return Object.freeze({ ok: false, reasonId: "deployed_digest_forbidden" });
  }
  if (isHeadlessFlyStagingCaptionTrimRejectedDigest(digest)) {
    return Object.freeze({ ok: false, reasonId: "rejected_digest" });
  }
  if (
    !isHeadlessFlyStagingCaptionTrimCandidateSealed() ||
    digest !== HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_CANDIDATE_IMAGE_DIGEST
  ) {
    return Object.freeze({ ok: false, reasonId: "not_sealed" });
  }
  return Object.freeze({ ok: true });
}

export function classifyHeadlessFlyStagingCaptionTrimRollbackDigest(
  digest: unknown,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (digest !== HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST) {
    return Object.freeze({ ok: false, reasonId: "unknown_digest" });
  }
  return Object.freeze({ ok: true });
}

export type HeadlessFlyStagingCaptionTrimAttemptKind =
  | "build_only"
  | "forward"
  | "rollback";

export function classifyHeadlessFlyStagingCaptionTrimAttemptBudget(input: {
  readonly kind: HeadlessFlyStagingCaptionTrimAttemptKind;
  readonly attemptedCount: number;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  if (
    input.kind !== "build_only" &&
    input.kind !== "forward" &&
    input.kind !== "rollback"
  ) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (!Number.isInteger(input.attemptedCount) || input.attemptedCount < 0) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (input.attemptedCount >= 1) {
    return Object.freeze({ ok: false, reasonId: "attempt_budget_exhausted" });
  }
  return Object.freeze({ ok: true });
}

export function classifyHeadlessFlyStagingCaptionTrimTopology(input: {
  readonly appName: unknown;
  readonly region: unknown;
  readonly verifyMachineId: unknown;
  readonly renderMachineId: unknown;
  readonly verifyCount: unknown;
  readonly renderCount: unknown;
  readonly otherCount: unknown;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  if (input.appName !== HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME) {
    return Object.freeze({ ok: false, reasonId: "wrong_app" });
  }
  if (input.region !== HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_REGION) {
    return Object.freeze({ ok: false, reasonId: "wrong_region" });
  }
  if (
    input.verifyMachineId !==
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID ||
    input.renderMachineId !==
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID ||
    input.verifyCount !== 1 ||
    input.renderCount !== 1 ||
    input.otherCount !== 0
  ) {
    return Object.freeze({ ok: false, reasonId: "wrong_topology" });
  }
  return Object.freeze({ ok: true });
}

export function validateHeadlessFlyStagingCaptionTrimParityPairs(): {
  readonly ok: boolean;
  readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId;
} {
  const forward = HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_FORWARD_PAIR;
  const rollback = HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_PAIR;
  if (
    forward.verifyMachineId !== rollback.verifyMachineId ||
    forward.renderMachineId !== rollback.renderMachineId ||
    forward.appName !== rollback.appName ||
    forward.region !== rollback.region
  ) {
    return Object.freeze({ ok: false, reasonId: "wrong_topology" });
  }
  if (forward.queueProvider !== "neon" || rollback.queueProvider !== "neon") {
    return Object.freeze({ ok: false, reasonId: "wrong_queue_provider" });
  }
  if (forward.maintenanceEnabled !== false || rollback.maintenanceEnabled !== false) {
    return Object.freeze({ ok: false, reasonId: "maintenance_enabled" });
  }
  if (
    forward.rendererBuildId !==
    HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID
  ) {
    return Object.freeze({ ok: false, reasonId: "wrong_renderer_build_id" });
  }
  if (
    rollback.imageDigestSha256 !==
    HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_ROLLBACK_IMAGE_DIGEST
  ) {
    return Object.freeze({ ok: false, reasonId: "unknown_digest" });
  }
  return Object.freeze({ ok: true, reasonId: "ok" });
}

export function classifyHeadlessFlyStagingCaptionTrimRolloutGate(input: {
  readonly sealed: boolean;
  readonly digest: unknown;
  readonly kind: "forward" | "rollback";
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  if (input.kind === "forward") {
    if (!input.sealed) {
      return Object.freeze({ ok: false, reasonId: "not_sealed" });
    }
    return classifyHeadlessFlyStagingCaptionTrimForwardDigest(input.digest);
  }
  return classifyHeadlessFlyStagingCaptionTrimRollbackDigest(input.digest);
}

export type HeadlessFlyStagingCaptionTrimBuildOnlyPhase =
  | "authorize"
  | "require_clean_tree"
  | "require_ancestry"
  | "build_worker"
  | "verify_build_id"
  | "verify_page_bundle"
  | "materialize_config"
  | "reject_public_services"
  | "capture_topology"
  | "push_build_only"
  | "record_digest"
  | "prove_topology_unchanged"
  | "cleanup";

export const HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_PHASES =
  Object.freeze([
    "authorize",
    "require_clean_tree",
    "require_ancestry",
    "build_worker",
    "verify_build_id",
    "verify_page_bundle",
    "materialize_config",
    "reject_public_services",
    "capture_topology",
    "push_build_only",
    "record_digest",
    "prove_topology_unchanged",
    "cleanup",
  ] as const satisfies readonly HeadlessFlyStagingCaptionTrimBuildOnlyPhase[]);

export type HeadlessFlyStagingCaptionTrimBuildOnlyEvent =
  | "gate_missing"
  | "dirty_tree"
  | "wrong_ancestry"
  | "build_id_rejected"
  | "page_bundle_missing_capability"
  | "public_service_present"
  | "topology_mutated"
  | "second_push"
  | "zero_digest"
  | "deployed_digest"
  | "rejected_digest"
  | "mutable_ref"
  | "machine_update_attempted"
  | "secret_printed"
  | "ok";

export function classifyHeadlessFlyStagingCaptionTrimBuildOnlyTransition(input: {
  readonly phase: HeadlessFlyStagingCaptionTrimBuildOnlyPhase;
  readonly event: HeadlessFlyStagingCaptionTrimBuildOnlyEvent;
}):
  | { readonly ok: true; readonly nextPhase: HeadlessFlyStagingCaptionTrimBuildOnlyPhase | "done" }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  const order = HEADLESS_FLY_STAGING_CAPTION_TRIM_BUILD_ONLY_PHASES;
  const index = order.indexOf(input.phase);
  if (index < 0) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (input.event !== "ok") {
    const reason =
      input.event === "zero_digest"
        ? "placeholder_digest"
        : input.event === "deployed_digest"
          ? "deployed_digest_forbidden"
          : input.event === "rejected_digest"
            ? "rejected_digest"
            : input.event === "second_push"
              ? "attempt_budget_exhausted"
              : input.event === "topology_mutated"
                ? "wrong_topology"
                : input.event === "public_service_present"
                  ? "wrong_topology"
                  : "hostile_input";
    return Object.freeze({ ok: false, reasonId: reason });
  }
  if (input.phase === "cleanup") {
    return Object.freeze({ ok: true, nextPhase: "done" });
  }
  return Object.freeze({ ok: true, nextPhase: order[index + 1]! });
}

const REQUIRED_PAGE_MARKERS = Object.freeze([
  "resolveDisplayableVideoSourceTimeMs",
  "resolveCaptionBackgroundAuthority",
  "resolveEngagementOverlayFrame",
  "drawEngagementOverlay",
  "resolveEngagementOverlayCaptionSafePlacement",
  "Subscribe",
  "resolveBrandStingFrame",
  "drawBrandSting",
  "engagement-overlays-v1",
  "shortforge-brand-sting-v1",
  "continuous-intra-scene-transitions-v1",
] as const);

const FORBIDDEN_PAGE_MARKERS = Object.freeze(["SpeechStylePanel"] as const);

export function classifyHeadlessFlyStagingCaptionTrimPageBundle(source: unknown):
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: HeadlessFlyStagingCaptionTrimParityReasonId } {
  if (typeof source !== "string" || source.length === 0) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  for (const marker of REQUIRED_PAGE_MARKERS) {
    if (!source.includes(marker)) {
      return Object.freeze({ ok: false, reasonId: "hostile_input" });
    }
  }
  for (const marker of FORBIDDEN_PAGE_MARKERS) {
    if (source.includes(marker)) {
      return Object.freeze({ ok: false, reasonId: "hostile_input" });
    }
  }
  return Object.freeze({ ok: true });
}

export function buildHeadlessFlyStagingCaptionTrimPublicEnvironment(): Readonly<
  Record<string, string>
> {
  return Object.freeze({
    ...HEADLESS_FLY_STAGING_PUBLIC_ENV,
    HEADLESS_RENDERER_BUILD_ID:
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
    HEADLESS_EXPORT_MAINTENANCE_ENABLED: "0",
    HEADLESS_QUEUE_PROVIDER: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_QUEUE_PROVIDER,
    HEADLESS_FLY_WAKE_APP_NAME: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
    HEADLESS_FLY_WAKE_MACHINE_ID:
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDER_MACHINE_ID,
    HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID:
      HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_VERIFY_MACHINE_ID,
  });
}

const RENDERER_BUILD_ID_TOML_RE = /HEADLESS_RENDERER_BUILD_ID\s*=\s*"[^"]+"/;

export function materializeHeadlessFlyStagingCaptionTrimToml(input: {
  readonly templateToml: unknown;
  readonly appName: unknown;
}): HeadlessFlyStagingMaterializeResult & { readonly rendererBuildId: string | null } {
  if (typeof input.templateToml !== "string") {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
      rendererBuildId: null,
    });
  }
  const replaced = input.templateToml.replace(
    RENDERER_BUILD_ID_TOML_RE,
    `HEADLESS_RENDERER_BUILD_ID = "${HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID}"`,
  );
  const materialized = materializeHeadlessFlyStagingToml(replaced, input.appName);
  if (materialized.status !== "ok" || materialized.toml == null) {
    return Object.freeze({ ...materialized, rendererBuildId: null });
  }
  const maintenanceLine = 'HEADLESS_EXPORT_MAINTENANCE_ENABLED = "0"';
  const queueLine = 'HEADLESS_QUEUE_PROVIDER = "neon"';
  let toml = materialized.toml;
  if (!toml.includes(maintenanceLine)) {
    toml = toml.replace(
      'HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"',
      `HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n  ${maintenanceLine}\n  ${queueLine}`,
    );
  }
  if (/\[\[services\]\]|\[http_service\]/.test(toml)) {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: materialized.appName,
      rendererBuildId: null,
    });
  }
  if (
    !toml.includes(HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID)
  ) {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: materialized.appName,
      rendererBuildId: null,
    });
  }
  return Object.freeze({
    ...materialized,
    toml,
    rendererBuildId: HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
  });
}

export function redactHeadlessFlyStagingCaptionTrimSecrets(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/(DATABASE_URL|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|UPSTASH_REDIS_TCP_URL|FLY_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)\s*[:=]\s*\S+/gi, "$1=REDACTED")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://REDACTED")
    .replace(/rediss?:\/\/\S+/gi, "redis://REDACTED");
}
