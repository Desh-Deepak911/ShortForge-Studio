/**
 * Safe Neon live-QA evidence document — no secrets, SQL, rows, or provider text.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export type NeonLiveCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type NeonLiveCaseEvidence = {
  readonly caseId: string;
  readonly status: NeonLiveCaseStatus;
  readonly failureCategory?: string;
};

export type NeonLiveEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly NeonLiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const NEON_LIVE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_NEON_LIVE_EVIDENCE.md";

export function defaultNeonLiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, NEON_LIVE_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon connection attempted.",
    "Prior PASS/FAIL evidence must not be overwritten by gate-off runs.",
  ],
): NeonLiveEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2B.2B — Neon live QA evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict: "NOT ELIGIBLE — live Neon matrix has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    notes,
  };
}

export function renderNeonLiveEvidenceMarkdown(
  doc: NeonLiveEvidenceDocument,
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
    "## Schema fingerprint",
    "",
  ];
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
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
      lines.push(`- \`${c.caseId}\`: ${c.status}${fail}`);
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseNeonLiveEvidenceMarkdown(
  markdown: string,
): NeonLiveEvidenceDocument | null {
  try {
    const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
      markdown,
    )?.[1] as NeonLiveEvidenceDocument["overall"] | undefined;
    if (overall == null) return null;
    return {
      ...createNotTestedEvidence(),
      overall,
      eligibilityVerdict:
        /(?:\*\*Eligibility:\*\*|Eligibility:)\s*(.+)/.exec(markdown)?.[1]?.trim() ??
        createNotTestedEvidence().eligibilityVerdict,
    };
  } catch {
    return null;
  }
}

/**
 * Gate-off must never overwrite a prior PASS/FAIL with NOT_TESTED.
 * Creates an initial NOT_TESTED file only when absent.
 */
export function preserveOrInitializeNeonLiveEvidence(options: {
  readonly evidencePath: string;
  readonly notTestedDoc?: NeonLiveEvidenceDocument;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: NeonLiveEvidenceDocument["overall"];
} {
  const notTested = options.notTestedDoc ?? createNotTestedEvidence();
  if (!existsSync(options.evidencePath)) {
    mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    writeFileSync(
      options.evidencePath,
      renderNeonLiveEvidenceMarkdown(notTested),
      "utf8",
    );
    return { action: "initialized", overall: "NOT_TESTED" };
  }
  const existing = readFileSync(options.evidencePath, "utf8");
  const parsed = parseNeonLiveEvidenceMarkdown(existing);
  if (parsed?.overall === "PASS" || parsed?.overall === "FAIL") {
    return { action: "preserved", overall: parsed.overall };
  }
  return { action: "unchanged", overall: parsed?.overall ?? "NOT_TESTED" };
}

export function writeNeonLiveEvidence(options: {
  readonly evidencePath: string;
  readonly document: NeonLiveEvidenceDocument;
}): void {
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderNeonLiveEvidenceMarkdown(options.document),
    "utf8",
  );
}

export function checksumPrefix(checksum: string): string {
  return checksum.slice(0, 12);
}
