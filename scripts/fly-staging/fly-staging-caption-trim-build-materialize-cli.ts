#!/usr/bin/env -S npx tsx
/**
 * Materialize the caption/trim parity build-only Fly config.
 * Never deploys — writes a toml file only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME,
  HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
  materializeHeadlessFlyStagingCaptionTrimToml,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-caption-trim-parity-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";

const [command, outPath, appName] = process.argv.slice(2);

function die(reasonId: string): never {
  console.error(reasonId);
  process.exit(1);
}

switch (command) {
  case "write": {
    if (typeof outPath !== "string" || outPath.length === 0) die("hostile_input");
    if (appName !== HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_APP_NAME) {
      die("wrong_app");
    }
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const templateToml = readFileSync(
      path.join(repoRoot, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
      "utf8",
    );
    const materialized = materializeHeadlessFlyStagingCaptionTrimToml({
      templateToml,
      appName,
    });
    if (
      materialized.status !== "ok" ||
      materialized.toml == null ||
      materialized.rendererBuildId !==
        HEADLESS_FLY_STAGING_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID
    ) {
      die("caption_trim_build_materialize_failed");
    }
    writeFileSync(outPath, materialized.toml, "utf8");
    console.log("caption_trim_build_materialize=PASS");
    break;
  }
  default:
    die("hostile_input");
}
