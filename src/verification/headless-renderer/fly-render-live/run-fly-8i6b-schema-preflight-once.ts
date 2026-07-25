/**
 * One-shot read-only Neon schema preflight — Sprint 11E Phase 2E.2D.8I.6B.
 * Never prints secret values, hostnames, database names, users, or parameters.
 */
import { statSync } from "node:fs";

import { HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH } from "@/features/headless-renderer/domain/headless-source-slot-key";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { extractHeadlessPgSqlState } from "@/features/headless-renderer/control-plane/runtime/map-database-failure";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import {
  FLY_VERIFY_LIVE_QA_SECRET_KEYS,
  validateFlyVerifyLiveQaEnvContract,
} from "@/verification/headless-renderer/fly-verify-live/qa-secret-contract";

const MASTER_PATH = "/tmp/shortforge-fly-verify-qa.master.env";
const MIGRATION_007_ID = "007_headless_owned_object_slot_key_capacity";
const MIGRATION_007_CHECKSUM =
  "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244";

export type DatabaseUrlSafeClass =
  | "pooled_postgresql"
  | "direct_postgresql"
  | "invalid"
  | "missing";

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

export function classifyDatabaseUrlSafe(
  raw: unknown,
): DatabaseUrlSafeClass {
  if (typeof raw !== "string" || raw.length === 0) return "missing";
  const normalized = stripOptionalEnvQuotes(raw);
  const lowered = normalized.toLowerCase();
  if (
    !lowered.startsWith("postgresql://") &&
    !lowered.startsWith("postgres://")
  ) {
    return "invalid";
  }
  if (lowered.includes("-pooler.")) return "pooled_postgresql";
  return "direct_postgresql";
}

function fail(reason: string, sqlState: string | null = null): never {
  console.log(
    JSON.stringify({
      overall: "FAIL",
      reason,
      sql_state: sqlState,
    }),
  );
  process.exit(1);
}

async function main() {
  const env = process.env;
  const mode = statSync(MASTER_PATH).mode & 0o777;
  const contract = validateFlyVerifyLiveQaEnvContract(env);
  const dbClass = classifyDatabaseUrlSafe(env.DATABASE_URL);
  const normalizedEnv =
    typeof env.DATABASE_URL === "string"
      ? {
          ...env,
          DATABASE_URL: stripOptionalEnvQuotes(env.DATABASE_URL),
        }
      : env;

  console.log(
    JSON.stringify({
      credential_master_mode: mode.toString(8).padStart(4, "0"),
      credential_key_count: FLY_VERIFY_LIVE_QA_SECRET_KEYS.length,
      env_contract_ok: contract.ok,
      database_url_class: dbClass,
    }),
  );

  if (mode !== 0o600) fail("credential_master_mode_not_0600");
  if (!contract.ok) fail(`env_contract_${contract.failClass}`);
  if (dbClass !== "pooled_postgresql") fail(`database_url_class_${dbClass}`);

  const connectionString = readConfiguredHeadlessDatabaseUrl(normalizedEnv);
  if (connectionString == null) fail("database_url_missing");

  const sql = createNeonSqlExecutor({ connectionString });
  let preflight;
  try {
    preflight = await runHeadlessSchemaPreflight({ sql });
  } catch (error) {
    fail("preflight_exception", extractHeadlessPgSqlState(error));
  }

  if (!preflight.ok) {
    fail(preflight.code);
  }

  const embedded = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations;
  const ledgerIds = preflight.fingerprint.migrationIds;
  const ledgerChecksums = preflight.fingerprint.checksums;
  if (ledgerIds.length !== 7) fail("migration_ledger_count_not_seven");
  if (embedded.length !== 7) fail("embedded_fingerprint_count_not_seven");

  for (let i = 0; i < embedded.length; i += 1) {
    const entry = embedded[i]!;
    if (ledgerIds[i] !== entry.migrationId) {
      fail("migration_ledger_order_mismatch");
    }
    if (ledgerChecksums[i] !== entry.checksumSha256) {
      fail("migration_checksum_drift");
    }
  }

  const migration007 = embedded.find((m) => m.migrationId === MIGRATION_007_ID);
  if (migration007 == null) fail("migration_007_missing_from_embedded");
  if (migration007.checksumSha256 !== MIGRATION_007_CHECKSUM) {
    fail("migration_007_checksum_mismatch");
  }

  if (HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH !== 1024) {
    fail("slot_key_capacity_constant_not_1024");
  }

  console.log(
    JSON.stringify({
      overall: "PASS",
      connection: "ok",
      migration_ledger_count: ledgerIds.length,
      embedded_fingerprint_match: true,
      migration_007_checksum_prefix: MIGRATION_007_CHECKSUM.slice(0, 12),
      slot_key_capacity: HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
      mutation: false,
    }),
  );
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("run-fly-8i6b-schema-preflight-once");
if (isDirectRun) {
  void main().catch(() => fail("unhandled_exception"));
}
