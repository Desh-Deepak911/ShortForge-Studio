/**
 * Safe R2 live-QA evidence document — no secrets, SQL, rows, URLs, or provider text.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export type R2LiveCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type R2LiveCaseEvidence = {
  readonly caseId: string;
  readonly status: R2LiveCaseStatus;
  readonly failureCategory?: string;
};

export type R2LiveEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly R2LiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const R2_LIVE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md";

export function defaultR2LiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, R2_LIVE_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedR2Evidence(
  notes: readonly string[] = [
    "Gate off — no Neon or R2 connection attempted.",
    "Prior PASS/FAIL evidence must not be overwritten by gate-off runs.",
  ],
): R2LiveEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2C.1A — R2 live QA evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict:
      "NOT ELIGIBLE — live R2 durability matrix has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    notes,
  };
}

export function renderR2LiveEvidenceMarkdown(
  doc: R2LiveEvidenceDocument,
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

export function parseR2LiveEvidenceMarkdown(
  markdown: string,
): R2LiveEvidenceDocument | null {
  try {
    const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
      markdown,
    )?.[1] as R2LiveEvidenceDocument["overall"] | undefined;
    if (overall == null) return null;
    return {
      ...createNotTestedR2Evidence(),
      overall,
      eligibilityVerdict:
        /(?:\*\*Eligibility:\*\*|Eligibility:)\s*(.+)/.exec(markdown)?.[1]?.trim() ??
        createNotTestedR2Evidence().eligibilityVerdict,
    };
  } catch {
    return null;
  }
}

/**
 * Gate-off must never overwrite a prior PASS/FAIL with NOT_TESTED.
 * Creates an initial NOT_TESTED file only when absent.
 */
export function preserveOrInitializeR2LiveEvidence(options: {
  readonly evidencePath: string;
  readonly notTestedDoc?: R2LiveEvidenceDocument;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: R2LiveEvidenceDocument["overall"];
} {
  const notTested = options.notTestedDoc ?? createNotTestedR2Evidence();
  if (!existsSync(options.evidencePath)) {
    mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    writeFileSync(
      options.evidencePath,
      renderR2LiveEvidenceMarkdown(notTested),
      "utf8",
    );
    return { action: "initialized", overall: "NOT_TESTED" };
  }
  const existing = readFileSync(options.evidencePath, "utf8");
  const parsed = parseR2LiveEvidenceMarkdown(existing);
  if (parsed?.overall === "PASS" || parsed?.overall === "FAIL") {
    return { action: "preserved", overall: parsed.overall };
  }
  return { action: "unchanged", overall: parsed?.overall ?? "NOT_TESTED" };
}

export function writeR2LiveEvidence(options: {
  readonly evidencePath: string;
  readonly document: R2LiveEvidenceDocument;
}): void {
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderR2LiveEvidenceMarkdown(options.document),
    "utf8",
  );
}

export function checksumPrefix(checksum: string): string {
  return checksum.slice(0, 12);
}
