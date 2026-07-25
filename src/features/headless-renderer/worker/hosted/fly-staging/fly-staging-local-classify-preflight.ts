/**
 * Sprint 11E Phase 2E.2D.6C — local classify + schema preflight for staging orchestrators.
 * Requires bridge secrets + fly_staging_apply_public_environment in the shell caller.
 * Never prints secret values or URLs. No provider contact.
 *
 * Run: npx tsx src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-local-classify-preflight.ts
 */
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import { HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import {
  classifyHeadlessFlyStagingOperatorPreflight,
  mergeHeadlessFlyStagingOperatorPreflightEnvironment,
} from "./fly-staging-public-environment";

async function main(): Promise<void> {
  const workerModeRaw = process.env.HEADLESS_FLY_STAGING_PREFLIGHT_WORKER_MODE;
  const workerMode =
    workerModeRaw === "verify" || workerModeRaw === "render"
      ? workerModeRaw
      : undefined;

  const merged = mergeHeadlessFlyStagingOperatorPreflightEnvironment(
    process.env as Record<string, unknown>,
    { workerMode, applyPublicEnvironment: true },
  );

  const preflight = classifyHeadlessFlyStagingOperatorPreflight(merged);
  console.log(`neon_status=${preflight.neonStatus}`);
  console.log(`r2_status=${preflight.r2Status}`);
  console.log(`upstash_tcp_status=${preflight.upstashStatus}`);
  console.log(`hosted_status=${preflight.hostedStatus}`);
  console.log(`hosted_reason=${preflight.hostedReasonId}`);

  if (preflight.status !== "ok") {
    console.log(`fail_class=${preflight.reasonId}`);
    process.exit(1);
  }

  const connectionString = readConfiguredHeadlessDatabaseUrl(merged);
  if (connectionString == null) {
    console.log("fail_class=database_url_unreadable");
    process.exit(1);
  }

  const sql = createNeonSqlExecutor({ connectionString });
  const result = await runHeadlessSchemaPreflight({ sql });
  if (!result.ok) {
    console.log("schema_preflight=FAIL");
    console.log(`schema_code=${result.code}`);
    console.log("fail_class=schema_preflight_failed");
    process.exit(1);
  }

  const ids = result.fingerprint.migrationIds.join(",");
  const checksums = result.fingerprint.checksums.join(",");
  const expectedIds = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations
    .map((m) => m.migrationId)
    .join(",");
  const expectedChecksums = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations
    .map((m) => m.checksumSha256)
    .join(",");

  if (ids !== expectedIds || checksums !== expectedChecksums) {
    console.log("schema_preflight=FAIL");
    console.log("fail_class=schema_fingerprint_mismatch");
    process.exit(1);
  }

  console.log("schema_preflight=PASS");
  console.log(`migration_ids=${ids}`);
  console.log(
    `checksum_prefixes=${result.fingerprint.checksums
      .map((c) => c.slice(0, 12))
      .join(",")}`,
  );
  console.log(`migration_count=${result.fingerprint.migrationIds.length}`);
  process.exit(0);
}

main().catch(() => {
  console.log("fail_class=schema_preflight_exception");
  process.exit(1);
});
