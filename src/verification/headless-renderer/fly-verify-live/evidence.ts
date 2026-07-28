/**
 * Hosted Fly verifier live QA evidence document.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import type { FlyVerifyLiveConfigAttribution } from "./qa-secret-contract";

export type FlyVerifyLiveCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type FlyVerifyLiveCaseEvidence = {
  readonly caseId: string;
  readonly status: FlyVerifyLiveCaseStatus;
  readonly failureCategory?: string;
};

export type FlyVerifyLiveEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly FlyVerifyLiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly acceptedImageDigestSha256: string | null;
  readonly flyVerifyTopology: {
    readonly verifyCount: number;
    readonly renderCount: number;
    readonly observedRegion: string;
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly configAttribution: FlyVerifyLiveConfigAttribution | null;
  readonly notes: readonly string[];
};

export const FLY_VERIFY_LIVE_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md";

export const FLY_VERIFY_FIRST_PASS_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_PHASE2E2D7A_FLY_STAGING_VERIFY_FIRST_PASS_EVIDENCE.md";

export function defaultFlyVerifyLiveEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, FLY_VERIFY_LIVE_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedFlyVerifyLiveEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon, R2, Upstash, or Fly connection attempted.",
    "Prior PASS/FAIL live evidence must not be overwritten by gate-off runs.",
    "Verify-first PASS evidence is a separate preserved document.",
    "Healthy verify Machine must not be stopped or redeployed by this harness.",
  ],
): FlyVerifyLiveEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict:
      "NOT ELIGIBLE — hosted Fly verifier live matrix has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    acceptedImageDigestSha256: null,
    flyVerifyTopology: null,
    cleanupStatus: "not_run",
    configAttribution: null,
    notes,
  };
}

export function renderFlyVerifyLiveEvidenceMarkdown(
  doc: FlyVerifyLiveEvidenceDocument,
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
    "## Configuration attribution",
    "",
  ];
  if (doc.configAttribution == null) {
    lines.push("- none");
  } else {
    const a = doc.configAttribution;
    lines.push(`- neon_status=${a.neon_status}`);
    lines.push(`- r2_status=${a.r2_status}`);
    lines.push(`- upstash_rest_status=${a.upstash_rest_status}`);
    lines.push(`- upstash_tcp_status=${a.upstash_tcp_status}`);
    lines.push(`- env_name_status=${a.env_name_status}`);
    lines.push(`- app_name_status=${a.app_name_status}`);
  }
  lines.push("", "## Schema fingerprint", "");
  if (doc.schemaFingerprint == null) {
    lines.push("- none");
  } else {
    for (let i = 0; i < doc.schemaFingerprint.migrationIds.length; i++) {
      const id = doc.schemaFingerprint.migrationIds[i]!;
      const prefix = doc.schemaFingerprint.checksumPrefixes[i] ?? "";
      lines.push(`- \`${id}\` checksum_prefix=\`${prefix}\``);
    }
  }
  lines.push("", "## Accepted verify Machine topology", "");
  if (doc.flyVerifyTopology == null) {
    lines.push("- none");
  } else {
    lines.push(
      `- verify=${doc.flyVerifyTopology.verifyCount} render=${doc.flyVerifyTopology.renderCount} region=${doc.flyVerifyTopology.observedRegion}`,
    );
  }
  lines.push("", "## Accepted image digest", "");
  lines.push(
    doc.acceptedImageDigestSha256 == null
      ? "- none"
      : `- \`${doc.acceptedImageDigestSha256}\``,
  );
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

export function parseFlyVerifyLiveEvidenceMarkdown(
  markdown: string,
): FlyVerifyLiveEvidenceDocument | null {
  try {
    const overall = /(?:\*\*Overall:\*\*|Overall:)\s*(PASS|FAIL|NOT_TESTED)/.exec(
      markdown,
    )?.[1] as FlyVerifyLiveEvidenceDocument["overall"] | undefined;
    if (overall == null) return null;
    return {
      ...createNotTestedFlyVerifyLiveEvidence(),
      overall,
      eligibilityVerdict:
        /(?:\*\*Eligibility:\*\*|Eligibility:)\s*(.+)/.exec(markdown)?.[1]?.trim() ??
        createNotTestedFlyVerifyLiveEvidence().eligibilityVerdict,
    };
  } catch {
    return null;
  }
}

export function preserveOrInitializeFlyVerifyLiveEvidence(options: {
  readonly evidencePath: string;
  readonly notTestedDoc?: FlyVerifyLiveEvidenceDocument;
}): {
  readonly action: "preserved" | "initialized" | "unchanged";
  readonly overall: FlyVerifyLiveEvidenceDocument["overall"];
} {
  const notTested = options.notTestedDoc ?? createNotTestedFlyVerifyLiveEvidence();
  if (!existsSync(options.evidencePath)) {
    mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    writeFileSync(
      options.evidencePath,
      renderFlyVerifyLiveEvidenceMarkdown(notTested),
      "utf8",
    );
    return { action: "initialized", overall: "NOT_TESTED" };
  }
  const existing = readFileSync(options.evidencePath, "utf8");
  const parsed = parseFlyVerifyLiveEvidenceMarkdown(existing);
  if (parsed?.overall === "PASS" || parsed?.overall === "FAIL") {
    return { action: "preserved", overall: parsed.overall };
  }
  return { action: "unchanged", overall: parsed?.overall ?? "NOT_TESTED" };
}

export function writeFlyVerifyLiveEvidence(options: {
  readonly evidencePath: string;
  readonly document: FlyVerifyLiveEvidenceDocument;
}): void {
  const normalized = path.normalize(options.evidencePath);
  if (
    normalized.endsWith(FLY_VERIFY_FIRST_PASS_EVIDENCE_RELATIVE_PATH) ||
    normalized.includes(
      `${path.sep}${FLY_VERIFY_FIRST_PASS_EVIDENCE_RELATIVE_PATH}`,
    )
  ) {
    throw new Error(
      "Fly verify live harness must never write verify-first PASS evidence path.",
    );
  }
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderFlyVerifyLiveEvidenceMarkdown(options.document),
    "utf8",
  );
}

export function checksumPrefix(checksum: string): string {
  return checksum.slice(0, 12);
}
