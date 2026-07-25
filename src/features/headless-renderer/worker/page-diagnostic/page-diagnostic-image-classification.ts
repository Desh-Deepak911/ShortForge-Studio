/**
 * Sprint 11E Phase 2E.2D.8F.3 — page diagnostic image classification.
 */

import manifest from "./page-diagnostic-build-manifest.json";

export const HEADLESS_PAGE_DIAGNOSTIC_IMAGE_CLASS =
  "page_diagnostic" as const;

export type HeadlessPageDiagnosticImageClass =
  typeof HEADLESS_PAGE_DIAGNOSTIC_IMAGE_CLASS;

export type HeadlessPageDiagnosticBuildManifest = {
  readonly imageClass: HeadlessPageDiagnosticImageClass;
  readonly canStartConsumerLoop: false;
  readonly deployable: false;
  readonly providerAccess: false;
  readonly publicService: false;
  readonly entry: string;
  readonly outfile: string;
  readonly pageArtifact: string;
  readonly target: string;
  readonly nodeMajor: 24;
  readonly sourcemap: false;
  readonly artifactFormat: string;
  readonly artifactVersion: number;
  readonly note: string;
};

export function buildHeadlessPageDiagnosticBuildManifest(): HeadlessPageDiagnosticBuildManifest {
  if (manifest.imageClass !== HEADLESS_PAGE_DIAGNOSTIC_IMAGE_CLASS) {
    throw new Error("PAGE_DIAGNOSTIC_IMAGE_CLASS_MISMATCH");
  }
  return Object.freeze({
    imageClass: HEADLESS_PAGE_DIAGNOSTIC_IMAGE_CLASS,
    canStartConsumerLoop: false,
    deployable: false,
    providerAccess: false,
    publicService: false,
    entry: manifest.entry,
    outfile: manifest.outfile,
    pageArtifact: manifest.pageArtifact,
    target: manifest.target,
    nodeMajor: 24,
    sourcemap: false,
    artifactFormat: manifest.artifactFormat,
    artifactVersion: manifest.artifactVersion,
    note: manifest.note,
  });
}

export function serializeHeadlessPageDiagnosticBuildManifest(
  m: HeadlessPageDiagnosticBuildManifest = buildHeadlessPageDiagnosticBuildManifest(),
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

export function assertPageDiagnosticImageManifest(
  m: HeadlessPageDiagnosticBuildManifest = buildHeadlessPageDiagnosticBuildManifest(),
): void {
  if (m.imageClass !== "page_diagnostic") {
    throw new Error("PAGE_DIAGNOSTIC_CLASS_INVALID");
  }
  if (m.deployable !== false || m.canStartConsumerLoop !== false) {
    throw new Error("PAGE_DIAGNOSTIC_MUST_NOT_BE_DEPLOYABLE");
  }
  if (m.providerAccess !== false || m.publicService !== false) {
    throw new Error("PAGE_DIAGNOSTIC_PROVIDER_ACCESS_FORBIDDEN");
  }
  if (m.nodeMajor !== 24 || m.target !== "node24") {
    throw new Error("PAGE_DIAGNOSTIC_NODE24_REQUIRED");
  }
  if (m.sourcemap !== false) {
    throw new Error("PAGE_DIAGNOSTIC_SOURCEMAP_FORBIDDEN");
  }
}
