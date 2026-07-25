/**
 * Sprint 11E Phase 2E.2D.8F.6 — claimed-render diagnostic image classification.
 */

import manifest from "./claimed-render-diagnostic-build-manifest.json";

export const HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS =
  "claimed_render_diagnostic" as const;

export type HeadlessClaimedRenderDiagnosticImageClass =
  typeof HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS;

export type HeadlessClaimedRenderDiagnosticBuildManifest = {
  readonly imageClass: HeadlessClaimedRenderDiagnosticImageClass;
  readonly canStartConsumerLoop: false;
  readonly deployable: false;
  readonly providerAccess: false;
  readonly publicService: false;
  readonly entry: string;
  readonly outfile: string;
  readonly pageArtifact: string;
  readonly workerArtifactLineage: string;
  readonly target: string;
  readonly nodeMajor: 24;
  readonly sourcemap: false;
  readonly artifactFormat: string;
  readonly artifactVersion: number;
  readonly note: string;
};

export function buildHeadlessClaimedRenderDiagnosticBuildManifest(): HeadlessClaimedRenderDiagnosticBuildManifest {
  if (manifest.imageClass !== HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS) {
    throw new Error("CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS_MISMATCH");
  }
  return Object.freeze({
    imageClass: HEADLESS_CLAIMED_RENDER_DIAGNOSTIC_IMAGE_CLASS,
    canStartConsumerLoop: false,
    deployable: false,
    providerAccess: false,
    publicService: false,
    entry: manifest.entry,
    outfile: manifest.outfile,
    pageArtifact: manifest.pageArtifact,
    workerArtifactLineage: manifest.workerArtifactLineage,
    target: manifest.target,
    nodeMajor: 24,
    sourcemap: false,
    artifactFormat: manifest.artifactFormat,
    artifactVersion: manifest.artifactVersion,
    note: manifest.note,
  });
}

export function serializeHeadlessClaimedRenderDiagnosticBuildManifest(
  m: HeadlessClaimedRenderDiagnosticBuildManifest = buildHeadlessClaimedRenderDiagnosticBuildManifest(),
): string {
  return `${JSON.stringify(
    {
      imageClass: m.imageClass,
      canStartConsumerLoop: m.canStartConsumerLoop,
      deployable: m.deployable,
      providerAccess: m.providerAccess,
      publicService: m.publicService,
      entry: m.entry,
      outfile: m.outfile,
      pageArtifact: m.pageArtifact,
      workerArtifactLineage: m.workerArtifactLineage,
      target: m.target,
      nodeMajor: m.nodeMajor,
      sourcemap: m.sourcemap,
      artifactFormat: m.artifactFormat,
      artifactVersion: m.artifactVersion,
      note: m.note,
    },
    null,
    2,
  )}\n`;
}

export function assertClaimedRenderDiagnosticImageManifest(
  m: HeadlessClaimedRenderDiagnosticBuildManifest = buildHeadlessClaimedRenderDiagnosticBuildManifest(),
): void {
  if (m.imageClass !== "claimed_render_diagnostic") {
    throw new Error("CLAIMED_RENDER_DIAGNOSTIC_CLASS_INVALID");
  }
  if (m.deployable !== false || m.canStartConsumerLoop !== false) {
    throw new Error("CLAIMED_RENDER_DIAGNOSTIC_MUST_NOT_BE_DEPLOYABLE");
  }
  if (m.providerAccess !== false || m.publicService !== false) {
    throw new Error("CLAIMED_RENDER_DIAGNOSTIC_PROVIDER_ACCESS_FORBIDDEN");
  }
  if (m.nodeMajor !== 24 || m.target !== "node24") {
    throw new Error("CLAIMED_RENDER_DIAGNOSTIC_NODE24_REQUIRED");
  }
  if (m.sourcemap !== false) {
    throw new Error("CLAIMED_RENDER_DIAGNOSTIC_SOURCEMAP_FORBIDDEN");
  }
}
