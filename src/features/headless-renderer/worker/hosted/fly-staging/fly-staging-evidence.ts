/**
 * Sprint 11E Phase 2E.2D.4 — bounded Fly staging evidence authority.
 * Never includes secret values, tokens, URLs, or provider messages.
 */

import { createHash } from "node:crypto";

import { HEADLESS_FLY_STAGING_SECRET_NAMES } from "./fly-staging-env-ledger";
import type { HeadlessFlyStagingSecretFlyStatus } from "./fly-staging-secret-activation";
import type { HeadlessFlyStagingScaleState } from "./fly-staging-deployment-plan";
import type { HeadlessFlyStagingRegionAuthority } from "./fly-staging-machine-authority";
import {
  HEADLESS_FLY_STAGING_ORG,
  HEADLESS_FLY_STAGING_PRIMARY_REGION,
  HEADLESS_FLY_STAGING_TOPOLOGY,
} from "./fly-staging-topology";

export type HeadlessFlyStagingEvidenceInput = {
  readonly appName: string;
  readonly imageDigestSha256: string | null;
  /** Secret NAMES present on the app — never values. */
  readonly secretNamesPresent: readonly string[];
  /**
   * Fly secret deployment aggregate from `fly secrets list --json` (Phase 2E.2D.6E).
   * Names-only ledger; never values. `not_observed` when list was not run.
   */
  readonly secretDeployAggregateStatus?:
    | HeadlessFlyStagingSecretFlyStatus
    | "not_observed";
  readonly scale: HeadlessFlyStagingScaleState;
  readonly schemaPreflightStatus: "pass" | "fail" | "not_run";
  readonly cleanupState:
    | "intact"
    | "machines_zeroed"
    | "scaled_to_zero"
    | "torn_down"
    | "unknown";
  readonly rollbackState:
    | "not_run"
    | "machines_zeroed"
    | "scaled_to_zero"
    | "prior_image"
    | "failed";
  readonly configurationFingerprintSha256: string;
  /**
   * Zero-consumer evidence must use configured_local_not_remotely_observed.
   * Remotely observed region is only valid after verify-first Machine status.
   */
  readonly regionAuthority: HeadlessFlyStagingRegionAuthority;
};

export type HeadlessFlyStagingEvidenceReasonId =
  | "ok"
  | "secret_value_leak"
  | "incomplete_secret_names"
  | "invalid_scale"
  | "invalid_digest"
  | "remotely_observed_region_claim"
  | "secrets_not_deployed_for_runtime"
  | "hostile_input";

export type HeadlessFlyStagingEvidenceDocument = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingEvidenceReasonId;
  readonly org: typeof HEADLESS_FLY_STAGING_ORG;
  /** Configured primary region pin — not a remote observation claim. */
  readonly primaryRegion: typeof HEADLESS_FLY_STAGING_PRIMARY_REGION;
  readonly regionAuthority: HeadlessFlyStagingRegionAuthority | null;
  readonly appName: string | null;
  readonly processGroups: readonly string[];
  readonly imageDigestSha256: string | null;
  readonly secretNamesPresent: readonly string[];
  readonly secretDeployAggregateStatus:
    | HeadlessFlyStagingSecretFlyStatus
    | "not_observed"
    | null;
  readonly secretValuesIncluded: false;
  readonly scale: HeadlessFlyStagingScaleState | null;
  readonly schemaPreflightStatus: HeadlessFlyStagingEvidenceInput["schemaPreflightStatus"] | null;
  readonly cleanupState: HeadlessFlyStagingEvidenceInput["cleanupState"] | null;
  readonly rollbackState: HeadlessFlyStagingEvidenceInput["rollbackState"] | null;
  readonly configurationFingerprintSha256: string | null;
  readonly evidenceFingerprintSha256: string | null;
};

const DIGEST_RE = /^[a-f0-9]{64}$/;

function looksLikeSecretValue(text: string): boolean {
  return (
    /postgres(ql)?:\/\//i.test(text) ||
    /rediss?:\/\//i.test(text) ||
    /sk_live|sk_test|AKIA[0-9A-Z]{16}/i.test(text) ||
    /-----BEGIN/.test(text)
  );
}

/**
 * Build a bounded evidence document. Rejects payloads that appear to embed secrets.
 */
export function buildHeadlessFlyStagingEvidenceDocument(
  input: unknown,
): HeadlessFlyStagingEvidenceDocument {
  const empty = (
    reasonId: HeadlessFlyStagingEvidenceReasonId,
  ): HeadlessFlyStagingEvidenceDocument =>
    Object.freeze({
      status: "invalid",
      reasonId,
      org: HEADLESS_FLY_STAGING_ORG,
      primaryRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
      regionAuthority: null,
      appName: null,
      processGroups: HEADLESS_FLY_STAGING_TOPOLOGY.processGroups,
      imageDigestSha256: null,
      secretNamesPresent: Object.freeze([] as string[]),
      secretDeployAggregateStatus: null,
      secretValuesIncluded: false,
      scale: null,
      schemaPreflightStatus: null,
      cleanupState: null,
      rollbackState: null,
      configurationFingerprintSha256: null,
      evidenceFingerprintSha256: null,
    });

  try {
    if (input == null || typeof input !== "object") {
      return empty("hostile_input");
    }
    const raw = input as HeadlessFlyStagingEvidenceInput;
    if (typeof raw.appName !== "string" || raw.appName.length === 0) {
      return empty("hostile_input");
    }
    if (looksLikeSecretValue(raw.appName)) {
      return empty("secret_value_leak");
    }
    if (
      typeof raw.configurationFingerprintSha256 !== "string" ||
      !DIGEST_RE.test(raw.configurationFingerprintSha256)
    ) {
      return empty("hostile_input");
    }
    if (
      raw.imageDigestSha256 != null &&
      (typeof raw.imageDigestSha256 !== "string" ||
        !DIGEST_RE.test(raw.imageDigestSha256))
    ) {
      return empty("invalid_digest");
    }
    if (!Array.isArray(raw.secretNamesPresent)) {
      return empty("hostile_input");
    }
    for (const name of raw.secretNamesPresent) {
      if (typeof name !== "string") return empty("hostile_input");
      if (looksLikeSecretValue(name)) return empty("secret_value_leak");
    }
    const required = new Set<string>(HEADLESS_FLY_STAGING_SECRET_NAMES);
    for (const name of raw.secretNamesPresent) {
      required.delete(name);
    }
    if (required.size > 0 && raw.secretNamesPresent.length > 0) {
      // Allow empty set for pre-secrets evidence; if any present, require full set.
      if (
        raw.secretNamesPresent.length !== HEADLESS_FLY_STAGING_SECRET_NAMES.length
      ) {
        return empty("incomplete_secret_names");
      }
    }
    if (
      raw.scale == null ||
      typeof raw.scale.verifyCount !== "number" ||
      typeof raw.scale.renderCount !== "number"
    ) {
      return empty("invalid_scale");
    }
    // Zero-consumer (machine counts 0/0) must not claim remote region observation.
    if (
      raw.regionAuthority === "remotely_observed_from_verify_machine" &&
      raw.scale.verifyCount === 0 &&
      raw.scale.renderCount === 0
    ) {
      return empty("remotely_observed_region_claim");
    }
    if (
      raw.regionAuthority !== "configured_local_not_remotely_observed" &&
      raw.regionAuthority !== "remotely_observed_from_verify_machine"
    ) {
      return empty("hostile_input");
    }
    const secretDeployAggregateStatus =
      raw.secretDeployAggregateStatus ?? "not_observed";
    if (
      secretDeployAggregateStatus !== "not_observed" &&
      secretDeployAggregateStatus !== "staged" &&
      secretDeployAggregateStatus !== "partial" &&
      secretDeployAggregateStatus !== "deployed" &&
      secretDeployAggregateStatus !== "unknown"
    ) {
      return empty("hostile_input");
    }
    if (
      raw.scale.verifyCount >= 1 &&
      raw.schemaPreflightStatus === "pass" &&
      secretDeployAggregateStatus !== "deployed"
    ) {
      return empty("secrets_not_deployed_for_runtime");
    }

    const doc = {
      status: "ok" as const,
      reasonId: "ok" as const,
      org: HEADLESS_FLY_STAGING_ORG,
      primaryRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
      regionAuthority: raw.regionAuthority,
      appName: raw.appName,
      processGroups: HEADLESS_FLY_STAGING_TOPOLOGY.processGroups,
      imageDigestSha256: raw.imageDigestSha256,
      secretNamesPresent: Object.freeze([...raw.secretNamesPresent].sort()),
      secretDeployAggregateStatus,
      secretValuesIncluded: false as const,
      scale: Object.freeze({ ...raw.scale }),
      schemaPreflightStatus: raw.schemaPreflightStatus,
      cleanupState: raw.cleanupState,
      rollbackState: raw.rollbackState,
      configurationFingerprintSha256: raw.configurationFingerprintSha256,
      evidenceFingerprintSha256: null as string | null,
    };

    const canonical = JSON.stringify({
      org: doc.org,
      primaryRegion: doc.primaryRegion,
      regionAuthority: doc.regionAuthority,
      appName: doc.appName,
      processGroups: doc.processGroups,
      imageDigestSha256: doc.imageDigestSha256,
      secretNamesPresent: doc.secretNamesPresent,
      secretDeployAggregateStatus: doc.secretDeployAggregateStatus,
      scale: doc.scale,
      schemaPreflightStatus: doc.schemaPreflightStatus,
      cleanupState: doc.cleanupState,
      rollbackState: doc.rollbackState,
      configurationFingerprintSha256: doc.configurationFingerprintSha256,
    });
    if (looksLikeSecretValue(canonical)) {
      return empty("secret_value_leak");
    }
    doc.evidenceFingerprintSha256 = createHash("sha256")
      .update(canonical)
      .digest("hex");
    return Object.freeze(doc);
  } catch {
    return empty("hostile_input");
  }
}

/**
 * Fingerprint materialized public configuration (toml + public env), no secrets.
 */
export function fingerprintHeadlessFlyStagingConfiguration(
  materializedToml: string,
): string {
  const payload = JSON.stringify({
    tomlSha256: createHash("sha256").update(materializedToml).digest("hex"),
    topology: {
      region: HEADLESS_FLY_STAGING_PRIMARY_REGION,
      org: HEADLESS_FLY_STAGING_ORG,
      verify: HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm,
      render: HEADLESS_FLY_STAGING_TOPOLOGY.renderVm,
      killSignal: HEADLESS_FLY_STAGING_TOPOLOGY.killSignal,
      killTimeoutSeconds: HEADLESS_FLY_STAGING_TOPOLOGY.killTimeoutSeconds,
    },
  });
  return createHash("sha256").update(payload).digest("hex");
}
