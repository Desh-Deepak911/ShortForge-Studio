/**
 * Sprint 11E Phase 2E.2D.8K.2.1 — sampler-only Fly preflight entrypoint.
 * Run: npm run test:headless-fly-render-4k-process-tree-sampler-preflight
 */

import { runFlyRender4kProcessTreeSamplerPreflight } from "../fly-render-4k-capacity/run-fly-render-4k-process-tree-sampler-preflight";

async function main() {
  const result = await runFlyRender4kProcessTreeSamplerPreflight();
  console.log(
    `\n4K sampler preflight: ${result.overall}` +
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
