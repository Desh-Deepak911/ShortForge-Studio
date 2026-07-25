/**
 * Targeted Upstash duplicate-delivery concurrency probe evidence — never
 * overwrites progressive or official live matrix evidence.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HEADLESS_QUEUE_PROTOCOL_VERSION } from "@/features/headless-renderer/control-plane";
import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  isConcurrencyAttributionReasonId,
  isConcurrencyAttributionStageId,
  scrubConcurrencyAttributionStages,
  type ConcurrencyAttributionStageResult,
} from "./concurrency-attribution";
import { assertUpstashEvidencePrivacyStructure } from "./evidence-privacy-authority";

export const UPSTASH_CONCURRENCY_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_UPSTASH_CONCURRENCY_PROBE.md";

export function defaultUpstashConcurrencyProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, UPSTASH_CONCURRENCY_PROBE_EVIDENCE_RELATIVE_PATH);
}

export type UpstashConcurrencyProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly failureStage: string | null;
  readonly failureReasonId: string | null;
  readonly stages: readonly ConcurrencyAttributionStageResult[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
    readonly queueProtocolVersion: string;
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly streamAuthority?: "qa_run_scoped" | "production_env" | null;
  readonly groupAuthority?: "production_protocol" | "qa_group" | null;
  readonly queueNamespaceVersion?: string | null;
  readonly runScopedCleanupStatus?:
    | "ok"
    | "failed"
    | "skipped"
    | "preserved"
    | "not_run"
    | null;
  readonly enqueueTransport?: "rest_xadd" | null;
  readonly consumeTransport?: "tcp_production_protocol" | null;
  readonly duplicateDeliveryModel?: "two_distinct_stream_ids" | null;
  readonly notes: readonly string[];
};

export const CONCURRENCY_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2D.1H — Upstash targeted duplicate-delivery concurrency probe" as const;

export const CONCURRENCY_PROBE_ELIGIBILITY = Object.freeze({
  PASS: "ELIGIBLE — targeted concurrency probe passed; progressive/official not rerun.",
  FAIL: "NOT ELIGIBLE — targeted concurrency probe failed or incomplete.",
  FAIL_CLEANUP: "NOT ELIGIBLE — targeted concurrency probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE=1 but Neon/Upstash config missing or invalid.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Upstash concurrency probe has not been executed.",
} as const);

export function createNotTestedUpstashConcurrencyProbeEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or Upstash connection attempted.",
    "Prior PASS/FAIL concurrency-probe evidence must not be overwritten by gate-off runs.",
    "Does not overwrite progressive or official live evidence.",
  ],
): UpstashConcurrencyProbeEvidenceDocument {
  return {
    title: CONCURRENCY_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: CONCURRENCY_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    failureStage: null,
    failureReasonId: null,
    stages: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    streamAuthority: null,
    groupAuthority: null,
    queueNamespaceVersion: null,
    runScopedCleanupStatus: null,
    enqueueTransport: null,
    consumeTransport: null,
    duplicateDeliveryModel: null,
    notes,
  };
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderUpstashConcurrencyProbeEvidenceMarkdown(
  doc: UpstashConcurrencyProbeEvidenceDocument,
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
    `**Queue namespace version:** ${
      doc.queueNamespaceVersion != null
        ? `\`${esc(doc.queueNamespaceVersion)}\``
        : "n/a"
    }`,
    `**streamAuthority:** ${
      doc.streamAuthority != null ? `\`${esc(doc.streamAuthority)}\`` : "n/a"
    }`,
    `**groupAuthority:** ${
      doc.groupAuthority != null ? `\`${esc(doc.groupAuthority)}\`` : "n/a"
    }`,
    `**Run-scoped cleanup:** ${
      doc.runScopedCleanupStatus != null
        ? esc(doc.runScopedCleanupStatus)
        : "n/a"
    }`,
    `**enqueueTransport:** ${
      doc.enqueueTransport != null ? `\`${esc(doc.enqueueTransport)}\`` : "n/a"
    }`,
    `**consumeTransport:** ${
      doc.consumeTransport != null ? `\`${esc(doc.consumeTransport)}\`` : "n/a"
    }`,
    `**duplicateDeliveryModel:** ${
      doc.duplicateDeliveryModel != null
        ? `\`${esc(doc.duplicateDeliveryModel)}\``
        : "n/a"
    }`,
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
      lines.push(`- \`${s.stageId}\`: ${s.ok ? "ok" : "failed"}`);
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

export function writeUpstashConcurrencyProbeEvidence(
  doc: UpstashConcurrencyProbeEvidenceDocument,
  evidencePath: string = defaultUpstashConcurrencyProbeEvidencePath(),
): void {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    renderUpstashConcurrencyProbeEvidenceMarkdown(doc),
    "utf8",
  );
}

export function preserveOrInitializeUpstashConcurrencyProbeEvidence(
  evidencePath: string = defaultUpstashConcurrencyProbeEvidencePath(),
): {
  readonly overall: UpstashConcurrencyProbeEvidenceDocument["overall"];
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
  writeUpstashConcurrencyProbeEvidence(
    createNotTestedUpstashConcurrencyProbeEvidence(),
    evidencePath,
  );
  return { overall: "NOT_TESTED", action: "initialized" };
}

export function concurrencyProbeCannotFalsePass(
  doc: UpstashConcurrencyProbeEvidenceDocument,
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
    if (doc.duplicateDeliveryModel !== "two_distinct_stream_ids") {
      return {
        ok: false,
        message: "PASS requires two_distinct_stream_ids delivery model.",
      };
    }
    const scrubbed = scrubConcurrencyAttributionStages(doc.stages);
    if (scrubbed.length !== doc.stages.length) {
      return { ok: false, message: "Unknown stage fields rejected." };
    }
    for (const s of scrubbed) {
      if (!isConcurrencyAttributionStageId(s.stageId)) {
        return { ok: false, message: "Unknown stage id." };
      }
      if (!s.ok) {
        return { ok: false, message: "PASS cannot include failed stages." };
      }
    }
    if (
      doc.failureReasonId != null &&
      !isConcurrencyAttributionReasonId(doc.failureReasonId)
    ) {
      return { ok: false, message: "Unknown reason id." };
    }
    for (const s of scrubbed) {
      const privacy = assertUpstashEvidencePrivacyStructure({
        caseId: "concurrency.no.steal",
        status: s.ok ? "PASS" : "FAIL",
      });
      if (!privacy.ok) return privacy;
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Probe evidence PASS authority failed." };
  }
}
