/**
 * Targeted progressive-prefix evidence — separate from full progressive / official live.
 * Does not claim exact-29 progressive PASS authority.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NeonLiveCaseEvidence } from "./evidence";
import type { ProgressiveSafeStage } from "./injection";

export const NEON_TARGETED_PROGRESSIVE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_NEON_PROGRESSIVE_TARGETED_2B2D2.md";

export function defaultNeonTargetedProgressiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, NEON_TARGETED_PROGRESSIVE_EVIDENCE_RELATIVE_PATH);
}

export type NeonTargetedProgressiveEvidenceDocument = {
  readonly title: string;
  readonly overall: "TARGETED_PASS" | "FAIL";
  readonly stopAfterCaseId: string;
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string;
  readonly endedAtIso: string;
  readonly lastCompletedRequiredCase: string | null;
  readonly activeFailedCase: string | null;
  readonly safeOperationStage: ProgressiveSafeStage | null;
  readonly safeControlPlaneCode: string | null;
  readonly allowlistedSqlState: string | null;
  readonly allowlistedConstraint: string | null;
  readonly cases: readonly NeonLiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderNeonTargetedProgressiveEvidenceMarkdown(
  doc: NeonTargetedProgressiveEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Stop after:** \`${esc(doc.stopAfterCaseId)}\``,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Started:** ${esc(doc.startedAtIso)}`,
    `**Ended:** ${esc(doc.endedAtIso)}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    "",
    "## Progressive attribution",
    "",
    `- lastCompletedRequiredCase=\`${esc(doc.lastCompletedRequiredCase ?? "none")}\``,
    `- activeFailedCase=\`${esc(doc.activeFailedCase ?? "none")}\``,
    `- safeOperationStage=\`${esc(doc.safeOperationStage ?? "none")}\``,
    `- safeControlPlaneCode=\`${esc(doc.safeControlPlaneCode ?? "none")}\``,
    `- allowlistedSqlState=\`${esc(doc.allowlistedSqlState ?? "none")}\``,
    `- allowlistedConstraint=\`${esc(doc.allowlistedConstraint ?? "none")}\``,
    "",
    "## Schema fingerprint",
    "",
  ];
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
    for (let i = 0; i < doc.schemaFingerprint.migrationIds.length; i++) {
      lines.push(
        `- \`${esc(doc.schemaFingerprint.migrationIds[i]!)}\` checksum_prefix=\`${esc(doc.schemaFingerprint.checksumPrefixes[i] ?? "")}\``,
      );
    }
  }
  lines.push("", "## Cases", "");
  for (const c of doc.cases) {
    const fail =
      c.failureCategory != null ? ` category=${esc(c.failureCategory)}` : "";
    lines.push(`- \`${esc(c.caseId)}\`: ${esc(c.status)}${fail}`);
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${esc(note)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeNeonTargetedProgressiveEvidence(options: {
  readonly evidencePath: string;
  readonly document: NeonTargetedProgressiveEvidenceDocument;
}): void {
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderNeonTargetedProgressiveEvidenceMarkdown(options.document),
    "utf8",
  );
}
