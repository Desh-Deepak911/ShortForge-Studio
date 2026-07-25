/**
 * Sprint 11E Phase 2E.2D.5C — exact Machine-list authority (local only).
 *
 * Pre-first-deploy truth: Fly Launch scale metadata is not authoritative until
 * at least one Machine exists. Zero-consumer success is image push proven +
 * exact zero Machine list + no public services.
 */

import {
  isHeadlessFlyStagingMachineId,
  parseHeadlessFlyStagingMachineId,
} from "./fly-staging-machine-id-authority";

/** Quiet `fly machine list -q` lines: one Machine id per non-empty line. */
export type HeadlessFlyStagingMachineListParse =
  | {
      readonly status: "ok";
      readonly reasonId: "ok_zero" | "ok_nonempty";
      readonly machineIds: readonly string[];
    }
  | {
      readonly status: "invalid";
      readonly reasonId:
        | "provider_error"
        | "malformed_machine_list"
        | "hostile_input";
      readonly machineIds: null;
    };

/**
 * Classify quiet machine-list stdout. Provider failure must be signaled by the
 * caller (non-zero exit / stderr marker) — empty stdout alone is not enough when
 * the CLI failed.
 */
export function classifyHeadlessFlyStagingQuietMachineList(
  stdout: unknown,
  options: {
    readonly listCommandSucceeded: boolean;
    readonly providerErrorMarker?: boolean;
  },
): HeadlessFlyStagingMachineListParse {
  try {
    if (options.providerErrorMarker === true || !options.listCommandSucceeded) {
      return Object.freeze({
        status: "invalid",
        reasonId: "provider_error",
        machineIds: null,
      });
    }
    if (typeof stdout !== "string") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        machineIds: null,
      });
    }
    const lines = stdout
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      // Reject table headers / error prose masquerading as success.
      if (
        !isHeadlessFlyStagingMachineId(line) ||
        /error|fail|machine/i.test(line)
      ) {
        return Object.freeze({
          status: "invalid",
          reasonId: "malformed_machine_list",
          machineIds: null,
        });
      }
    }
    if (lines.length === 0) {
      return Object.freeze({
        status: "ok",
        reasonId: "ok_zero",
        machineIds: Object.freeze([]),
      });
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok_nonempty",
      machineIds: Object.freeze([...lines]),
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      machineIds: null,
    });
  }
}

export type HeadlessFlyStagingImagePushLogClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_push_proven"
    | "ok_push_proven_zero_machine_noise_tolerated"
    | "push_not_proven"
    | "noise_without_push_proof"
    | "hostile_input";
  readonly manifestDigestSha256: string | null;
  readonly imageRefPresent: boolean;
  readonly zeroMachineCliNoisePresent: boolean;
};

const MANIFEST_DIGEST_RE = /exporting manifest sha256:([a-f0-9]{64})/i;
const IMAGE_REF_RE = /image:\s*registry\.fly\.io\/\S+/i;
const BUILD_DONE_RE = /Building image done/i;
const ZERO_MACHINE_NOISE_RE =
  /could not create a fly\.toml from any machines[\s\S]*No machines configured for this app|No machines configured for this app[\s\S]*could not create a fly\.toml from any machines/i;

/**
 * Classify build-only push log. Post-push zero-Machine CLI noise is accepted
 * only when build+push and an immutable image reference are proven.
 */
export function classifyHeadlessFlyStagingImagePushLog(
  log: unknown,
): HeadlessFlyStagingImagePushLogClassification {
  try {
    if (typeof log !== "string" || log.length === 0) {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        manifestDigestSha256: null,
        imageRefPresent: false,
        zeroMachineCliNoisePresent: false,
      });
    }
    const manifestMatch = MANIFEST_DIGEST_RE.exec(log);
    const manifestDigestSha256 = manifestMatch?.[1] ?? null;
    const imageRefPresent = IMAGE_REF_RE.test(log);
    const buildDone = BUILD_DONE_RE.test(log);
    const zeroMachineCliNoisePresent = ZERO_MACHINE_NOISE_RE.test(log);
    const pushProven =
      buildDone &&
      imageRefPresent &&
      typeof manifestDigestSha256 === "string" &&
      manifestDigestSha256.length === 64;

    if (!pushProven) {
      return Object.freeze({
        status: "invalid",
        reasonId: zeroMachineCliNoisePresent
          ? "noise_without_push_proof"
          : "push_not_proven",
        manifestDigestSha256,
        imageRefPresent,
        zeroMachineCliNoisePresent,
      });
    }
    if (zeroMachineCliNoisePresent) {
      return Object.freeze({
        status: "ok",
        reasonId: "ok_push_proven_zero_machine_noise_tolerated",
        manifestDigestSha256,
        imageRefPresent: true,
        zeroMachineCliNoisePresent: true,
      });
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok_push_proven",
      manifestDigestSha256,
      imageRefPresent: true,
      zeroMachineCliNoisePresent: false,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      manifestDigestSha256: null,
      imageRefPresent: false,
      zeroMachineCliNoisePresent: false,
    });
  }
}

export type HeadlessFlyStagingProcessInventory = {
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly otherCount: number;
  readonly machineIds: readonly string[];
};

export type HeadlessFlyStagingProcessInventoryClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_zero_machines"
    | "ok_verify_only"
    | "ok_verify_and_render"
    | "unexpected_machine"
    | "render_without_verify"
    | "provider_error"
    | "malformed_machine_list"
    | "hostile_input";
  readonly inventory: HeadlessFlyStagingProcessInventory | null;
};

/**
 * Classify process-group inventory derived from Machine list (not Launch scale).
 */
export function classifyHeadlessFlyStagingProcessInventory(
  inventory: unknown,
  phase:
    | "post_secrets_or_image_deploy"
    | "post_verify_first_activation"
    | "post_render_activation",
): HeadlessFlyStagingProcessInventoryClassification {
  try {
    if (inventory == null || typeof inventory !== "object") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        inventory: null,
      });
    }
    const verifyCount = (inventory as { verifyCount?: unknown }).verifyCount;
    const renderCount = (inventory as { renderCount?: unknown }).renderCount;
    const otherCount = (inventory as { otherCount?: unknown }).otherCount ?? 0;
    const machineIds = (inventory as { machineIds?: unknown }).machineIds;
    if (
      typeof verifyCount !== "number" ||
      typeof renderCount !== "number" ||
      typeof otherCount !== "number" ||
      !Number.isSafeInteger(verifyCount) ||
      !Number.isSafeInteger(renderCount) ||
      !Number.isSafeInteger(otherCount) ||
      verifyCount < 0 ||
      renderCount < 0 ||
      otherCount < 0 ||
      !Array.isArray(machineIds)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_machine_list",
        inventory: null,
      });
    }
    const ids = machineIds.filter((x): x is string => typeof x === "string");
    const state = Object.freeze({
      verifyCount,
      renderCount,
      otherCount,
      machineIds: Object.freeze([...ids]),
    });
    if (otherCount > 0) {
      return Object.freeze({
        status: "invalid",
        reasonId: "unexpected_machine",
        inventory: state,
      });
    }
    if (phase === "post_secrets_or_image_deploy") {
      if (verifyCount !== 0 || renderCount !== 0 || ids.length !== 0) {
        return Object.freeze({
          status: "invalid",
          reasonId: "unexpected_machine",
          inventory: state,
        });
      }
      return Object.freeze({
        status: "ok",
        reasonId: "ok_zero_machines",
        inventory: state,
      });
    }
    if (phase === "post_verify_first_activation") {
      if (verifyCount !== 1 || renderCount !== 0 || ids.length !== 1) {
        return Object.freeze({
          status: "invalid",
          reasonId:
            renderCount > 0 ? "render_without_verify" : "unexpected_machine",
          inventory: state,
        });
      }
      return Object.freeze({
        status: "ok",
        reasonId: "ok_verify_only",
        inventory: state,
      });
    }
    if (verifyCount !== 1 || renderCount !== 1 || ids.length !== 2) {
      return Object.freeze({
        status: "invalid",
        reasonId: "unexpected_machine",
        inventory: state,
      });
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok_verify_and_render",
      inventory: state,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      inventory: null,
    });
  }
}

/**
 * Parse `fly machine list --json` into process-group inventory.
 * Accepts metadata.fly_process_group or config.metadata.fly_process_group.
 */
export function parseHeadlessFlyStagingMachineListJson(
  jsonText: unknown,
): HeadlessFlyStagingProcessInventoryClassification {
  try {
    if (typeof jsonText !== "string") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        inventory: null,
      });
    }
    const trimmed = jsonText.trim();
    if (trimmed.length === 0) {
      return classifyHeadlessFlyStagingProcessInventory(
        {
          verifyCount: 0,
          renderCount: 0,
          otherCount: 0,
          machineIds: [],
        },
        "post_secrets_or_image_deploy",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_machine_list",
        inventory: null,
      });
    }
    if (!Array.isArray(parsed)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_machine_list",
        inventory: null,
      });
    }
    let verifyCount = 0;
    let renderCount = 0;
    let otherCount = 0;
    const machineIds: string[] = [];
    for (const row of parsed) {
      if (row == null || typeof row !== "object") {
        return Object.freeze({
          status: "invalid",
          reasonId: "malformed_machine_list",
          inventory: null,
        });
      }
      const idParsed = parseHeadlessFlyStagingMachineId(
        (row as { id?: unknown }).id,
      );
      if (!idParsed.ok) {
        return Object.freeze({
          status: "invalid",
          reasonId: "malformed_machine_list",
          inventory: null,
        });
      }
      machineIds.push(idParsed.machineId);
      const meta =
        (row as { config?: { metadata?: Record<string, unknown> } }).config
          ?.metadata ??
        (row as { metadata?: Record<string, unknown> }).metadata ??
        {};
      const group = meta.fly_process_group;
      if (group === "verify") verifyCount += 1;
      else if (group === "render") renderCount += 1;
      else otherCount += 1;
    }
    // Phase-agnostic parse — caller reclassifies for the phase.
    const inventory = Object.freeze({
      verifyCount,
      renderCount,
      otherCount,
      machineIds: Object.freeze(machineIds),
    });
    return Object.freeze({
      status: "ok",
      reasonId:
        verifyCount === 0 && renderCount === 0 && otherCount === 0
          ? "ok_zero_machines"
          : verifyCount === 1 && renderCount === 0 && otherCount === 0
            ? "ok_verify_only"
            : verifyCount === 1 && renderCount === 1 && otherCount === 0
              ? "ok_verify_and_render"
              : "unexpected_machine",
      inventory,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      inventory: null,
    });
  }
}

/** First verify activation model — chosen for Launch process-group consistency. */
export const HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_MODEL =
  "verify_only_first_deploy_from_immutable_image" as const;

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_CONTRACT =
  Object.freeze({
    model: HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_MODEL,
    usesImmutableImageNoRebuild: true,
    haFalse: true,
    verifyProcessGroupOnly: true,
    renderAbsent: true,
    region: "iad",
    cpuKind: "shared",
    cpus: 1,
    memoryMb: 2048,
    publicServicesForbidden: true,
    /** Full topology remains one image; render is a later transition. */
    fullTopologyRemainsVerifyAndRender: true,
    forbidsPersistedZeroScaleBeforeFirstMachine: true,
    forbidsFlyScaleCountShowBeforeFirstMachine: true,
  });

/**
 * Scripts that must not invoke Launch scale or `fly config show` before the
 * first Machine exists (Phase 2E.2D.5E). Zero-consumer orchestrators are bound
 * by the same forbidden CLI surface.
 */
export const HEADLESS_FLY_STAGING_PRE_FIRST_DEPLOY_SCRIPTS = Object.freeze([
  "fly-staging-app-create.sh",
  "fly-staging-secrets-install.sh",
  "fly-staging-image-deploy.sh",
  "fly-staging-rollback.sh",
  "fly-staging-teardown.sh",
] as const);

/** Forbidden CLI tokens in pre-first-Machine executable script lines. */
export const HEADLESS_FLY_STAGING_PRE_FIRST_FORBIDDEN_CLI = Object.freeze([
  "fly config show",
  "fly scale count",
  "fly scale show",
] as const);

/**
 * Strip comments and test whether executable lines contain forbidden observers.
 */
export function headlessFlyStagingScriptContainsPreFirstForbiddenCli(
  scriptBody: unknown,
): boolean {
  if (typeof scriptBody !== "string") return true;
  const executable = scriptBody
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  return HEADLESS_FLY_STAGING_PRE_FIRST_FORBIDDEN_CLI.some((token) =>
    executable.includes(token),
  );
}

/**
 * Optional `fly config show` diagnostic after first Machine.
 * Never a zero-consumer success/failure authority.
 */
export type HeadlessFlyStagingConfigShowDiagnostic = {
  readonly status: "ignored";
  readonly reasonId:
    | "absent"
    | "command_failed"
    | "empty"
    | "misleading_or_unexpected"
    | "present_ignored";
  readonly invalidatesZeroConsumerRelease: false;
};

export function classifyHeadlessFlyStagingConfigShowDiagnostic(
  stdout: unknown,
  options: { readonly commandSucceeded?: boolean } = {},
): HeadlessFlyStagingConfigShowDiagnostic {
  const base = {
    status: "ignored" as const,
    invalidatesZeroConsumerRelease: false as const,
  };
  if (options.commandSucceeded === false) {
    return Object.freeze({ ...base, reasonId: "command_failed" });
  }
  if (stdout == null) {
    return Object.freeze({ ...base, reasonId: "absent" });
  }
  if (typeof stdout !== "string") {
    return Object.freeze({ ...base, reasonId: "misleading_or_unexpected" });
  }
  if (stdout.trim().length === 0) {
    return Object.freeze({ ...base, reasonId: "empty" });
  }
  // Misleading region/public-service text must not fail zero-consumer.
  if (
    /primary_region\s*=\s*"(?!iad)[^"]+"/i.test(stdout) ||
    /\[\[services\]\]|\[http_service\]/i.test(stdout) ||
    /error|failed|could not/i.test(stdout)
  ) {
    return Object.freeze({ ...base, reasonId: "misleading_or_unexpected" });
  }
  return Object.freeze({ ...base, reasonId: "present_ignored" });
}

export type HeadlessFlyStagingRegionAuthority =
  | "configured_local_not_remotely_observed"
  | "remotely_observed_from_verify_machine";

export type HeadlessFlyStagingZeroConsumerReleaseInput = {
  readonly localConfigValid: boolean;
  readonly appName: string;
  readonly org: string;
  readonly localPrimaryRegion: string;
  readonly localPublicServicesAbsent: boolean;
  readonly localTopologyExact: boolean;
  readonly exactNineSecretsStaged: boolean;
  readonly imagePushProven: boolean;
  readonly imageDigestSha256: string | null;
  readonly machineListSucceeded: boolean;
  readonly machineCount: number;
  readonly machineListMalformed?: boolean;
  /** Optional; must never decide the outcome. */
  readonly configShowStdout?: string | null;
  readonly configShowCommandSucceeded?: boolean;
  readonly regionAuthority: HeadlessFlyStagingRegionAuthority;
  readonly consumersStarted?: boolean;
};

export type HeadlessFlyStagingZeroConsumerReleaseClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_exact_zero_consumer"
    | "local_config_invalid"
    | "wrong_app_or_org"
    | "wrong_local_region"
    | "local_public_service"
    | "local_topology_mismatch"
    | "secrets_incomplete"
    | "image_push_not_proven"
    | "machine_list_provider_error"
    | "malformed_machine_list"
    | "unexpected_machine"
    | "remotely_observed_region_claim"
    | "consumer_activity"
    | "hostile_input";
  readonly regionAuthority: HeadlessFlyStagingRegionAuthority | null;
  readonly configShowDiagnostic: HeadlessFlyStagingConfigShowDiagnostic;
};

/**
 * Exact zero-consumer release authority (2E.2D.5E).
 * Region is configured+locally validated only — never remotely observed yet.
 */
export function classifyHeadlessFlyStagingZeroConsumerRelease(
  input: unknown,
): HeadlessFlyStagingZeroConsumerReleaseClassification {
  const diagnosticFor = (
    raw: HeadlessFlyStagingZeroConsumerReleaseInput | null,
  ): HeadlessFlyStagingConfigShowDiagnostic =>
    classifyHeadlessFlyStagingConfigShowDiagnostic(raw?.configShowStdout, {
      commandSucceeded: raw?.configShowCommandSucceeded,
    });

  try {
    if (input == null || typeof input !== "object") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        regionAuthority: null,
        configShowDiagnostic: classifyHeadlessFlyStagingConfigShowDiagnostic(
          null,
        ),
      });
    }
    const raw = input as HeadlessFlyStagingZeroConsumerReleaseInput;
    const configShowDiagnostic = diagnosticFor(raw);

    if (raw.regionAuthority === "remotely_observed_from_verify_machine") {
      return Object.freeze({
        status: "invalid",
        reasonId: "remotely_observed_region_claim",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.regionAuthority !== "configured_local_not_remotely_observed") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        regionAuthority: null,
        configShowDiagnostic,
      });
    }
    if (raw.localConfigValid !== true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "local_config_invalid",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (
      typeof raw.appName !== "string" ||
      !/^shortforge-hw-staging-[a-z0-9]{4,24}$/.test(raw.appName) ||
      raw.org !== "personal"
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "wrong_app_or_org",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.localPrimaryRegion !== "iad") {
      return Object.freeze({
        status: "invalid",
        reasonId: "wrong_local_region",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.localPublicServicesAbsent !== true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "local_public_service",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.localTopologyExact !== true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "local_topology_mismatch",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.exactNineSecretsStaged !== true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "secrets_incomplete",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (
      raw.imagePushProven !== true ||
      typeof raw.imageDigestSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(raw.imageDigestSha256)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "image_push_not_proven",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.machineListMalformed === true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_machine_list",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.machineListSucceeded !== true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "machine_list_provider_error",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (
      typeof raw.machineCount !== "number" ||
      !Number.isSafeInteger(raw.machineCount) ||
      raw.machineCount < 0
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "malformed_machine_list",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.machineCount !== 0) {
      return Object.freeze({
        status: "invalid",
        reasonId: "unexpected_machine",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    if (raw.consumersStarted === true) {
      return Object.freeze({
        status: "invalid",
        reasonId: "consumer_activity",
        regionAuthority: raw.regionAuthority,
        configShowDiagnostic,
      });
    }
    // configShowDiagnostic is recorded but never consulted for status.
    return Object.freeze({
      status: "ok",
      reasonId: "ok_exact_zero_consumer",
      regionAuthority: "configured_local_not_remotely_observed",
      configShowDiagnostic,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      regionAuthority: null,
      configShowDiagnostic: classifyHeadlessFlyStagingConfigShowDiagnostic(null),
    });
  }
}
