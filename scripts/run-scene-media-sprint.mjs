#!/usr/bin/env node
/**
 * Sprint 8E — deterministic Scene Media sprint aggregate suite.
 * Fail-fast. No network required for semantic steps.
 */
import { spawnSync } from "node:child_process";

const steps = [
  "typecheck",
  "test:scene-media-timeline-domain",
  "test:scene-media-timeline-ui",
  "test:scene-media-item-inspector",
  "test:scene-media-preview",
  "test:scene-media-export",
  "test:scene-media-sprint-golden",
  "test:scene-media-local-evidence",
  "test:scene-media",
  "test:media-playback",
  "test:story-patch-classifier",
  "test:drafts",
  "test:draft-reload-qa",
  "test:timeline-foundation-qa",
  "test:export-manifest",
  "test:export-manifest-renderer",
  "test:export-scene-media-renderer",
  "test:export-capability-audit",
  "test:export-golden-matrix",
  "test:export-golden-parity",
  "test:export-final-artifact",
  "test:hook-sprint",
];

console.log("scene-media-sprint — running Sprint 8E deterministic suite\n");

for (const script of steps) {
  console.log(`\n── npm run ${script} ──`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(
      `\nscene-media-sprint FAILED at ${script} (exit ${result.status ?? 1})`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log("\nscene-media-sprint — all deterministic steps passed");
console.log(
  "Sprint 8 frozen — local Preview / WebM / editor Pass recorded in docs/qa/scene-media-local-results.md.",
);
