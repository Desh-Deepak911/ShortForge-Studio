#!/usr/bin/env -S npx tsx
/**
 * Bridge rollout credential CLI — validates master files and derives ephemeral bridges.
 * Never prints secret values.
 */

import { chmodSync, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  classifyBridgeRolloutCredentialSurfaceCoherence,
  classifyPooledUrlCannotApplyMigrations,
  deriveHostedWorkerBridgeLinesFromQaMaster,
  deriveQaProbeBridgeLinesFromQaMaster,
  FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS,
  parseEnvFileAssignments,
  formatEnvAssignment,
  validateBridgeRolloutQaMasterFile,
  validateMigrationMasterFile,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-bridge-rollout-credential-authority";

const QA_MASTER = process.env.FLY_STAGING_BRIDGE_ROLLOUT_QA_MASTER_PATH
  ?? "/tmp/shortforge-fly-verify-qa.master.env";
const MIGRATE_MASTER = process.env.FLY_STAGING_BRIDGE_ROLLOUT_MIGRATE_MASTER_PATH
  ?? "/tmp/shortforge-neon-migrate.master.env";

function die(failClass: string, code = 1): never {
  console.log(`fail_class=${failClass}`);
  process.exit(code);
}

function readMode(path: string): string {
  return (statSync(path).mode & 0o777).toString(8);
}

function readBody(path: string): string {
  return readFileSync(path, "utf8");
}

function writeBridge(path: string, lines: readonly string[]): void {
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "validate-qa-master": {
    if (!existsSync(QA_MASTER)) die("master_not_regular_file");
    const body = readBody(QA_MASTER);
    const result = validateBridgeRolloutQaMasterFile({
      body,
      modeOctal: readMode(QA_MASTER),
    });
    if (!result.ok) die(result.failClass);
    console.log("qa_master_validation=PASS");
    console.log("qa_key_count=11");
    console.log("rest_keys_legal_in_qa_master=true");
    break;
  }
  case "validate-migration-master": {
    const exists = existsSync(MIGRATE_MASTER);
    const result = validateMigrationMasterFile({
      exists,
      body: exists ? readBody(MIGRATE_MASTER) : "",
      modeOctal: exists ? readMode(MIGRATE_MASTER) : "",
    });
    if (!result.ok) {
      if (result.failClass === "migration_master_missing") {
        console.log("BLOCKED_MIGRATION_MASTER_MISSING");
      }
      die(result.failClass);
    }
    console.log("migration_master_validation=PASS");
    console.log("migration_key_count=1");
    console.log("migration_endpoint_class=direct_non_pooler");
    break;
  }
  case "validate-surfaces": {
    if (!existsSync(QA_MASTER)) die("master_not_regular_file");
    const qaBody = readBody(QA_MASTER);
    const qa = validateBridgeRolloutQaMasterFile({
      body: qaBody,
      modeOctal: readMode(QA_MASTER),
    });
    if (!qa.ok) die(qa.failClass);
    const workerLines = deriveHostedWorkerBridgeLinesFromQaMaster(qaBody);
    const migrateExists = existsSync(MIGRATE_MASTER);
    const migrate = validateMigrationMasterFile({
      exists: migrateExists,
      body: migrateExists ? readBody(MIGRATE_MASTER) : "",
      modeOctal: migrateExists ? readMode(MIGRATE_MASTER) : "",
    });
    if (!migrate.ok) {
      if (migrate.failClass === "migration_master_missing") {
        console.log("BLOCKED_MIGRATION_MASTER_MISSING");
      }
      die(migrate.failClass);
    }
    const coherence = classifyBridgeRolloutCredentialSurfaceCoherence({
      qaMasterBody: qaBody,
      workerBridgeLines: workerLines,
    });
    if (!coherence.ok) die(coherence.failClass);
    const pooled = classifyPooledUrlCannotApplyMigrations(qaBody);
    if (!pooled.ok) die(pooled.failClass);
    console.log("credential_surfaces=PASS");
    console.log(`app_name_pin=${FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME}`);
    console.log(`env_name_pin=${FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_ENV_NAME}`);
    break;
  }
  case "materialize-worker-bridge": {
    const outPath = args[0];
    if (typeof outPath !== "string" || outPath.length === 0) die("hostile_input");
    if (!existsSync(QA_MASTER)) die("master_not_regular_file");
    const qaBody = readBody(QA_MASTER);
    const qa = validateBridgeRolloutQaMasterFile({
      body: qaBody,
      modeOctal: readMode(QA_MASTER),
    });
    if (!qa.ok) die(qa.failClass);
    const lines = deriveHostedWorkerBridgeLinesFromQaMaster(qaBody);
    const coherence = classifyBridgeRolloutCredentialSurfaceCoherence({
      qaMasterBody: qaBody,
      workerBridgeLines: lines,
    });
    if (!coherence.ok) die(coherence.failClass);
    writeBridge(outPath, lines);
    console.log("worker_bridge_materialized=PASS");
    console.log("worker_bridge_key_count=9");
    break;
  }
  case "materialize-qa-probe-env": {
    const outPath = args[0];
    if (typeof outPath !== "string" || outPath.length === 0) die("hostile_input");
    if (!existsSync(QA_MASTER)) die("master_not_regular_file");
    const qaBody = readBody(QA_MASTER);
    const qa = validateBridgeRolloutQaMasterFile({
      body: qaBody,
      modeOctal: readMode(QA_MASTER),
    });
    if (!qa.ok) die(qa.failClass);
    const lines = [
      ...deriveQaProbeBridgeLinesFromQaMaster(qaBody),
      `HEADLESS_ENV_NAME=${FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_ENV_NAME}`,
      `HEADLESS_FLY_STAGING_APP_NAME=${FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME}`,
    ];
    writeBridge(outPath, lines);
    console.log("qa_probe_env_materialized=PASS");
    console.log("qa_probe_key_count=11");
    console.log("public_pins_materialized=PASS");
    break;
  }
  case "materialize-neon-read-env": {
    const outPath = args[0];
    if (typeof outPath !== "string" || outPath.length === 0) die("hostile_input");
    if (!existsSync(QA_MASTER)) die("master_not_regular_file");
    const qaBody = readBody(QA_MASTER);
    const qa = validateBridgeRolloutQaMasterFile({
      body: qaBody,
      modeOctal: readMode(QA_MASTER),
    });
    if (!qa.ok) die(qa.failClass);
    const databaseUrl = parseEnvFileAssignments(qaBody).find(
      (entry) => entry.key === "DATABASE_URL",
    )?.value;
    if (databaseUrl == null || databaseUrl.length === 0) die("pooled_url_unreadable");
    writeBridge(outPath, [formatEnvAssignment("DATABASE_URL", databaseUrl)]);
    console.log("neon_read_bridge_materialized=PASS");
    break;
  }
  case "cleanup": {
    for (const path of args) {
      if (typeof path === "string" && path.length > 0 && existsSync(path)) {
        unlinkSync(path);
      }
    }
    console.log("ephemeral_cleanup=PASS");
    break;
  }
  case "run-migration": {
    if (!existsSync(MIGRATE_MASTER)) die("migration_master_missing");
    const body = readBody(MIGRATE_MASTER);
    const validated = validateMigrationMasterFile({
      exists: true,
      body,
      modeOctal: readMode(MIGRATE_MASTER),
    });
    if (!validated.ok) die(validated.failClass);
    const assignments = parseEnvFileAssignments(body);
    const unpooled = assignments.find((entry) => entry.key === "DATABASE_URL_UNPOOLED")?.value;
    if (unpooled == null || unpooled.length === 0) die("migration_master_empty_value");
    if (process.env.HEADLESS_NEON_MIGRATE !== "1") die("migration_gate_blocked");
    const result = spawnSync("npm", ["run", "migrate:headless-neon"], {
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        DATABASE_URL_UNPOOLED: unpooled,
        HEADLESS_NEON_MIGRATE: "1",
        DATABASE_URL: "",
      },
      stdio: "inherit",
    });
    if ((result.status ?? 1) !== 0) die("migration_apply_failed");
    console.log("migration_apply=PASS");
    break;
  }
  default:
    die("hostile_input");
}
