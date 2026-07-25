/**
 * Build-time embed of exact buildHeadlessReferenceFixture silent/720p/2000ms bytes.
 * Verification-only generator — not imported by production barrels.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { buildClaimedRenderDiagnosticSmokeBoundary } from "@/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-diagnostic-smoke-boundary";

const OUT = join(
  process.cwd(),
  "src/features/headless-renderer/worker/claimed-render-diagnostic/claimed-render-probe-fixture.embed.json",
);

const smoke = buildClaimedRenderDiagnosticSmokeBoundary();
const fixture = buildHeadlessReferenceFixture({
  audioMode: "silent",
  durationMs: smoke.contentDurationMs,
  rendererProfile: smoke.rendererProfile,
});

const assetEntries: Array<[string, string]> = [];
for (const [url, bytes] of fixture.assetBytesByUrl) {
  assetEntries.push([url, Buffer.from(bytes).toString("base64")]);
}

const payload = {
  profileId: smoke.profileId,
  contentDurationMs: smoke.contentDurationMs,
  rendererProfile: fixture.rendererProfile,
  manifest: fixture.manifestV3,
  assetsBase64: assetEntries,
  manifestFingerprint: fixture.manifestV3.fingerprint,
};

mkdirSync(join(process.cwd(), "src/features/headless-renderer/worker/claimed-render-diagnostic"), {
  recursive: true,
});
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`embedded probe fixture → ${OUT}`);
