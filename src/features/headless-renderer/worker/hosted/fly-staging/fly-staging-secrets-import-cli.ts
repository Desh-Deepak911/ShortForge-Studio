#!/usr/bin/env npx tsx
/**
 * Emit decoded Fly secrets import stream to stdout.
 * Reads exact-nine secret names from the process environment after bridge load.
 * Never prints values to stderr; bounded reason ids only.
 */
import { HEADLESS_FLY_STAGING_SECRET_NAMES } from "./fly-staging-env-ledger";
import { buildHeadlessFlyStagingSecretsImportStream } from "./fly-staging-secrets-import-stream";

function main(): void {
  const record: Record<string, string> = {};
  for (const name of HEADLESS_FLY_STAGING_SECRET_NAMES) {
    const value = process.env[name];
    if (typeof value !== "string") {
      process.stderr.write(`fail_class=decoded_secret_missing name=${name}\n`);
      process.exit(1);
    }
    record[name] = value;
  }
  const built = buildHeadlessFlyStagingSecretsImportStream(record);
  if (built.status !== "ok" || built.stream == null) {
    process.stderr.write(`fail_class=secrets_import_stream_invalid reason=${built.reasonId}\n`);
    process.exit(1);
  }
  process.stdout.write(built.stream);
}

main();
