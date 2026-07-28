/**
 * Progressive Upstash diagnostic evidence — never overwrites official LIVE_EVIDENCE.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HEADLESS_QUEUE_PROTOCOL_VERSION } from "@/features/headless-renderer/control-plane";

import type { UpstashLiveCaseEvidence, UpstashLiveEvidenceDocument } from "./evidence";
import { createNotTestedUpstashEvidence } from "./evidence";

export const UPSTASH_PROGRESSIVE_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_UPSTASH_PROGRESSIVE_DIAGNOSTIC.md";

export const UPSTASH_PROGRESSIVE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2D.1D — Upstash progressive diagnostic evidence";

export function defaultUpstashProgressiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, UPSTASH_PROGRESSIVE_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedUpstashProgressiveEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or Upstash connection attempted.",
    "Prior PASS/FAIL progressive evidence must not be overwritten by gate-off runs.",
    "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.",
  ],
): UpstashLiveEvidenceDocument {
  return {
    ...createNotTestedUpstashEvidence(notes),
    title: UPSTASH_PROGRESSIVE_EVIDENCE_TITLE,
    eligibilityVerdict:
      "NOT ELIGIBLE — progressive Upstash dual-lease matrix has not been executed.",
  };
}

export function renderUpstashProgressiveEvidenceMarkdown(
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

export function writeUpstashProgressiveEvidence(
  doc: UpstashLiveEvidenceDocument,
  evidencePath: string = defaultUpstashProgressiveEvidencePath(),
): void {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    renderUpstashProgressiveEvidenceMarkdown(doc),
    "utf8",
  );
}

/**
 * Gate-off: preserve prior PASS/FAIL; initialize NOT_TESTED only when absent.
 * Never rewrite existing progressive evidence on gate-off.
 * Never touches official LIVE_EVIDENCE.
 */
export function preserveOrInitializeUpstashProgressiveEvidence(
  evidencePath: string = defaultUpstashProgressiveEvidencePath(),
): {
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
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
  writeUpstashProgressiveEvidence(
    createNotTestedUpstashProgressiveEvidence(),
    evidencePath,
  );
  return { overall: "NOT_TESTED", action: "initialized" };
}

/** Reject progressive false-PASS (prefix-FAIL / incomplete / cleanup bad). */
export function progressiveCannotFalsePass(input: {
  readonly cases: readonly UpstashLiveCaseEvidence[];
  readonly cleanupStatus: UpstashLiveEvidenceDocument["cleanupStatus"];
  readonly claimedOverall: "PASS" | "FAIL" | "NOT_TESTED";
}): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (input.claimedOverall !== "PASS") return { ok: true };
  const allPass =
    input.cases.length > 0 &&
    input.cases.every((c) => c.status === "PASS");
  if (!allPass) {
    return {
      ok: false,
      message: "Progressive PASS requires every recorded case to be PASS.",
    };
  }
  if (input.cleanupStatus !== "ok" && input.cleanupStatus !== "preserved") {
    return {
      ok: false,
      message: "Progressive PASS requires cleanup ok|preserved.",
    };
  }
  return { ok: true };
}
