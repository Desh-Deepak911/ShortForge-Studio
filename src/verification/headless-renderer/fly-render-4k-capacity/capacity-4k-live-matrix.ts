/**
 * Sprint 11E Phase 2E.2D.8K.1 — hosted 4K capacity live matrix (35 cases).
 *
 * Mirrors fly-render-live/live-matrix.ts patterns. The shared prefix (7 cases)
 * adapts render-live's environment/topology checks for the separate 4K gate,
 * frozen render VM shape, and global outbox quiescence. Each of the two 4K
 * profiles (webm/silent, mp4/with-voice-and-music) then runs the same 13
 * job-lifecycle case suffixes render-live already proves, delegating to
 * DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS on a profile-scoped child context so
 * both profiles share Neon/R2/Upstash/Fly wiring but never share a session or
 * projectId. Cross cases (process-tree memory headroom, evidence privacy)
 * close out the run. Stops on first FAIL; remaining cases are NOT_TESTED.
 */

import { randomUUID } from "node:crypto";

import { classifyHeadlessNeonEnvironment } from "@/features/headless-renderer/control-plane";
import { classifyHeadlessR2Environment } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import { classifyHeadlessFlyStagingRenderVmSpec } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";
import {
  HEADLESS_FLY_STAGING_PRIMARY_REGION,
  HEADLESS_FLY_STAGING_RENDER_VM,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";

import {
  DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
} from "../fly-render-live/live-matrix";
import { emptyFlyRenderLiveSession } from "../fly-render-live/types";
import type { FlyRenderLiveMatrixContext } from "../fly-render-live/types";
import type { RequiredFlyRenderLiveCaseId } from "../fly-render-live/required-cases";

import { assertGlobalOutboxQuiescence } from "./capacity-4k-outbox-quiescence";
import {
  verifyCapacity4kDownloadedArtifact,
  type Capacity4kArtifactVerifyFailClass,
} from "./capacity-4k-artifact-verify";
import {
  buildCapacity4kShortFunctionalBoundary,
  type Capacity4kWorkloadBoundary,
} from "./capacity-4k-workload";
import type { Capacity4kProfileId } from "./capacity-4k-profile-audit";
import {
  attributeFlyRender4kCapacityEnvironment,
  isFlyRender4kCapacityConfigAttributionEligible,
  isFlyRender4kCapacityGateEnvironmentEligible,
  validateFlyRender4kCapacityQaEnvContract,
  HEADLESS_FLY_RENDER_4K_QA_GATE_ENV,
} from "./capacity-4k-qa-gate";
import {
  REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS,
  type RequiredFlyRender4kCapacityCaseId,
  type FlyRender4kCapacityFailureCategory,
} from "./capacity-4k-required-cases";
import type { FlyRender4kCapacityCaseEvidence } from "./capacity-4k-evidence";
import {
  createNotTestedFlyRender4kCapacityEvidence,
} from "./capacity-4k-evidence";
import { assertFlyRender4kCapacityEvidencePrivacyStructure } from "./capacity-4k-evidence-privacy-authority";
import {
  evaluateCapacity4kProcessTreeHeadroom,
  type Capacity4kHeadroomEvaluation,
} from "./capacity-4k-headroom-authority";
import type { Hosted4kProcessTreeMemoryObservation } from "./hosted-4k-process-tree-memory-observer";

export type FlyRender4kCapacityCaseRunner = (
  ctx: FlyRenderLiveMatrixContext,
) => Promise<FlyRender4kCapacityCaseEvidence>;

export type Capacity4kLiveMatrixResult = {
  readonly cases: readonly FlyRender4kCapacityCaseEvidence[];
  readonly processTreeObservation: Hosted4kProcessTreeMemoryObservation | null;
  readonly headroomEvaluation: Capacity4kHeadroomEvaluation | null;
};

function pass(
  caseId: RequiredFlyRender4kCapacityCaseId,
): FlyRender4kCapacityCaseEvidence {
  return { caseId, status: "PASS" };
}

function fail(
  caseId: RequiredFlyRender4kCapacityCaseId,
  category: FlyRender4kCapacityFailureCategory,
): FlyRender4kCapacityCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function notTested(
  caseId: RequiredFlyRender4kCapacityCaseId,
): FlyRender4kCapacityCaseEvidence {
  return { caseId, status: "NOT_TESTED" };
}

async function readTopology(ctx: FlyRenderLiveMatrixContext) {
  if (ctx.readFlyTopology != null) return ctx.readFlyTopology();
  return {
    verifyCount: 0,
    renderCount: 0,
    region: "",
    verifyMachineId: null,
    renderMachineId: null,
    verifyImageDigestSha256: null,
    renderImageDigestSha256: null,
  };
}

async function readFullCapacity4kArtifactBytes(
  ctx: FlyRenderLiveMatrixContext,
): Promise<Uint8Array | null> {
  if (
    ctx.session.artifactObjectKey == null ||
    ctx.session.storeId == null ||
    ctx.session.artifactByteLength == null
  ) {
    return null;
  }
  const total = ctx.session.artifactByteLength;
  const bytes = new Uint8Array(total);
  let offset = 0;
  try {
    const stream = ctx.io.streamFullObject({
      locator: {
        storeId: ctx.session.storeId,
        objectKey: ctx.session.artifactObjectKey,
      },
      ownerId: ctx.ownerId,
      maxBytes: total + 1,
    });
    let result = await stream.next();
    while (!result.done) {
      const chunk = result.value;
      if (offset + chunk.byteLength > total) return null;
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
      result = await stream.next();
    }
    if (result.value == null || !result.value.ok || offset !== total) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

function mapArtifactVerifyFailClass(
  failClass: Capacity4kArtifactVerifyFailClass,
): FlyRender4kCapacityFailureCategory {
  switch (failClass) {
    case "wrong_dimensions":
      return "WRONG_DIMENSIONS";
    case "wrong_video_codec":
    case "wrong_container":
    case "wrong_audio_codec":
    case "unexpected_audio_stream":
    case "missing_required_audio_stream":
      return "WRONG_CODEC_CONTAINER";
    default:
      return "ARTIFACT_DOWNLOAD_VERIFY_FAILED";
  }
}

/** Profile-path case suffixes — derived from the frozen case registry, never duplicated. */
const PROFILE_PATH_SUFFIXES: readonly string[] = REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.filter(
  (id) => id.startsWith("4k.webm."),
).map((id) => id.slice("4k.webm.".length));

const PROFILE_FAILURE_CATEGORY: Readonly<
  Record<string, FlyRender4kCapacityFailureCategory>
> = Object.freeze({
  "job.create_queued": "JOB_CREATE_QUEUED_FAILED",
  "dispatch_outbox.intent": "DISPATCH_OUTBOX_INTENT_FAILED",
  "upstash.enqueue_render": "UPSTASH_ENQUEUE_RENDER_FAILED",
  "hosted.render_claim": "HOSTED_RENDER_CLAIM_FAILED",
  "hosted.chromium_execution": "HOSTED_CHROMIUM_EXECUTION_FAILED",
  "hosted.ffmpeg_execution": "HOSTED_FFMPEG_EXECUTION_FAILED",
  "r2.streamed_artifact_upload": "R2_STREAMED_UPLOAD_FAILED",
  "owned_object.finalized": "OWNED_OBJECT_FINALIZED_FAILED",
  "artifact.binding_coherence": "ARTIFACT_BINDING_INCOHERENT",
  "job.succeeded_cas": "JOB_SUCCEEDED_CAS_FAILED",
  "artifact.download_verify": "ARTIFACT_DOWNLOAD_VERIFY_FAILED",
  "replay.idempotent": "REPLAY_NOT_IDEMPOTENT",
  "cleanup.complete": "CLEANUP_FAILED",
});

type Capacity4kProfileDef = {
  readonly prefix: "4k.webm" | "4k.mp4";
  readonly creatorPrefix: string;
  readonly audioMode: "silent" | "with-voice-and-music";
};

const PROFILE_DEFS: readonly Capacity4kProfileDef[] = Object.freeze([
  { prefix: "4k.webm", creatorPrefix: "4k-webm", audioMode: "silent" },
  {
    prefix: "4k.mp4",
    creatorPrefix: "4k-mp4",
    audioMode: "with-voice-and-music",
  },
]);

function profileIdFor(prefix: "4k.webm" | "4k.mp4"): Capacity4kProfileId {
  return prefix === "4k.webm" ? "4k-webm-30" : "4k-mp4-30";
}

function prefixFromProfileId(
  profileId: Capacity4kProfileId,
): "4k.webm" | "4k.mp4" {
  return profileId === "4k-webm-30" ? "4k.webm" : "4k.mp4";
}

/**
 * Single shared implementation for every `${prefix}.${suffix}` profile case.
 * Derives both the caseId and the audio/profile expectations from `ctx` at
 * call time, so the same function instance backs both profile prefixes.
 */
function makeProfileSuffixRunner(suffix: string): FlyRender4kCapacityCaseRunner {
  return async (ctx) => {
    const boundary = ctx.capacity4kBoundary;
    const prefix =
      boundary != null ? prefixFromProfileId(boundary.profileId) : "4k.webm";
    const caseId = `${prefix}.${suffix}` as RequiredFlyRender4kCapacityCaseId;
    const category =
      PROFILE_FAILURE_CATEGORY[suffix] ?? "MATRIX_EXCEPTION";
    try {
      if (suffix === "cleanup.complete") {
        const { defaultFlyRenderLiveCleanup } = await import(
          "../fly-render-live/cleanup"
        );
        const cleanup = await defaultFlyRenderLiveCleanup(ctx, false);
        return cleanup === "ok" ? pass(caseId) : fail(caseId, "CLEANUP_FAILED");
      }
      if (suffix === "artifact.download_verify") {
        const base = await DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS[
          "artifact.download_verify"
        ](ctx);
        if (base.status !== "PASS") {
          return fail(caseId, "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
        }
        if (boundary == null) {
          return fail(caseId, "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
        }
        const bytes = await readFullCapacity4kArtifactBytes(ctx);
        if (bytes == null) {
          return fail(caseId, "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
        }
        const verified = verifyCapacity4kDownloadedArtifact({
          bytes,
          profileId: boundary.profileId,
          expectedContentMs: boundary.contentDurationMs,
          expectedRenderMs: boundary.renderDurationMs,
          audioMode: ctx.capacity4kAudioMode ?? "silent",
        });
        if (!verified.ok) {
          return fail(caseId, mapArtifactVerifyFailClass(verified.failClass));
        }
        return pass(caseId);
      }
      const base = await DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS[
        suffix as RequiredFlyRenderLiveCaseId
      ](ctx);
      return base.status === "PASS" ? pass(caseId) : fail(caseId, category);
    } catch {
      return fail(caseId, category);
    }
  };
}

function reuseLiveSharedCase(
  caseId: RequiredFlyRender4kCapacityCaseId,
  liveCaseId: RequiredFlyRenderLiveCaseId,
  category: FlyRender4kCapacityFailureCategory,
): FlyRender4kCapacityCaseRunner {
  return async (ctx) => {
    try {
      const result = await DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS[liveCaseId](ctx);
      return result.status === "PASS" ? pass(caseId) : fail(caseId, category);
    } catch {
      return fail(caseId, category);
    }
  };
}

const envConfigRunner: FlyRender4kCapacityCaseRunner = async (ctx) => {
  try {
    const contract = validateFlyRender4kCapacityQaEnvContract(ctx.env);
    if (!contract.ok) return fail("env.config", "ENV_CONFIG_FAILED");
    const attribution = attributeFlyRender4kCapacityEnvironment(ctx.env);
    if (!isFlyRender4kCapacityConfigAttributionEligible(attribution)) {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
    if (!isFlyRender4kCapacityGateEnvironmentEligible(ctx.env)) {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
    if (
      (ctx.env as Record<string, unknown>)[HEADLESS_FLY_RENDER_4K_QA_GATE_ENV] !==
      "1"
    ) {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
    const neon = classifyHeadlessNeonEnvironment(ctx.env);
    const r2 = classifyHeadlessR2Environment(ctx.env);
    const producer = classifyHeadlessUpstashProducerEnvironment(ctx.env);
    const consumer = classifyHeadlessUpstashConsumerEnvironment(ctx.env);
    const envName = (ctx.env as Record<string, unknown>).HEADLESS_ENV_NAME;
    const appName = (ctx.env as Record<string, unknown>)
      .HEADLESS_FLY_STAGING_APP_NAME;
    if (
      neon !== "configured" ||
      r2 !== "configured" ||
      producer !== "configured" ||
      consumer !== "configured" ||
      envName !== "staging"
    ) {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
    if (
      typeof appName !== "string" ||
      appName !== HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP
    ) {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
    return pass("env.config");
  } catch {
    return fail("env.config", "ENV_CONFIG_FAILED");
  }
};

const flyRenderVmShapeRunner: FlyRender4kCapacityCaseRunner = async (ctx) => {
  try {
    const topo = await readTopology(ctx);
    const snapshot = {
      machineId: topo.renderMachineId ?? "efgh5678efgh5678",
      processGroup: "render" as const,
      region: HEADLESS_FLY_STAGING_PRIMARY_REGION,
      cpuKind: HEADLESS_FLY_STAGING_RENDER_VM.cpuKind,
      cpus: HEADLESS_FLY_STAGING_RENDER_VM.cpus,
      memoryMb: HEADLESS_FLY_STAGING_RENDER_VM.memoryMb,
      imageDigestSha256: topo.renderImageDigestSha256,
    };
    const result = classifyHeadlessFlyStagingRenderVmSpec(snapshot);
    return result.status === "ok"
      ? pass("fly.render_vm_shape")
      : fail("fly.render_vm_shape", "FLY_RENDER_VM_SHAPE_MISMATCH");
  } catch {
    return fail("fly.render_vm_shape", "FLY_RENDER_VM_SHAPE_MISMATCH");
  }
};

const outboxQuiescenceRunner: FlyRender4kCapacityCaseRunner = async (ctx) => {
  try {
    const result = await assertGlobalOutboxQuiescence(ctx.sql);
    return result.ok
      ? pass("outbox.quiescence")
      : fail("outbox.quiescence", "OUTBOX_NOT_QUIESCENT");
  } catch {
    return fail("outbox.quiescence", "OUTBOX_NOT_QUIESCENT");
  }
};

/**
 * Shared pure evaluator for the process-tree headroom case — used both by the
 * case runner (pass/fail only) and by the orchestrator's evidence capture.
 */
function evaluateCapacity4kProcessTreeCase(
  observation: Hosted4kProcessTreeMemoryObservation | null,
): {
  readonly evidence: FlyRender4kCapacityCaseEvidence;
  readonly headroomEvaluation: Capacity4kHeadroomEvaluation | null;
} {
  if (observation == null) {
    return {
      evidence: fail(
        "process_tree.memory_observation",
        "PROCESS_TREE_MEMORY_INCOMPLETE",
      ),
      headroomEvaluation: null,
    };
  }
  if (observation.oomOrRestartObserved) {
    return {
      evidence: fail(
        "process_tree.memory_observation",
        "OOM_OR_RESTART_OBSERVED",
      ),
      headroomEvaluation: evaluateCapacity4kProcessTreeHeadroom({
        profileId: "4k-webm-30",
        peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
        oomOrRestartObserved: true,
        samplingComplete: observation.samplingComplete,
      }),
    };
  }
  const headroomEvaluation = evaluateCapacity4kProcessTreeHeadroom({
    profileId: "4k-webm-30",
    peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
    oomOrRestartObserved: false,
    samplingComplete: observation.samplingComplete,
  });
  if (
    !observation.samplingComplete ||
    observation.peakProcessTreeRssBytes == null
  ) {
    return {
      evidence: fail(
        "process_tree.memory_observation",
        "PROCESS_TREE_MEMORY_INCOMPLETE",
      ),
      headroomEvaluation,
    };
  }
  if (headroomEvaluation.verdict !== "capacity_claim_justified") {
    return {
      evidence: fail(
        "process_tree.memory_observation",
        "INSUFFICIENT_MEMORY_HEADROOM",
      ),
      headroomEvaluation,
    };
  }
  return {
    evidence: pass("process_tree.memory_observation"),
    headroomEvaluation,
  };
}

const processTreeMemoryObservationRunner: FlyRender4kCapacityCaseRunner = async (
  ctx,
) => {
  try {
    const sampler = ctx.capacity4kProcessTreeSampler;
    const observation = sampler != null ? await sampler.stop() : null;
    return evaluateCapacity4kProcessTreeCase(observation).evidence;
  } catch {
    return fail(
      "process_tree.memory_observation",
      "PROCESS_TREE_MEMORY_INCOMPLETE",
    );
  }
};

const evidencePrivacyRunner: FlyRender4kCapacityCaseRunner = async (ctx) => {
  try {
    const probeDoc = {
      ...createNotTestedFlyRender4kCapacityEvidence(),
      overall: "NOT_TESTED" as const,
      eligibilityVerdict: "privacy probe",
      cases: [{ caseId: "env.config", status: "PASS" as const }],
      acceptedImageDigestSha256: ctx.acceptedImageDigestSha256,
      notes: [
        "Hosted 4K capacity matrix — no secret values in evidence.",
        `run=${ctx.runId.slice(0, 8)}`,
      ],
    };
    const privacy = assertFlyRender4kCapacityEvidencePrivacyStructure(probeDoc);
    return privacy.ok
      ? pass("evidence.privacy")
      : fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
  } catch {
    return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
  }
};

function buildDefaultCapacity4kCaseRunners(): Readonly<
  Record<RequiredFlyRender4kCapacityCaseId, FlyRender4kCapacityCaseRunner>
> {
  const runners: Record<string, FlyRender4kCapacityCaseRunner> = {
    "env.config": envConfigRunner,
    "fly.verify_machine_healthy": reuseLiveSharedCase(
      "fly.verify_machine_healthy",
      "fly.verify_machine_healthy",
      "FLY_VERIFY_UNHEALTHY",
    ),
    "fly.render_machine_healthy": reuseLiveSharedCase(
      "fly.render_machine_healthy",
      "fly.render_machine_healthy",
      "FLY_RENDER_UNHEALTHY",
    ),
    "fly.render_vm_shape": flyRenderVmShapeRunner,
    "fly.immutable_image_equality": reuseLiveSharedCase(
      "fly.immutable_image_equality",
      "fly.immutable_image_equality",
      "FLY_IMAGE_MISMATCH",
    ),
    "neon.schema_fingerprint": reuseLiveSharedCase(
      "neon.schema_fingerprint",
      "neon.schema_fingerprint",
      "SCHEMA_FINGERPRINT_FAILED",
    ),
    "outbox.quiescence": outboxQuiescenceRunner,
    "process_tree.memory_observation": processTreeMemoryObservationRunner,
    "evidence.privacy": evidencePrivacyRunner,
  };
  for (const prefix of ["4k.webm", "4k.mp4"] as const) {
    for (const suffix of PROFILE_PATH_SUFFIXES) {
      runners[`${prefix}.${suffix}`] = makeProfileSuffixRunner(suffix);
    }
  }
  return Object.freeze(runners) as Readonly<
    Record<RequiredFlyRender4kCapacityCaseId, FlyRender4kCapacityCaseRunner>
  >;
}

export const DEFAULT_CAPACITY_4K_CASE_RUNNERS = buildDefaultCapacity4kCaseRunners();

function isSharedPrefixCaseId(id: string): boolean {
  return (
    !id.startsWith("4k.") &&
    id !== "process_tree.memory_observation" &&
    id !== "evidence.privacy"
  );
}

export type Capacity4kLiveMatrixOptions = {
  readonly buildProfileBoundary?: (
    profileId: Capacity4kProfileId,
  ) => Capacity4kWorkloadBoundary;
};

export async function runCapacity4kLiveMatrix(
  ctx: FlyRenderLiveMatrixContext,
  runners: Readonly<
    Partial<Record<RequiredFlyRender4kCapacityCaseId, FlyRender4kCapacityCaseRunner>>
  > = DEFAULT_CAPACITY_4K_CASE_RUNNERS,
  options: Capacity4kLiveMatrixOptions = {},
): Promise<Capacity4kLiveMatrixResult> {
  const buildProfileBoundary =
    options.buildProfileBoundary ?? buildCapacity4kShortFunctionalBoundary;
  const out: FlyRender4kCapacityCaseEvidence[] = [];
  let stopped = false;

  async function runOne(
    id: RequiredFlyRender4kCapacityCaseId,
    activeCtx: FlyRenderLiveMatrixContext,
  ): Promise<void> {
    if (stopped) {
      out.push(notTested(id));
      return;
    }
    try {
      const runner = runners[id] ?? DEFAULT_CAPACITY_4K_CASE_RUNNERS[id];
      const result = await runner(activeCtx);
      const shaped =
        result.caseId === id ? result : fail(id, "CASE_SHAPE_INVALID");
      out.push(shaped);
      if (shaped.status === "FAIL") stopped = true;
    } catch {
      out.push(fail(id, "MATRIX_EXCEPTION"));
      stopped = true;
    }
  }

  const sharedIds = REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.filter(
    isSharedPrefixCaseId,
  );
  for (const id of sharedIds) {
    await runOne(id, ctx);
  }

  for (const def of PROFILE_DEFS) {
    const boundary: Capacity4kWorkloadBoundary = buildProfileBoundary(
      profileIdFor(def.prefix),
    );
    const profileCtx: FlyRenderLiveMatrixContext = {
      ...ctx,
      projectId: randomUUID(),
      session: emptyFlyRenderLiveSession(),
      capacity4kBoundary: boundary,
      capacity4kAudioMode: def.audioMode,
      capacity4kCreatorPrefix: def.creatorPrefix,
      smokePollTimeoutMs: boundary.pollTimeoutMs,
      smokeContentDurationMs: boundary.contentDurationMs,
    };
    for (const suffix of PROFILE_PATH_SUFFIXES) {
      const id = `${def.prefix}.${suffix}` as RequiredFlyRender4kCapacityCaseId;
      await runOne(id, profileCtx);
    }
  }

  await runOne("process_tree.memory_observation", ctx);
  await runOne("evidence.privacy", ctx);

  let processTreeObservation: Hosted4kProcessTreeMemoryObservation | null = null;
  let headroomEvaluation: Capacity4kHeadroomEvaluation | null = null;
  try {
    const sampler = ctx.capacity4kProcessTreeSampler;
    const observation = sampler != null ? await sampler.stop() : null;
    processTreeObservation = observation;
    headroomEvaluation = evaluateCapacity4kProcessTreeCase(
      observation,
    ).headroomEvaluation;
  } catch {
    // Leave both null — evidence must reflect an unavailable observation, never guess.
  }

  return Object.freeze({
    cases: Object.freeze(out.slice()),
    processTreeObservation,
    headroomEvaluation,
  });
}
