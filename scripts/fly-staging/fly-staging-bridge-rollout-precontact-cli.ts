#!/usr/bin/env -S npx tsx
/**
 * Read-only pre-contact acceptance for controlled bridge rollout.
 * Uses pooled DATABASE_URL from QA master — never prints secret values.
 */

import { embeddedSchemaFingerprintAsPreflightSources } from "../../src/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH } from "../../src/features/headless-renderer/domain/headless-source-slot-key";
import {
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "../../src/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import { readConfiguredHeadlessDatabaseUrl } from "../../src/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "../../src/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "../../src/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import { assertGlobalOutboxQuiescence } from "../../src/verification/headless-renderer/fly-render-4k-capacity/capacity-4k-outbox-quiescence";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";

function stripOptionalEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readDatabaseUrlFromEnv(): string | null {
  const configured = readConfiguredHeadlessDatabaseUrl(process.env);
  if (configured != null) return configured;
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") return null;
  const trimmed = stripOptionalEnvQuotes(raw);
  return trimmed.length > 0 ? trimmed : null;
}

async function main(): Promise<void> {
  const phase = process.argv[2] ?? "baseline";
  const expectedDigest =
    phase === "post-forward" || phase === "post-restart"
      ? HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST
      : HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST;

  const connectionString = readDatabaseUrlFromEnv();
  if (connectionString == null) {
    console.log("neon_read=FAIL");
    process.exit(1);
  }
  console.log("neon_read=PASS");

  const sql = createNeonSqlExecutor({ connectionString });
  const compatibilityMode = HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE;

  const preflight = await runHeadlessSchemaPreflight({
    sql,
    compatibilityMode,
  });
  console.log(`schema_preflight=${preflight.ok ? "PASS" : "FAIL"}`);
  if (!preflight.ok) {
    console.log(`schema_code=${preflight.code}`);
    process.exit(1);
  }

  const expectedSources = embeddedSchemaFingerprintAsPreflightSources();
  const ids = preflight.fingerprint.migrationIds;
  const checksums = preflight.fingerprint.checksums;

  if (phase === "baseline" || phase === "pre-migrate" || phase === "post-forward") {
    if (ids.length !== expectedSources.length - 1) {
      console.log("schema_ledger_count_mismatch=1");
      process.exit(1);
    }
    if (ids.includes(HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID)) {
      console.log("schema_has_008=premature");
      process.exit(1);
    }
    for (let i = 0; i < ids.length; i += 1) {
      if (
        ids[i] !== expectedSources[i]?.migrationId ||
        checksums[i] !== expectedSources[i]?.checksumSha256
      ) {
        console.log("schema_checksum_mismatch=1");
        process.exit(1);
      }
    }
  }

  if (phase === "post-migrate" || phase === "post-restart") {
    if (ids.length !== expectedSources.length) {
      console.log("schema_ledger_count_mismatch=1");
      process.exit(1);
    }
    if (!ids.includes(HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID)) {
      console.log("schema_has_008=missing");
      process.exit(1);
    }
    const has009 = ids.some((id) => /^009_/.test(id) || /^0[1-9][0-9]_/.test(id));
    if (has009) {
      console.log("schema_has_009_plus=true");
      process.exit(1);
    }
    for (let i = 0; i < expectedSources.length; i += 1) {
      if (
        ids[i] !== expectedSources[i]?.migrationId ||
        checksums[i] !== expectedSources[i]?.checksumSha256
      ) {
        console.log("schema_checksum_mismatch=1");
        process.exit(1);
      }
    }
  }

  console.log(`checksum_match=true`);
  console.log(`migration_count=${preflight.fingerprint.migrationIds.length}`);

  const outbox = await assertGlobalOutboxQuiescence(sql);
  console.log(`outbox_quiescence=${outbox.ok ? "PASS" : "FAIL"}`);
  if (!outbox.ok) process.exit(1);

  const verifyClaims = await sql.withClient(async (client) => {
    await client.query("SELECT set_config('search_path', 'public, pg_temp', true)");
    return client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.headless_owned_objects WHERE verification_claim_token IS NOT NULL`,
    );
  });
  const renderClaims = await sql.withClient(async (client) => {
    await client.query("SELECT set_config('search_path', 'public, pg_temp', true)");
    return client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM public.headless_jobs
       WHERE state IN ('queued', 'rendering', 'encoding', 'validating', 'uploading')
         AND claim_token IS NOT NULL`,
    );
  });
  console.log(`active_verify_claims=${verifyClaims.rows[0]?.n ?? "0"}`);
  console.log(`active_render_claims=${renderClaims.rows[0]?.n ?? "0"}`);

  const slot = await sql.withClient(async (client) =>
    client.query<{ character_maximum_length: number | null }>(
      `SELECT character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'headless_owned_objects'
         AND column_name = 'slot_key'`,
    ),
  );
  const capacity = slot.rows[0]?.character_maximum_length ?? 0;
  console.log(`slot_key_capacity=${capacity}`);
  if (capacity !== HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH) process.exit(1);

  console.log(`expected_unified_digest=${expectedDigest}`);
  console.log(`precontact_phase=${phase}`);
  console.log("precontact_readonly=PASS");
}

main().catch(() => {
  console.log("precontact_readonly=FAIL");
  process.exit(1);
});
