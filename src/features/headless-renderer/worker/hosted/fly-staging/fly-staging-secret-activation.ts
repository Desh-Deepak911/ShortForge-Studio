/**
 * Sprint 11E Phase 2E.2D.6E — Fly staged-secret activation and rollback authority.
 * Local only. Never returns or logs secret values.
 */

import { HEADLESS_FLY_STAGING_SECRET_NAMES } from "./fly-staging-env-ledger";
import { parseHeadlessFlyStagingMachineId } from "./fly-staging-machine-id-authority";

/** Normalized Fly secret deployment status (names only in ledger). */
export type HeadlessFlyStagingSecretFlyStatus =
  | "staged"
  | "deployed"
  | "partial"
  | "unknown";

export type HeadlessFlyStagingSecretLedgerEntry = {
  readonly name: string;
  readonly flyStatus: Exclude<HeadlessFlyStagingSecretFlyStatus, "partial">;
};

export type HeadlessFlyStagingSecretLedgerParse =
  | {
      readonly status: "ok";
      readonly reasonId: "ok";
      readonly entries: readonly HeadlessFlyStagingSecretLedgerEntry[];
      readonly aggregateStatus: HeadlessFlyStagingSecretFlyStatus;
      readonly runtimeReady: boolean;
    }
  | {
      readonly status: "invalid";
      readonly reasonId:
        | "provider_error"
        | "malformed_secret_list"
        | "missing_secret_name"
        | "unknown_secret_name"
        | "duplicate_secret_name"
        | "secret_name_count_mismatch"
        | "unknown_fly_status"
        | "hostile_input";
      readonly entries: readonly HeadlessFlyStagingSecretLedgerEntry[];
      readonly aggregateStatus: HeadlessFlyStagingSecretFlyStatus | null;
      readonly runtimeReady: false;
    };

export type HeadlessFlyStagingVerifyMachineSnapshot = {
  readonly machineId: string;
  readonly processGroup: "verify" | "render" | "other";
  readonly region: string;
  readonly cpuKind: string;
  readonly cpus: number;
  readonly memoryMb: number;
  readonly imageDigestSha256: string | null;
};

export type HeadlessFlyStagingVerifyFirstSecretActivationInput = {
  readonly secretsBefore: HeadlessFlyStagingSecretLedgerParse;
  readonly secretsAfter: HeadlessFlyStagingSecretLedgerParse | null;
  readonly machineBefore: HeadlessFlyStagingVerifyMachineSnapshot | null;
  readonly machineAfter: HeadlessFlyStagingVerifyMachineSnapshot | null;
  readonly expectedImageDigestSha256: string;
  readonly secretsDeployAttempted: boolean;
  readonly secretsDeploySucceeded: boolean | null;
  readonly providerListSucceeded: boolean;
};

export type HeadlessFlyStagingVerifyFirstSecretActivationReasonId =
  | "ok_deployed"
  | "ok_already_deployed"
  | "ok_activated_by_single_deploy"
  | "needs_secrets_deploy"
  | "secrets_staged_not_runtime_ready"
  | "secrets_partial_not_runtime_ready"
  | "secrets_deploy_failed"
  | "secrets_still_staged_after_deploy"
  | "secrets_still_partial_after_deploy"
  | "secrets_not_deployed_final"
  | "malformed_secret_list"
  | "machine_topology_changed"
  | "image_digest_changed"
  | "render_machine_created"
  | "provider_error"
  | "hostile_input";

export type HeadlessFlyStagingVerifyFirstSecretActivationClassification = {
  readonly status: "ok" | "invalid" | "pending";
  readonly reasonId: HeadlessFlyStagingVerifyFirstSecretActivationReasonId;
  readonly shouldRunSecretsDeploy: boolean;
  readonly runtimeReady: boolean;
};

export type HeadlessFlyStagingRuntimeReadinessInput = {
  readonly secretLedger: HeadlessFlyStagingSecretLedgerParse;
  readonly schemaPreflightLogStatus: "pass" | "fail" | "absent" | "unknown";
  readonly verifyLoopStarted: boolean;
};

export type HeadlessFlyStagingRollbackDestroyInput = {
  readonly argv: readonly string[];
  readonly listCommandSucceeded: boolean;
  readonly destroyCommandsSucceeded: readonly boolean[];
  readonly finalMachineCount: number | null;
};

export type HeadlessFlyStagingRollbackDestroyClassification = {
  readonly status: "ok" | "invalid" | "unconfirmed";
  readonly reasonId:
    | "ok_exact_zero"
    | "invalid_destroy_flag_y"
    | "invalid_missing_app_scope"
    | "invalid_foreign_machine_id"
    | "provider_list_failed"
    | "destroy_failed"
    | "rollback_unconfirmed"
    | "hostile_input";
};

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]*$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

function normalizeFlyStatus(raw: unknown): Exclude<HeadlessFlyStagingSecretFlyStatus, "partial"> | "unknown_fly_status" {
  if (typeof raw !== "string") return "unknown_fly_status";
  const s = raw.trim().toLowerCase();
  if (s === "staged" || s === "staging") return "staged";
  if (s === "deployed") return "deployed";
  return "unknown_fly_status";
}

function readSecretRow(row: unknown): { name: string; status: unknown } | null {
  if (row == null || typeof row !== "object") return null;
  const obj = row as Record<string, unknown>;
  const name = obj.name ?? obj.Name;
  const status = obj.status ?? obj.Status;
  if (typeof name !== "string") return null;
  return { name, status };
}

function computeAggregate(
  entries: readonly HeadlessFlyStagingSecretLedgerEntry[],
): HeadlessFlyStagingSecretFlyStatus {
  let staged = 0;
  let deployed = 0;
  let unknown = 0;
  for (const e of entries) {
    if (e.flyStatus === "staged") staged += 1;
    else if (e.flyStatus === "deployed") deployed += 1;
    else unknown += 1;
  }
  if (unknown > 0) return "unknown";
  if (staged > 0 && deployed > 0) return "partial";
  if (staged === entries.length) return "staged";
  if (deployed === entries.length) return "deployed";
  return "unknown";
}

/**
 * Parse `fly secrets list --json` — exact nine names, bounded statuses, no values.
 */
export function parseHeadlessFlyStagingSecretsListJson(
  json: unknown,
  options: { readonly listCommandSucceeded?: boolean } = {},
): HeadlessFlyStagingSecretLedgerParse {
  try {
    if (options.listCommandSucceeded === false) {
      return Object.freeze({
        status: "invalid",
        reasonId: "provider_error",
        entries: Object.freeze([]),
        aggregateStatus: null,
        runtimeReady: false,
      });
    }
    if (typeof json === "string") {
      try {
        json = JSON.parse(json);
      } catch {
        return Object.freeze({
          status: "invalid",
          reasonId: "malformed_secret_list",
          entries: Object.freeze([]),
          aggregateStatus: null,
          runtimeReady: false,
        });
      }
    }
    if (!Array.isArray(json)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_secret_list",
        entries: Object.freeze([]),
        aggregateStatus: null,
        runtimeReady: false,
      });
    }
    const entries: HeadlessFlyStagingSecretLedgerEntry[] = [];
    const seen = new Set<string>();
    for (const row of json) {
      const parsed = readSecretRow(row);
      if (parsed == null) {
        return Object.freeze({
          status: "invalid",
          reasonId: "malformed_secret_list",
          entries: Object.freeze([]),
          aggregateStatus: null,
          runtimeReady: false,
        });
      }
      const name = parsed.name.trim();
      if (!SECRET_NAME_RE.test(name) || seen.has(name)) {
        return Object.freeze({
          status: "invalid",
          reasonId: seen.has(name) ? "duplicate_secret_name" : "malformed_secret_list",
          entries: Object.freeze([]),
          aggregateStatus: null,
          runtimeReady: false,
        });
      }
      const flyStatus = normalizeFlyStatus(parsed.status);
      if (flyStatus === "unknown_fly_status") {
        return Object.freeze({
          status: "invalid",
          reasonId: "unknown_fly_status",
          entries: Object.freeze([]),
          aggregateStatus: null,
          runtimeReady: false,
        });
      }
      seen.add(name);
      entries.push(Object.freeze({ name, flyStatus }));
    }
    if (entries.length !== HEADLESS_FLY_STAGING_SECRET_NAMES.length) {
      return Object.freeze({
        status: "invalid",
        reasonId: "secret_name_count_mismatch",
        entries: Object.freeze(entries),
        aggregateStatus: null,
        runtimeReady: false,
      });
    }
    for (const required of HEADLESS_FLY_STAGING_SECRET_NAMES) {
      if (!seen.has(required)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "missing_secret_name",
          entries: Object.freeze(entries),
          aggregateStatus: null,
          runtimeReady: false,
        });
      }
      if (!(HEADLESS_FLY_STAGING_SECRET_NAMES as readonly string[]).includes(required)) {
        continue;
      }
    }
    for (const entry of entries) {
      if (
        !(HEADLESS_FLY_STAGING_SECRET_NAMES as readonly string[]).includes(entry.name)
      ) {
        return Object.freeze({
          status: "invalid",
          reasonId: "unknown_secret_name",
          entries: Object.freeze(entries),
          aggregateStatus: null,
          runtimeReady: false,
        });
      }
    }
    const aggregateStatus = computeAggregate(entries);
    const runtimeReady = aggregateStatus === "deployed";
    return Object.freeze({
      status: "ok",
      reasonId: "ok",
      entries: Object.freeze(entries),
      aggregateStatus,
      runtimeReady,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      entries: Object.freeze([]),
      aggregateStatus: null,
      runtimeReady: false,
    });
  }
}

/** Pre-first Machine: staged exact-nine is valid; never runtime-ready. */
export function classifyHeadlessFlyStagingPreFirstMachineSecretSurface(
  ledger: HeadlessFlyStagingSecretLedgerParse,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_staged_or_deployed_names"
    | "ok_staged_not_runtime_ready"
    | "invalid_ledger"
    | "partial_not_allowed_pre_first"
    | "unknown_status";
  readonly runtimeReady: boolean;
} {
  if (ledger.status !== "ok") {
    return Object.freeze({
      status: "invalid",
      reasonId: "invalid_ledger",
      runtimeReady: false,
    });
  }
  if (ledger.aggregateStatus === "partial" || ledger.aggregateStatus === "unknown") {
    return Object.freeze({
      status: "invalid",
      reasonId:
        ledger.aggregateStatus === "partial"
          ? "partial_not_allowed_pre_first"
          : "unknown_status",
      runtimeReady: false,
    });
  }
  return Object.freeze({
    status: "ok",
    reasonId: ledger.runtimeReady
      ? "ok_staged_or_deployed_names"
      : "ok_staged_not_runtime_ready",
    runtimeReady: ledger.runtimeReady,
  });
}

function snapshotsMatchTopology(
  before: HeadlessFlyStagingVerifyMachineSnapshot,
  after: HeadlessFlyStagingVerifyMachineSnapshot,
  expectedDigest: string,
): HeadlessFlyStagingVerifyFirstSecretActivationReasonId | "ok" {
  if (after.processGroup !== "verify" || before.processGroup !== "verify") {
    return "render_machine_created";
  }
  if (
    before.region !== "iad" ||
    after.region !== "iad" ||
    before.cpuKind !== after.cpuKind ||
    before.cpus !== after.cpus ||
    before.memoryMb !== after.memoryMb
  ) {
    return "machine_topology_changed";
  }
  const afterDigest = after.imageDigestSha256 ?? "";
  const beforeDigest = before.imageDigestSha256 ?? "";
  if (
    beforeDigest !== expectedDigest ||
    afterDigest !== expectedDigest ||
    beforeDigest !== afterDigest
  ) {
    return "image_digest_changed";
  }
  if (before.machineId !== after.machineId) {
    return "machine_topology_changed";
  }
  return "ok";
}

/**
 * Decide whether verify-first needs exactly one `fly secrets deploy` and whether
 * final secret state is runtime-ready.
 */
export function classifyHeadlessFlyStagingVerifyFirstSecretActivation(
  input: HeadlessFlyStagingVerifyFirstSecretActivationInput,
): HeadlessFlyStagingVerifyFirstSecretActivationClassification {
  try {
    if (!input.providerListSucceeded || input.secretsBefore.status !== "ok") {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_secret_list",
        shouldRunSecretsDeploy: false,
        runtimeReady: false,
      });
    }
    const beforeAgg = input.secretsBefore.aggregateStatus;
    if (input.secretsDeployAttempted !== true) {
      if (beforeAgg === "deployed") {
        return Object.freeze({
          status: "ok",
          reasonId: "ok_already_deployed",
          shouldRunSecretsDeploy: false,
          runtimeReady: true,
        });
      }
      if (beforeAgg === "staged") {
        return Object.freeze({
          status: "pending",
          reasonId: "needs_secrets_deploy",
          shouldRunSecretsDeploy: true,
          runtimeReady: false,
        });
      }
      if (beforeAgg === "partial") {
        return Object.freeze({
          status: "pending",
          reasonId: "needs_secrets_deploy",
          shouldRunSecretsDeploy: true,
          runtimeReady: false,
        });
      }
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_secret_list",
        shouldRunSecretsDeploy: false,
        runtimeReady: false,
      });
    }
    if (input.secretsDeploySucceeded !== true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "secrets_deploy_failed",
        shouldRunSecretsDeploy: false,
        runtimeReady: false,
      });
    }
    if (input.secretsAfter == null || input.secretsAfter.status !== "ok") {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_secret_list",
        shouldRunSecretsDeploy: false,
        runtimeReady: false,
      });
    }
    if (
      input.machineBefore != null &&
      input.machineAfter != null
    ) {
      const topo = snapshotsMatchTopology(
        input.machineBefore,
        input.machineAfter,
        input.expectedImageDigestSha256,
      );
      if (topo !== "ok") {
        return Object.freeze({
          status: "invalid",
          reasonId: topo,
          shouldRunSecretsDeploy: false,
          runtimeReady: false,
        });
      }
    }
    const afterAgg = input.secretsAfter.aggregateStatus;
    if (afterAgg === "deployed") {
      return Object.freeze({
        status: "ok",
        reasonId:
          beforeAgg === "deployed"
            ? "ok_already_deployed"
            : "ok_activated_by_single_deploy",
        shouldRunSecretsDeploy: false,
        runtimeReady: true,
      });
    }
    if (afterAgg === "staged") {
      return Object.freeze({
        status: "invalid",
        reasonId: "secrets_still_staged_after_deploy",
        shouldRunSecretsDeploy: false,
        runtimeReady: false,
      });
    }
    if (afterAgg === "partial") {
      return Object.freeze({
        status: "invalid",
        reasonId: "secrets_still_partial_after_deploy",
        shouldRunSecretsDeploy: false,
        runtimeReady: false,
      });
    }
    return Object.freeze({
      status: "invalid",
      reasonId: "secrets_not_deployed_final",
      shouldRunSecretsDeploy: false,
      runtimeReady: false,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      shouldRunSecretsDeploy: false,
      runtimeReady: false,
    });
  }
}

/**
 * Runtime verify-first success requires deployed secrets AND worker log proof.
 * Never infer from names-only, image deploy, Machine creation, or local preflight.
 */
export function classifyHeadlessFlyStagingVerifyFirstRuntimeReadiness(
  input: HeadlessFlyStagingRuntimeReadinessInput,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_runtime_ready"
    | "secrets_not_deployed"
    | "schema_preflight_failed"
    | "verify_loop_not_started"
    | "invalid_secret_ledger"
    | "hostile_input";
} {
  try {
    if (
      input.secretLedger.status !== "ok" ||
      input.secretLedger.runtimeReady !== true
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId:
          input.secretLedger.status !== "ok"
            ? "invalid_secret_ledger"
            : "secrets_not_deployed",
      });
    }
    if (input.schemaPreflightLogStatus === "fail") {
      return Object.freeze({
        status: "invalid",
        reasonId: "schema_preflight_failed",
      });
    }
    if (!input.verifyLoopStarted) {
      return Object.freeze({
        status: "invalid",
        reasonId: "verify_loop_not_started",
      });
    }
    if (input.schemaPreflightLogStatus !== "pass") {
      return Object.freeze({
        status: "invalid",
        reasonId: "schema_preflight_failed",
      });
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok_runtime_ready",
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
    });
  }
}

/** Rollback destroy CLI authority — rejects invalid `-y`; requires app scope. */
export function classifyHeadlessFlyStagingRollbackDestroy(
  input: HeadlessFlyStagingRollbackDestroyInput,
): HeadlessFlyStagingRollbackDestroyClassification {
  try {
    for (const arg of input.argv) {
      if (arg === "-y" || arg === "--yes") {
        return Object.freeze({
          status: "invalid",
          reasonId: "invalid_destroy_flag_y",
        });
      }
    }
    const joined = input.argv.join(" ");
    if (!/\bfly machine destroy\b/.test(joined)) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    if (!/\s-a\s|\s--app\s/.test(` ${joined} `)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "invalid_missing_app_scope",
      });
    }
    if (!input.listCommandSucceeded) {
      return Object.freeze({
        status: "unconfirmed",
        reasonId: "provider_list_failed",
      });
    }
    if (input.destroyCommandsSucceeded.some((ok) => !ok)) {
      return Object.freeze({
        status: "unconfirmed",
        reasonId: "destroy_failed",
      });
    }
    if (
      input.finalMachineCount == null ||
      !Number.isSafeInteger(input.finalMachineCount)
    ) {
      return Object.freeze({
        status: "unconfirmed",
        reasonId: "rollback_unconfirmed",
      });
    }
    if (input.finalMachineCount !== 0) {
      return Object.freeze({
        status: "unconfirmed",
        reasonId: "rollback_unconfirmed",
      });
    }
    return Object.freeze({ status: "ok", reasonId: "ok_exact_zero" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export function parseHeadlessFlyStagingVerifyMachineFromListJson(
  json: unknown,
): HeadlessFlyStagingVerifyMachineSnapshot | null {
  try {
    if (!Array.isArray(json) || json.length !== 1) return null;
    const m = json[0] as Record<string, unknown>;
    const idParsed = parseHeadlessFlyStagingMachineId(m.id);
    if (!idParsed.ok) return null;
    const id = idParsed.machineId;
    const config = (m.config as Record<string, unknown> | undefined) ?? {};
    const meta =
      (config.metadata as Record<string, unknown> | undefined) ??
      (m.metadata as Record<string, unknown> | undefined) ??
      {};
    const groupRaw = meta.fly_process_group;
    const processGroup =
      groupRaw === "verify"
        ? "verify"
        : groupRaw === "render"
          ? "render"
          : "other";
    const guest = (config.guest as Record<string, unknown> | undefined) ?? {};
    const region = typeof m.region === "string" ? m.region : "";
    const cpuKind =
      typeof guest.cpu_kind === "string"
        ? guest.cpu_kind
        : typeof guest.cpuKind === "string"
          ? guest.cpuKind
          : "";
    const cpus = Number(guest.cpus);
    const memoryMb = Number(guest.memory_mb ?? guest.memoryMb);
    let imageDigestSha256: string | null = null;
    const image = config.image;
    if (typeof image === "string") {
      const match = /@sha256:([a-f0-9]{64})/i.exec(image);
      if (match) imageDigestSha256 = match[1]!.toLowerCase();
    }
    const imageRef = m.image_ref as Record<string, unknown> | undefined;
    if (
      imageDigestSha256 == null &&
      imageRef &&
      typeof imageRef.digest === "string" &&
      DIGEST_RE.test(imageRef.digest)
    ) {
      imageDigestSha256 = imageRef.digest.toLowerCase();
    }
    return Object.freeze({
      machineId: id,
      processGroup,
      region,
      cpuKind,
      cpus,
      memoryMb,
      imageDigestSha256,
    });
  } catch {
    return null;
  }
}

export const HEADLESS_FLY_STAGING_SECRET_ACTIVATION_CONTRACT = Object.freeze({
  preFirstMachineAllowsStaged: true,
  stagedNeverRuntimeReady: true,
  verifyFirstSecretsDeployMaxAttempts: 1,
  runtimeRequiresDeployedLedger: true,
  neverInferFromLocalPreflight: true,
  neverInferFromMachineCreationAlone: true,
  rollbackDestroyUsesForceNotYes: true,
  rollbackUnconfirmedNeverClean: true,
} as const);

export const HEADLESS_FLY_STAGING_SECRET_FLY_STATUSES = Object.freeze([
  "staged",
  "partial",
  "deployed",
  "unknown",
] as const);
