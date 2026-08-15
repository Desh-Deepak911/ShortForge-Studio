/**
 * Seed owned assets + create a queued headless job for the local worker.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";

import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
  type HeadlessTestControlPlaneStack,
} from "../../control-plane/testing";
import { headlessSourceDigest, type HeadlessRendererProfile } from "../../domain";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "../../control-plane/types/control-plane.types";
import type { HeadlessCreateJobTransportV1 } from "../../control-plane/types/control-plane.types";
import type { HeadlessReferenceFixture } from "./build-reference-fixture";
import {
  createTestLocalHeadlessWorkerRunner,
  type LocalHeadlessWorkerTestHooks,
} from "./create-test-local-worker-runner";
import type { LocalHeadlessWorkerRunner } from "../runtime/local-worker-runner";
import {
  HEADLESS_WORKER_RENDERER_BUILD_ID,
  type HeadlessWorkerLimits,
} from "../runtime/worker-types";

export async function seedAndCreateReferenceJob(input: {
  fixture: HeadlessReferenceFixture;
  manifest?: ExportManifest;
  ownerId?: string;
  idempotencyKey?: string;
  clockMs?: number;
  rendererProfile?: HeadlessRendererProfile;
  workerLimits?: Partial<HeadlessWorkerLimits>;
  testHooks?: LocalHeadlessWorkerTestHooks;
}): Promise<{
  stack: HeadlessTestControlPlaneStack;
  worker: LocalHeadlessWorkerRunner;
  jobId: string;
  ownerId: string;
}> {
  const clock = input.clockMs ?? 1_700_000_000_000;
  const manifest = input.manifest ?? input.fixture.manifestV3;
  const ownerId = input.ownerId ?? "owner-11d";
  const projectId = manifest.project.projectId;

  const stack = composeTestHeadlessControlPlane({
    principal: {ownerId,
      sessionId: "sess-11d",
    },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
    nowMs: () => clock,
    workerMode: "noop",
  });

  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: clock,
    leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
    assetByteFactory: (slot) => {
      for (const [url, bytes] of input.fixture.assetBytesByUrl) {
        if (headlessSourceDigest(url) === slot.sourceDigest) {
          return bytes;
        }
      }
      throw new Error(`No fixture bytes for slot ${slot.role}`);
    },
    mimeForSlot: (slot) => {
      for (const [url, mimeType] of input.fixture.assetMimeByUrl) {
        if (headlessSourceDigest(url) === slot.sourceDigest) {
          return mimeType;
        }
      }
      throw new Error(`No fixture MIME for slot ${slot.role}`);
    },
  });
  if (!seeded.ok) {
    throw new Error(`Seed failed: ${seeded.issues[0]?.message}`);
  }

  const rendererProfile: HeadlessRendererProfile =
    input.rendererProfile ??
    input.fixture.rendererProfile ?? {
      resolution:
        manifest.output.resolution === "1080p" ? "1080p" : "720p",
      format: manifest.output.format === "mp4" ? "mp4" : "webm",
      fps: 30,
      quality: manifest.output.quality,
    };

  const transport: HeadlessCreateJobTransportV1 = {
    version: 1,
    projectId,
    manifestObject: seeded.value.manifestLocator,
    manifestPayloadDigest: seeded.value.manifestPayloadDigest,
    assetBundleObject: seeded.value.bundleLocator,
    assetBundleFingerprint: seeded.value.bundle.fingerprint,
    rendererProfile,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    idempotencyKey: input.idempotencyKey ?? "idem-11d-ref",
  };

  const created = await stack.service.createJob({
    requestContext: {},
    rawBodyText: JSON.stringify(transport),
    body: transport,
  });
  if (!created.ok) {
    throw new Error(`Create failed: ${created.issues[0]?.message}`);
  }

  const worker = createTestLocalHeadlessWorkerRunner({
    jobStore: stack.jobStore,
    queue: stack.queue,
    storage: stack.storage,
    artifactCleanup: stack.artifactCleanup,
    nowMs: () => clock,
    limits: input.workerLimits,
    testHooks: input.testHooks,
  });

  return { stack, worker, jobId: created.value.jobId, ownerId };
}
