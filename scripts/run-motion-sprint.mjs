#!/usr/bin/env node
/**
 * Sprint 5 Shared Media Motion aggregate suite.
 * Fails fast on the first failing command.
 */
import { spawnSync } from "node:child_process";

const steps = [
  "test:media-motion",
  "test:preview-motion",
  "test:export-motion",
  "test:motion-sprint-freeze",
  "test:scene-video-inspector",
  "test:scene-image-motion",
  "test:timeline-image-motion-qa",
  "test:preview-video-clip",
  "test:export-scene-media-renderer",
  "test:export-fingerprint",
  "test:story-sync-domain",
  "test:story-evolution",
];

console.log("motion-sprint — running Sprint 5 suite\n");

for (const script of steps) {
  console.log(`\n── npm run ${script} ──`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nmotion-sprint FAILED at ${script} (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nmotion-sprint — all steps passed");
