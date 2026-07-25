/**
 * Safe R2 targeted-QA evidence document — separate from official live evidence.
 * NEVER writes docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export type R2TargetedCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type R2TargetedCaseEvidence = {
  readonly caseId: string;
  readonly status: R2TargetedCaseStatus;
  readonly failureCategory?: string;
};

export type R2TargetedEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly R2TargetedCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const R2_TARGETED_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_R2_TARGETED_EVIDENCE.md";

/** Official live path — targeted harness must never write here. */
export const R2_OFFICIAL_LIVE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md";

export function defaultR2TargetedEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, R2_TARGETED_EVIDENCE_RELATIVE_PATH);
}

export function defaultR2OfficialLiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, R2_OFFICIAL_LIVE_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedR2TargetedEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or R2 connection attempted.",
    "Prior PASS/FAIL targeted evidence must not be overwritten by gate-off runs.",
    "Official docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md is never written by this harness.",
  ],
): R2TargetedEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2C.1B — R2 targeted QA evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict:
      "NOT ELIGIBLE — targeted R2 minimum chain has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    notes,
  };
}

export function renderR2TargetedEvidenceMarkdown(
  doc: R2TargetedEvidenceDocument,
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

export function parseR2TargetedEvidenceMarkdown(
  markdown: string,
): R2TargetedEvidenceDocument | null {
  try {
    const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
      markdown,
    )?.[1] as R2TargetedEvidenceDocument["overall"] | undefined;
    if (overall == null) return null;
    return {
      ...createNotTestedR2TargetedEvidence(),
      overall,
      eligibilityVerdict:
        /(?:\*\*Eligibility:\*\*|Eligibility:)\s*(.+)/.exec(markdown)?.[1]?.trim() ??
        createNotTestedR2TargetedEvidence().eligibilityVerdict,
    };
  } catch {
    return null;
  }
}

/**
 * Gate-off must never overwrite a prior PASS/FAIL with NOT_TESTED.
 * Creates an initial NOT_TESTED file only when absent.
 */
export function preserveOrInitializeR2TargetedEvidence(options: {
  readonly evidencePath: string;
  readonly notTestedDoc?: R2TargetedEvidenceDocument;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: R2TargetedEvidenceDocument["overall"];
} {
  const notTested = options.notTestedDoc ?? createNotTestedR2TargetedEvidence();
  if (!existsSync(options.evidencePath)) {
    mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    writeFileSync(
      options.evidencePath,
      renderR2TargetedEvidenceMarkdown(notTested),
      "utf8",
    );
    return { action: "initialized", overall: "NOT_TESTED" };
  }
  const existing = readFileSync(options.evidencePath, "utf8");
  const parsed = parseR2TargetedEvidenceMarkdown(existing);
  if (parsed?.overall === "PASS" || parsed?.overall === "FAIL") {
    return { action: "preserved", overall: parsed.overall };
  }
  return { action: "unchanged", overall: parsed?.overall ?? "NOT_TESTED" };
}

export function writeR2TargetedEvidence(options: {
  readonly evidencePath: string;
  readonly document: R2TargetedEvidenceDocument;
}): void {
  const normalized = path.normalize(options.evidencePath);
  if (
    normalized.endsWith(R2_OFFICIAL_LIVE_EVIDENCE_RELATIVE_PATH) ||
    normalized.includes(`${path.sep}${R2_OFFICIAL_LIVE_EVIDENCE_RELATIVE_PATH}`)
  ) {
    throw new Error(
      "Targeted harness must never write official R2 live evidence path.",
    );
  }
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderR2TargetedEvidenceMarkdown(options.document),
    "utf8",
  );
}

export function checksumPrefix(checksum: string): string {
  return checksum.slice(0, 12);
}
