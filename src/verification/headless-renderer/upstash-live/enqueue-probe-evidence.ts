/**
 * Targeted Upstash enqueue-probe evidence — never overwrites official live matrix.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HEADLESS_QUEUE_PROTOCOL_VERSION } from "@/features/headless-renderer/control-plane";
import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  isEnqueueAttributionReasonId,
  isEnqueueAttributionStageId,
  scrubEnqueueAttributionStages,
  type EnqueueAttributionStageResult,
} from "./enqueue-attribution";
import { assertUpstashEvidencePrivacyStructure } from "./evidence-privacy-authority";

export const UPSTASH_ENQUEUE_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_UPSTASH_ENQUEUE_PROBE.md";

export function defaultUpstashEnqueueProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, UPSTASH_ENQUEUE_PROBE_EVIDENCE_RELATIVE_PATH);
}

export type UpstashEnqueueProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly failureStage: string | null;
  readonly failureReasonId: string | null;
  readonly stages: readonly EnqueueAttributionStageResult[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
    readonly queueProtocolVersion: string;
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const ENQUEUE_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2D.1B — Upstash targeted enqueue probe" as const;

export const ENQUEUE_PROBE_ELIGIBILITY = Object.freeze({
  PASS: "ELIGIBLE — targeted enqueue probe passed; official matrix not rerun.",
  FAIL: "NOT ELIGIBLE — targeted enqueue probe failed or incomplete.",
  FAIL_CLEANUP: "NOT ELIGIBLE — targeted enqueue probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_UPSTASH_QA_ENQUEUE_PROBE=1 but Neon/Upstash config missing or invalid.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Upstash enqueue probe has not been executed.",
} as const);

export function createNotTestedUpstashEnqueueProbeEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or Upstash connection attempted.",
    "Prior PASS/FAIL enqueue-probe evidence must not be overwritten by gate-off runs.",
    "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.",
  ],
): UpstashEnqueueProbeEvidenceDocument {
  return {
    title: ENQUEUE_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: ENQUEUE_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    failureStage: null,
    failureReasonId: null,
    stages: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    notes,
  };
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderUpstashEnqueueProbeEvidenceMarkdown(
  doc: UpstashEnqueueProbeEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Started:** ${doc.startedAtIso != null ? esc(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? esc(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    `**Queue protocol:** \`${HEADLESS_QUEUE_PROTOCOL_VERSION}\``,
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
      lines.push(`- \`${s.stage}\`: ${s.status}${reason}`);
    }
  }
  lines.push("", "## Schema fingerprint", "");
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
    lines.push(
      `- queue_protocol=\`${esc(doc.schemaFingerprint.queueProtocolVersion)}\``,
    );
    for (let i = 0; i < doc.schemaFingerprint.migrationIds.length; i++) {
      lines.push(
        `- \`${esc(doc.schemaFingerprint.migrationIds[i]!)}\` checksum_prefix=\`${esc(doc.schemaFingerprint.checksumPrefixes[i] ?? "")}\``,
      );
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${esc(note)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeUpstashEnqueueProbeEvidence(
  doc: UpstashEnqueueProbeEvidenceDocument,
  evidencePath: string = defaultUpstashEnqueueProbeEvidencePath(),
): void {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    renderUpstashEnqueueProbeEvidenceMarkdown(doc),
    "utf8",
  );
}

/**
 * Gate-off: preserve prior PASS/FAIL; initialize NOT_TESTED only when absent.
 */
export function preserveOrInitializeUpstashEnqueueProbeEvidence(
  evidencePath: string = defaultUpstashEnqueueProbeEvidencePath(),
): {
  readonly overall: UpstashEnqueueProbeEvidenceDocument["overall"];
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
  writeUpstashEnqueueProbeEvidence(
    createNotTestedUpstashEnqueueProbeEvidence(),
    evidencePath,
  );
  return { overall: "NOT_TESTED", action: "initialized" };
}

export function enqueueProbeCannotFalsePass(
  doc: UpstashEnqueueProbeEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(doc)) {
      return { ok: false, message: "Hostile probe evidence rejected." };
    }
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall is not PASS." };
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
    const scrubbed = scrubEnqueueAttributionStages(doc.stages);
    if (scrubbed.length !== doc.stages.length) {
      return { ok: false, message: "Unknown stage fields rejected." };
    }
    for (const s of scrubbed) {
      if (!isEnqueueAttributionStageId(s.stage)) {
        return { ok: false, message: "Unknown stage id." };
      }
      if (s.status === "failed") {
        return { ok: false, message: "PASS cannot include failed stages." };
      }
      if (s.reasonId != null && !isEnqueueAttributionReasonId(s.reasonId)) {
        return { ok: false, message: "Unknown reason id." };
      }
    }
    // Privacy: reuse case-shape walker on a safe projection.
    for (const s of scrubbed) {
      const privacy = assertUpstashEvidencePrivacyStructure({
        caseId: "enqueue.render",
        status: s.status === "ok" ? "PASS" : "FAIL",
        ...(s.reasonId != null ? { failureReasonId: s.reasonId } : {}),
      });
      if (!privacy.ok) return privacy;
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Probe evidence PASS authority failed." };
  }
}
