/**
 * Variant A — known-good minimal page diagnostic fixture via production path.
 */

import type { ExportManifestV4 } from "@/features/export/domain/headless-safe";

import type { HeadlessRendererProfile } from "../../domain";
import {
  buildPageDiagnosticManifestV3,
  buildPageDiagnosticPngBytes,
  PAGE_DIAGNOSTIC_CONTENT_DURATION_MS,
  PAGE_DIAGNOSTIC_PROFILE_ID,
} from "../page-diagnostic/page-diagnostic-fixture";
import { buildClaimedRenderDiagnosticSmokeBoundary } from "./claimed-render-diagnostic-smoke-boundary";

export type ClaimedRenderDiagnosticFixturePack = {
  readonly manifest: ExportManifestV4;
  readonly assetBytesByUrl: ReadonlyMap<string, Uint8Array>;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly contentDurationMs: number;
  readonly profileId: string;
};

export function buildClaimedRenderDiagnosticMinimalFixture(): ClaimedRenderDiagnosticFixturePack {
  const smoke = buildClaimedRenderDiagnosticSmokeBoundary();
  const manifest = buildPageDiagnosticManifestV3();
  const pngBytes = buildPageDiagnosticPngBytes();
  const scene = manifest.scenes[0];
  const item = scene?.mediaTimeline.items[0];
  if (scene == null || item == null) {
    throw new Error("minimal_fixture_invalid");
  }
  const imageUrl =
    item.media.type === "image" ? item.media.source : "fixture://page-diagnostic/scene-a.png";
  const assetBytesByUrl = new Map<string, Uint8Array>([[imageUrl, pngBytes]]);

  return Object.freeze({
    manifest,
    assetBytesByUrl,
    rendererProfile: {
      ...smoke.rendererProfile,
      quality: "high" as const,
    },
    contentDurationMs: PAGE_DIAGNOSTIC_CONTENT_DURATION_MS,
    profileId: PAGE_DIAGNOSTIC_PROFILE_ID,
  });
}
