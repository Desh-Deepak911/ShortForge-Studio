#!/usr/bin/env node
/**
 * Aggregate export reliability suite (4.2C-8C).
 * Run: npm run test:export-reliability
 */
import { spawnSync } from "node:child_process";

const STEPS = [
  "test:export-manual-capture",
  "test:export-timestamp-normalization",
  "test:export-pipeline-forensics",
  "test:export-capability-audit",
  "test:export-manifest",
  "test:export-capability-preflight",
  "test:export-render-context",
  "test:export-manifest-renderer",
  "test:export-canonical-timing",
  "test:export-chunk-plan",
  "test:export-chunk-renderer",
  "test:export-chunk-encoding",
  "test:export-chunk-concat",
  "test:export-chunk-seams",
  "test:export-ffmpeg-recovery",
  "test:export-audio-policy",
  "test:export-audio-graph",
  "test:export-webm-format",
  "test:export-mp4-format",
  "test:export-end-of-project",
  "test:export-final-artifact",
  "test:export-golden-matrix",
  "test:export-golden-parity",
  "test:export-runtime-codec-probe",
  "test:export-device-qa-contract",
  "test:export-retry-cancellation",
  "test:export-performance-policy",
  "test:export-fallback-ui",
  "test:export-session",
  "test:export-reconfiguration",
  "test:export-resolution-policy",
  "test:export-1080p-capability",
  "test:export-mixed-media-audit",
  "test:export-mixed-media-final",
  "test:export-video-sync",
  "test:export-subtitle-sync",
  "test:export-media-fit",
  "test:export-scene-media-renderer",
  "test:export-motion",
  "test:export-fingerprint",
];

console.log("export-reliability — mixed-media export freeze suite\n");

for (const script of STEPS) {
  console.log(`── npm run ${script} ──\n`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nexport-reliability FAILED at ${script}\n`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nexport-reliability — all steps passed\n");
