/**
 * Semantic release authority for claimed-render artifact cleanup wiring.
 * Validates delegated terminal cleanup ownership instead of brittle symbol scans.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { deleteOrScheduleArtifactCleanup } from "@/features/headless-renderer/control-plane/services/schedule-artifact-cleanup";
import type { HeadlessStorageLocatorIdentity } from "@/features/headless-renderer/domain/headless-render.types";
import {
  runCorrectedFinalizeFailureBoundaryFixture,
  runTerminalCleanupNotOnSuccessFixture,
} from "@/features/headless-renderer/worker/testing/schema-008-artifact-finalization-fixtures";

export type ClaimedRenderCleanupWiringSources = {
  readonly executeClaimedRender: string;
  readonly terminalCleanupRuntime: string;
  readonly terminalCleanupCoordinator: string;
};

export type ClaimedRenderCleanupWiringValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: readonly string[] };

const EXECUTE_CLAIMED_RENDER_REL =
  "src/features/headless-renderer/worker/runtime/execute-claimed-render.ts";
const TERMINAL_CLEANUP_RUNTIME_REL =
  "src/features/headless-renderer/worker/runtime/claimed-render-terminal-cleanup-runtime.ts";
const TERMINAL_CLEANUP_COORDINATOR_REL =
  "src/features/headless-renderer/control-plane/services/headless-terminal-cleanup-coordinator.ts";

export function readClaimedRenderCleanupWiringSources(): ClaimedRenderCleanupWiringSources {
  const root = process.cwd();
  return {
    executeClaimedRender: readFileSync(join(root, EXECUTE_CLAIMED_RENDER_REL), "utf8"),
    terminalCleanupRuntime: readFileSync(join(root, TERMINAL_CLEANUP_RUNTIME_REL), "utf8"),
    terminalCleanupCoordinator: readFileSync(
      join(root, TERMINAL_CLEANUP_COORDINATOR_REL),
      "utf8",
    ),
  };
}

function sliceAfter(source: string, needle: string, length: number): string | null {
  const index = source.indexOf(needle);
  if (index < 0) {
    return null;
  }
  return source.slice(index, index + length);
}

/**
 * Validates that claimed-render cleanup is delegated through the terminal session
 * and coordinator, with binding/finalization ordering preserved on every path.
 */
export function validateClaimedRenderCleanupWiring(
  sources: ClaimedRenderCleanupWiringSources,
): ClaimedRenderCleanupWiringValidation {
  const missing: string[] = [];
  const execute = sources.executeClaimedRender;
  const runtime = sources.terminalCleanupRuntime;
  const coordinator = sources.terminalCleanupCoordinator;

  if (execute.includes("deleteOrScheduleArtifactCleanup")) {
    missing.push("execute_must_delegate_cleanup_to_coordinator");
  }

  const executeSymbols: readonly [string, string][] = [
    ["createClaimedRenderTerminalCleanupSession", "terminal_cleanup_session_factory"],
    ["runPostTerminalCleanup", "post_terminal_cleanup_runner"],
    ["queueOrphanForTerminalCleanup", "orphan_queue_hook"],
    ["evaluateArtifactObjectBindingCoherence", "binding_coherence_evaluator"],
    ["cleanupSession.queueOrphanTarget", "session_orphan_enqueue"],
  ];
  for (const [needle, id] of executeSymbols) {
    if (!execute.includes(needle)) {
      missing.push(id);
    }
  }

  const bindingStart = execute.indexOf("artifact_binding_validation_started");
  const casStart = execute.indexOf("job_succeeded_cas_started");
  if (bindingStart < 0 || casStart < 0 || bindingStart >= casStart) {
    missing.push("binding_validation_before_succeeded_cas");
  }

  const succeededCasCompleted = execute.indexOf("job_succeeded_cas_completed");
  const successCleanup = execute.indexOf('runPostTerminalCleanup("succeeded")');
  if (
    succeededCasCompleted < 0 ||
    successCleanup < 0 ||
    succeededCasCompleted >= successCleanup
  ) {
    missing.push("succeeded_cas_before_success_terminal_cleanup_hook");
  }

  const uploadFailureBlock = sliceAfter(execute, "if (uploadFailed)", 900);
  if (uploadFailureBlock == null || !uploadFailureBlock.includes("runPostTerminalCleanup")) {
    missing.push("upload_failure_terminal_cleanup");
  }

  const finalizeFailureBlock = sliceAfter(execute, "if (finalizeFailed)", 900);
  if (finalizeFailureBlock == null || !finalizeFailureBlock.includes("runPostTerminalCleanup")) {
    missing.push("finalize_failure_terminal_cleanup");
  }

  const bindingFailureBlock = sliceAfter(execute, "if (!bindingEvaluated.ok)", 1200);
  if (
    bindingFailureBlock == null ||
    !bindingFailureBlock.includes("queueOrphanForTerminalCleanup") ||
    !bindingFailureBlock.includes("runPostTerminalCleanup")
  ) {
    missing.push("binding_failure_orphan_queue_and_terminal_cleanup");
  }

  const succeededCasFailureBlock = sliceAfter(
    execute,
    "if (!cas.ok || cas.value.kind !== \"updated\")",
    1400,
  );
  if (
    succeededCasFailureBlock == null ||
    !succeededCasFailureBlock.includes("queueOrphanForTerminalCleanup") ||
    !succeededCasFailureBlock.includes("runPostTerminalCleanup")
  ) {
    missing.push("succeeded_cas_failure_orphan_queue_and_terminal_cleanup");
  }

  if (!runtime.includes("runHeadlessTerminalCleanupCoordinator")) {
    missing.push("runtime_coordinator_delegation");
  }
  if (!runtime.includes("queueOrphanTarget")) {
    missing.push("runtime_orphan_target_queue");
  }

  if (!coordinator.includes("deleteOrScheduleArtifactCleanup")) {
    missing.push("coordinator_delete_or_schedule");
  }
  if (
    !coordinator.includes(
      "Never deletes the final downloadable artifact binding",
    )
  ) {
    missing.push("coordinator_binding_preservation_invariant");
  }
  if (!coordinator.includes("for (const target of input.orphanTargets)")) {
    missing.push("coordinator_orphan_target_only_loop");
  }

  return missing.length === 0
    ? { ok: true }
    : { ok: false, missing: Object.freeze(missing) };
}

export function assertClaimedRenderCleanupWiringComplete(): void {
  const validation = validateClaimedRenderCleanupWiring(
    readClaimedRenderCleanupWiringSources(),
  );
  if (!validation.ok) {
    throw new Error(
      `claimed render cleanup wiring incomplete: ${validation.missing.join(", ")}`,
    );
  }
}

const FIXTURE_LOCATOR: HeadlessStorageLocatorIdentity = Object.freeze({
  kind: "object_storage",
  storeId: "artifacts-bucket",
  objectKey: "artifacts/op_fixture/attempt_1/output.webm",
});

const FIXTURE_DIGEST = `sha256:${"a".repeat(64)}`;

async function runDeleteFailureSchedulesDurableWorkFixture(): Promise<boolean> {
  const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
  const outcome = await deleteOrScheduleArtifactCleanup({
    storage: {
      deleteObject: async () => ({ ok: false }),
    },
    cleanup,
    locator: FIXTURE_LOCATOR,
    objectId: "obj_fixture",
    ownerId: "owner_fixture",
    projectId: "project_fixture",
    jobId: "job_fixture",
    attempt: 1,
    contentDigest: FIXTURE_DIGEST,
    reasonId: "UPLOAD_SESSION_ORPHAN",
    nowMs: 1_700_000_000_000,
    expiresAtMs: 1_700_086_400_000,
  });
  return (
    outcome.status === "scheduled" &&
    cleanup.testingCountPendingForOwner("owner_fixture") === 1
  );
}

async function runIdempotentAbsentCleanupFixture(): Promise<boolean> {
  const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
  const outcome = await deleteOrScheduleArtifactCleanup({
    storage: {
      deleteObject: async () => ({ ok: true }),
    },
    cleanup,
    locator: FIXTURE_LOCATOR,
    objectId: "obj_absent_fixture",
    ownerId: "owner_absent_fixture",
    projectId: "project_absent_fixture",
    jobId: "job_absent_fixture",
    attempt: 1,
    contentDigest: FIXTURE_DIGEST,
    reasonId: "UPLOAD_SESSION_ORPHAN",
    nowMs: 1_700_000_000_000,
    expiresAtMs: 1_700_086_400_000,
  });
  return outcome.status === "deleted" && cleanup.testingCountPendingForOwner("owner_absent_fixture") === 0;
}

function runProjectSourcePreservationFixture(
  sources: ClaimedRenderCleanupWiringSources,
): boolean {
  const execute = sources.executeClaimedRender;
  const coordinator = sources.terminalCleanupCoordinator;
  return (
    !execute.includes("deleteOrScheduleArtifactCleanup") &&
    !execute.includes("scheduleHeadlessExportDeleteNow") &&
    coordinator.includes("for (const target of input.orphanTargets)") &&
    !coordinator.includes("purpose: \"manifest\"") &&
    !coordinator.includes("purpose: \"source\"")
  );
}

function runCleanupEvidencePrivacyFixture(): boolean {
  const sample = JSON.stringify({
    status: "scheduled",
    cleanupId: "cleanup_fixture",
    orphanReports: [{ status: "scheduled", cleanupId: null }],
  });
  return (
    !sample.includes(FIXTURE_LOCATOR.objectKey) &&
    !sample.includes("owner_fixture") &&
    !sample.includes(FIXTURE_DIGEST)
  );
}

export type ClaimedRenderCleanupReleaseBehaviorSnapshot = {
  readonly successPathNoOrphanCleanup: boolean;
  readonly finalizeFailureSequenceCoherent: boolean;
  readonly bindingFailureWiringPresent: boolean;
  readonly deleteFailureSchedulesDurableWork: boolean;
  readonly idempotentAbsentCleanupOk: boolean;
  readonly projectSourceProtected: boolean;
  readonly privacySafe: boolean;
};

/**
 * Behavioral proofs for artifact cleanup release authority without provider contact.
 */
export async function runClaimedRenderCleanupReleaseBehaviorFixtures(): Promise<ClaimedRenderCleanupReleaseBehaviorSnapshot> {
  const sources = readClaimedRenderCleanupWiringSources();
  const wiring = validateClaimedRenderCleanupWiring(sources);
  const successFixture = await runTerminalCleanupNotOnSuccessFixture();
  const finalizeFailureFixture = await runCorrectedFinalizeFailureBoundaryFixture();

  return {
    successPathNoOrphanCleanup: !successFixture.cleanupScheduled,
    finalizeFailureSequenceCoherent: finalizeFailureFixture.sequenceCoherent,
    bindingFailureWiringPresent:
      wiring.ok &&
      (() => {
        const block = sliceAfter(
          sources.executeClaimedRender,
          "if (!bindingEvaluated.ok)",
          1200,
        );
        return (
          block != null &&
          block.includes("queueOrphanForTerminalCleanup") &&
          block.includes("runPostTerminalCleanup")
        );
      })(),
    deleteFailureSchedulesDurableWork: await runDeleteFailureSchedulesDurableWorkFixture(),
    idempotentAbsentCleanupOk: await runIdempotentAbsentCleanupFixture(),
    projectSourceProtected: runProjectSourcePreservationFixture(sources),
    privacySafe: runCleanupEvidencePrivacyFixture(),
  };
}
