/**
 * Hosted worker image classification — Phase 2E.2C.2.
 * Discriminated build manifest: foundation_image | deployable_worker.
 * Transition to deployable_worker only when packaging is complete.
 */

import hostedManifest from "./hosted-build-manifest.json";

/** Supported hosted Node major — image + esbuild target authority. */
export const HEADLESS_HOSTED_NODE_MAJOR = 24 as const;

/** EOL majors that must never appear in hosted build/image authority. */
export const HEADLESS_HOSTED_REJECTED_NODE_MAJORS = Object.freeze([
  16, 18, 20,
] as const);

export type HeadlessHostedImageClass = "foundation_image" | "deployable_worker";

export const HEADLESS_HOSTED_IMAGE_CLASS =
  hostedManifest.imageClass as HeadlessHostedImageClass;

export const HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES = Object.freeze(
  hostedManifest.unresolvedDynamicModules as readonly string[],
);

export const HEADLESS_HOSTED_UNRESOLVED_COMPOSITION_SEAMS = Object.freeze(
  hostedManifest.unresolvedCompositionSeams as readonly string[],
);

type HostedManifestCommon = {
  readonly entry: string;
  readonly outfile: string;
  readonly pageArtifact: string;
  readonly target: string;
  readonly nodeMajor: number;
  readonly sourcemap: false;
  readonly artifactFormat: string;
  readonly artifactVersion: number;
  readonly unresolvedDynamicModules: readonly string[];
  readonly unresolvedCompositionSeams: readonly string[];
  readonly note: string;
};

export type HeadlessHostedFoundationManifest = HostedManifestCommon & {
  readonly imageClass: "foundation_image";
  readonly canStartConsumerLoop: false;
  readonly deployable: false;
};

export type HeadlessHostedDeployableManifest = HostedManifestCommon & {
  readonly imageClass: "deployable_worker";
  readonly canStartConsumerLoop: true;
  readonly deployable: true;
};

export type HeadlessHostedBuildManifest =
  | HeadlessHostedFoundationManifest
  | HeadlessHostedDeployableManifest;

function readCommon(): HostedManifestCommon {
  return {
    entry: hostedManifest.entry,
    outfile: hostedManifest.outfile,
    pageArtifact: hostedManifest.pageArtifact,
    target: hostedManifest.target,
    nodeMajor: hostedManifest.nodeMajor,
    sourcemap: false,
    artifactFormat: hostedManifest.artifactFormat,
    artifactVersion: hostedManifest.artifactVersion,
    unresolvedDynamicModules: [
      ...hostedManifest.unresolvedDynamicModules,
    ],
    unresolvedCompositionSeams: [
      ...hostedManifest.unresolvedCompositionSeams,
    ],
    note: hostedManifest.note,
  };
}

/** @deprecated Prefer buildHeadlessHostedBuildManifest — kept for callers. */
export function buildHeadlessHostedFoundationManifest(): HeadlessHostedBuildManifest {
  return buildHeadlessHostedBuildManifest();
}

export function buildHeadlessHostedBuildManifest(): HeadlessHostedBuildManifest {
  const common = readCommon();
  if (hostedManifest.imageClass === "deployable_worker") {
    return Object.freeze({
      ...common,
      imageClass: "deployable_worker",
      canStartConsumerLoop: true,
      deployable: true,
    });
  }
  return Object.freeze({
    ...common,
    imageClass: "foundation_image",
    canStartConsumerLoop: false,
    deployable: false,
  });
}

/** Stable JSON for BUILD_INFO.json — no wall-clock fields. */
export function serializeHeadlessHostedBuildManifest(
  manifest: HeadlessHostedBuildManifest = buildHeadlessHostedBuildManifest(),
  schemaFingerprint?: {
    readonly version: number;
    readonly migrations: readonly {
      readonly migrationId: string;
      readonly checksumSha256: string;
    }[];
  },
): string {
  const ordered: Record<string, unknown> = {
    imageClass: manifest.imageClass,
    canStartConsumerLoop: manifest.canStartConsumerLoop,
    deployable: manifest.deployable,
    entry: manifest.entry,
    outfile: manifest.outfile,
    pageArtifact: manifest.pageArtifact,
    target: manifest.target,
    nodeMajor: manifest.nodeMajor,
    sourcemap: manifest.sourcemap,
    artifactFormat: manifest.artifactFormat,
    artifactVersion: manifest.artifactVersion,
    unresolvedDynamicModules: [...manifest.unresolvedDynamicModules],
    unresolvedCompositionSeams: [...manifest.unresolvedCompositionSeams],
  };
  if (schemaFingerprint != null) {
    ordered.schemaFingerprint = {
      version: schemaFingerprint.version,
      migrations: schemaFingerprint.migrations.map((m) => ({
        migrationId: m.migrationId,
        checksumSha256: m.checksumSha256,
      })),
    };
  }
  ordered.note = manifest.note;
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function assertFoundationImageNotDeployable(
  manifest: HeadlessHostedBuildManifest,
): void {
  if (manifest.imageClass !== "foundation_image") {
    throw new Error("HOSTED_IMAGE_CLASS_MISMATCH");
  }
  if (manifest.deployable !== false) {
    throw new Error("FOUNDATION_IMAGE_MUST_NOT_BE_DEPLOYABLE");
  }
  if (manifest.canStartConsumerLoop !== false) {
    throw new Error("FOUNDATION_IMAGE_MUST_NOT_START_CONSUMER");
  }
  if (manifest.unresolvedDynamicModules.length === 0) {
    throw new Error("FOUNDATION_IMAGE_MUST_LIST_DYNAMIC_MODULES");
  }
}

export function assertDeployableWorkerImage(
  manifest: HeadlessHostedBuildManifest,
): void {
  if (manifest.imageClass !== "deployable_worker") {
    throw new Error("HOSTED_IMAGE_CLASS_NOT_DEPLOYABLE_WORKER");
  }
  if (manifest.deployable !== true) {
    throw new Error("DEPLOYABLE_WORKER_MUST_BE_DEPLOYABLE");
  }
  if (manifest.canStartConsumerLoop !== true) {
    throw new Error("DEPLOYABLE_WORKER_MUST_ALLOW_CONSUMER_LOOP");
  }
  if (manifest.nodeMajor !== HEADLESS_HOSTED_NODE_MAJOR) {
    throw new Error("DEPLOYABLE_WORKER_NODE_MAJOR_MISMATCH");
  }
  if (manifest.target !== `node${HEADLESS_HOSTED_NODE_MAJOR}`) {
    throw new Error("DEPLOYABLE_WORKER_TARGET_MISMATCH");
  }
  if (manifest.sourcemap !== false) {
    throw new Error("DEPLOYABLE_WORKER_SOURCEMAP_FORBIDDEN");
  }
  if (manifest.unresolvedDynamicModules.length !== 0) {
    throw new Error("DEPLOYABLE_WORKER_HAS_UNRESOLVED_DYNAMIC_MODULES");
  }
  if (manifest.unresolvedCompositionSeams.length !== 0) {
    throw new Error("DEPLOYABLE_WORKER_HAS_UNRESOLVED_COMPOSITION_SEAMS");
  }
  if (
    HEADLESS_HOSTED_REJECTED_NODE_MAJORS.includes(
      manifest.nodeMajor as 16 | 18 | 20,
    )
  ) {
    throw new Error("DEPLOYABLE_WORKER_REJECTED_EOL_NODE");
  }
}
