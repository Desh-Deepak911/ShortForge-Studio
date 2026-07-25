/**
 * Hosted Fly render live QA evidence document.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import type { FlyRenderLiveConfigAttribution } from "./qa-secret-contract";
import type { HostedRenderProcessTreePeakObservation } from "./process-tree-peak-memory";
import type { FlyRenderLiveJobCreateFailureAttribution } from "./job-create-attribution";
import type { FlyRenderLiveDispatchOutboxObservationAttribution } from "./dispatch-outbox-observation-attribution";
import type { FlyRenderClaimedRenderExecutionAttributionSnapshot } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";

export type FlyRenderLiveCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type FlyRenderLiveCaseEvidence = {
  readonly caseId: string;
  readonly status: FlyRenderLiveCaseStatus;
  readonly failureCategory?: string;
  readonly jobCreateFailureAttribution?: FlyRenderLiveJobCreateFailureAttribution;
  readonly dispatchOutboxIntentAttribution?: FlyRenderLiveDispatchOutboxObservationAttribution;
  readonly executionAttribution?: FlyRenderClaimedRenderExecutionAttributionSnapshot;
  readonly runDeliveryCorrelationClass?: "matched" | "unmatched";
};

export type FlyRenderLiveEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly FlyRenderLiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly acceptedImageDigestSha256: string | null;
  readonly flyRenderTopology: {
    readonly verifyCount: number;
    readonly renderCount: number;
    readonly observedRegion: string;
  } | null;
  readonly smokeWorkload: {
    readonly profileId: string;
    readonly contentDurationMs: number;
    readonly pollTimeoutMs: number;
    readonly claims4kCapacity: false;
  } | null;
  readonly resourceObservation: HostedRenderProcessTreePeakObservation | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly configAttribution: FlyRenderLiveConfigAttribution | null;
  readonly jobCreateFailureAttribution: FlyRenderLiveJobCreateFailureAttribution | null;
  readonly notes: readonly string[];
};

export const FLY_RENDER_LIVE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md";

export function defaultFlyRenderLiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, FLY_RENDER_LIVE_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedFlyRenderLiveEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon, R2, Upstash, or Fly connection attempted.",
    "Prior PASS/FAIL live evidence must not be overwritten by gate-off runs.",
    "Render activation is a separate gate from this QA matrix.",
    "Healthy verify and render Machines must not be stopped by gate-off runs.",
  ],
): FlyRenderLiveEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2E.2D.8A — Hosted Fly render live evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict:
      "NOT ELIGIBLE — hosted Fly render live matrix has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    acceptedImageDigestSha256: null,
    flyRenderTopology: null,
    smokeWorkload: null,
    resourceObservation: null,
    cleanupStatus: "not_run",
    configAttribution: null,
    jobCreateFailureAttribution: null,
    notes,
  };
}

export function renderFlyRenderLiveEvidenceMarkdown(
  doc: FlyRenderLiveEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${doc.title}`,
    "",
    `**Overall:** ${doc.overall}`,
    `**Eligibility:** ${doc.eligibilityVerdict}`,
    `**Started:** ${doc.startedAtIso ?? "n/a"}`,
    `**Ended:** ${doc.endedAtIso ?? "n/a"}`,
    `**Cleanup:** ${doc.cleanupStatus}`,
    "",
    "## Configuration attribution",
    "",
  ];
  if (doc.configAttribution == null) {
    lines.push("- none");
  } else {
    const a = doc.configAttribution;
    lines.push(`- neon_status=${a.neon_status}`);
    lines.push(`- r2_status=${a.r2_status}`);
    lines.push(`- upstash_rest_status=${a.upstash_rest_status}`);
    lines.push(`- upstash_tcp_status=${a.upstash_tcp_status}`);
    lines.push(`- env_name_status=${a.env_name_status}`);
    lines.push(`- app_name_status=${a.app_name_status}`);
  }
  lines.push("", "## Schema fingerprint", "");
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
    for (let i = 0; i < doc.schemaFingerprint.migrationIds.length; i++) {
      const id = doc.schemaFingerprint.migrationIds[i]!;
      const prefix = doc.schemaFingerprint.checksumPrefixes[i] ?? "";
      lines.push(`- \`${id}\` checksum_prefix=\`${prefix}\``);
    }
  }
  lines.push("", "## Fly render topology", "");
  if (doc.flyRenderTopology == null) {
    lines.push("- none");
  } else {
    lines.push(
      `- verify=${doc.flyRenderTopology.verifyCount} render=${doc.flyRenderTopology.renderCount} region=${doc.flyRenderTopology.observedRegion}`,
    );
  }
  lines.push("", "## Accepted image digest", "");
  lines.push(
    doc.acceptedImageDigestSha256 == null
      ? "- none"
      : `- \`${doc.acceptedImageDigestSha256}\``,
  );
  lines.push("", "## Smoke workload boundary", "");
  if (doc.smokeWorkload == null) {
    lines.push("- none");
  } else {
    lines.push(`- profile_id=${doc.smokeWorkload.profileId}`);
    lines.push(`- content_duration_ms=${doc.smokeWorkload.contentDurationMs}`);
    lines.push(`- poll_timeout_ms=${doc.smokeWorkload.pollTimeoutMs}`);
    lines.push(`- claims_4k_capacity=${doc.smokeWorkload.claims4kCapacity}`);
  }
  lines.push("", "## Resource observation", "");
  if (doc.resourceObservation == null) {
    lines.push("- none");
  } else {
    const r = doc.resourceObservation;
    lines.push(`- measurement=${r.scope.measurement}`);
    lines.push(`- peak_process_tree_rss_bytes=${r.peakProcessTreeRssBytes ?? "n/a"}`);
    lines.push(`- observation_duration_ms=${r.observationDurationMs ?? "n/a"}`);
    lines.push(`- not_node_rss_alone=${r.scope.notNodeRssAlone}`);
    lines.push(`- not_4k_capacity_authority=${r.scope.not4kCapacityAuthority}`);
  }
  lines.push("", "## Cases", "");
  if (doc.cases.length === 0) {
    lines.push("- (none recorded)");
  } else {
    for (const c of doc.cases) {
      const fail =
        c.failureCategory != null ? ` category=${c.failureCategory}` : "";
      let line = `- \`${c.caseId}\`: ${c.status}${fail}`;
      if (c.jobCreateFailureAttribution != null) {
        const a = c.jobCreateFailureAttribution;
        line += ` stage=${a.failureStage} reasonId=${a.failureReasonId}`;
      }
      if (c.dispatchOutboxIntentAttribution != null) {
        const a = c.dispatchOutboxIntentAttribution;
        line += ` first_state=${a.firstObservedState} reread_state=${a.rereadObservedState} transition=${a.monotonicTransitionClass}`;
      }
      lines.push(line);
    }
  }
  lines.push("", "## Job create failure attribution", "");
  if (doc.jobCreateFailureAttribution == null) {
    lines.push("- none");
  } else {
    const a = doc.jobCreateFailureAttribution;
    lines.push(`- failure_stage=${a.failureStage}`);
    lines.push(`- failure_reason_id=${a.failureReasonId}`);
    lines.push(
      `- safe_control_plane_code=${a.safeControlPlaneCode ?? "none"}`,
    );
    lines.push(`- allowlisted_sqlstate=${a.allowlistedSqlState ?? "none"}`);
    lines.push(
      `- allowlisted_constraint=${a.allowlistedConstraint ?? "none"}`,
    );
    lines.push(
      `- promotion_reason_id=${a.promotionReasonId ?? "none"}`,
    );
    lines.push(`- durable_job_stage=${a.durableJobStage ?? "none"}`);
    lines.push(`- store_version_delta=${a.storeVersionDelta ?? "none"}`);
    lines.push(`- cleanup_status=${a.cleanupStatus ?? "none"}`);
    if (a.coverageAttribution != null) {
      const c = a.coverageAttribution;
      lines.push(`- coverage_required_target_count=${c.requiredTargetCount}`);
      lines.push(`- coverage_staged_reference_count=${c.stagedReferenceCount}`);
      lines.push(
        `- coverage_finalized_owned_object_count=${c.finalizedOwnedObjectCount}`,
      );
      lines.push(
        `- coverage_verified_target_count_before=${c.verifiedTargetCountBefore}`,
      );
      lines.push(
        `- coverage_verified_target_count_after=${c.verifiedTargetCountAfter}`,
      );
      lines.push(`- coverage_missing_target_count=${c.missingTargetCount}`);
      lines.push(
        `- coverage_duplicate_extra_classification=${c.duplicateExtraClassification}`,
      );
      lines.push(`- coverage_reconcile_result_kind=${c.reconcileResultKind}`);
      lines.push(
        `- coverage_store_version_delta=${c.storeVersionDelta ?? "none"}`,
      );
      lines.push(
        `- coverage_final_complete=${c.finalCoverageComplete}`,
      );
      lines.push(
        `- coverage_intermediate_blocked_incomplete=${c.intermediateBlockedIncomplete}`,
      );
    }
    if (a.stagingAttribution != null) {
      const s = a.stagingAttribution;
      lines.push(`- staging_substage=${s.stagingSubstage}`);
      lines.push(`- staging_object_purpose_class=${s.objectPurposeClass}`);
      lines.push(`- staging_slot_key_class=${s.slotKeyClass}`);
      lines.push(`- staging_slot_key_length_class=${s.slotKeyLengthClass}`);
      lines.push(`- staging_store_class=${s.storeClass}`);
      lines.push(
        `- staging_safe_control_plane_code=${s.safeControlPlaneCode ?? "none"}`,
      );
      lines.push(
        `- staging_allowlisted_sqlstate=${s.allowlistedSqlState ?? "none"}`,
      );
      lines.push(
        `- staging_allowlisted_constraint=${s.allowlistedConstraint ?? "none"}`,
      );
      lines.push(`- staging_result_kind=${s.resultKind}`);
    }
    if (a.finalizeAttribution != null) {
      const f = a.finalizeAttribution;
      lines.push(`- finalize_substage=${f.finalizeSubstage}`);
      lines.push(`- finalize_object_purpose_class=${f.objectPurposeClass}`);
      lines.push(`- finalize_slot_key_class=${f.slotKeyClass}`);
      lines.push(`- finalize_slot_key_length_class=${f.slotKeyLengthClass}`);
      lines.push(`- finalize_store_class=${f.storeClass}`);
      lines.push(
        `- finalize_failure_boundary_class=${f.failureBoundaryClass ?? "none"}`,
      );
      lines.push(
        `- finalize_safe_control_plane_code=${f.safeControlPlaneCode ?? "none"}`,
      );
      lines.push(
        `- finalize_allowlisted_sqlstate=${f.allowlistedSqlState ?? "none"}`,
      );
      lines.push(
        `- finalize_allowlisted_constraint=${f.allowlistedConstraint ?? "none"}`,
      );
      lines.push(`- finalize_result_kind=${f.resultKind}`);
      lines.push(
        `- finalize_store_version_delta=${f.storeVersionDelta ?? "none"}`,
      );
      lines.push(
        `- finalize_durable_object_stage_class=${f.durableObjectStageClass ?? "none"}`,
      );
      lines.push(
        `- finalize_revision_outcome_class=${f.r2RevisionOutcomeClass ?? "none"}`,
      );
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseFlyRenderLiveEvidenceMarkdown(
  markdown: string,
): FlyRenderLiveEvidenceDocument | null {
  try {
    const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
      markdown,
    )?.[1] as FlyRenderLiveEvidenceDocument["overall"] | undefined;
    if (overall == null) return null;
    return {
      ...createNotTestedFlyRenderLiveEvidence(),
      overall,
      eligibilityVerdict:
        /(?:\*\*Eligibility:\*\*|Eligibility:)\s*(.+)/.exec(markdown)?.[1]?.trim() ??
        createNotTestedFlyRenderLiveEvidence().eligibilityVerdict,
    };
  } catch {
    return null;
  }
}

export function preserveOrInitializeFlyRenderLiveEvidence(options: {
  readonly evidencePath: string;
  readonly notTestedDoc?: FlyRenderLiveEvidenceDocument;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: FlyRenderLiveEvidenceDocument["overall"];
} {
  const notTested = options.notTestedDoc ?? createNotTestedFlyRenderLiveEvidence();
  if (!existsSync(options.evidencePath)) {
    mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    writeFileSync(
      options.evidencePath,
      renderFlyRenderLiveEvidenceMarkdown(notTested),
      "utf8",
    );
    return { action: "initialized", overall: "NOT_TESTED" };
  }
  const existing = readFileSync(options.evidencePath, "utf8");
  const parsed = parseFlyRenderLiveEvidenceMarkdown(existing);
  if (parsed?.overall === "PASS" || parsed?.overall === "FAIL") {
    return { action: "preserved", overall: parsed.overall };
  }
  return { action: "unchanged", overall: parsed?.overall ?? "NOT_TESTED" };
}

export function writeFlyRenderLiveEvidence(options: {
  readonly evidencePath: string;
  readonly document: FlyRenderLiveEvidenceDocument;
}): void {
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderFlyRenderLiveEvidenceMarkdown(options.document),
    "utf8",
  );
}

export function checksumPrefix(checksum: string): string {
  return checksum.slice(0, 12);
}

export function extractJobCreateFailureAttributionFromCases(
  cases: readonly FlyRenderLiveCaseEvidence[],
  cleanupStatus?: FlyRenderLiveJobCreateFailureAttribution["cleanupStatus"],
): FlyRenderLiveJobCreateFailureAttribution | null {
  const failed = cases.find(
    (c) => c.caseId === "job.create_queued" && c.status === "FAIL",
  );
  if (failed?.jobCreateFailureAttribution == null) {
    return null;
  }
  return cleanupStatus != null
    ? { ...failed.jobCreateFailureAttribution, cleanupStatus }
    : failed.jobCreateFailureAttribution;
}
