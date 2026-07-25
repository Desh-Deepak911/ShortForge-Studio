/**
 * Sprint 11E Phase 2E.2D.8K.3.1 — sampler lifecycle preflight entrypoint.
 */

import { runHosted4kDetachedSamplerLifecyclePreflight } from "./fly-render-4k-capacity/hosted-render-machine-process-tree-lifecycle";

async function main() {
  const result = await runHosted4kDetachedSamplerLifecyclePreflight();
  console.log(
    `\n4K sampler lifecycle preflight: ${result.overall}` +
      ` samples=${result.sampleCount}` +
      ` duration_ms=${result.observationDurationMs ?? "n/a"}` +
      ` avg_interval_ms=${result.averageIntervalMs ?? "n/a"}` +
      ` max_gap_ms=${result.maximumObservedGapMs ?? "n/a"}` +
      ` peak_rss_bytes=${result.peakProcessTreeRssBytes ?? "n/a"}` +
      (result.failClass != null ? ` fail=${result.failClass}` : "") +
      `\n`,
  );
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
