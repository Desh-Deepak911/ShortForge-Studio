/**
 * Safe Upstash live-QA evidence document — no secrets, URLs, tokens, or provider text.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { HEADLESS_QUEUE_PROTOCOL_VERSION } from "@/features/headless-renderer/control-plane";

export type UpstashLiveCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type UpstashLiveCaseEvidence = {
  readonly caseId: string;
  readonly status: UpstashLiveCaseStatus;
  readonly failureCategory?: string;
  /** Allowlisted attribution stage (never free text / secrets). */
  readonly failureStage?: string;
  /** Allowlisted attribution reason only (never free text / secrets). */
  readonly failureReasonId?: string;
};

export type UpstashLiveEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly UpstashLiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
    readonly queueProtocolVersion: string;
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const UPSTASH_LIVE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md";

export function defaultUpstashLiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, UPSTASH_LIVE_EVIDENCE_RELATIVE_PATH);
}

export function checksumPrefix(sha256: string): string {
  return sha256.slice(0, 12);
}

export function createNotTestedUpstashEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or Upstash connection attempted.",
    "Prior PASS/FAIL evidence must not be overwritten by gate-off runs.",
  ],
): UpstashLiveEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2D.1 — Upstash dual-lease live QA evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict:
      "NOT ELIGIBLE — live Upstash dual-lease matrix has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    notes,
  };
}

export function renderUpstashLiveEvidenceMarkdown(
  doc: UpstashLiveEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${doc.title}`,
    "",
    `**Overall:** ${doc.overall}`,
    `**Eligibility:** ${doc.eligibilityVerdict}`,
    `**Started:** ${doc.startedAtIso ?? "n/a"}`,
    `**Ended:** ${doc.endedAtIso ?? "n/a"}`,
    `**Cleanup:** ${doc.cleanupStatus}`,
    `**Queue protocol:** \`${HEADLESS_QUEUE_PROTOCOL_VERSION}\``,
    "",
    "## Schema fingerprint",
    "",
  ];
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
    lines.push(
      `- queue_protocol=\`${doc.schemaFingerprint.queueProtocolVersion}\``,
    );
    for (let i = 0; i < doc.schemaFingerprint.migrationIds.length; i++) {
      const id = doc.schemaFingerprint.migrationIds[i]!;
      const prefix = doc.schemaFingerprint.checksumPrefixes[i] ?? "";
      lines.push(`- \`${id}\` checksum_prefix=\`${prefix}\``);
    }
  }
  lines.push("", "## Cases", "");
  if (doc.cases.length === 0) {
    lines.push("- (none recorded)");
  } else {
    for (const c of doc.cases) {
      const fail =
        c.failureCategory != null ? ` category=${c.failureCategory}` : "";
      const stage =
        c.failureStage != null ? ` stage=${c.failureStage}` : "";
      const reason =
        c.failureReasonId != null ? ` reasonId=${c.failureReasonId}` : "";
      lines.push(`- \`${c.caseId}\`: ${c.status}${fail}${stage}${reason}`);
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeUpstashLiveEvidence(
  doc: UpstashLiveEvidenceDocument,
  evidencePath: string = defaultUpstashLiveEvidencePath(),
): void {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, renderUpstashLiveEvidenceMarkdown(doc), "utf8");
}

/**
 * Gate-off: preserve prior PASS/FAIL/NOT_TESTED; initialize NOT_TESTED only when absent.
 * Never rewrite an existing evidence file on gate-off.
 */
export function preserveOrInitializeUpstashLiveEvidence(
  evidencePath: string = defaultUpstashLiveEvidencePath(),
): UpstashLiveEvidenceDocument {
  if (existsSync(evidencePath)) {
    const existing = readFileSync(evidencePath, "utf8");
    if (existing.includes("**Overall:** PASS")) {
      return {
        ...createNotTestedUpstashEvidence([
          "Gate off — preserved prior PASS evidence (not overwritten).",
        ]),
        overall: "PASS",
        eligibilityVerdict:
          "PRESERVED PRIOR PASS — gate off did not re-run.",
      };
    }
    if (existing.includes("**Overall:** FAIL")) {
      return {
        ...createNotTestedUpstashEvidence([
          "Gate off — preserved prior FAIL evidence (not overwritten).",
        ]),
        overall: "FAIL",
        eligibilityVerdict:
          "PRESERVED PRIOR FAIL — gate off did not re-run.",
      };
    }
    // Existing NOT_TESTED (or other) — leave file bytes unchanged.
    return createNotTestedUpstashEvidence([
      "Gate off — preserved existing evidence file (not overwritten).",
      "Authorized remote Upstash live pass was refused before provider contact while DEFAULT runners were stubs.",
    ]);
  }
  const doc = createNotTestedUpstashEvidence();
  writeUpstashLiveEvidence(doc, evidencePath);
  return doc;
}
