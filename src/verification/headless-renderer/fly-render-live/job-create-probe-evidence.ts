/**
 * Targeted Fly render job-create probe evidence — never overwrites official live matrix.
 * Sprint 11E Phase 2E.2D.8B.1 — zero-consumer topology required for queued+outbox contract.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  isJobCreateAttributionReasonId,
  isJobCreateAttributionStageId,
  scrubJobCreateAttributionStages,
  type JobCreateAttributionStageResult,
} from "./job-create-attribution";
import {
  isJobCreateProbeConsumerSafetyReasonId,
  isJobCreateProbeConsumerSafetyStageId,
} from "./job-create-probe-consumer-safety";

export const FLY_RENDER_JOB_CREATE_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_JOB_CREATE_PROBE.md";

export function defaultFlyRenderJobCreateProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, FLY_RENDER_JOB_CREATE_PROBE_EVIDENCE_RELATIVE_PATH);
}

export type JobCreateProbeConsumerSafetyMode =
  | "zero_consumer"
  | "blocked_active_consumers"
  | "not_assessed";

export type JobCreateProbeStageResult =
  | JobCreateAttributionStageResult
  | {
      readonly stage: "consumer_safety_precheck";
      readonly status: "ok" | "failed";
      readonly reasonId?:
        | "active_staging_consumers_block_mutation"
        | "consumer_topology_unavailable";
    };

export type FlyRenderJobCreateProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly failureStage: string | null;
  readonly failureReasonId: string | null;
  readonly stages: readonly JobCreateProbeStageResult[];
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly consumerSafetyMode: JobCreateProbeConsumerSafetyMode;
  readonly notes: readonly string[];
};

export const JOB_CREATE_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2E.2D.8B.1 — Fly render targeted job-create probe" as const;

export const JOB_CREATE_PROBE_ELIGIBILITY = Object.freeze({
  PASS_ZERO_CONSUMER:
    "ELIGIBLE — zero-consumer topology; targeted job-create probe passed queued+outbox contract.",
  PASS: "ELIGIBLE — targeted job-create probe passed; official render matrix not rerun.",
  FAIL: "NOT ELIGIBLE — targeted job-create probe failed or incomplete.",
  FAIL_BLOCKED_CONSUMERS:
    "NOT ELIGIBLE — active staging consumers block mutation; probe cannot prove queued+outbox contract.",
  FAIL_CLEANUP: "NOT ELIGIBLE — targeted job-create probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE=1 but Neon/R2 config missing or invalid.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Fly render job-create probe has not been executed.",
} as const);

export function createNotTestedFlyRenderJobCreateProbeEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or R2 connection attempted.",
    "Prior PASS/FAIL job-create probe evidence must not be overwritten by gate-off runs.",
    "Zero-consumer topology required for queued+pending-outbox contract.",
    "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
  ],
): FlyRenderJobCreateProbeEvidenceDocument {
  return {
    title: JOB_CREATE_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: JOB_CREATE_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    failureStage: null,
    failureReasonId: null,
    stages: [],
    cleanupStatus: "not_run",
    consumerSafetyMode: "not_assessed",
    notes,
  };
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderFlyRenderJobCreateProbeEvidenceMarkdown(
  doc: FlyRenderJobCreateProbeEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Consumer safety mode:** ${esc(doc.consumerSafetyMode)}`,
    `**Started:** ${doc.startedAtIso != null ? esc(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? esc(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    `**Failure stage:** ${doc.failureStage != null ? `\`${esc(doc.failureStage)}\`` : "n/a"}`,
    `**Failure reasonId:** ${
      doc.failureReasonId != null ? `\`${esc(doc.failureReasonId)}\`` : "n/a"
    }`,
    "",
    "## Stages",
    "",
  ];
  if (doc.stages.length === 0) {
    lines.push("- (none recorded)");
  } else {
    for (const s of doc.stages) {
      const reason = s.reasonId != null ? ` reasonId=${s.reasonId}` : "";
      const promo =
        "promotionReasonId" in s && s.promotionReasonId != null
          ? ` promotionReasonId=${s.promotionReasonId}`
          : "";
      lines.push(`- \`${s.stage}\`: ${s.status}${reason}${promo}`);
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${esc(note)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeFlyRenderJobCreateProbeEvidence(input: {
  readonly evidencePath?: string;
  readonly document: FlyRenderJobCreateProbeEvidenceDocument;
}): void {
  const evidencePath =
    input.evidencePath ?? defaultFlyRenderJobCreateProbeEvidencePath();
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    renderFlyRenderJobCreateProbeEvidenceMarkdown(input.document),
    "utf8",
  );
}

export function preserveOrInitializeFlyRenderJobCreateProbeEvidence(
  evidencePath: string = defaultFlyRenderJobCreateProbeEvidencePath(),
): {
  readonly overall: FlyRenderJobCreateProbeEvidenceDocument["overall"];
  readonly action: "preserved" | "initialized";
} {
  if (existsSync(evidencePath)) {
    const existing = readFileSync(evidencePath, "utf8");
    if (existing.includes("**Overall:** PASS")) {
      return { overall: "PASS", action: "preserved" };
    }
    if (existing.includes("**Overall:** FAIL")) {
      return { overall: "FAIL", action: "preserved" };
    }
    return { overall: "NOT_TESTED", action: "preserved" };
  }
  writeFlyRenderJobCreateProbeEvidence({
    evidencePath,
    document: createNotTestedFlyRenderJobCreateProbeEvidence(),
  });
  return { overall: "NOT_TESTED", action: "initialized" };
}

function isProbeStageValid(s: JobCreateProbeStageResult): boolean {
  if (isJobCreateProbeConsumerSafetyStageId(s.stage)) {
    if (s.status !== "ok" && s.status !== "failed") return false;
    if (
      s.reasonId != null &&
      !isJobCreateProbeConsumerSafetyReasonId(s.reasonId)
    ) {
      return false;
    }
    return true;
  }
  if (!isJobCreateAttributionStageId(s.stage)) return false;
  if (
    s.status !== "ok" &&
    s.status !== "failed" &&
    s.status !== "skipped" &&
    s.status !== "best_effort_failed"
  ) {
    return false;
  }
  if (
    s.reasonId != null &&
    !isJobCreateAttributionReasonId(s.reasonId)
  ) {
    return false;
  }
  return true;
}

export function jobCreateProbeCannotFalsePass(
  doc: FlyRenderJobCreateProbeEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(doc)) {
      return { ok: false, message: "Hostile probe evidence rejected." };
    }
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall is not PASS." };
    }
    if (doc.consumerSafetyMode !== "zero_consumer") {
      return {
        ok: false,
        message: "PASS requires zero_consumer topology.",
      };
    }
    if (doc.cleanupStatus !== "ok" && doc.cleanupStatus !== "preserved") {
      return { ok: false, message: "PASS requires cleanup ok|preserved." };
    }
    if (doc.failureStage != null || doc.failureReasonId != null) {
      return { ok: false, message: "PASS must not carry failure stage/reason." };
    }
    if (doc.stages.length === 0) {
      return { ok: false, message: "PASS requires recorded stages." };
    }
    for (const s of doc.stages) {
      if (!isProbeStageValid(s)) {
        return { ok: false, message: "Unknown stage fields rejected." };
      }
      if (s.status === "failed") {
        return { ok: false, message: "PASS cannot include failed stages." };
      }
    }
    const attributionStages = doc.stages.filter(
      (s): s is JobCreateAttributionStageResult =>
        isJobCreateAttributionStageId(s.stage),
    );
    const scrubbed = scrubJobCreateAttributionStages(attributionStages);
    if (scrubbed.length !== attributionStages.length) {
      return { ok: false, message: "Unknown attribution stage fields rejected." };
    }
    const outbox = doc.stages.find(
      (s) => s.stage === "dispatch_outbox_intent_reread",
    );
    if (outbox?.status !== "ok") {
      return {
        ok: false,
        message: "PASS requires dispatch_outbox_intent_reread ok.",
      };
    }
    const queued = doc.stages.find((s) => s.stage === "queued_state_assertion");
    if (queued?.status !== "ok") {
      return {
        ok: false,
        message: "PASS requires queued_state_assertion ok.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Probe evidence PASS authority failed." };
  }
}

export function assertJobCreateProbeEvidenceSafe(
  markdown: string,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const forbidden = [
    /postgres(ql)?:\/\//i,
    /rediss?:\/\//i,
    /DATABASE_URL/i,
    /UPSTASH_/i,
    /R2_/i,
    /sha256:[0-9a-f]{64}/i,
    /https:\/\/[^\s]+/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(markdown)) {
      return { ok: false, message: "Probe evidence contains forbidden content." };
    }
  }
  return { ok: true };
}
