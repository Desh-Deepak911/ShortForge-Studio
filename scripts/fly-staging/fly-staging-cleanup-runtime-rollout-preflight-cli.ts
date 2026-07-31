#!/usr/bin/env -S npx tsx
/**
 * Operator preflight for cleanup-runtime rollout — digest-bound public env + strict schema 008.
 * Requires nine-key worker bridge secrets already loaded in process.env.
 */

import { classifyHeadlessNeonEnvironment } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { classifyHeadlessR2Environment } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import { classifyHeadlessUpstashConsumerEnvironment } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { classifyHeadlessHostedWorkerEnvironment } from "@/features/headless-renderer/worker/hosted/hosted-environment";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  classifyHeadlessFlyStagingEnvNameValue,
  mergeHeadlessFlyStagingOperatorPreflightEnvironment,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-public-environment";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";

async function main(): Promise<void> {
  const workerModeRaw = process.env.HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE;
  const workerMode =
    workerModeRaw === "verify" || workerModeRaw === "render"
      ? workerModeRaw
      : undefined;

  const merged = mergeHeadlessFlyStagingOperatorPreflightEnvironment(
    process.env as Record<string, unknown>,
    { workerMode, applyPublicEnvironment: false },
  );

  const envName = classifyHeadlessFlyStagingEnvNameValue(merged.HEADLESS_ENV_NAME);
  if (envName.status !== "ok") {
    console.log("fail_class=public_env_invalid");
    process.exit(1);
  }

  if (
    merged.HEADLESS_RENDERER_BUILD_ID !==
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
  ) {
    console.log("fail_class=wrong_renderer_build_id");
    process.exit(1);
  }

  if (merged.HEADLESS_EXPORT_MAINTENANCE_ENABLED !== "0") {
    console.log("fail_class=maintenance_enabled");
    process.exit(1);
  }

  const neonStatus = classifyHeadlessNeonEnvironment(merged);
  const r2Status = classifyHeadlessR2Environment(merged);
  const upstashStatus = classifyHeadlessUpstashConsumerEnvironment(merged);
  const hosted = classifyHeadlessHostedWorkerEnvironment(merged);

  console.log(`neon_status=${neonStatus}`);
  console.log(`r2_status=${r2Status}`);
  console.log(`upstash_tcp_status=${upstashStatus}`);
  console.log(`hosted_status=${hosted.status}`);
  console.log("maintenance_enabled=0");

  if (
    neonStatus !== "configured" ||
    r2Status !== "configured" ||
    upstashStatus !== "configured" ||
    hosted.status !== "configured"
  ) {
    console.log("fail_class=hosted_environment_not_ready");
    process.exit(1);
  }

  const connectionString = readConfiguredHeadlessDatabaseUrl(merged);
  if (connectionString == null) {
    console.log("fail_class=database_url_unreadable");
    process.exit(1);
  }

  const sql = createNeonSqlExecutor({ connectionString });
  const result = await runHeadlessSchemaPreflight({
    sql,
    compatibilityMode: "strict",
  });
  if (!result.ok) {
    console.log("schema_preflight=FAIL");
    console.log(`schema_code=${result.code}`);
    process.exit(1);
  }

  console.log("schema_preflight=PASS");
  console.log(`migration_count=${result.fingerprint.migrationIds.length}`);
  console.log("compatibility_mode=strict");
}

main().catch(() => {
  console.log("fail_class=cleanup_runtime_rollout_preflight_exception");
  process.exit(1);
});
