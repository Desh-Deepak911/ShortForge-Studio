/**
 * Separate progressive diagnostic evidence — never overwrites official live evidence.
 * Only branded validated documents may be written.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  createNotTestedProgressiveEvidence,
  isValidatedNeonProgressiveEvidence,
  type NeonProgressiveDiagnosticDocument,
  type ValidatedNeonProgressiveEvidence,
  validateNeonProgressiveEvidence,
} from "./progressive-evidence-authority";

export type { NeonProgressiveDiagnosticDocument } from "./progressive-evidence-authority";

export const NEON_PROGRESSIVE_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_NEON_PROGRESSIVE_DIAGNOSTIC.md";

export function defaultNeonProgressiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, NEON_PROGRESSIVE_EVIDENCE_RELATIVE_PATH);
}

function escapeMarkdownToken(value: string): string {
  // Validated tokens never contain backticks/newlines; fail closed to "none".
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderNeonProgressiveEvidenceMarkdown(
  doc: NeonProgressiveDiagnosticDocument,
): string {
  const lines: string[] = [
    `# ${escapeMarkdownToken(doc.title)}`,
    "",
    `**Overall:** ${escapeMarkdownToken(doc.overall)}`,
    `**Eligibility:** ${escapeMarkdownToken(doc.eligibilityVerdict)}`,
    `**Started:** ${doc.startedAtIso != null ? escapeMarkdownToken(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? escapeMarkdownToken(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${escapeMarkdownToken(doc.cleanupStatus)}`,
    "",
    "## Progressive attribution",
    "",
    `- lastCompletedRequiredCase=\`${escapeMarkdownToken(doc.lastCompletedRequiredCase ?? "none")}\``,
    `- activeFailedCase=\`${escapeMarkdownToken(doc.activeFailedCase ?? "none")}\``,
    `- safeOperationStage=\`${escapeMarkdownToken(doc.safeOperationStage ?? "none")}\``,
    `- safeControlPlaneCode=\`${escapeMarkdownToken(doc.safeControlPlaneCode ?? "none")}\``,
    `- allowlistedSqlState=\`${escapeMarkdownToken(doc.allowlistedSqlState ?? "none")}\``,
    `- allowlistedConstraint=\`${escapeMarkdownToken(doc.allowlistedConstraint ?? "none")}\``,
    `- promotionResultKind=\`${escapeMarkdownToken(doc.promotionResultKind ?? "none")}\``,
    `- promotionReasonId=\`${escapeMarkdownToken(doc.promotionReasonId ?? "none")}\``,
    `- durableCanonicalRowExists=\`${
      doc.durableCanonicalRowExists == null
        ? "none"
        : doc.durableCanonicalRowExists
          ? "true"
          : "false"
    }\``,
    `- storeVersionDelta=\`${escapeMarkdownToken(doc.storeVersionDelta ?? "none")}\``,
    `- stageClassification=\`${escapeMarkdownToken(doc.stageClassification ?? "none")}\``,
    "",
    "## Schema fingerprint",
    "",
  ];
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
    for (let i = 0; i < doc.schemaFingerprint.migrationIds.length; i++) {
      const id = escapeMarkdownToken(doc.schemaFingerprint.migrationIds[i]!);
      const prefix = escapeMarkdownToken(
        doc.schemaFingerprint.checksumPrefixes[i] ?? "",
      );
      lines.push(`- \`${id}\` checksum_prefix=\`${prefix}\``);
    }
  }
  lines.push("", "## Cases", "");
  if (doc.cases.length === 0) {
    lines.push("- (none recorded)");
  } else {
    for (const c of doc.cases) {
      const fail =
        c.failureCategory != null
          ? ` category=${escapeMarkdownToken(c.failureCategory)}`
          : "";
      lines.push(
        `- \`${escapeMarkdownToken(c.caseId)}\`: ${escapeMarkdownToken(c.status)}${fail}`,
      );
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${escapeMarkdownToken(note)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseNeonProgressiveEvidenceMarkdown(
  markdown: string,
): NeonProgressiveDiagnosticDocument | null {
  try {
    const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
      markdown,
    )?.[1] as NeonProgressiveDiagnosticDocument["overall"] | undefined;
    if (overall == null) return null;
    return {
      ...createNotTestedProgressiveEvidence(),
      overall,
      eligibilityVerdict:
        /(?:\*\*Eligibility:\*\*|Eligibility:)\s*(.+)/.exec(markdown)?.[1]?.trim() ??
        createNotTestedProgressiveEvidence().eligibilityVerdict,
    };
  } catch {
    return null;
  }
}

/**
 * Gate-off must never overwrite a prior PASS/FAIL with NOT_TESTED.
 * Creates an initial NOT_TESTED file only when absent.
 */
export function preserveOrInitializeNeonProgressiveEvidence(options: {
  readonly evidencePath: string;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: NeonProgressiveDiagnosticDocument["overall"];
} {
  const notTested = createNotTestedProgressiveEvidence();
  const validated = validateNeonProgressiveEvidence({ document: notTested });
  if (!validated.ok) {
    return { action: "unchanged", overall: "NOT_TESTED" };
  }
  if (!existsSync(options.evidencePath)) {
    mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    writeFileSync(
      options.evidencePath,
      renderNeonProgressiveEvidenceMarkdown(validated.document),
      "utf8",
    );
    return { action: "initialized", overall: "NOT_TESTED" };
  }
  const existing = readFileSync(options.evidencePath, "utf8");
  const parsed = parseNeonProgressiveEvidenceMarkdown(existing);
  if (parsed?.overall === "PASS" || parsed?.overall === "FAIL") {
    return { action: "preserved", overall: parsed.overall };
  }
  return { action: "unchanged", overall: parsed?.overall ?? "NOT_TESTED" };
}

/**
 * Write only branded validated progressive evidence. No public bypass builder.
 */
export function writeNeonProgressiveEvidence(options: {
  readonly evidencePath: string;
  readonly document: ValidatedNeonProgressiveEvidence;
}): void {
  if (!isValidatedNeonProgressiveEvidence(options.document)) {
    throw new TypeError("progressive evidence write requires validated document");
  }
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderNeonProgressiveEvidenceMarkdown(options.document),
    "utf8",
  );
}
