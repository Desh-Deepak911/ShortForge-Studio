/**
 * Claimed-render artifact finalization ordering regression coverage.
 * Run: npm run test:headless-claimed-render-finalization-ordering
 */

import assert from "node:assert/strict";

import { classifyStorageFinalizeFailureSubstage } from "@/features/headless-renderer/worker/runtime/classify-storage-finalize-failure";
import { createCollectingProviderBackedBoundaryTelemetry } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import { validateOwningBoundarySequenceCoherence } from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import type { ArtifactFinalizeSubstageClass } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import type { OwningBoundaryEventId } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function emitFinalizeFailureSequence(input: {
  readonly finalizeSubstage: ArtifactFinalizeSubstageClass;
  readonly includeTerminalCas: boolean;
}): readonly OwningBoundaryEventId[] {
  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "finalize-ordering",
  });
  telemetry.emit("artifact_upload_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_upload_completed", {
    uploadOutcomeClass: "succeeded",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_completed", {
    finalizeOutcomeClass: "failed",
    finalizeSubstage: input.finalizeSubstage,
    artifactLifecycleRole: "primary_output",
  });
  if (input.includeTerminalCas) {
    telemetry.emit("terminal_failure_cas_started");
    telemetry.emit("terminal_failure_cas_completed", {
      casOutcomeClass: "succeeded",
    });
  }
  telemetry.emit("cleanup_completed", { cleanupOutcomeClass: "ok" });
  return telemetry.observations.map((entry) => entry.boundaryId);
}

async function main() {
  console.log("\nClaimed render finalization ordering\n");

  await test("upload completion is not classified as finalize failure substage", () => {
    assert.equal(
      classifyStorageFinalizeFailureSubstage("OBJECT_INTEGRITY_FAILED"),
      "finalized_coherence_assertion",
    );
    assert.notEqual(
      classifyStorageFinalizeFailureSubstage("OBJECT_INTEGRITY_FAILED"),
      "r2_upload",
    );
  });

  await test("legacy upload-to-cleanup skip fails sequence coherence", () => {
    const telemetry = createCollectingProviderBackedBoundaryTelemetry({
      portId: "legacy-skip",
    });
    telemetry.emit("artifact_upload_completed", {
      uploadOutcomeClass: "succeeded",
    });
    telemetry.emit("cleanup_completed", { cleanupOutcomeClass: "ok" });
    const observed = telemetry.observations.map((entry) => entry.boundaryId);
    const coherence = validateOwningBoundarySequenceCoherence({
      observedSequence: observed,
      providerContext: null,
      workspaceAttribution: null,
      terminalSubstage: "artifact_finalize",
    });
    assert.equal(coherence.ok, false);
    if (coherence.ok) throw new Error("expected incoherent sequence");
    assert.equal(coherence.incoherenceClass, "non_monotonic_sequence");
  });

  await test("finalize boundaries precede terminal cleanup on failure", () => {
    const observed = emitFinalizeFailureSequence({
      finalizeSubstage: "finalized_coherence_assertion",
      includeTerminalCas: true,
    });
    assert.deepEqual(observed.slice(-3), [
      "terminal_failure_cas_started",
      "terminal_failure_cas_completed",
      "cleanup_completed",
    ]);
    const finalizeStartedIdx = observed.indexOf("owned_object_finalize_started");
    const finalizeCompletedIdx = observed.indexOf(
      "owned_object_finalize_completed",
    );
    const cleanupIdx = observed.indexOf("cleanup_completed");
    assert.ok(finalizeStartedIdx >= 0);
    assert.ok(finalizeCompletedIdx > finalizeStartedIdx);
    assert.ok(cleanupIdx > finalizeCompletedIdx);
    const coherence = validateOwningBoundarySequenceCoherence({
      observedSequence: observed,
      providerContext: null,
      workspaceAttribution: null,
      terminalSubstage: "artifact_finalize",
    });
    assert.equal(coherence.ok, true);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
