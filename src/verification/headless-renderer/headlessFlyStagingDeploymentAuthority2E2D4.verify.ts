/**
 * Sprint 11E Phase 2E.2D.4 — Fly staging deployment authority (local only).
 * Run: npm run test:headless-fly-staging-deployment-authority-2e2d4
 *
 * No Fly / Neon / R2 / Upstash provider contact.
 */

import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { HEADLESS_PHASE3_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/renderer-build-id";
import {
  HEADLESS_FLY_PRODUCTION_APP_NAMES,
  HEADLESS_FLY_STAGING_BRIDGE_CLEANUP_CONTRACT,
  HEADLESS_FLY_STAGING_BRIDGE_MODE,
  HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT,
  HEADLESS_FLY_STAGING_DEPLOYMENT_ORDER,
  HEADLESS_FLY_STAGING_GATE_IDS,
  HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV,
  HEADLESS_FLY_STAGING_PRE_FIRST_DEPLOY_SCRIPTS,
  HEADLESS_FLY_STAGING_PRE_FIRST_FORBIDDEN_CLI,
  HEADLESS_FLY_STAGING_PUBLIC_ENV,
  HEADLESS_FLY_STAGING_SECRET_NAMES,
  HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH,
  HEADLESS_FLY_STAGING_TOPOLOGY,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_CONTRACT,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_MODEL,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_TEMPLATE_RELATIVE_PATH,
  HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM,
  auditHeadlessFlyStagingTemplate,
  auditHeadlessFlyStagingVerifyFirstTemplate,
  buildHeadlessFlyStagingAppName,
  buildHeadlessFlyStagingEvidenceDocument,
  classifyHeadlessFlyStagingAppName,
  classifyHeadlessFlyStagingBridgeBody,
  classifyHeadlessFlyStagingBridgeRecord,
  classifyHeadlessFlyStagingConfigShowDiagnostic,
  classifyHeadlessFlyStagingEnvLedger,
  classifyHeadlessFlyStagingEnvName,
  classifyHeadlessFlyStagingGateAuthorization,
  classifyHeadlessFlyStagingImagePushLog,
  classifyHeadlessFlyStagingProcessInventory,
  classifyHeadlessFlyStagingQuietMachineList,
  classifyHeadlessFlyStagingScaleState,
  classifyHeadlessFlyStagingZeroConsumerRelease,
  classifyHeadlessFlyStagingRoot,
  classifyHeadlessFlyStagingOperatorPreflight,
  classifyHeadlessFlyStagingEnvNameValue,
  deriveHeadlessFlyStagingRootFromCommonDir,
  fingerprintHeadlessFlyStagingConfiguration,
  HEADLESS_FLY_STAGING_ORCHESTRATOR_ROOT_CONTRACT,
  HEADLESS_FLY_STAGING_PUBLIC_ENVIRONMENT_CONTRACT,
  HEADLESS_FLY_STAGING_ROOT_MARKER_PATHS,
  HEADLESS_FLY_STAGING_TRUSTED_ENV_NAME,
  mergeHeadlessFlyStagingOperatorPreflightEnvironment,
  buildHeadlessFlyStagingPublicEnvironment,
  isHeadlessFlyStagingPublicEnvironmentInitialized,
  headlessFlyStagingGateEnvName,
  headlessFlyStagingScriptContainsPreFirstForbiddenCli,
  materializeHeadlessFlyStagingToml,
  materializeHeadlessFlyStagingVerifyFirstToml,
  parseHeadlessFlyStagingMachineListJson,
  HEADLESS_FLY_STAGING_SECRET_ACTIVATION_CONTRACT,
  parseHeadlessFlyStagingSecretsListJson,
  classifyHeadlessFlyStagingPreFirstMachineSecretSurface,
  classifyHeadlessFlyStagingVerifyFirstSecretActivation,
  classifyHeadlessFlyStagingVerifyFirstRuntimeReadiness,
  classifyHeadlessFlyStagingRollbackDestroy,
  parseHeadlessFlyStagingVerifyMachineFromListJson,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_ORCHESTRATOR_CONTRACT,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_ENTRYPOINT_RELATIVE_PATH,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_FORBIDDEN_WRAPPER_RE,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_REQUIRED_FUNCTIONS,
  classifyHeadlessFlyStagingVerifyFirstInvokedPath,
  classifyHeadlessFlyStagingVerifyFirstDryRun,
  HEADLESS_FLY_STAGING_SECRETS_SYNC_CONTRACT,
  HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT,
  HEADLESS_FLY_STAGING_FORBIDDEN_BRIDGE_IMPORT_PATTERNS,
  HEADLESS_FLY_STAGING_ORCHESTRATOR_EVIDENCE_CONTRACT,
  assertHeadlessFlyStagingSecretsImportRoundTrip,
  buildHeadlessFlyStagingSecretsImportStream,
  parseHeadlessFlyStagingSecretsImportStream,
  rejectShellSerializedSecretValue,
  validateHeadlessFlyStagingDecodedSecretsRecord,
  buildHeadlessFlyStagingOrchestratorEvidenceDocument,
} from "@/features/headless-renderer/worker/hosted/fly-staging";

const ROOT = path.resolve(__dirname, "../../..");
const TEMPLATE = path.join(ROOT, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH);
const VERIFY_FIRST_TEMPLATE = path.join(
  ROOT,
  HEADLESS_FLY_STAGING_VERIFY_FIRST_TEMPLATE_RELATIVE_PATH,
);
const SCRIPTS = path.join(ROOT, "scripts/fly-staging");
const COMMON = path.join(SCRIPTS, "fly-staging-common.sh");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function validBridgeRecord(): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const key of HEADLESS_FLY_STAGING_SECRET_NAMES) {
    rec[key] = `fixture-value-for-${key}-not-a-real-secret`;
  }
  // Make URL-shaped fixtures pass emptiness only — classifier does not validate URL form.
  rec.DATABASE_URL = "postgresql://user:pass@ep-staging.example/neondb";
  rec.UPSTASH_REDIS_TCP_URL = "rediss://default:pass@example.upstash.io:6379";
  rec.R2_ENDPOINT = "https://accountid.r2.cloudflarestorage.com";
  rec.R2_BUCKET_ASSETS = "footie-assets-staging";
  rec.R2_BUCKET_ARTIFACTS = "footie-artifacts-staging";
  rec.HEADLESS_ALLOWED_ORIGINS = "https://staging.example.com";
  return rec;
}

function runScript(
  script: string,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("sh", [path.join(SCRIPTS, script)], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function sourceFlyStagingCommon(
  command: string,
  env: Record<string, string> = {},
  cwd: string = ROOT,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    "sh",
    ["-c", `. "${COMMON}" && ${command}`],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        FLY_STAGING_COMMON_DIR: SCRIPTS,
        ...env,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function writeBridgeFixture(bridgePath: string): void {
  mkdirSync(path.dirname(bridgePath), { recursive: true });
  const body = Object.entries(validBridgeRecord())
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(bridgePath, `${body}\n`, { mode: 0o600 });
}

function runVerifyFirstOrchestrator(
  args: string[],
  env: Record<string, string>,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    "sh",
    [path.join(SCRIPTS, "fly-staging-verify-first.sh"), ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        FLY_STAGING_COMMON_DIR: SCRIPTS,
        HEADLESS_FLY_STAGING_ORG: "personal",
        HEADLESS_FLY_STAGING_PRIMARY_REGION: "iad",
        ...env,
      },
    },
  );
  return {
    status: result.status,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    stderr: result.stderr ?? "",
  };
}

function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.4 — Fly staging deployment authority\n",
  );

  assert.ok(existsSync(TEMPLATE), "fly.staging.template.toml missing");
  const templateToml = readFileSync(TEMPLATE, "utf8");

  test("topology authority: region/resources/concurrency/kill/no public service", () => {
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.primaryRegion, "iad");
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.org, "personal");
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.imageClass, "deployable_worker");
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.concurrency, 1);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.cpuKind, "shared");
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.cpus, 1);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.memoryMb, 2048);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.renderVm.cpuKind, "performance");
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.renderVm.cpus, 4);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.renderVm.memoryMb, 8192);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.killSignal, "SIGTERM");
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.killTimeoutSeconds, 30);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.gracefulShutdownMs, 25_000);
    assert.equal(HEADLESS_FLY_STAGING_TOPOLOGY.publicServicesAllowed, false);
    assert.equal(
      HEADLESS_FLY_STAGING_TOPOLOGY.rendererBuildId,
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM,
      "build_only_release_then_exact_zero_machine_authority",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_MODEL,
      "verify_only_first_deploy_from_immutable_image",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_CONTRACT.haFalse,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_CONTRACT.renderAbsent,
      true,
    );
  });

  test("template audit PASS + public env omits worker mode", () => {
    const audit = auditHeadlessFlyStagingTemplate(templateToml);
    assert.equal(audit.status, "ok", audit.reasonId);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        HEADLESS_FLY_STAGING_PUBLIC_ENV,
        "HEADLESS_WORKER_MODE",
      ),
      false,
    );
    assert.equal(HEADLESS_FLY_STAGING_PUBLIC_ENV.HEADLESS_ENV_NAME, "staging");
    assert.equal(
      HEADLESS_FLY_STAGING_PUBLIC_ENV.HEADLESS_HOSTED_IMAGE_CLASS,
      "deployable_worker",
    );
  });

  test("malformed / production app names rejected", () => {
    assert.equal(classifyHeadlessFlyStagingAppName("").reasonId, "empty");
    assert.equal(
      classifyHeadlessFlyStagingAppName("ShortForge-HW-Staging-abcd").reasonId,
      "uppercase_or_underscore",
    );
    assert.equal(
      classifyHeadlessFlyStagingAppName("shortforge_hw_staging_abcd").reasonId,
      "uppercase_or_underscore",
    );
    assert.equal(
      classifyHeadlessFlyStagingAppName("shortforge-hw-staging-ab").reasonId,
      "invalid_suffix",
    );
    assert.equal(
      classifyHeadlessFlyStagingAppName("other-staging-abcd").reasonId,
      "missing_staging_prefix",
    );
    for (const prod of HEADLESS_FLY_PRODUCTION_APP_NAMES) {
      assert.equal(
        classifyHeadlessFlyStagingAppName(prod).status,
        "production_name_rejected",
      );
    }
    assert.equal(
      classifyHeadlessFlyStagingAppName("shortforge-hw-staging-prod1").status,
      "production_name_rejected",
    );
    assert.equal(
      buildHeadlessFlyStagingAppName("a9f3c2e1").status,
      "ok",
    );
  });

  test("materialize staging toml with operator suffix", () => {
    const built = buildHeadlessFlyStagingAppName("a9f3c2e1");
    assert.equal(built.status, "ok");
    const mat = materializeHeadlessFlyStagingToml(templateToml, built.appName);
    assert.equal(mat.status, "ok", String(mat.reasonId));
    assert.ok(mat.toml);
    assert.equal(mat.toml!.includes("REPLACE_WITH_STAGING_APP_NAME"), false);
    assert.match(mat.toml!, /app\s*=\s*"shortforge-hw-staging-a9f3c2e1"/);
    assert.match(mat.toml!, /primary_region\s*=\s*"iad"/);
  });

  test("secret ledger: exact membership; REST/Clerk forbidden", () => {
    const ok = classifyHeadlessFlyStagingEnvLedger({
      secretNames: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
      envNames: Object.keys(HEADLESS_FLY_STAGING_PUBLIC_ENV),
      publicEnv: { ...HEADLESS_FLY_STAGING_PUBLIC_ENV },
    });
    assert.equal(ok.status, "ok", ok.reasonId);

    assert.equal(
      classifyHeadlessFlyStagingEnvLedger({
        secretNames: HEADLESS_FLY_STAGING_SECRET_NAMES.filter(
          (n) => n !== "DATABASE_URL",
        ),
      }).reasonId,
      "missing_secret_name",
    );
    assert.equal(
      classifyHeadlessFlyStagingEnvLedger({
        secretNames: [...HEADLESS_FLY_STAGING_SECRET_NAMES, "EXTRA"],
      }).reasonId,
      "unknown_secret_name",
    );
    assert.equal(
      classifyHeadlessFlyStagingEnvLedger({
        secretNames: [...HEADLESS_FLY_STAGING_SECRET_NAMES, "DATABASE_URL"],
      }).reasonId,
      "duplicate_secret_name",
    );
    assert.equal(
      classifyHeadlessFlyStagingEnvLedger({
        secretNames: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
        envNames: ["UPSTASH_REDIS_REST_URL"],
      }).reasonId,
      "rest_credentials_present",
    );
    assert.equal(
      classifyHeadlessFlyStagingEnvLedger({
        secretNames: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
        publicEnv: {
          ...HEADLESS_FLY_STAGING_PUBLIC_ENV,
          HEADLESS_WORKER_MODE: "render",
        },
      }).reasonId,
      "worker_mode_in_env",
    );
    assert.equal(classifyHeadlessFlyStagingEnvName("CLERK_SECRET_KEY"), "forbidden");
    assert.equal(
      classifyHeadlessFlyStagingEnvName("HEADLESS_WORKER_MODE"),
      "process_command_only",
    );
  });

  test("bridge: empty/extra/unknown/duplicate/.env.local rejected; cleanup contract", () => {
    const ok = classifyHeadlessFlyStagingBridgeRecord(validBridgeRecord());
    assert.equal(ok.status, "ok", ok.reasonId);
    assert.ok(ok.keySetFingerprintSha256);

    assert.equal(
      classifyHeadlessFlyStagingBridgeBody("").reasonId,
      "empty_bridge",
    );
    assert.equal(
      classifyHeadlessFlyStagingBridgeRecord({
        ...validBridgeRecord(),
        DATABASE_URL: "",
      }).reasonId,
      "empty_value",
    );
    assert.equal(
      classifyHeadlessFlyStagingBridgeBody(
        Object.entries(validBridgeRecord())
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") + "\nUNKNOWN=1",
      ).reasonId,
      "unknown_key",
    );
    const dupBody =
      Object.entries(validBridgeRecord())
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\nDATABASE_URL=postgresql://dup";
    assert.equal(
      classifyHeadlessFlyStagingBridgeBody(dupBody).reasonId,
      "duplicate_key",
    );
    assert.equal(
      classifyHeadlessFlyStagingBridgeBody(
        "source .env.local\n" +
          Object.entries(validBridgeRecord())
            .map(([k, v]) => `${k}=${v}`)
            .join("\n"),
      ).reasonId,
      "env_local_fallback_forbidden",
    );
    assert.equal(
      classifyHeadlessFlyStagingBridgeBody(
        Object.entries(validBridgeRecord())
          .map(([k, v]) => `${k}=${v}`)
          .join("\n"),
        { fileMode: 0o644 },
      ).reasonId,
      "wrong_mode",
    );
    assert.equal(
      classifyHeadlessFlyStagingBridgeBody(
        `HEADLESS_ENV_NAME=staging\n${Object.entries(validBridgeRecord())
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")}`,
      ).reasonId,
      "public_env_in_bridge",
    );
    assert.equal(
      classifyHeadlessFlyStagingBridgeBody(
        `HEADLESS_WORKER_MODE=verify\n${Object.entries(validBridgeRecord())
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")}`,
      ).reasonId,
      "public_env_in_bridge",
    );
    assert.equal(HEADLESS_FLY_STAGING_BRIDGE_MODE, 0o600);
    assert.equal(
      HEADLESS_FLY_STAGING_BRIDGE_CLEANUP_CONTRACT.forbidEnvLocalFallback,
      true,
    );
    assert.deepEqual(
      [...HEADLESS_FLY_STAGING_BRIDGE_CLEANUP_CONTRACT.unsetSecretNames],
      [...HEADLESS_FLY_STAGING_SECRET_NAMES],
    );
    assert.equal(
      HEADLESS_FLY_STAGING_BRIDGE_CLEANUP_CONTRACT.unsetProcessBoundaryEnvNames[0],
      "HEADLESS_WORKER_MODE",
    );
    assert.ok(
      HEADLESS_FLY_STAGING_BRIDGE_CLEANUP_CONTRACT.unsetPublicEnvNames.includes(
        "HEADLESS_ENV_NAME",
      ),
    );
  });

  test("wrong region/resources / public service / process-mode mismatch", () => {
    assert.equal(
      auditHeadlessFlyStagingTemplate(
        templateToml.replace('primary_region = "iad"', 'primary_region = "lhr"'),
      ).reasonId,
      "wrong_region",
    );
    assert.equal(
      auditHeadlessFlyStagingTemplate(
        templateToml.replace("memory_mb = 8192", "memory_mb = 2048"),
      ).reasonId,
      "wrong_resources",
    );
    assert.equal(
      auditHeadlessFlyStagingTemplate(
        templateToml + '\n[[services]]\n  internal_port = 8080\n',
      ).reasonId,
      "public_service_exposure",
    );
    assert.equal(
      auditHeadlessFlyStagingTemplate(
        templateToml + '\n  HEADLESS_WORKER_MODE = "render"\n',
      ).reasonId,
      "worker_mode_in_env",
    );
  });

  test("scale authority: accidental consumer start + render-before-verify", () => {
    assert.equal(
      classifyHeadlessFlyStagingScaleState(
        { verifyCount: 0, renderCount: 0 },
        "post_secrets_or_deploy",
      ).reasonId,
      "ok_zero_consumer",
    );
    assert.equal(
      classifyHeadlessFlyStagingScaleState(
        { verifyCount: 1, renderCount: 0 },
        "post_secrets_or_deploy",
      ).reasonId,
      "accidental_consumer_start",
    );
    assert.equal(
      classifyHeadlessFlyStagingScaleState(
        { verifyCount: 0, renderCount: 1 },
        "post_verify_scale_up",
      ).reasonId,
      "render_before_verify",
    );
    assert.equal(
      classifyHeadlessFlyStagingScaleState(
        { verifyCount: 1, renderCount: 0 },
        "post_verify_scale_up",
      ).reasonId,
      "ok_verify_only",
    );
  });

  test("gate authorization defaults blocked; deployment order + rollback/teardown", () => {
    for (const gate of HEADLESS_FLY_STAGING_GATE_IDS) {
      const blocked = classifyHeadlessFlyStagingGateAuthorization(gate, {});
      assert.equal(blocked.authorized, false);
      assert.equal(blocked.blockProviderContact, true);
      assert.equal(blocked.reasonId, "master_execution_blocked");
      const gateOnly = classifyHeadlessFlyStagingGateAuthorization(gate, {
        [HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV]: "1",
      });
      assert.equal(gateOnly.reasonId, "gate_blocked");
      const ok = classifyHeadlessFlyStagingGateAuthorization(gate, {
        [HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV]: "1",
        [headlessFlyStagingGateEnvName(gate)]: "1",
      });
      assert.equal(ok.authorized, true);
    }
    assert.deepEqual(
      [...HEADLESS_FLY_STAGING_DEPLOYMENT_ORDER],
      [
        "local_gates",
        "artifact_hashes",
        "app_create",
        "secrets_install",
        "build_only_image_push_zero_machines",
        "image_runtime_inspection",
        "schema_preflight",
        "verify_first_activation",
        "verifier_evidence",
        "render_activation",
      ],
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.secretsMustNotStartConsumers,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.imageDeployMustLeaveExactZeroMachines,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.imageDeployMustLeaveScaleZero,
      false,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.preFirstDeployForbidsFlyScaleCountShow,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.preFirstDeployForbidsFlyConfigShow,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.zeroConsumerRegionAuthority,
      "configured_local_not_remotely_observed",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.remoteRegionObservationPhase,
      "verify_first_machine_status",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.renderScaleRequiresPriorVerifyScale,
      true,
    );
  });

  test("bounded evidence: fingerprint + secret names only", () => {
    const mat = materializeHeadlessFlyStagingToml(
      templateToml,
      "shortforge-hw-staging-a9f3c2e1",
    );
    assert.equal(mat.status, "ok");
    const configFp = fingerprintHeadlessFlyStagingConfiguration(mat.toml!);
    const doc = buildHeadlessFlyStagingEvidenceDocument({
      appName: mat.appName!,
      imageDigestSha256: "a".repeat(64),
      secretNamesPresent: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
      scale: { verifyCount: 0, renderCount: 0 },
      schemaPreflightStatus: "not_run",
      cleanupState: "intact",
      rollbackState: "not_run",
      configurationFingerprintSha256: configFp,
      regionAuthority: "configured_local_not_remotely_observed",
    });
    assert.equal(doc.status, "ok", doc.reasonId);
    assert.equal(doc.secretValuesIncluded, false);
    assert.equal(
      doc.regionAuthority,
      "configured_local_not_remotely_observed",
    );
    assert.ok(doc.evidenceFingerprintSha256);
    assert.equal(
      buildHeadlessFlyStagingEvidenceDocument({
        appName: "shortforge-hw-staging-a9f3c2e1",
        imageDigestSha256: "not-a-digest",
        secretNamesPresent: [],
        scale: { verifyCount: 0, renderCount: 0 },
        schemaPreflightStatus: "not_run",
        cleanupState: "intact",
        rollbackState: "not_run",
        configurationFingerprintSha256: configFp,
        regionAuthority: "configured_local_not_remotely_observed",
      }).reasonId,
      "invalid_digest",
    );
    assert.equal(
      buildHeadlessFlyStagingEvidenceDocument({
        appName: "shortforge-hw-staging-a9f3c2e1",
        imageDigestSha256: "a".repeat(64),
        secretNamesPresent: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
        scale: { verifyCount: 0, renderCount: 0 },
        schemaPreflightStatus: "not_run",
        cleanupState: "intact",
        rollbackState: "not_run",
        configurationFingerprintSha256: configFp,
        regionAuthority: "remotely_observed_from_verify_machine",
      }).reasonId,
      "remotely_observed_region_claim",
    );
  });

  test("operator scripts refuse without gates (no Fly contact)", () => {
    const scripts = [
      "fly-staging-app-create.sh",
      "fly-staging-secrets-install.sh",
      "fly-staging-image-deploy.sh",
      "fly-staging-verify-scale-up.sh",
      "fly-staging-render-scale-up.sh",
      "fly-staging-rollback.sh",
      "fly-staging-teardown.sh",
    ];
    for (const script of scripts) {
      const scriptPath = path.join(SCRIPTS, script);
      assert.ok(existsSync(scriptPath), script);
      chmodSync(scriptPath, 0o755);
      const run = runScript(script, {
        HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-a9f3c2e1",
      });
      assert.notEqual(run.status, 0, script);
      assert.match(
        `${run.stdout}${run.stderr}`,
        /master_execution_blocked|gate_blocked/,
      );
      assert.equal(
        /fly apps create|fly secrets|fly deploy|fly scale|fly machine/i.test(
          `${run.stdout}${run.stderr}`,
        ),
        false,
        `${script} must not reach Fly CLI when blocked`,
      );
    }
    assert.ok(existsSync(COMMON));
    assert.match(
      readFileSync(COMMON, "utf8"),
      /Never source \.env\.local|forbid_env_local|env_local_fallback_forbidden/i,
    );
    // Executable bit present on scripts after chmod.
    assert.ok((statSync(path.join(SCRIPTS, scripts[0]!)).mode & 0o111) !== 0);
    // Image deploy must materialize fly.toml at repo root (not .tmp/) so
    // dockerfile paths resolve against the build context.
    const imageDeploy = readFileSync(
      path.join(SCRIPTS, "fly-staging-image-deploy.sh"),
      "utf8",
    );
    assert.match(
      imageDeploy,
      /MATERIALIZED=.*fly\.staging\.materialized\.toml/,
    );
    assert.equal(
      imageDeploy.includes(".tmp/fly.staging.materialized.toml"),
      false,
    );
    assert.match(
      imageDeploy,
      /build_only_release_then_exact_zero_machine_authority/,
    );
    assert.match(imageDeploy, /fly_cli_post_push_zero_machine_noise=tolerated/);
    assert.match(imageDeploy, /fly_staging_assert_exact_zero_machines/);
    assert.equal(
      headlessFlyStagingScriptContainsPreFirstForbiddenCli(imageDeploy),
      false,
    );
  });

  test("secret-name matcher: staged star, unmarked, headers; reject bad sets", () => {
    const required = [...HEADLESS_FLY_STAGING_SECRET_NAMES];
    const stagedBody = [
      " NAME                       │ DIGEST           │ STATUS ",
      ...required.map(
        (name) =>
          ` * ${name.padEnd(23)} │ ${"a".repeat(16)} │ Staged `,
      ),
      "",
      "There are 9 secrets not deployed. Deploy with `fly secrets deploy` to make them available.",
    ].join("\n");
    const unmarkedBody = [
      "NAME DIGEST STATUS",
      ...required.map((name) => `${name} deadbeef Staged`),
    ].join("\n");

    const runMatcher = (body: string) => {
      const tmp = path.join(
        ROOT,
        ".tmp",
        `secret-list-fixture-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
      );
      mkdirSync(path.dirname(tmp), { recursive: true });
      writeFileSync(tmp, body, "utf8");
      const result = sourceFlyStagingCommon(
        `fly_staging_assert_secret_names_present "${tmp}" && echo matcher=PASS`,
      );
      try {
        unlinkSync(tmp);
      } catch {
        // ignore
      }
      return result;
    };

    const staged = runMatcher(stagedBody);
    assert.equal(staged.status, 0, staged.stderr || staged.stdout);
    assert.match(`${staged.stdout}${staged.stderr}`, /matcher=PASS/);

    const unmarked = runMatcher(unmarkedBody);
    assert.equal(unmarked.status, 0, unmarked.stderr || unmarked.stdout);

    const missing = runMatcher(
      stagedBody.replace(` * ${required[0]}`, " * NOT_A_SECRET"),
    );
    assert.notEqual(missing.status, 0);
    assert.match(
      `${missing.stdout}${missing.stderr}`,
      /secret_name_missing|unknown_secret_name|secret_name_count_mismatch/,
    );

    const forbidden = runMatcher(
      unmarkedBody + "\nUPSTASH_REDIS_REST_URL deadbeef Staged\n",
    );
    assert.notEqual(forbidden.status, 0);
    assert.match(
      `${forbidden.stdout}${forbidden.stderr}`,
      /forbidden_secret_name_present|secret_name_count_mismatch/,
    );

    const dup = runMatcher(
      unmarkedBody + `\n${required[0]} deadbeef Staged\n`,
    );
    assert.notEqual(dup.status, 0);
    assert.match(
      `${dup.stdout}${dup.stderr}`,
      /secret_name_duplicate|secret_name_count_mismatch/,
    );
  });

  test("2E.2D.5C: push log + zero Machines; noise only with proof", () => {
    const digest = "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e";
    const successLog = [
      `#16 exporting manifest sha256:${digest} done`,
      "--> Building image done",
      "image: registry.fly.io/shortforge-hw-staging-example:deployment-001",
      "image size: 396 MB",
    ].join("\n");
    const success = classifyHeadlessFlyStagingImagePushLog(successLog);
    assert.equal(success.status, "ok");
    assert.equal(success.reasonId, "ok_push_proven");
    assert.equal(success.manifestDigestSha256, digest);

    const noiseLog =
      successLog +
      "\nError: failed to grab app config from existing machines, error: could not create a fly.toml from any machines :-(\nNo machines configured for this app\n";
    const noise = classifyHeadlessFlyStagingImagePushLog(noiseLog);
    assert.equal(noise.status, "ok");
    assert.equal(
      noise.reasonId,
      "ok_push_proven_zero_machine_noise_tolerated",
    );

    const noiseOnly = classifyHeadlessFlyStagingImagePushLog(
      "Error: could not create a fly.toml from any machines :-(\nNo machines configured for this app\n",
    );
    assert.equal(noiseOnly.status, "invalid");
    assert.equal(noiseOnly.reasonId, "noise_without_push_proof");

    const zeroList = classifyHeadlessFlyStagingQuietMachineList("", {
      listCommandSucceeded: true,
    });
    assert.equal(zeroList.status, "ok");
    assert.equal(zeroList.reasonId, "ok_zero");

    const tmp = path.join(
      ROOT,
      ".tmp",
      `push-log-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    mkdirSync(path.dirname(tmp), { recursive: true });
    writeFileSync(tmp, noiseLog, "utf8");
    const shellClass = sourceFlyStagingCommon(
      `fly_staging_classify_image_push_log_file "${tmp}"`,
    );
    unlinkSync(tmp);
    assert.equal(shellClass.status, 0, shellClass.stderr || shellClass.stdout);
    assert.match(shellClass.stdout, /push=PASS/);
    assert.match(shellClass.stdout, /noise=tolerated/);
    assert.match(shellClass.stdout, new RegExp(digest));
  });

  test("2E.2D.5C: machine-list provider failure / malformed / unexpected", () => {
    assert.equal(
      classifyHeadlessFlyStagingQuietMachineList("", {
        listCommandSucceeded: false,
      }).reasonId,
      "provider_error",
    );
    assert.equal(
      classifyHeadlessFlyStagingQuietMachineList("Error: failed ensuring", {
        listCommandSucceeded: true,
        providerErrorMarker: true,
      }).reasonId,
      "provider_error",
    );
    assert.equal(
      classifyHeadlessFlyStagingQuietMachineList("NAME STATE\nabc12345", {
        listCommandSucceeded: true,
      }).reasonId,
      "malformed_machine_list",
    );
    assert.equal(
      classifyHeadlessFlyStagingQuietMachineList("not a machine id!!!", {
        listCommandSucceeded: true,
      }).reasonId,
      "malformed_machine_list",
    );
    const unexpected = classifyHeadlessFlyStagingQuietMachineList(
      "e784279b471d89\n",
      { listCommandSucceeded: true },
    );
    assert.equal(unexpected.status, "ok");
    assert.equal(unexpected.reasonId, "ok_nonempty");
    assert.equal(
      classifyHeadlessFlyStagingProcessInventory(
        {
          verifyCount: 1,
          renderCount: 0,
          otherCount: 0,
          machineIds: ["e784279b471d89"],
        },
        "post_secrets_or_image_deploy",
      ).reasonId,
      "unexpected_machine",
    );

    const emptyFile = path.join(
      ROOT,
      ".tmp",
      `mlist-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    mkdirSync(path.dirname(emptyFile), { recursive: true });
    writeFileSync(emptyFile, "", "utf8");
    const zeroShell = sourceFlyStagingCommon(
      `fly_staging_classify_quiet_machine_list_file "${emptyFile}" 1`,
    );
    assert.equal(zeroShell.status, 0, zeroShell.stderr || zeroShell.stdout);
    assert.match(zeroShell.stdout, /machine_count=0/);

    writeFileSync(emptyFile, "Error: could not list machines\n", "utf8");
    const badShell = sourceFlyStagingCommon(
      `fly_staging_classify_quiet_machine_list_file "${emptyFile}" 1`,
    );
    assert.notEqual(badShell.status, 0);
    assert.match(
      `${badShell.stdout}${badShell.stderr}`,
      /malformed_machine_list/,
    );

    const failShell = sourceFlyStagingCommon(
      `fly_staging_classify_quiet_machine_list_file "${emptyFile}" 0`,
    );
    unlinkSync(emptyFile);
    assert.notEqual(failShell.status, 0);
    assert.match(
      `${failShell.stdout}${failShell.stderr}`,
      /machine_list_provider_error/,
    );
  });

  test("2E.2D.5C: verify-first template + inventory; render blocked at boundary", () => {
    assert.ok(existsSync(VERIFY_FIRST_TEMPLATE));
    const vfToml = readFileSync(VERIFY_FIRST_TEMPLATE, "utf8");
    const audit = auditHeadlessFlyStagingVerifyFirstTemplate(vfToml);
    assert.equal(audit.status, "ok", audit.reasonId);
    const mat = materializeHeadlessFlyStagingVerifyFirstToml(
      vfToml,
      "shortforge-hw-staging-a9f3c2e1",
    );
    assert.equal(mat.status, "ok", String(mat.reasonId));
    assert.match(mat.toml!, /verify\s*=\s*"verify"/);
    assert.equal(/render\s*=\s*"render"/.test(mat.toml!), false);

    assert.equal(
      auditHeadlessFlyStagingVerifyFirstTemplate(
        vfToml + '\n  render = "render"\n',
      ).reasonId,
      "render_process_present",
    );

    const verifyOnlyJson = JSON.stringify([
      {
        id: "e784279b471d89",
        config: { metadata: { fly_process_group: "verify" } },
      },
    ]);
    const parsed = parseHeadlessFlyStagingMachineListJson(verifyOnlyJson);
    assert.equal(parsed.status, "ok");
    assert.equal(
      classifyHeadlessFlyStagingProcessInventory(
        parsed.inventory,
        "post_verify_first_activation",
      ).reasonId,
      "ok_verify_only",
    );
    assert.equal(
      classifyHeadlessFlyStagingProcessInventory(
        {
          verifyCount: 0,
          renderCount: 1,
          otherCount: 0,
          machineIds: ["r784279b471d89"],
        },
        "post_verify_first_activation",
      ).reasonId,
      "render_without_verify",
    );
    assert.equal(
      classifyHeadlessFlyStagingScaleState(
        { verifyCount: 0, renderCount: 1 },
        "post_verify_scale_up",
      ).reasonId,
      "render_before_verify",
    );

    const verifyScript = readFileSync(
      path.join(SCRIPTS, "fly-staging-verify-scale-up.sh"),
      "utf8",
    );
    assert.match(verifyScript, /verify_only_first_deploy_from_immutable_image/);
    assert.match(verifyScript, /--ha=false/);
    assert.match(verifyScript, /--image/);
    assert.match(verifyScript, /fly\.staging\.verify-first/);
    assert.equal(
      /(?:^|[^#])\s*fly scale (?:count|show)/m.test(verifyScript),
      false,
    );

    const renderScript = readFileSync(
      path.join(SCRIPTS, "fly-staging-render-scale-up.sh"),
      "utf8",
    );
    assert.match(renderScript, /verify_required_before_render/);
    assert.equal(
      /(?:^|[^#])\s*fly scale (?:count|show)/m.test(renderScript),
      false,
    );
  });

  test("2E.2D.5C: pre-first-deploy scripts forbid fly scale; rollback/teardown use machines", () => {
    for (const script of HEADLESS_FLY_STAGING_PRE_FIRST_DEPLOY_SCRIPTS) {
      const body = readFileSync(path.join(SCRIPTS, script), "utf8");
      assert.equal(
        headlessFlyStagingScriptContainsPreFirstForbiddenCli(body),
        false,
        `${script} must not invoke forbidden pre-first observers`,
      );
    }
    assert.deepEqual(
      [...HEADLESS_FLY_STAGING_PRE_FIRST_FORBIDDEN_CLI],
      ["fly config show", "fly scale count", "fly scale show"],
    );
    const rollback = readFileSync(
      path.join(SCRIPTS, "fly-staging-rollback.sh"),
      "utf8",
    );
    assert.match(rollback, /fly_staging_destroy_all_app_machines/);
    assert.match(rollback, /machines_zeroed=PASS/);
    assert.match(rollback, /--build-only/);

    const teardown = readFileSync(
      path.join(SCRIPTS, "fly-staging-teardown.sh"),
      "utf8",
    );
    assert.match(teardown, /fly_staging_destroy_all_app_machines/);
    assert.match(teardown, /shortforge-hw-staging-\*/);
    assert.equal(/fly scale/.test(teardown), false);

    const emptyJson = parseHeadlessFlyStagingMachineListJson("[]");
    assert.equal(emptyJson.status, "ok");
    assert.equal(
      classifyHeadlessFlyStagingProcessInventory(
        emptyJson.inventory,
        "post_secrets_or_image_deploy",
      ).reasonId,
      "ok_zero_machines",
    );
  });

  test("2E.2D.5E: config show cannot fail zero-consumer; local region/services gate", () => {
    const digest = "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e";
    const baseOk = {
      localConfigValid: true,
      appName: "shortforge-hw-staging-4def8fa0",
      org: "personal",
      localPrimaryRegion: "iad",
      localPublicServicesAbsent: true,
      localTopologyExact: true,
      exactNineSecretsStaged: true,
      imagePushProven: true,
      imageDigestSha256: digest,
      machineListSucceeded: true,
      machineCount: 0,
      regionAuthority: "configured_local_not_remotely_observed" as const,
      consumersStarted: false,
    };

    for (const [label, stdout, succeeded] of [
      ["missing", null, undefined],
      ["failed", "Error: could not", false],
      ["empty", "", true],
      [
        "misleading_region",
        'primary_region = "lhr"\n[[services]]\n',
        true,
      ],
    ] as const) {
      const result = classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        configShowStdout: stdout,
        configShowCommandSucceeded: succeeded,
      });
      assert.equal(result.status, "ok", label);
      assert.equal(result.reasonId, "ok_exact_zero_consumer", label);
      assert.equal(result.configShowDiagnostic.invalidatesZeroConsumerRelease, false);
    }

    assert.equal(
      classifyHeadlessFlyStagingConfigShowDiagnostic(null).reasonId,
      "absent",
    );
    assert.equal(
      classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        localPrimaryRegion: "lhr",
      }).reasonId,
      "wrong_local_region",
    );
    assert.equal(
      classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        localPublicServicesAbsent: false,
      }).reasonId,
      "local_public_service",
    );
    assert.equal(
      classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        imagePushProven: false,
        imageDigestSha256: null,
      }).reasonId,
      "image_push_not_proven",
    );
    assert.equal(
      classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        machineListMalformed: true,
      }).reasonId,
      "malformed_machine_list",
    );
    assert.equal(
      classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        machineCount: 1,
      }).reasonId,
      "unexpected_machine",
    );
    assert.equal(
      classifyHeadlessFlyStagingZeroConsumerRelease({
        ...baseOk,
        regionAuthority: "remotely_observed_from_verify_machine",
      }).reasonId,
      "remotely_observed_region_claim",
    );

    // Verify-first remains independently gated.
    assert.equal(
      classifyHeadlessFlyStagingGateAuthorization("verify_scale_up", {
        [HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV]: "1",
      }).reasonId,
      "gate_blocked",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.verifyScaleRequiresSeparateAuthorization,
      true,
    );

    // Wrong local region / public services fail at template audit (before provider).
    assert.equal(
      auditHeadlessFlyStagingTemplate(
        readFileSync(TEMPLATE, "utf8").replace(
          'primary_region = "iad"',
          'primary_region = "lhr"',
        ),
      ).reasonId,
      "wrong_region",
    );
    assert.equal(
      auditHeadlessFlyStagingTemplate(
        readFileSync(TEMPLATE, "utf8") + "\n[[services]]\n  internal_port = 8080\n",
      ).reasonId,
      "public_service_exposure",
    );
  });

  test("2E.2D.6A: orchestrator FOOTIEBITZ_ROOT authority — exported, fallback, hostile", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_ORCHESTRATOR_ROOT_CONTRACT.neverUsesCallerZero,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_ORCHESTRATOR_ROOT_CONTRACT.fallbackUsesCommonScriptLocation,
      true,
    );

    const canonical = classifyHeadlessFlyStagingRoot(ROOT);
    assert.equal(canonical.status, "ok", canonical.reasonId);
    assert.equal(canonical.canonicalRoot, ROOT);

    const fromCommonDir = deriveHeadlessFlyStagingRootFromCommonDir(SCRIPTS);
    assert.equal(fromCommonDir.status, "ok");
    assert.equal(fromCommonDir.canonicalRoot, ROOT);

    for (const marker of HEADLESS_FLY_STAGING_ROOT_MARKER_PATHS) {
      assert.ok(existsSync(path.join(ROOT, marker)), marker);
    }
    assert.equal(
      VERIFY_FIRST_TEMPLATE,
      path.join(ROOT, HEADLESS_FLY_STAGING_VERIFY_FIRST_TEMPLATE_RELATIVE_PATH),
    );

    const commonBody = readFileSync(COMMON, "utf8");
    assert.match(commonBody, /Never derive root from caller \$0/);
    assert.match(commonBody, /FLY_STAGING_COMMON_DIR/);
    assert.equal(/\$0.*\.\.\/\.\./.test(commonBody), false);

    for (const script of [
      "fly-staging-app-create.sh",
      "fly-staging-secrets-install.sh",
      "fly-staging-image-deploy.sh",
      "fly-staging-verify-scale-up.sh",
      "fly-staging-render-scale-up.sh",
      "fly-staging-rollback.sh",
      "fly-staging-teardown.sh",
    ]) {
      const body = readFileSync(path.join(SCRIPTS, script), "utf8");
      assert.match(body, /FLY_STAGING_COMMON_DIR=/);
      assert.match(body, /\$\{FLY_STAGING_COMMON_DIR\}\/fly-staging-common\.sh/);
    }

    mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
    const tmpOrch = path.join(ROOT, ".tmp", "orch-root-authority-fixture.sh");
    writeFileSync(
      tmpOrch,
      `#!/bin/sh
set -eu
export FOOTIEBITZ_ROOT="${ROOT}"
. "${COMMON}"
printf '%s\\n' "root=\${FOOTIEBITZ_ROOT}"
printf '%s\\n' "verify_first=\${FLY_STAGING_VERIFY_FIRST_TEMPLATE}"
`,
      { mode: 0o755 },
    );
    const tmpOrchRun = spawnSync("sh", [tmpOrch], {
      cwd: path.join(ROOT, ".tmp"),
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(tmpOrchRun.status, 0, tmpOrchRun.stderr || tmpOrchRun.stdout);
    assert.match(tmpOrchRun.stdout, new RegExp(`root=${ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(tmpOrchRun.stdout, new RegExp(`verify_first=${VERIFY_FIRST_TEMPLATE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const outsideEnv: Record<string, string> = {
      ...process.env,
      FLY_STAGING_COMMON_DIR: SCRIPTS,
    };
    delete outsideEnv.FOOTIEBITZ_ROOT;
    const outsideRun = spawnSync(
      "sh",
      ["-c", `. "${COMMON}" && printf '%s\\n' "\${FOOTIEBITZ_ROOT}"`],
      { cwd: "/tmp", encoding: "utf8", env: outsideEnv },
    );
    assert.equal(outsideRun.status, 0, outsideRun.stderr || outsideRun.stdout);
    assert.equal(outsideRun.stdout.trim(), ROOT);

    const zeroTrap = spawnSync(
      "sh",
      [
        "-c",
        `export FLY_STAGING_COMMON_SH="${COMMON}"
. "${COMMON}"
printf '%s\\n' "\${FOOTIEBITZ_ROOT}"`,
      ],
      {
        cwd: path.join(ROOT, ".tmp"),
        encoding: "utf8",
        env: process.env,
      },
    );
    assert.equal(zeroTrap.status, 0, zeroTrap.stderr || zeroTrap.stdout);
    assert.equal(zeroTrap.stdout.trim(), ROOT);

    for (const [label, env, pattern] of [
      ["blank", { FOOTIEBITZ_ROOT: "   " }, /footiebitz_root_blank/],
      ["relative", { FOOTIEBITZ_ROOT: "footiebitz" }, /footiebitz_root_relative/],
      [
        "missing",
        { FOOTIEBITZ_ROOT: "/tmp/nonexistent-footiebitz-root-6a" },
        /footiebitz_root_missing/,
      ],
      [
        "wrong_package",
        { FOOTIEBITZ_ROOT: "/tmp" },
        /footiebitz_root_wrong_package/,
      ],
    ] as const) {
      const bad = sourceFlyStagingCommon('echo should_not_run', env);
      assert.notEqual(bad.status, 0, label);
      assert.match(`${bad.stdout}${bad.stderr}`, pattern, label);
      assert.equal(/fly apps create|fly secrets|fly deploy|fly machine/i.test(`${bad.stdout}${bad.stderr}`), false, label);
    }

    const hostileExported = sourceFlyStagingCommon('echo should_not_run', {
      FOOTIEBITZ_ROOT: path.join(ROOT, ".."),
      FLY_STAGING_COMMON_DIR: "",
    });
    assert.notEqual(hostileExported.status, 0);
    assert.match(
      `${hostileExported.stdout}${hostileExported.stderr}`,
      /footiebitz_root_wrong_package|footiebitz_root_missing_marker/,
    );

    const blockedAppCreate = runScript("fly-staging-app-create.sh", {
      FOOTIEBITZ_ROOT: "relative-not-absolute",
      HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-a9f3c2e1",
    });
    assert.notEqual(blockedAppCreate.status, 0);
    assert.match(
      `${blockedAppCreate.stdout}${blockedAppCreate.stderr}`,
      /footiebitz_root_relative/,
    );
    assert.equal(
      /fly apps create|fly secrets|fly deploy|fly machine/i.test(
        `${blockedAppCreate.stdout}${blockedAppCreate.stderr}`,
      ),
      false,
    );

    assert.equal(classifyHeadlessFlyStagingRoot("").reasonId, "blank");
    assert.equal(classifyHeadlessFlyStagingRoot("footiebitz").reasonId, "relative");
    assert.equal(
      classifyHeadlessFlyStagingRoot("/tmp/nonexistent-footiebitz-root-6a").reasonId,
      "missing",
    );
    assert.equal(classifyHeadlessFlyStagingRoot("/tmp").reasonId, "wrong_package");

    try {
      unlinkSync(tmpOrch);
    } catch {
      // ignore
    }
  });

  test("2E.2D.6C: staging public-environment authority — trusted public before classify", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_PUBLIC_ENVIRONMENT_CONTRACT.trustedEnvName,
      "staging",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_PUBLIC_ENVIRONMENT_CONTRACT.neverFromBridge,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_PUBLIC_ENVIRONMENT_CONTRACT.applyBeforeClassification,
      true,
    );
    assert.equal(
      buildHeadlessFlyStagingPublicEnvironment().HEADLESS_ENV_NAME,
      HEADLESS_FLY_STAGING_TRUSTED_ENV_NAME,
    );
    assert.equal(
      buildHeadlessFlyStagingPublicEnvironment().HEADLESS_RENDERER_BUILD_ID,
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
    );
    assert.equal(
      buildHeadlessFlyStagingPublicEnvironment().HEADLESS_HOSTED_IMAGE_CLASS,
      "deployable_worker",
    );

    for (const [label, value, reason] of [
      ["blank", "", "blank"],
      ["production", "production", "production"],
      ["local", "local", "local_env"],
      ["hostile", "staging-evil", "mismatch"],
    ] as const) {
      assert.equal(
        classifyHeadlessFlyStagingEnvNameValue(value).reasonId,
        reason,
        label,
      );
    }
    assert.equal(
      classifyHeadlessFlyStagingEnvNameValue("staging").status,
      "ok",
    );

    const secrets = validBridgeRecord();
    const withoutPublic = classifyHeadlessFlyStagingOperatorPreflight({
      ...secrets,
      HEADLESS_WORKER_MODE: "verify",
    });
    assert.equal(withoutPublic.status, "invalid");
    assert.equal(withoutPublic.reasonId, "public_env_not_initialized");
    assert.equal(withoutPublic.upstashStatus, "skipped");

    const withPublic = classifyHeadlessFlyStagingOperatorPreflight(
      mergeHeadlessFlyStagingOperatorPreflightEnvironment(secrets, {
        workerMode: "verify",
      }),
    );
    assert.equal(withPublic.status, "ok", withPublic.reasonId);
    assert.equal(withPublic.upstashStatus, "configured");
    assert.equal(withPublic.hostedStatus, "configured");

    const renderBoundary = classifyHeadlessFlyStagingOperatorPreflight(
      mergeHeadlessFlyStagingOperatorPreflightEnvironment(secrets, {
        workerMode: "render",
      }),
    );
    assert.equal(renderBoundary.status, "ok", renderBoundary.reasonId);

    assert.equal(
      isHeadlessFlyStagingPublicEnvironmentInitialized(
        buildHeadlessFlyStagingPublicEnvironment(),
      ),
      true,
    );

    const commonBody = readFileSync(COMMON, "utf8");
    assert.match(commonBody, /fly_staging_apply_public_environment/);
    assert.match(commonBody, /fly_staging_unset_public_environment/);
    assert.match(commonBody, /fly_staging_assert_bridge_has_no_public_keys/);
    assert.match(commonBody, /HEADLESS_ENV_NAME="staging"/);
    assert.match(commonBody, /fly_staging_unset_gate_env/);

    assert.ok(
      existsSync(
        path.join(
          ROOT,
          "src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-local-classify-preflight.ts",
        ),
      ),
    );
    const preflightBody = readFileSync(
      path.join(
        ROOT,
        "src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-local-classify-preflight.ts",
      ),
      "utf8",
    );
    assert.match(
      preflightBody,
      /mergeHeadlessFlyStagingOperatorPreflightEnvironment/,
    );
    assert.match(
      preflightBody,
      /classifyHeadlessFlyStagingOperatorPreflight/,
    );

    const shellApply = sourceFlyStagingCommon(
      'fly_staging_apply_public_environment && printf "%s\\n" "${HEADLESS_ENV_NAME}" "${HEADLESS_RENDERER_BUILD_ID}"',
    );
    assert.equal(shellApply.status, 0, shellApply.stderr || shellApply.stdout);
    assert.match(shellApply.stdout, /^staging\n/);
    assert.match(shellApply.stdout, new RegExp(HEADLESS_PHASE3_RENDERER_BUILD_ID));

    const shellCleanup = sourceFlyStagingCommon(
      'fly_staging_apply_public_environment && fly_staging_unset_public_environment && fly_staging_unset_gate_env && test -z "${HEADLESS_ENV_NAME+x}" && echo cleanup=PASS',
    );
    assert.equal(shellCleanup.status, 0, shellCleanup.stderr || shellCleanup.stdout);
    assert.match(shellCleanup.stdout, /cleanup=PASS/);

    const badBridge = path.join(ROOT, ".tmp", "bridge-public-env-fixture");
    mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
    writeFileSync(
      badBridge,
      `HEADLESS_ENV_NAME=staging\n${Object.entries(secrets)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n")}\n`,
    );
    const bridgeRejectRun = sourceFlyStagingCommon(
      `fly_staging_assert_bridge_has_no_public_keys "${badBridge}"`,
    );
    assert.notEqual(bridgeRejectRun.status, 0);
    assert.match(
      `${bridgeRejectRun.stdout}${bridgeRejectRun.stderr}`,
      /bridge_public_env_key/,
    );
    try {
      unlinkSync(badBridge);
    } catch {
      // ignore
    }
  });

  test("2E.2D.6E: staged-secret activation and rollback authority", () => {
    const digest =
      "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e";
    const machineId = "080e9612c97028";

    const allStagedJson = HEADLESS_FLY_STAGING_SECRET_NAMES.map((name) => ({
      name,
      status: "Staged",
    }));
    const allDeployedJson = HEADLESS_FLY_STAGING_SECRET_NAMES.map((name) => ({
      name,
      status: "Deployed",
    }));
    const partialJson = HEADLESS_FLY_STAGING_SECRET_NAMES.map((name, i) => ({
      name,
      status: i < 4 ? "Deployed" : "Staged",
    }));

    const stagedLedger = parseHeadlessFlyStagingSecretsListJson(allStagedJson);
    assert.equal(stagedLedger.status, "ok");
    assert.equal(stagedLedger.aggregateStatus, "staged");
    assert.equal(stagedLedger.runtimeReady, false);

    const preFirst = classifyHeadlessFlyStagingPreFirstMachineSecretSurface(
      stagedLedger,
    );
    assert.equal(preFirst.status, "ok");
    assert.equal(preFirst.reasonId, "ok_staged_not_runtime_ready");
    assert.equal(preFirst.runtimeReady, false);

    const deployedLedger = parseHeadlessFlyStagingSecretsListJson(
      allDeployedJson,
    );
    assert.equal(deployedLedger.aggregateStatus, "deployed");
    assert.equal(deployedLedger.runtimeReady, true);

    const partialLedger = parseHeadlessFlyStagingSecretsListJson(partialJson);
    assert.equal(partialLedger.aggregateStatus, "partial");
    assert.equal(partialLedger.runtimeReady, false);

    const machineListRow = [
      {
        id: machineId,
        region: "iad",
        config: {
          metadata: { fly_process_group: "verify" },
          image: `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${digest}`,
          guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
        },
      },
    ];
    const machineBefore =
      parseHeadlessFlyStagingVerifyMachineFromListJson(machineListRow);
    assert.ok(machineBefore);
    assert.equal(machineBefore!.processGroup, "verify");

    const needsDeploy = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: stagedLedger,
      secretsAfter: null,
      machineBefore,
      machineAfter: null,
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: false,
      secretsDeploySucceeded: null,
      providerListSucceeded: true,
    });
    assert.equal(needsDeploy.status, "pending");
    assert.equal(needsDeploy.reasonId, "needs_secrets_deploy");
    assert.equal(needsDeploy.shouldRunSecretsDeploy, true);

    const activated = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: stagedLedger,
      secretsAfter: deployedLedger,
      machineBefore,
      machineAfter: machineBefore,
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: true,
      secretsDeploySucceeded: true,
      providerListSucceeded: true,
    });
    assert.equal(activated.status, "ok");
    assert.equal(activated.reasonId, "ok_activated_by_single_deploy");
    assert.equal(activated.runtimeReady, true);

    const partialPending = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: partialLedger,
      secretsAfter: null,
      machineBefore,
      machineAfter: null,
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: false,
      secretsDeploySucceeded: null,
      providerListSucceeded: true,
    });
    assert.equal(partialPending.shouldRunSecretsDeploy, true);

    const alreadyDeployed = classifyHeadlessFlyStagingVerifyFirstSecretActivation(
      {
        secretsBefore: deployedLedger,
        secretsAfter: null,
        machineBefore,
        machineAfter: null,
        expectedImageDigestSha256: digest,
        secretsDeployAttempted: false,
        secretsDeploySucceeded: null,
        providerListSucceeded: true,
      },
    );
    assert.equal(alreadyDeployed.status, "ok");
    assert.equal(alreadyDeployed.reasonId, "ok_already_deployed");
    assert.equal(alreadyDeployed.shouldRunSecretsDeploy, false);

    const deployFailed = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: stagedLedger,
      secretsAfter: null,
      machineBefore,
      machineAfter: null,
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: true,
      secretsDeploySucceeded: false,
      providerListSucceeded: true,
    });
    assert.equal(deployFailed.reasonId, "secrets_deploy_failed");

    const stillStaged = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: stagedLedger,
      secretsAfter: stagedLedger,
      machineBefore,
      machineAfter: machineBefore,
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: true,
      secretsDeploySucceeded: true,
      providerListSucceeded: true,
    });
    assert.equal(stillStaged.reasonId, "secrets_still_staged_after_deploy");

    assert.equal(
      parseHeadlessFlyStagingSecretsListJson({ not: "array" }).reasonId,
      "malformed_secret_list",
    );
    assert.equal(
      parseHeadlessFlyStagingSecretsListJson([], { listCommandSucceeded: false })
        .reasonId,
      "provider_error",
    );
    assert.equal(
      parseHeadlessFlyStagingSecretsListJson([
        { name: "DATABASE_URL", status: "Weird" },
      ]).reasonId,
      "unknown_fly_status",
    );
    assert.equal(
      parseHeadlessFlyStagingSecretsListJson([
        { name: "DATABASE_URL", status: "Staged" },
        { name: "DATABASE_URL", status: "Staged" },
      ]).reasonId,
      "duplicate_secret_name",
    );
    assert.equal(
      parseHeadlessFlyStagingSecretsListJson([
        { name: "DATABASE_URL", status: "Staged" },
      ]).reasonId,
      "secret_name_count_mismatch",
    );
    assert.equal(
      parseHeadlessFlyStagingSecretsListJson([
        ...allStagedJson,
        { name: "EXTRA_SECRET", status: "Staged" },
      ]).reasonId,
      "secret_name_count_mismatch",
    );

    const digestChanged = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: stagedLedger,
      secretsAfter: deployedLedger,
      machineBefore,
      machineAfter: parseHeadlessFlyStagingVerifyMachineFromListJson([
        {
          id: machineId,
          region: "iad",
          config: {
            metadata: { fly_process_group: "verify" },
            image: `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${"b".repeat(64)}`,
            guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
          },
        },
      ]),
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: true,
      secretsDeploySucceeded: true,
      providerListSucceeded: true,
    });
    assert.equal(digestChanged.reasonId, "image_digest_changed");

    const renderCreated = classifyHeadlessFlyStagingVerifyFirstSecretActivation({
      secretsBefore: stagedLedger,
      secretsAfter: deployedLedger,
      machineBefore,
      machineAfter: parseHeadlessFlyStagingVerifyMachineFromListJson([
        {
          id: machineId,
          region: "iad",
          config: {
            metadata: { fly_process_group: "render" },
            image: `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${digest}`,
            guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
          },
        },
      ]),
      expectedImageDigestSha256: digest,
      secretsDeployAttempted: true,
      secretsDeploySucceeded: true,
      providerListSucceeded: true,
    });
    assert.equal(renderCreated.reasonId, "render_machine_created");

    const runtimeBlocked = classifyHeadlessFlyStagingVerifyFirstRuntimeReadiness({
      secretLedger: stagedLedger,
      schemaPreflightLogStatus: "pass",
      verifyLoopStarted: true,
    });
    assert.equal(runtimeBlocked.reasonId, "secrets_not_deployed");

    const runtimeOk = classifyHeadlessFlyStagingVerifyFirstRuntimeReadiness({
      secretLedger: deployedLedger,
      schemaPreflightLogStatus: "pass",
      verifyLoopStarted: true,
    });
    assert.equal(runtimeOk.status, "ok");
    assert.equal(runtimeOk.reasonId, "ok_runtime_ready");

    const loopNotStarted = classifyHeadlessFlyStagingVerifyFirstRuntimeReadiness({
      secretLedger: deployedLedger,
      schemaPreflightLogStatus: "pass",
      verifyLoopStarted: false,
    });
    assert.equal(loopNotStarted.reasonId, "verify_loop_not_started");

    assert.equal(
      classifyHeadlessFlyStagingRollbackDestroy({
        argv: ["fly", "machine", "destroy", "-a", "shortforge-hw-staging-x", "-y", "abc"],
        listCommandSucceeded: true,
        destroyCommandsSucceeded: [true],
        finalMachineCount: 0,
      }).reasonId,
      "invalid_destroy_flag_y",
    );
    assert.equal(
      classifyHeadlessFlyStagingRollbackDestroy({
        argv: ["fly", "machine", "destroy", "--force", "abc"],
        listCommandSucceeded: true,
        destroyCommandsSucceeded: [true],
        finalMachineCount: 0,
      }).reasonId,
      "invalid_missing_app_scope",
    );
    assert.equal(
      classifyHeadlessFlyStagingRollbackDestroy({
        argv: [
          "fly",
          "machine",
          "destroy",
          "-a",
          "shortforge-hw-staging-x",
          "--force",
          machineId,
        ],
        listCommandSucceeded: true,
        destroyCommandsSucceeded: [true],
        finalMachineCount: 0,
      }).status,
      "ok",
    );
    assert.equal(
      classifyHeadlessFlyStagingRollbackDestroy({
        argv: [
          "fly",
          "machine",
          "destroy",
          "-a",
          "shortforge-hw-staging-x",
          "--force",
          machineId,
        ],
        listCommandSucceeded: true,
        destroyCommandsSucceeded: [false],
        finalMachineCount: 0,
      }).status,
      "unconfirmed",
    );
    assert.equal(
      classifyHeadlessFlyStagingRollbackDestroy({
        argv: [
          "fly",
          "machine",
          "destroy",
          "-a",
          "shortforge-hw-staging-x",
          "--force",
          machineId,
        ],
        listCommandSucceeded: false,
        destroyCommandsSucceeded: [true],
        finalMachineCount: 0,
      }).status,
      "unconfirmed",
    );
    assert.equal(
      classifyHeadlessFlyStagingRollbackDestroy({
        argv: [
          "fly",
          "machine",
          "destroy",
          "-a",
          "shortforge-hw-staging-x",
          "--force",
          machineId,
        ],
        listCommandSucceeded: true,
        destroyCommandsSucceeded: [true],
        finalMachineCount: 1,
      }).status,
      "unconfirmed",
    );

    assert.equal(
      HEADLESS_FLY_STAGING_SECRET_ACTIVATION_CONTRACT.stagedNeverRuntimeReady,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.verifyFirstSecretsDeployMaxAttempts,
      1,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.runtimeSecretReadinessRequiresDeployedLedger,
      true,
    );

    const commonBody = readFileSync(COMMON, "utf8");
    assert.match(commonBody, /fly_staging_verify_first_activate_staged_secrets/);
    assert.match(commonBody, /fly secrets deploy/);
    assert.match(commonBody, /fly machine destroy -a "\${_app}" --force/);
    assert.equal(/machine destroy.*-y/.test(commonBody), false);

    const verifyScript = readFileSync(
      path.join(SCRIPTS, "fly-staging-verify-scale-up.sh"),
      "utf8",
    );
    assert.match(verifyScript, /fly_staging_verify_first_activate_staged_secrets/);
    assert.match(verifyScript, /secrets_deployed=required/);

    const fp = fingerprintHeadlessFlyStagingConfiguration(
      readFileSync(VERIFY_FIRST_TEMPLATE, "utf8"),
    );
    const stagedEvidence = buildHeadlessFlyStagingEvidenceDocument({
      appName: "shortforge-hw-staging-4def8fa0",
      imageDigestSha256: digest,
      secretNamesPresent: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
      secretDeployAggregateStatus: "staged",
      scale: { verifyCount: 1, renderCount: 0 },
      schemaPreflightStatus: "pass",
      cleanupState: "intact",
      rollbackState: "not_run",
      configurationFingerprintSha256: fp,
      regionAuthority: "remotely_observed_from_verify_machine",
    });
    assert.equal(stagedEvidence.reasonId, "secrets_not_deployed_for_runtime");

    const deployedEvidence = buildHeadlessFlyStagingEvidenceDocument({
      appName: "shortforge-hw-staging-4def8fa0",
      imageDigestSha256: digest,
      secretNamesPresent: [...HEADLESS_FLY_STAGING_SECRET_NAMES],
      secretDeployAggregateStatus: "deployed",
      scale: { verifyCount: 1, renderCount: 0 },
      schemaPreflightStatus: "pass",
      cleanupState: "intact",
      rollbackState: "not_run",
      configurationFingerprintSha256: fp,
      regionAuthority: "remotely_observed_from_verify_machine",
    });
    assert.equal(deployedEvidence.status, "ok");
    assert.equal(deployedEvidence.secretDeployAggregateStatus, "deployed");
  });

  test("2E.2D.6G: canonical verify-first orchestrator authority + dry-run", () => {
    const digest =
      "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e";
    const imageRef = `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${digest}`;
    const entrypoint = path.join(
      ROOT,
      HEADLESS_FLY_STAGING_VERIFY_FIRST_ENTRYPOINT_RELATIVE_PATH,
    );

    assert.equal(
      HEADLESS_FLY_STAGING_VERIFY_FIRST_ORCHESTRATOR_CONTRACT
        .canonicalEntrypointOnly,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.verifyFirstCanonicalOrchestratorOnly,
      true,
    );
    assert.ok(existsSync(entrypoint));
    assert.match(
      readFileSync(entrypoint, "utf8"),
      /fly_staging_load_bridge/,
    );
    assert.equal(
      /fly_staging_source_bridge/.test(readFileSync(entrypoint, "utf8")),
      false,
    );
    assert.equal(
      classifyHeadlessFlyStagingVerifyFirstInvokedPath(
        `${ROOT}/.tmp/run-2e2d6f-verify-first.sh`,
      ).reasonId,
      "forbidden_tmp_wrapper",
    );
    assert.equal(
      classifyHeadlessFlyStagingVerifyFirstInvokedPath(entrypoint).reasonId,
      "ok_canonical",
    );

    const commonBody = readFileSync(COMMON, "utf8");
    for (const fn of HEADLESS_FLY_STAGING_VERIFY_FIRST_REQUIRED_FUNCTIONS) {
      assert.match(commonBody, new RegExp(`${fn}\\(\\)`));
    }
    assert.equal(/fly_staging_source_bridge\s*\(\)/.test(commonBody), false);
    assert.match(commonBody, /fly_staging_accept_bridge/);
    assert.match(commonBody, /FLY_STAGING_BRIDGE_ACCEPTED=1/);
    assert.match(commonBody, /fly_staging_provider_fly/);
    assert.match(commonBody, /fly machine destroy -a "\${_app}" --force/);
    assert.equal(/machine destroy.*-y/.test(commonBody), false);

    const verifyFirstBody = readFileSync(entrypoint, "utf8");
    assert.match(verifyFirstBody, /fly-staging-verify-scale-up\.sh/);
    assert.match(verifyFirstBody, /--dry-run/);
    assert.equal(
      HEADLESS_FLY_STAGING_VERIFY_FIRST_FORBIDDEN_WRAPPER_RE.test(
        verifyFirstBody,
      ),
      false,
    );

    mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
    const bridgeOk = path.join(ROOT, ".tmp", "bridge-6g-dry-run-pass");
    writeBridgeFixture(bridgeOk);
    const passRun = runVerifyFirstOrchestrator(["--dry-run"], {
      HEADLESS_FLY_STAGING_DRY_RUN: "1",
      HEADLESS_FLY_STAGING_FIXTURE_SCENARIO: "staged_activation_pass",
      HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE: `/tmp/fly-staging-dry-pass-${Date.now()}`,
      HEADLESS_FLY_STAGING_BRIDGE_FILE: bridgeOk,
      HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-4def8fa0",
      HEADLESS_FLY_STAGING_IMAGE_REF: imageRef,
    });
    assert.equal(passRun.status, 0, passRun.stdout);
    assert.match(passRun.stdout, /orchestrator=verify_first result=PASS/);
    assert.match(passRun.stdout, /phase=bridge_loaded/);
    assert.match(passRun.stdout, /phase=public_environment_applied/);
    assert.match(passRun.stdout, /phase=local_preflight_pass/);
    assert.match(passRun.stdout, /phase=secrets_synced/);
    assert.match(passRun.stdout, /phase=secrets_post_sync_classified/);
    assert.match(passRun.stdout, /secrets_sync=PASS/);
    assert.match(passRun.stdout, /secrets_activation=(PASS|SKIP)/);
    if (passRun.stdout.includes("secrets_activation=PASS")) {
      assert.equal(
        (passRun.stdout.match(/secrets_deploy_invoked=1/g) ?? []).length,
        1,
      );
    }
    assert.equal(existsSync(bridgeOk), false, "accepted bridge deleted on exit");

    const passLines = passRun.stdout.split("\n");
    const phases = passLines
      .filter((l) => l.startsWith("phase="))
      .map((l) => l.replace("phase=", ""));
    assert.equal(
      classifyHeadlessFlyStagingVerifyFirstDryRun({
        dryRun: true,
        invokedPath: entrypoint,
        logLines: passLines,
        bridgeExistsAfterExit: false,
        bridgeAccepted: true,
        bridgeLoaded: true,
        providerFlyInvoked: false,
        phasesReached: phases as never[],
      }).reasonId,
      "ok_dry_run_complete",
    );

    const bridgeSkip = path.join(ROOT, ".tmp", "bridge-6g-all-deployed");
    writeBridgeFixture(bridgeSkip);
    const skipRun = runVerifyFirstOrchestrator(["--dry-run"], {
      HEADLESS_FLY_STAGING_DRY_RUN: "1",
      HEADLESS_FLY_STAGING_FIXTURE_SCENARIO: "all_deployed_skip",
      HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE: `/tmp/fly-staging-dry-skip-${Date.now()}`,
      HEADLESS_FLY_STAGING_BRIDGE_FILE: bridgeSkip,
      HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-4def8fa0",
      HEADLESS_FLY_STAGING_IMAGE_REF: imageRef,
    });
    assert.equal(skipRun.status, 0, skipRun.stdout);
    assert.match(skipRun.stdout, /secrets_activation=SKIP/);
    assert.equal(
      (skipRun.stdout.match(/secrets_deploy_invoked=1/g) ?? []).length,
      0,
    );

    const bridgeBootstrap = path.join(ROOT, ".tmp", "bridge-6g-bootstrap-fail");
    writeBridgeFixture(bridgeBootstrap);
    const bootstrapRun = runVerifyFirstOrchestrator(["--dry-run"], {
      HEADLESS_FLY_STAGING_DRY_RUN: "1",
      HEADLESS_FLY_STAGING_BRIDGE_FILE: bridgeBootstrap,
      HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-4def8fa0",
      HEADLESS_FLY_STAGING_IMAGE_REF: "",
    });
    assert.notEqual(bootstrapRun.status, 0);
    assert.match(bootstrapRun.stdout, /fail_class=missing_immutable_image_ref/);
    assert.ok(
      existsSync(bridgeBootstrap),
      "bootstrap failure before accept preserves bridge",
    );
    try {
      unlinkSync(bridgeBootstrap);
    } catch {
      // ignore
    }

    const bridgeLoadFail = path.join(ROOT, ".tmp", "bridge-6g-load-fail");
    writeBridgeFixture(bridgeLoadFail);
    const loadFailRun = runVerifyFirstOrchestrator(["--dry-run"], {
      HEADLESS_FLY_STAGING_DRY_RUN: "1",
      HEADLESS_FLY_STAGING_FIXTURE_SCENARIO: "load_fail",
      HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE: `/tmp/fly-staging-dry-loadfail-${Date.now()}`,
      HEADLESS_FLY_STAGING_BRIDGE_FILE: bridgeLoadFail,
      HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-4def8fa0",
      HEADLESS_FLY_STAGING_IMAGE_REF: imageRef,
    });
    assert.notEqual(loadFailRun.status, 0);
    assert.match(loadFailRun.stdout, /fail_class=bridge_load_simulated_fail/);
    assert.equal(
      existsSync(bridgeLoadFail),
      false,
      "failure after accept deletes bridge",
    );

    const fnCheck = sourceFlyStagingCommon(
      "fly_staging_assert_required_functions",
    );
    assert.equal(fnCheck.status, 0, fnCheck.stderr || fnCheck.stdout);

    const aliasReject = sourceFlyStagingCommon(
      'fly_staging_source_bridge() { :; }; fly_staging_assert_required_functions',
    );
    assert.notEqual(aliasReject.status, 0);
    assert.match(
      `${aliasReject.stdout}${aliasReject.stderr}`,
      /forbidden_function_alias/,
    );
  });

  test("2E.2D.6H: decoded secret sync + guaranteed rollback authority", () => {
    assert.equal(HEADLESS_FLY_STAGING_SECRETS_SYNC_CONTRACT.decodedImportStreamOnly, true);
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.verifyFirstRequiresDecodedSecretsSync,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT.secretsImportForbidsBridgeFilePipe,
      true,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_VERIFY_FIRST_ORCHESTRATOR_CONTRACT.observeRuntimeNeverDies,
      true,
    );

    const secretsInstallBody = readFileSync(
      path.join(SCRIPTS, "fly-staging-secrets-install.sh"),
      "utf8",
    );
    const commonBody = readFileSync(COMMON, "utf8");
    const verifyFirstBody = readFileSync(
      path.join(SCRIPTS, "fly-staging-verify-first.sh"),
      "utf8",
    );
    for (const pattern of HEADLESS_FLY_STAGING_FORBIDDEN_BRIDGE_IMPORT_PATTERNS) {
      assert.equal(pattern.test(secretsInstallBody), false, String(pattern));
      assert.equal(pattern.test(verifyFirstBody), false, String(pattern));
    }
    assert.match(secretsInstallBody, /fly_staging_emit_decoded_secrets_import_stream/);
    assert.match(commonBody, /fly_staging_sync_decoded_secrets/);
    assert.match(commonBody, /HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL secrets_sync/);
    assert.match(commonBody, /fly_staging_orchestrator_rollback_to_zero/);
    const observeFnBody =
      commonBody.match(
        /fly_staging_observe_verify_runtime_logs\(\) \{[\s\S]*?\n\}/,
      )?.[0] ?? "";
    assert.equal(observeFnBody.includes("fly_staging_die"), false);
    assert.match(observeFnBody, /return 1/);
    assert.match(commonBody, /rollback=unconfirmed/);
    assert.match(commonBody, /rollback=confirmed/);

    const sensitiveDecoded: Record<string, string> = {
      ...validBridgeRecord(),
      DATABASE_URL:
        "postgresql://user:p@ss&w0rd?ssl=true@ep.example/neondb?channel=1&x=%25",
      UPSTASH_REDIS_TCP_URL: "rediss://default:pa$$w%40rd@host.example:6379/0?foo=bar",
      R2_SECRET_ACCESS_KEY: 'key"with\'quotes\\and\\backslash',
      R2_ACCESS_KEY_ID: "AKIA&?%:@$\\test",
      HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com/path?a=1&b=2",
    };
    assert.equal(
      validateHeadlessFlyStagingDecodedSecretsRecord(sensitiveDecoded).status,
      "ok",
    );
    assert.equal(
      assertHeadlessFlyStagingSecretsImportRoundTrip(sensitiveDecoded).status,
      "ok",
    );
    const built = buildHeadlessFlyStagingSecretsImportStream(sensitiveDecoded);
    assert.equal(built.status, "ok");
    assert.equal(built.recordCount, HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT);
    const parsed = parseHeadlessFlyStagingSecretsImportStream(built.stream!);
    assert.equal(parsed.status, "ok");
    for (const name of HEADLESS_FLY_STAGING_SECRET_NAMES) {
      assert.equal(parsed.values!.get(name), sensitiveDecoded[name]);
    }
    assert.equal(rejectShellSerializedSecretValue("$'postgresql://user'").reasonId, "shell_quoted_representation");
    assert.equal(rejectShellSerializedSecretValue("printf %q output").reasonId, "percent_q_representation");
    assert.equal(rejectShellSerializedSecretValue("a\nb").reasonId, "unsafe_byte_lf");

    const digest =
      "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e";
    const imageRef = `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${digest}`;

    const runScenario = (
      scenario: string,
      stateSuffix: string,
    ): { status: number | null; stdout: string } => {
      const bridge = path.join(ROOT, ".tmp", `bridge-6h-${stateSuffix}`);
      writeBridgeFixture(bridge);
      const run = runVerifyFirstOrchestrator(["--dry-run"], {
        HEADLESS_FLY_STAGING_DRY_RUN: "1",
        HEADLESS_FLY_STAGING_FIXTURE_SCENARIO: scenario,
        HEADLESS_FLY_STAGING_FIXTURE_STATE_FILE: `/tmp/fly-staging-6h-${stateSuffix}-${Date.now()}`,
        HEADLESS_FLY_STAGING_BRIDGE_FILE: bridge,
        HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-4def8fa0",
        HEADLESS_FLY_STAGING_IMAGE_REF: imageRef,
      });
      return { status: run.status, stdout: run.stdout };
    };

    const schemaRollback = runScenario(
      "schema_database_unavailable_rollback",
      "schema-rollback",
    );
    assert.notEqual(schemaRollback.status, 0, schemaRollback.stdout);
    assert.match(schemaRollback.stdout, /runtime_observation=FAIL reason=schema_database_unavailable/);
    assert.match(schemaRollback.stdout, /rollback=confirmed/);
    assert.match(schemaRollback.stdout, /phase=rollback_complete/);
    assert.match(schemaRollback.stdout, /fail_class=runtime_observation_failed rollback=confirmed/);
    assert.equal(
      (schemaRollback.stdout.match(/destroy_ok=1/g) ?? []).length >= 1 ||
        schemaRollback.stdout.includes("rollback=confirmed"),
      true,
    );

    const loopRollback = runScenario(
      "verify_loop_not_started_rollback",
      "loop-rollback",
    );
    assert.notEqual(loopRollback.status, 0, loopRollback.stdout);
    assert.match(loopRollback.stdout, /runtime_observation=FAIL reason=verify_loop_not_started/);
    assert.match(loopRollback.stdout, /rollback=confirmed/);

    const destroyFail = runScenario("rollback_destroy_fail", "destroy-fail");
    assert.notEqual(destroyFail.status, 0, destroyFail.stdout);
    assert.match(destroyFail.stdout, /rollback=unconfirmed/);
    assert.match(destroyFail.stdout, /fail_class=rollback_unconfirmed/);

    const listFail = runScenario("rollback_list_fail", "list-fail");
    assert.notEqual(listFail.status, 0, listFail.stdout);
    assert.match(listFail.stdout, /rollback=unconfirmed reason=provider_list_failed/);

    const passRun = runScenario("staged_activation_pass", "pass");
    assert.equal(passRun.status, 0, passRun.stdout);
    assert.match(passRun.stdout, /runtime_observation=PASS/);
    assert.match(passRun.stdout, /phase=runtime_observation_pass/);
    assert.equal(passRun.stdout.includes("rollback=confirmed"), false);

    const evidenceOk = buildHeadlessFlyStagingOrchestratorEvidenceDocument({
      secretsSyncStatus: "synced_from_decoded_values",
      secretDeployAggregateStatus: "deployed",
      remoteSchemaPreflightStatus: "pass",
      loopReadinessStatus: "started",
      rollbackResultStatus: "not_run",
    });
    assert.equal(evidenceOk.status, "ok");
    assert.equal(
      HEADLESS_FLY_STAGING_ORCHESTRATOR_EVIDENCE_CONTRACT.distinguishesSecretsSyncFromDeploy,
      true,
    );

    const emitCheck = sourceFlyStagingCommon(
      'export DATABASE_URL="postgresql://u:p@h/db"; export R2_ACCOUNT_ID=1; export R2_ACCESS_KEY_ID=k; export R2_SECRET_ACCESS_KEY=s; export R2_BUCKET_ASSETS=a; export R2_BUCKET_ARTIFACTS=b; export R2_ENDPOINT=https://e; export HEADLESS_ALLOWED_ORIGINS=https://o; export UPSTASH_REDIS_TCP_URL=rediss://x; FLY_STAGING_BRIDGE_LOADED=1; fly_staging_emit_decoded_secrets_import_stream | wc -l',
      { FLY_STAGING_BRIDGE_LOADED: "1" },
    );
    assert.equal(emitCheck.status, 0, emitCheck.stderr || emitCheck.stdout);
    assert.equal(Number(emitCheck.stdout.trim()), 9);
  });

  console.log(`\n${passed} passed\n`);
}

main();
