/**
 * Targeted execution probe evidence — never overwrites official live matrix.
 * Sprint 11E Phase 2E.2D.8F.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";
import {
  isClaimedRenderExecutionReasonId,
  isClaimedRenderExecutionSubstageId,
  sanitizeClaimedRenderExecutionAttributionSnapshot,
  type FlyRenderClaimedRenderExecutionAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import { pageWorkspaceAttributionToTelemetryFacts } from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
import { sourceBindingAttributionToTelemetryFacts } from "@/features/headless-renderer/worker/runtime/source-binding-resolution";
import type { OwningBoundaryTerminalEvidence } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import type { OwningBoundarySequenceCoherenceResult } from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import { providerContextToTelemetryFacts } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";

import {
  assertExecutionProbeJobCreateAttributionRequired,
  renderExecutionProbeJobCreateAttributionMarkdown,
  type FlyRenderExecutionProbeJobCreateAttribution,
} from "./execution-probe-job-create-attribution";
import {
  assertProbeBoundaryEvidenceContract,
  type BoundaryEmissionClassification,
} from "./owning-boundary-probe-authority";

export const FLY_RENDER_EXECUTION_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md";

export function defaultFlyRenderExecutionProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, FLY_RENDER_EXECUTION_PROBE_EVIDENCE_RELATIVE_PATH);
}

export type FlyRenderExecutionProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly failureSubstage: string | null;
  readonly failureReasonId: string | null;
  readonly executionAttribution: FlyRenderClaimedRenderExecutionAttributionSnapshot | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly executionStages: readonly {
    readonly stageId: string;
    readonly status: string;
    readonly failureCategory?: string;
  }[];
  readonly smokeWorkload: {
    readonly profileId: string;
    readonly contentDurationMs: number;
    readonly pollTimeoutMs: number;
    readonly claims4kCapacity: false;
    readonly framePlan: {
      readonly fps: 30;
      readonly contentFrames: number;
      readonly renderedFrames: number;
      readonly paddingTailFrames: number;
      readonly renderDurationMs: number;
      readonly endBufferMs: number;
    } | null;
  } | null;
  readonly resourceObservation: import("./process-tree-peak-memory").HostedRenderProcessTreePeakObservation | null;
  readonly executionDurationMs: number | null;
  readonly artifactAuthority: {
    readonly bindingVerified: boolean;
    readonly downloadVerified: boolean;
    readonly replayIdempotent: boolean;
    readonly artifactByteLength: number | null;
  } | null;
  readonly acceptedImageDigestSha256: string | null;
  readonly owningBoundaryEvidence: (OwningBoundaryTerminalEvidence & {
    readonly observedSequence: readonly string[];
    readonly cleanupOutcomeClass: "ok" | "failed" | "not_run";
    readonly sequenceCoherence: OwningBoundarySequenceCoherenceResult;
  }) | null;
  readonly owningBoundaryIngestionFailure: string | null;
  readonly boundaryEmissionClassification: BoundaryEmissionClassification | null;
  readonly jobCreateAttribution: FlyRenderExecutionProbeJobCreateAttribution | null;
  readonly notes: readonly string[];
};

export const EXECUTION_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2E.2D.8F — Fly render execution probe" as const;

export const EXECUTION_PROBE_ELIGIBILITY = Object.freeze({
  PASS: "ELIGIBLE — targeted execution probe reached succeeded or exact terminal attribution.",
  FAIL: "NOT ELIGIBLE — targeted execution probe failed or incomplete.",
  FAIL_CLEANUP: "NOT ELIGIBLE — targeted execution probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE=1 but QA config missing or invalid.",
  FAIL_TELEMETRY_IMAGE:
    "NOT ELIGIBLE — render Machine must run post-007 telemetry-current image (8F) before execution probe.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Fly render execution probe has not been executed.",
} as const);

export function createNotTestedFlyRenderExecutionProbeEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon, R2, Upstash, or Fly connection attempted.",
    "Prior PASS/FAIL execution probe evidence must not be overwritten by gate-off runs.",
    "Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
  ],
): FlyRenderExecutionProbeEvidenceDocument {
  return {
    title: EXECUTION_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    failureSubstage: null,
    failureReasonId: null,
    executionAttribution: null,
    cleanupStatus: "not_run",
    executionStages: [],
    smokeWorkload: null,
    resourceObservation: null,
    executionDurationMs: null,
    artifactAuthority: null,
    acceptedImageDigestSha256: null,
    owningBoundaryEvidence: null,
    owningBoundaryIngestionFailure: null,
    boundaryEmissionClassification: null,
    jobCreateAttribution: null,
    notes,
  };
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderFlyRenderExecutionProbeEvidenceMarkdown(
  doc: FlyRenderExecutionProbeEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Started:** ${doc.startedAtIso != null ? esc(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? esc(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    `**Failure substage:** ${
      doc.failureSubstage != null ? `\`${esc(doc.failureSubstage)}\`` : "n/a"
    }`,
    `**Failure reasonId:** ${
      doc.failureReasonId != null ? `\`${esc(doc.failureReasonId)}\`` : "n/a"
    }`,
    "",
    "## Execution attribution",
    "",
  ];
  if (doc.executionAttribution == null) {
    lines.push("- none");
  } else {
    const e = doc.executionAttribution;
    lines.push(`- execution_substage=${e.executionSubstage}`);
    lines.push(`- disposition_kind=${e.dispositionKind}`);
    lines.push(`- durable_job_state_class=${e.durableJobStateClass}`);
    lines.push(
      `- claim_token_coherence_class=${e.claimTokenCoherenceClass}`,
    );
    lines.push(`- cleanup_scheduled_class=${e.cleanupScheduledClass}`);
    lines.push(`- binary_component_class=${e.binaryComponentClass}`);
    lines.push(`- bounded_duration_class=${e.boundedDurationClass}`);
    lines.push(
      `- safe_worker_code=${e.safeWorkerCode != null ? esc(e.safeWorkerCode) : "none"}`,
    );
    lines.push(
      `- store_version_delta=${e.storeVersionDelta != null ? esc(e.storeVersionDelta) : "none"}`,
    );
    if (e.pageFailureReason != null) {
      lines.push(`- page_failure_reason=${esc(e.pageFailureReason)}`);
    }
    if (e.pageResponseClass != null) {
      lines.push(`- page_response_class=${esc(e.pageResponseClass)}`);
    }
  }
  lines.push("", "## Source binding attribution", "");
  if (doc.executionAttribution?.sourceBindingAttribution == null) {
    lines.push("- none");
  } else {
    const bindingFacts = sourceBindingAttributionToTelemetryFacts(
      doc.executionAttribution.sourceBindingAttribution,
    );
    for (const [key, value] of Object.entries(bindingFacts)) {
      lines.push(`- ${key}=${esc(value)}`);
    }
  }
  lines.push("", "## Page workspace attribution", "");
  if (doc.executionAttribution?.pageWorkspaceAttribution == null) {
    lines.push("- none");
  } else {
    const workspaceFacts = pageWorkspaceAttributionToTelemetryFacts(
      doc.executionAttribution.pageWorkspaceAttribution,
    );
    for (const [key, value] of Object.entries(workspaceFacts)) {
      lines.push(`- ${key}=${esc(value)}`);
    }
  }
  lines.push("", "## Execution stages", "");
  if (doc.executionStages.length === 0) {
    lines.push("- none");
  } else {
    for (const stage of doc.executionStages) {
      const extra =
        stage.failureCategory != null
          ? ` (${stage.failureCategory})`
          : "";
      lines.push(`- ${stage.stageId}=${stage.status}${extra}`);
    }
  }
  lines.push("", "## Smoke workload", "");
  if (doc.smokeWorkload == null) {
    lines.push("- none");
  } else {
    lines.push(`- profile=${doc.smokeWorkload.profileId}`);
    lines.push(`- content_duration_ms=${doc.smokeWorkload.contentDurationMs}`);
    lines.push(`- poll_timeout_ms=${doc.smokeWorkload.pollTimeoutMs}`);
    lines.push(`- claims_4k_capacity=${doc.smokeWorkload.claims4kCapacity}`);
    if (doc.smokeWorkload.framePlan != null) {
      const fp = doc.smokeWorkload.framePlan;
      lines.push(`- fps=${fp.fps}`);
      lines.push(`- content_frames=${fp.contentFrames}`);
      lines.push(`- rendered_frames=${fp.renderedFrames}`);
      lines.push(`- padding_tail_frames=${fp.paddingTailFrames}`);
      lines.push(`- render_duration_ms=${fp.renderDurationMs}`);
      lines.push(`- end_buffer_ms=${fp.endBufferMs}`);
    }
  }
  lines.push("", "## Resource observation", "");
  if (doc.resourceObservation == null) {
    lines.push("- none");
  } else {
    const r = doc.resourceObservation;
    lines.push(`- measurement=${r.scope.measurement}`);
    lines.push(`- peak_process_tree_rss_bytes=${r.peakProcessTreeRssBytes ?? "n/a"}`);
    lines.push(`- observation_duration_ms=${r.observationDurationMs ?? "n/a"}`);
    lines.push(
      `- unavailable_reason=${r.unavailableReason != null ? esc(r.unavailableReason) : "none"}`,
    );
    lines.push(`- not_node_rss_alone=${r.scope.notNodeRssAlone}`);
    lines.push(`- not_4k_capacity_authority=${r.scope.not4kCapacityAuthority}`);
  }
  lines.push(`**Execution duration ms:** ${doc.executionDurationMs ?? "n/a"}`);
  lines.push("", "## Artifact authority", "");
  if (doc.artifactAuthority == null) {
    lines.push("- none");
  } else {
    const a = doc.artifactAuthority;
    lines.push(`- binding_verified=${a.bindingVerified}`);
    lines.push(`- download_verified=${a.downloadVerified}`);
    lines.push(`- replay_idempotent=${a.replayIdempotent}`);
    lines.push(`- artifact_byte_length=${a.artifactByteLength ?? "n/a"}`);
  }
  lines.push(
    `**Accepted image digest:** ${
      doc.acceptedImageDigestSha256 != null
        ? esc(doc.acceptedImageDigestSha256)
        : "n/a"
    }`,
  );
  lines.push("", "## Owning boundary telemetry", "");
  if (doc.owningBoundaryEvidence == null) {
    lines.push("- none");
  } else {
    const b = doc.owningBoundaryEvidence;
    lines.push(
      `- last_observed_boundary=${
        b.lastObservedBoundary != null ? esc(b.lastObservedBoundary) : "none"
      }`,
    );
    lines.push(
      `- missing_next_boundary=${
        b.missingNextBoundary != null ? esc(b.missingNextBoundary) : "none"
      }`,
    );
    lines.push(
      `- owning_boundary_telemetry_incomplete=${b.owningBoundaryTelemetryIncomplete}`,
    );
    lines.push(`- cleanup_outcome_class=${esc(b.cleanupOutcomeClass)}`);
    lines.push(
      `- observed_sequence=${b.observedSequence.map(esc).join(",") || "none"}`,
    );
    if (b.providerContext != null) {
      for (const [key, value] of Object.entries(
        providerContextToTelemetryFacts(b.providerContext),
      )) {
        lines.push(`- ${key}=${esc(value)}`);
      }
    }
    if (b.workspaceAttribution != null) {
      for (const [key, value] of Object.entries(
        pageWorkspaceAttributionToTelemetryFacts(b.workspaceAttribution),
      )) {
        lines.push(`- ${key}=${esc(value)}`);
      }
    }
    if ("sequenceCoherence" in b && b.sequenceCoherence != null) {
      lines.push(
        `- sequence_coherence=${
          b.sequenceCoherence.ok ? "ok" : esc(b.sequenceCoherence.reasonId)
        }`,
      );
      if (!b.sequenceCoherence.ok) {
        lines.push(
          `- incoherence_class=${esc(b.sequenceCoherence.incoherenceClass)}`,
        );
      }
    }
  }
  lines.push(
    `**Owning boundary ingestion failure:** ${
      doc.owningBoundaryIngestionFailure != null
        ? esc(doc.owningBoundaryIngestionFailure)
        : "none"
    }`,
  );
  lines.push(
    `**Boundary emission classification:** ${
      doc.boundaryEmissionClassification != null
        ? esc(doc.boundaryEmissionClassification)
        : "none"
    }`,
  );
  lines.push("", "## Execution-probe job-create attribution", "");
  if (doc.jobCreateAttribution == null) {
    lines.push("- none");
  } else {
    lines.push(...renderExecutionProbeJobCreateAttributionMarkdown(doc.jobCreateAttribution));
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function assertExecutionProbeEvidenceSafe(
  markdown: string,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (
    /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|password=|token=|BEGIN PRIVATE KEY)/i.test(
      markdown,
    )
  ) {
    return { ok: false, message: "forbidden_secret_pattern" };
  }
  if (/\bR2_(ACCOUNT|ACCESS|SECRET|BUCKET|ENDPOINT|ALLOWED)/i.test(markdown)) {
    return { ok: false, message: "forbidden_r2_env_token" };
  }
  return { ok: true };
}

export function executionProbeCannotFalsePass(
  doc: FlyRenderExecutionProbeEvidenceDocument,
): boolean {
  if (doc.overall !== "PASS") return true;
  if (doc.executionAttribution == null) return false;
  return doc.executionAttribution.dispositionKind === "succeeded";
}

export function executionProbeSuccessAttributionIsAuthoritative(
  attribution: FlyRenderClaimedRenderExecutionAttributionSnapshot | null,
): boolean {
  if (attribution == null) return false;
  return attribution.dispositionKind === "succeeded";
}

export function preserveOrInitializeFlyRenderExecutionProbeEvidence(
  evidencePath: string,
): { readonly action: string; readonly overall: string } {
  if (existsSync(evidencePath)) {
    const existing = readFileSync(evidencePath, "utf8");
    const overall =
      /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
        existing,
      )?.[1] ?? "NOT_TESTED";
    return { action: "preserved", overall };
  }
  const dir = path.dirname(evidencePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFlyRenderExecutionProbeEvidence({
    evidencePath,
    document: createNotTestedFlyRenderExecutionProbeEvidence(),
  });
  return { action: "initialized", overall: "NOT_TESTED" };
}

export function writeFlyRenderExecutionProbeEvidence(input: {
  readonly evidencePath: string;
  readonly document: FlyRenderExecutionProbeEvidenceDocument;
}): void {
  if (guardHeadlessStructure(input.document)) {
    throw new Error("hostile_execution_probe_document");
  }
  const md = renderFlyRenderExecutionProbeEvidenceMarkdown(input.document);
  const safe = assertExecutionProbeEvidenceSafe(md);
  if (!safe.ok) throw new Error(safe.message);
  if (
    input.document.overall === "PASS" &&
    !executionProbeCannotFalsePass(input.document)
  ) {
    throw new Error("execution_probe_false_pass");
  }
  if (input.document.executionAttribution != null) {
    const sanitized = sanitizeClaimedRenderExecutionAttributionSnapshot(
      input.document.executionAttribution,
    );
    if (sanitized == null) throw new Error("execution_attribution_invalid");
  }
  if (
    input.document.failureSubstage != null &&
    !isClaimedRenderExecutionSubstageId(input.document.failureSubstage)
  ) {
    throw new Error("failure_substage_invalid");
  }
  if (
    input.document.failureReasonId != null &&
    !isClaimedRenderExecutionReasonId(input.document.failureReasonId)
  ) {
    throw new Error("failure_reason_invalid");
  }
  const failedStage = input.document.executionStages.find(
    (s) => s.status === "FAIL",
  )?.stageId ?? null;
  const jobCreateRequired = assertExecutionProbeJobCreateAttributionRequired({
    failedStageId: failedStage,
    jobCreateAttribution: input.document.jobCreateAttribution,
  });
  if (!jobCreateRequired.ok) {
    throw new Error(jobCreateRequired.message);
  }
  const boundaryContract = assertProbeBoundaryEvidenceContract({
    overall: input.document.overall,
    failureSubstage: input.document.failureSubstage,
    failureReasonId: input.document.failureReasonId,
    executionAttribution: input.document.executionAttribution,
    owningBoundaryEvidence: input.document.owningBoundaryEvidence,
    boundaryEmissionClassification: input.document.boundaryEmissionClassification,
  });
  if (!boundaryContract.ok) {
    throw new Error(boundaryContract.message);
  }
  const dir = path.dirname(input.evidencePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(input.evidencePath, md, "utf8");
}
