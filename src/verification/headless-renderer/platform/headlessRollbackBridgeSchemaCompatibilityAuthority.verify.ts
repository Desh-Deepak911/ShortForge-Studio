/**
 * Schema-008 rollback bridge compatibility authority.
 * Run: npm run test:headless-rollback-bridge-schema-compatibility-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { embeddedSchemaFingerprintAsPreflightSources } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import {
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
  classifyHeadlessSchemaPreflightCompatibilityBinding,
  validateHeadlessSchemaPreflightLedgerForMode,
} from "@/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
  buildHeadlessFlyStagingRollbackBridgePublicEnvironment,
  classifyHeadlessFlyStagingCompatibilityModeOnNonBridgeImage,
  classifyHeadlessFlyStagingRollbackBridgeEnvironmentPair,
  classifyHeadlessFlyStagingRollbackBridgeImageRecord,
  isHeadlessFlyStagingPlaceholderBridgeDigest,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";
import {
  buildHeadlessFlyStagingMaterializedConfigAttemptIdentity,
  classifyHeadlessFlyStagingMaterializedConfigCrossAttemptReuse,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-controlled-rollout-attempt-authority";
import {
  HEADLESS_PHASE3_RENDERER_BUILD_ID,
  HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/renderer-build-id";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function ledgerMap(
  rows: readonly { migrationId: string; checksumSha256: string }[],
): Map<string, string> {
  return new Map(rows.map((row) => [row.migrationId, row.checksumSha256]));
}

function schema007Ledger(): Map<string, string> {
  return ledgerMap(embeddedSchemaFingerprintAsPreflightSources());
}

function schema008Ledger(): Map<string, string> {
  const map = schema007Ledger();
  map.set(
    HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
    HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
  );
  return map;
}

function eightMigrationExpectedSources() {
  return [
    ...embeddedSchemaFingerprintAsPreflightSources(),
    {
      migrationId: HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
      checksumSha256: HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
    },
  ];
}

function permissivePreflightExecutor(
  ledgerById: Map<string, string>,
): HeadlessSqlExecutor {
  const client = {
    query: async (text: string, params?: readonly unknown[]) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class") && text.includes("relkind")) {
        return {
          rows: [{ relkind: "r", relpersistence: "p" }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: [...ledgerById.entries()].map(([migration_id, checksum_sha256]) => ({
            migration_id,
            checksum_sha256,
          })),
          rowCount: ledgerById.size,
        };
      }
      if (
        text.includes("FROM pg_constraint") ||
        text.includes("FROM pg_index") ||
        text.includes("information_schema.columns") ||
        text.includes("character_maximum_length")
      ) {
        return {
          rows: [
            {
              contype: "u",
              convalidated: true,
              table_name: "headless_render_jobs",
              nspname: "public",
              ref_table: "headless_project_ownership",
              ref_nsp: "public",
              cols: ["project_id", "owner_id"],
              ref_cols: ["project_id", "owner_id"],
              n: "0",
              character_maximum_length: 1024,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as HeadlessSqlClient;
  return {
    withClient: async <T>(fn: (c: HeadlessSqlClient) => Promise<T>) => fn(client),
    withTransaction: async <T>(fn: (c: HeadlessSqlClient) => Promise<T>) => fn(client),
  };
}

async function main() {
  console.log("\nSchema-008 rollback bridge compatibility authority\n");

  const coreSources = embeddedSchemaFingerprintAsPreflightSources();

  await test("bridge accepts exact schema 007 ledger", () => {
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      strictExpectedSources: coreSources,
      ledgerById: schema007Ledger(),
    });
    assert.equal(result.ok, true);
  });

  await test("bridge accepts exact schema 008 ledger", () => {
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      strictExpectedSources: coreSources,
      ledgerById: schema008Ledger(),
    });
    assert.equal(result.ok, true);
  });

  await test("strict 2G.24 mode rejects schema 008", () => {
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: "strict",
      strictExpectedSources: coreSources,
      ledgerById: schema008Ledger(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("standard eight-migration strict mode rejects schema 007", () => {
    const expected = eightMigrationExpectedSources();
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: "strict",
      strictExpectedSources: expected,
      ledgerById: schema007Ledger(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_MISSING");
  });

  await test("bridge rejects missing historical migration", () => {
    const map = schema007Ledger();
    map.delete(coreSources[0]!.migrationId);
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      strictExpectedSources: coreSources,
      ledgerById: map,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_MISSING");
  });

  await test("bridge rejects altered historical checksum", () => {
    const map = schema007Ledger();
    map.set(coreSources[0]!.migrationId, "f".repeat(64));
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      strictExpectedSources: coreSources,
      ledgerById: map,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("bridge rejects altered migration-008 checksum", () => {
    const map = schema008Ledger();
    map.set(HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID, "a".repeat(64));
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      strictExpectedSources: coreSources,
      ledgerById: map,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("bridge rejects unknown migration 009", () => {
    const map = schema008Ledger();
    map.set("009_unknown_future", "b".repeat(64));
    const result = validateHeadlessSchemaPreflightLedgerForMode({
      mode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      strictExpectedSources: coreSources,
      ledgerById: map,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_DRIFT");
  });

  await test("bridge rejects duplicate migration ledger rows via preflight", async () => {
    const row = coreSources[0]!;
    const base = permissivePreflightExecutor(schema007Ledger());
    const sql: HeadlessSqlExecutor = {
      withClient: async (fn) =>
        base.withClient(async (inner) => {
          const wrapped = {
            query: async (text: string, params?: readonly unknown[]) => {
              if (text.includes("FROM public.headless_schema_migrations")) {
                return {
                  rows: [
                    {
                      migration_id: row.migrationId,
                      checksum_sha256: row.checksumSha256,
                    },
                    {
                      migration_id: row.migrationId,
                      checksum_sha256: row.checksumSha256,
                    },
                  ],
                  rowCount: 2,
                };
              }
              return inner.query(text, params);
            },
          } as HeadlessSqlClient;
          return fn(wrapped);
        }),
      withTransaction: async (fn) => sql.withClient(fn),
    };
    const result = await runHeadlessSchemaPreflight({
      sql,
      compatibilityMode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_INCOHERENT");
  });

  await test("bridge mode rejected for non-bridge digest", () => {
    const classified = classifyHeadlessFlyStagingCompatibilityModeOnNonBridgeImage({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      compatibilityMode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
    });
    assert.equal(classified.ok, false);
    if (!classified.ok) {
      assert.equal(classified.reasonId, "compatibility_mode_on_non_bridge_image");
    }
  });

  await test("bridge build id rejected without bridge mode", () => {
    const binding = classifyHeadlessSchemaPreflightCompatibilityBinding({
      compatibilityMode: undefined,
      rendererBuildId: HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    });
    assert.equal(binding.ok, false);
    if (!binding.ok) {
      assert.equal(binding.reasonId, "bridge_build_id_without_bridge_mode");
    }
  });

  await test("bridge image rejected with wrong renderer build id", () => {
    const binding = classifyHeadlessSchemaPreflightCompatibilityBinding({
      compatibilityMode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
      rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
    });
    assert.equal(binding.ok, false);
    if (!binding.ok) {
      assert.equal(binding.reasonId, "bridge_mode_without_bridge_build_id");
    }
  });

  await test("bridge image rejected with wrong environment pair", () => {
    const pair = classifyHeadlessFlyStagingRollbackBridgeEnvironmentPair({
      imageDigestSha256:
        "d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68",
      rendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
      compatibilityMode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
    });
    assert.equal(pair.ok, false);
  });

  await test("maintenance remains disabled on bridge record", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD.maintenanceEnabled,
      false,
    );
    const classified = classifyHeadlessFlyStagingRollbackBridgeImageRecord();
    assert.equal(classified.ok, true);
  });

  await test("real bridge digest resolves and placeholder digest is rejected", () => {
    assert.equal(
      isHeadlessFlyStagingPlaceholderBridgeDigest(
        HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD.imageDigestSha256,
      ),
      false,
    );
    assert.equal(isHeadlessFlyStagingPlaceholderBridgeDigest("0".repeat(64)), true);
    const pair = classifyHeadlessFlyStagingRollbackBridgeEnvironmentPair({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD.imageDigestSha256,
      rendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
      compatibilityMode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
    });
    assert.equal(pair.ok, true);
  });

  await test("no maintenance provider env on bridge public environment", () => {
    const bridgeEnv = buildHeadlessFlyStagingRollbackBridgePublicEnvironment();
    assert.equal(
      (bridgeEnv as Record<string, string | undefined>)
        .HEADLESS_EXPORT_MAINTENANCE_ENABLED,
      undefined,
    );
    assert.equal(
      bridgeEnv[HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV],
      HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
    );
  });

  await test("page artifact hash unchanged from accepted 2G.24 runtime", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
    );
    assert.notEqual(
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD.hostedWorkerArtifactSha256,
      "c425cd5d4ffd94279bab75c325bd06a9dadaed6ee3e8fe04dab3e8146b12a9ca",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD.hostedWorkerArtifactSha256,
      "53a1bbf0815a6ca6a032f659efac708aa803447277e488d00d35c1c94c5834e2",
    );
  });

  await test("execution-probe authority still accepts strict 2G.24 build id", () => {
    const binding = classifyHeadlessSchemaPreflightCompatibilityBinding({
      compatibilityMode: "strict",
      rendererBuildId: HEADLESS_PHASE3_RENDERER_BUILD_ID,
    });
    assert.equal(binding.ok, true);
    if (binding.ok) assert.equal(binding.mode, "strict");
  });

  await test("rollback materialized configuration is independently generated", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..");
    const templateToml = readFileSync(
      path.join(repoRoot, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
      "utf8",
    );
    const forwardMaterialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
      templateToml,
      appName: "shortforge-hw-staging-test",
      pair: {
        pairId: "post_007_2g24_export_correctness_forward_pair",
        role: "forward_target",
        imageRecordId: "post_007_2g24_export_correctness_current",
        imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
        rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
        hostedWorkerArtifactSha256: "c425cd5d4ffd94279bab75c325bd06a9dadaed6ee3e8fe04dab3e8146b12a9ca",
        hostedPageArtifactSha256:
          HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
        buildInfoSha256: "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
      },
    });
    const bridgeMaterialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
      templateToml,
      appName: "shortforge-hw-staging-test",
      pair: HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
    });
    assert.equal(forwardMaterialized.status, "ok");
    assert.equal(bridgeMaterialized.status, "ok");
    if (forwardMaterialized.status === "ok" && bridgeMaterialized.status === "ok") {
      assert.notEqual(forwardMaterialized.toml, bridgeMaterialized.toml);
      assert.equal(
        bridgeMaterialized.rendererBuildId,
        HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
      );
    }
  });

  await test("forward configuration cannot be reused as rollback configuration", () => {
    const forwardIdentity = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: "/tmp/footiebitz",
      attemptKind: "forward",
      imageDigestSha256:
        "d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68",
      attemptSequence: 1,
    });
    const bridgeIdentity = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: "/tmp/footiebitz",
      attemptKind: "rollback",
      imageDigestSha256: "0".repeat(64),
      attemptSequence: 1,
    });
    const reuse = classifyHeadlessFlyStagingMaterializedConfigCrossAttemptReuse({
      priorIdentity: forwardIdentity,
      nextIdentity: bridgeIdentity,
    });
    assert.equal(reuse.ok, true);
    assert.notEqual(forwardIdentity.relativePath, bridgeIdentity.relativePath);
  });

  await test("placeholder bridge digest is fail-closed", () => {
    assert.equal(isHeadlessFlyStagingPlaceholderBridgeDigest("0".repeat(64)), true);
    const pair = classifyHeadlessFlyStagingRollbackBridgeEnvironmentPair({
      imageDigestSha256: "0".repeat(64),
      rendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
      compatibilityMode: HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
    });
    assert.equal(pair.ok, false);
    if (!pair.ok) assert.equal(pair.reasonId, "placeholder_digest");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
