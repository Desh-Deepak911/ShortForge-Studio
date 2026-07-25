/**
 * Sprint 11E Phase 2E.2D.7A — bounded verify-first PASS evidence authority.
 * Records sanitized deployment phases and remotely observed topology only.
 * Never includes secret values, URLs, credentials, or provider payloads.
 */

import { createHash } from "node:crypto";

import {
  HEADLESS_FLY_STAGING_ORG,
  HEADLESS_FLY_STAGING_PRIMARY_REGION,
  HEADLESS_FLY_STAGING_TOPOLOGY,
} from "./fly-staging-topology";

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP =
  "shortforge-hw-staging-4def8fa0" as const;

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_IMAGE_DIGEST =
  "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e" as const;

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_DEPLOYMENT_PHASES =
  Object.freeze([
    "bootstrap",
    "bridge_surface_validated",
    "bridge_accepted",
    "bridge_loaded",
    "public_environment_applied",
    "local_preflight_pass",
    "zero_machines_confirmed",
    "secrets_synced",
    "secrets_post_sync_classified",
    "deploy_complete",
    "topology_proven",
    "secrets_activated",
    "runtime_observation_pass",
  ] as const);

export type HeadlessFlyStagingVerifyFirstPassDeploymentPhase =
  (typeof HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_DEPLOYMENT_PHASES)[number];

export type HeadlessFlyStagingVerifyFirstPassEvidenceInput = {
  readonly appName: string;
  readonly imageDigestSha256: string;
  readonly deploymentPhases: readonly string[];
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly observedRegion: string;
  readonly secretDeployAggregateStatus: "deployed";
  readonly remoteSchemaPreflightStatus: "pass";
  readonly loopReadinessStatus: "started";
  readonly publicServicesExposure: "none";
  readonly restartLoopObserved: false;
  readonly cpuKind: string;
  readonly cpus: number;
  readonly memoryMb: number;
};

export type HeadlessFlyStagingVerifyFirstPassReasonId =
  | "ok"
  | "secret_value_leak"
  | "invalid_topology"
  | "invalid_digest"
  | "missing_phase"
  | "remote_schema_not_pass"
  | "loop_not_started"
  | "secrets_not_deployed"
  | "restart_loop_observed"
  | "hostile_input";

export type HeadlessFlyStagingVerifyFirstPassEvidenceDocument = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingVerifyFirstPassReasonId;
  readonly org: typeof HEADLESS_FLY_STAGING_ORG;
  readonly primaryRegion: typeof HEADLESS_FLY_STAGING_PRIMARY_REGION;
  readonly appName: string | null;
  readonly imageDigestSha256: string | null;
  readonly deploymentPhases: readonly string[];
  readonly verifyCount: number | null;
  readonly renderCount: number | null;
  readonly observedRegion: string | null;
  readonly secretDeployAggregateStatus: "deployed" | null;
  readonly remoteSchemaPreflightStatus: "pass" | null;
  readonly loopReadinessStatus: "started" | null;
  readonly publicServicesExposure: "none" | null;
  readonly restartLoopObserved: boolean | null;
  readonly verifyVm: {
    readonly cpuKind: string;
    readonly cpus: number;
    readonly memoryMb: number;
  } | null;
  readonly secretValuesIncluded: false;
  readonly evidenceFingerprintSha256: string | null;
};

const DIGEST_RE = /^[a-f0-9]{64}$/;

function looksLikeSecretValue(text: string): boolean {
  return (
    /postgres(ql)?:\/\//i.test(text) ||
    /rediss?:\/\//i.test(text) ||
    /registry\.fly\.io\//i.test(text) ||
    /sk_live|sk_test|AKIA[0-9A-Z]{16}/i.test(text)
  );
}

export function buildHeadlessFlyStagingVerifyFirstPassEvidenceDocument(
  input: unknown,
): HeadlessFlyStagingVerifyFirstPassEvidenceDocument {
  const empty = (
    reasonId: HeadlessFlyStagingVerifyFirstPassReasonId,
  ): HeadlessFlyStagingVerifyFirstPassEvidenceDocument =>
    Object.freeze({
      status: "invalid",
      reasonId,
      org: HEADLESS_FLY_STAGING_ORG,
      primaryRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
      appName: null,
      imageDigestSha256: null,
      deploymentPhases: Object.freeze([]),
      verifyCount: null,
      renderCount: null,
      observedRegion: null,
      secretDeployAggregateStatus: null,
      remoteSchemaPreflightStatus: null,
      loopReadinessStatus: null,
      publicServicesExposure: null,
      restartLoopObserved: null,
      verifyVm: null,
      secretValuesIncluded: false,
      evidenceFingerprintSha256: null,
    });

  try {
    if (input == null || typeof input !== "object") {
      return empty("hostile_input");
    }
    const raw = input as HeadlessFlyStagingVerifyFirstPassEvidenceInput;
    if (typeof raw.appName !== "string" || looksLikeSecretValue(raw.appName)) {
      return empty("hostile_input");
    }
    if (
      typeof raw.imageDigestSha256 !== "string" ||
      !DIGEST_RE.test(raw.imageDigestSha256)
    ) {
      return empty("invalid_digest");
    }
    if (!Array.isArray(raw.deploymentPhases)) {
      return empty("hostile_input");
    }
    for (const phase of raw.deploymentPhases) {
      if (typeof phase !== "string" || looksLikeSecretValue(phase)) {
        return empty("secret_value_leak");
      }
    }
    for (const required of HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_DEPLOYMENT_PHASES) {
      if (!raw.deploymentPhases.includes(required)) {
        return empty("missing_phase");
      }
    }
    if (raw.verifyCount !== 1 || raw.renderCount !== 0) {
      return empty("invalid_topology");
    }
    if (raw.observedRegion !== HEADLESS_FLY_STAGING_PRIMARY_REGION) {
      return empty("invalid_topology");
    }
    if (raw.secretDeployAggregateStatus !== "deployed") {
      return empty("secrets_not_deployed");
    }
    if (raw.remoteSchemaPreflightStatus !== "pass") {
      return empty("remote_schema_not_pass");
    }
    if (raw.loopReadinessStatus !== "started") {
      return empty("loop_not_started");
    }
    if (raw.restartLoopObserved !== false) {
      return empty("restart_loop_observed");
    }
    if (raw.publicServicesExposure !== "none") {
      return empty("hostile_input");
    }
    const doc = Object.freeze({
      status: "ok" as const,
      reasonId: "ok" as const,
      org: HEADLESS_FLY_STAGING_ORG,
      primaryRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
      appName: raw.appName,
      imageDigestSha256: raw.imageDigestSha256,
      deploymentPhases: Object.freeze([...raw.deploymentPhases]),
      verifyCount: raw.verifyCount,
      renderCount: raw.renderCount,
      observedRegion: raw.observedRegion,
      secretDeployAggregateStatus: raw.secretDeployAggregateStatus,
      remoteSchemaPreflightStatus: raw.remoteSchemaPreflightStatus,
      loopReadinessStatus: raw.loopReadinessStatus,
      publicServicesExposure: raw.publicServicesExposure,
      restartLoopObserved: raw.restartLoopObserved,
      verifyVm: Object.freeze({
        cpuKind: raw.cpuKind,
        cpus: raw.cpus,
        memoryMb: raw.memoryMb,
      }),
      secretValuesIncluded: false as const,
      evidenceFingerprintSha256: null as string | null,
    });
    const canonical = JSON.stringify({
      org: doc.org,
      primaryRegion: doc.primaryRegion,
      appName: doc.appName,
      imageDigestSha256: doc.imageDigestSha256,
      deploymentPhases: doc.deploymentPhases,
      verifyCount: doc.verifyCount,
      renderCount: doc.renderCount,
      observedRegion: doc.observedRegion,
      secretDeployAggregateStatus: doc.secretDeployAggregateStatus,
      remoteSchemaPreflightStatus: doc.remoteSchemaPreflightStatus,
      loopReadinessStatus: doc.loopReadinessStatus,
      publicServicesExposure: doc.publicServicesExposure,
      restartLoopObserved: doc.restartLoopObserved,
      verifyVm: doc.verifyVm,
    });
    if (looksLikeSecretValue(canonical)) {
      return empty("secret_value_leak");
    }
    return Object.freeze({
      ...doc,
      evidenceFingerprintSha256: createHash("sha256")
        .update(canonical)
        .digest("hex"),
    });
  } catch {
    return empty("hostile_input");
  }
}

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_ACCEPTED_STATE =
  Object.freeze({
    appName: HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
    imageDigestSha256: HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_IMAGE_DIGEST,
    deploymentPhases: HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_DEPLOYMENT_PHASES,
    verifyCount: 1,
    renderCount: 0,
    observedRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
    secretDeployAggregateStatus: "deployed" as const,
    remoteSchemaPreflightStatus: "pass" as const,
    loopReadinessStatus: "started" as const,
    publicServicesExposure: "none" as const,
    restartLoopObserved: false as const,
    cpuKind: HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.cpuKind,
    cpus: HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.cpus,
    memoryMb: HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.memoryMb,
  } satisfies HeadlessFlyStagingVerifyFirstPassEvidenceInput);

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_PHASE2E2D7A_FLY_STAGING_VERIFY_FIRST_PASS_EVIDENCE.md" as const;
