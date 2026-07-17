#!/usr/bin/env node
/**
 * Sprint 9D — Intra-scene transition sprint aggregate suite.
 * Fail-fast. Stops on first failed step with non-zero exit.
 */
import { spawnSync } from "node:child_process";

const steps = [
  "typecheck",
  "test:intra-scene-transition-domain",
  "test:intra-scene-transition-editor",
  "test:intra-scene-transition-preview",
  "test:intra-scene-transition-export",
  "test:intra-scene-transition-golden",
  "test:intra-scene-transition-local-evidence",
  "test:scene-media-sprint",
  "test:export-manifest",
  "test:export-manifest-renderer",
  "test:export-scene-media-renderer",
  "test:export-capability-audit",
  "test:export-final-artifact",
  "test:export-caption-layout",
  "test:export-caption-opacity",
  "test:export-audio-policy",
  "test:export-canonical-timing",
  "test:hook-sprint",
];

console.log("intra-scene-transition-sprint — running Sprint 9D deterministic suite\n");

for (const script of steps) {
  console.log(`\n── npm run ${script} ──`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(
      `\nintra-scene-transition-sprint FAILED at ${script} (exit ${result.status ?? 1})`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log("\nintra-scene-transition-sprint — all deterministic steps passed");
console.log(
  "SPRINT 9 GOLDEN QA: COMPLETE — freeze awaits local Preview / 720p WebM / editor sign-off.",
);
