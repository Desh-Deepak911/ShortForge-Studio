/**
 * Variant B — exact execution-probe smoke fixture (embedded JSON beside bundle).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExportManifestV3 } from "@/features/export/domain/headless-safe";

import type { HeadlessRendererProfile } from "../../domain";

import type { ClaimedRenderDiagnosticFixturePack } from "./claimed-render-diagnostic-fixture-minimal";

type EmbeddedProbeFixture = {
  readonly profileId: string;
  readonly contentDurationMs: number;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly manifest: ExportManifestV3;
  readonly assetsBase64: readonly (readonly [string, string])[];
  readonly manifestFingerprint: string;
};

function resolveEmbedPath(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string {
  const explicit = (env as Record<string, unknown>)
    .HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_ROOT;
  if (typeof explicit === "string" && explicit.length > 0) {
    return join(explicit, "claimed-render-probe-fixture.embed.json");
  }
  return join(process.cwd(), "claimed-render-probe-fixture.embed.json");
}

export function loadEmbeddedProbeFixture(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): EmbeddedProbeFixture {
  const path = resolveEmbedPath(env);
  if (!existsSync(path)) {
    throw new Error("embedded_probe_fixture_absent");
  }
  return JSON.parse(readFileSync(path, "utf8")) as EmbeddedProbeFixture;
}

export function buildClaimedRenderDiagnosticLiveSmokeFixture(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): ClaimedRenderDiagnosticFixturePack {
  const frozen = loadEmbeddedProbeFixture(env);
  const assetBytesByUrl = new Map<string, Uint8Array>();
  for (const [url, b64] of frozen.assetsBase64) {
    assetBytesByUrl.set(url, new Uint8Array(Buffer.from(b64, "base64")));
  }
  if (frozen.manifest.fingerprint !== frozen.manifestFingerprint) {
    throw new Error("embedded_probe_fixture_fingerprint_mismatch");
  }
  return Object.freeze({
    manifest: frozen.manifest,
    assetBytesByUrl,
    rendererProfile: frozen.rendererProfile,
    contentDurationMs: frozen.contentDurationMs,
    profileId: frozen.profileId,
  });
}

export function readEmbeddedProbeFixtureFingerprint(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string {
  return loadEmbeddedProbeFixture(env).manifestFingerprint;
}
