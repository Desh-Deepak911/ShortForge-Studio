/**
 * Targeted Neon promotion-probe evidence — never overwrites progressive / live docs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  emptyPromotionAttribution,
  sanitizePromotionAttribution,
  type HeadlessPromotionAttribution,
} from "@/features/headless-renderer/control-plane/testing";

import { emptyPromotionDiagnosticFields } from "./promotion-diagnostic";

export const NEON_PROMOTION_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_NEON_PROMOTION_PROBE_2B2D3.md";

export function defaultNeonPromotionProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, NEON_PROMOTION_PROBE_EVIDENCE_RELATIVE_PATH);
}

export type NeonPromotionProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly attribution: HeadlessPromotionAttribution;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly notes: readonly string[];
};

export const PROMOTION_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2B.2D.3 — Neon promotion probe" as const;

export const PROMOTION_PROBE_ELIGIBILITY = Object.freeze({
  PASS: "ELIGIBLE — promotion durably canonical and coherent; later matrix cases not run.",
  FAIL: "NOT ELIGIBLE — promotion probe failed or incomplete.",
  FAIL_CLEANUP: "NOT ELIGIBLE — promotion probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_NEON_QA_PROMOTION_PROBE=1 but DATABASE_URL is missing or invalid.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Neon promotion probe has not been executed.",
} as const);

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function createNotTestedPromotionProbeEvidence(): NeonPromotionProbeEvidenceDocument {
  return {
    title: PROMOTION_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: PROMOTION_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    attribution: emptyPromotionAttribution("promotion"),
    cleanupStatus: "not_run",
    schemaFingerprint: null,
    notes: [
      "Promotion probe evidence — does not overwrite progressive or official live evidence.",
      "Gate off — no Neon connection attempted.",
      "Prior PASS/FAIL promotion-probe evidence must not be overwritten by gate-off runs.",
    ],
  };
}

export function renderNeonPromotionProbeEvidenceMarkdown(
  doc: NeonPromotionProbeEvidenceDocument,
): string {
  const a = doc.attribution;
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Started:** ${doc.startedAtIso != null ? esc(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? esc(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    "",
    "## Promotion attribution",
    "",
    `- safeOperationStage=\`${esc(a.safeOperationStage)}\``,
    `- promotionResultKind=\`${esc(a.promotionResultKind ?? "none")}\``,
    `- safeControlPlaneCode=\`${esc(a.safeControlPlaneCode ?? "none")}\``,
    `- allowlistedSqlState=\`${esc(a.allowlistedSqlState ?? "none")}\``,
    `- allowlistedConstraint=\`${esc(a.allowlistedConstraint ?? "none")}\``,
    `- promotionReasonId=\`${esc(a.promotionReasonId ?? "none")}\``,
    `- durableCanonicalRowExists=\`${
      a.durableCanonicalRowExists == null
        ? "none"
        : a.durableCanonicalRowExists
          ? "true"
          : "false"
    }\``,
    `- storeVersionDelta=\`${esc(a.storeVersionDelta ?? "none")}\``,
    `- stageClassification=\`${esc(a.stageClassification ?? "none")}\``,
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
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${esc(note)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeNeonPromotionProbeEvidence(options: {
  readonly evidencePath: string;
  readonly document: NeonPromotionProbeEvidenceDocument;
}): void {
  const attribution =
    sanitizePromotionAttribution(options.document.attribution) ??
    emptyPromotionAttribution("promotion");
  const document: NeonPromotionProbeEvidenceDocument = {
    ...options.document,
    attribution,
  };
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderNeonPromotionProbeEvidenceMarkdown(document),
    "utf8",
  );
}

/**
 * Gate-off must never overwrite a prior PASS/FAIL with NOT_TESTED.
 */
export function preserveOrInitializeNeonPromotionProbeEvidence(options: {
  readonly evidencePath: string;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: NeonPromotionProbeEvidenceDocument["overall"];
} {
  if (existsSync(options.evidencePath)) {
    try {
      const text = readFileSync(options.evidencePath, "utf8");
      const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
        text,
      )?.[1] as NeonPromotionProbeEvidenceDocument["overall"] | undefined;
      if (overall === "PASS" || overall === "FAIL") {
        return { action: "preserved", overall };
      }
      if (overall === "NOT_TESTED") {
        return { action: "unchanged", overall: "NOT_TESTED" };
      }
    } catch {
      // fall through to initialize
    }
  }
  writeNeonPromotionProbeEvidence({
    evidencePath: options.evidencePath,
    document: createNotTestedPromotionProbeEvidence(),
  });
  return { action: "initialized", overall: "NOT_TESTED" };
}

/** Hostile unknown provider text must not enter evidence. */
export function assertPromotionProbeEvidenceSafe(serialized: string): boolean {
  if (serialized.includes("postgresql://")) return false;
  if (serialized.includes("DATABASE_URL")) return false;
  if (/password/i.test(serialized)) return false;
  if (/secret/i.test(serialized)) return false;
  // Arbitrary provider chatter must not appear as reason IDs.
  if (serialized.includes("relation does not exist")) return false;
  if (serialized.includes("syntax error")) return false;
  return true;
}

export function promotionProbeCannotFalsePass(options: {
  readonly overall: NeonPromotionProbeEvidenceDocument["overall"];
  readonly attribution: HeadlessPromotionAttribution;
  readonly cleanupStatus: NeonPromotionProbeEvidenceDocument["cleanupStatus"];
}): boolean {
  if (options.overall !== "PASS") return true;
  if (options.cleanupStatus !== "ok") return false;
  if (options.attribution.promotionResultKind !== "updated") return false;
  if (options.attribution.durableCanonicalRowExists !== true) return false;
  if (options.attribution.stageClassification !== "canonical") return false;
  if (options.attribution.storeVersionDelta !== "plus_one") return false;
  if (options.attribution.promotionReasonId != null) return false;
  return true;
}

export { emptyPromotionDiagnosticFields };
