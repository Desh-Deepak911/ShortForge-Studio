/**
 * CLI helper for shell orchestrators — classify secrets JSON file (local/remote).
 * Prints bounded lines only; never secret values.
 * Usage: tsx fly-staging-secrets-json-cli.ts <path-to-json> [list_rc]
 */
import { readFileSync } from "node:fs";

import { parseHeadlessFlyStagingSecretsListJson } from "./fly-staging-secret-activation";

function main(): void {
  const path = process.argv[2];
  const listRc = process.argv[3] ?? "0";
  if (!path) {
    console.log("status=invalid reason=missing_path");
    process.exit(1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.log("status=invalid reason=malformed_secret_list");
    process.exit(1);
  }
  const result = parseHeadlessFlyStagingSecretsListJson(raw, {
    listCommandSucceeded: listRc === "0",
  });
  console.log(`status=${result.status}`);
  console.log(`reason=${result.reasonId}`);
  console.log(`aggregate=${result.aggregateStatus ?? "null"}`);
  console.log(`runtime_ready=${result.runtimeReady ? "true" : "false"}`);
  process.exit(result.status === "ok" ? 0 : 1);
}

main();
