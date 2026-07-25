/**
 * Targeted owned-object staging probe evidence — never overwrites official live matrix.
 * Sprint 11E Phase 2E.2D.8C.1 — stops before R2 upload, reconcile, promotion, or outbox.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  isOwnedObjectStagingReasonId,
  isOwnedObjectStagingSubstageId,
  sanitizeOwnedObjectStagingAttributionSnapshot,
  type FlyRenderOwnedObjectStagingAttributionSnapshot,
} from "./owned-object-staging-attribution";
import type { OwnedObjectStagingSubstageResult } from "./owned-object-staging-chain";

export const FLY_RENDER_OWNED_OBJECT_STAGING_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_FLY_RENDER_OWNED_OBJECT_STAGING_PROBE.md";

export function defaultFlyRenderOwnedObjectStagingProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(
    cwd,
    FLY_RENDER_OWNED_OBJECT_STAGING_PROBE_EVIDENCE_RELATIVE_PATH,
  );
}

export type FlyRenderOwnedObjectStagingProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly failureSubstage: string | null;
  readonly failureReasonId: string | null;
  readonly substages: readonly OwnedObjectStagingSubstageResult[];
  readonly stagingAttribution: FlyRenderOwnedObjectStagingAttributionSnapshot | null;
  readonly stagedRecordCount: number;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const OWNED_OBJECT_STAGING_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2E.2D.8C.1 — Fly render owned-object staging probe" as const;

export const OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY = Object.freeze({
  PASS:
    "ELIGIBLE — targeted owned-object staging probe passed durable record coherence.",
  FAIL: "NOT ELIGIBLE — targeted owned-object staging probe failed or incomplete.",
  FAIL_CLEANUP: "NOT ELIGIBLE — targeted owned-object staging probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_STAGING_PROBE=1 but Neon config missing or invalid.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Fly render owned-object staging probe has not been executed.",
} as const);

export function createNotTestedFlyRenderOwnedObjectStagingProbeEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon connection attempted.",
    "Prior PASS/FAIL staging probe evidence must not be overwritten by gate-off runs.",
    "Stops before R2 upload, reconciliation, promotion, outbox, or enqueue.",
    "Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
  ],
): FlyRenderOwnedObjectStagingProbeEvidenceDocument {
  return {
    title: OWNED_OBJECT_STAGING_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    failureSubstage: null,
    failureReasonId: null,
    substages: [],
    stagingAttribution: null,
    stagedRecordCount: 0,
    cleanupStatus: "not_run",
    notes,
  };
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderFlyRenderOwnedObjectStagingProbeEvidenceMarkdown(
  doc: FlyRenderOwnedObjectStagingProbeEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Started:** ${doc.startedAtIso != null ? esc(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? esc(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    `**Staged record count:** ${doc.stagedRecordCount}`,
    `**Failure substage:** ${
      doc.failureSubstage != null ? `\`${esc(doc.failureSubstage)}\`` : "n/a"
    }`,
    `**Failure reasonId:** ${
      doc.failureReasonId != null ? `\`${esc(doc.failureReasonId)}\`` : "n/a"
    }`,
    "",
    "## Staging attribution",
    "",
  ];
  if (doc.stagingAttribution == null) {
    lines.push("- none");
  } else {
    const s = doc.stagingAttribution;
    lines.push(`- staging_substage=${s.stagingSubstage}`);
    lines.push(`- staging_object_purpose_class=${s.objectPurposeClass}`);
    lines.push(`- staging_slot_key_class=${s.slotKeyClass}`);
    lines.push(`- staging_slot_key_length_class=${s.slotKeyLengthClass}`);
    lines.push(`- staging_store_class=${s.storeClass}`);
    lines.push(
      `- staging_safe_control_plane_code=${s.safeControlPlaneCode ?? "none"}`,
    );
    lines.push(
      `- staging_allowlisted_sqlstate=${s.allowlistedSqlState ?? "none"}`,
    );
    lines.push(
      `- staging_allowlisted_constraint=${s.allowlistedConstraint ?? "none"}`,
    );
    lines.push(`- staging_result_kind=${s.resultKind}`);
  }
  lines.push("", "## Substages", "");
  if (doc.substages.length === 0) {
    lines.push("- (none recorded)");
  } else {
    for (const s of doc.substages) {
      const reason = s.reasonId != null ? ` reasonId=${s.reasonId}` : "";
      lines.push(`- \`${s.substage}\`: ${s.status}${reason}`);
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${esc(note)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeFlyRenderOwnedObjectStagingProbeEvidence(input: {
  readonly evidencePath?: string;
  readonly document: FlyRenderOwnedObjectStagingProbeEvidenceDocument;
}): void {
  const evidencePath =
    input.evidencePath ?? defaultFlyRenderOwnedObjectStagingProbeEvidencePath();
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    renderFlyRenderOwnedObjectStagingProbeEvidenceMarkdown(input.document),
    "utf8",
  );
}

export function preserveOrInitializeFlyRenderOwnedObjectStagingProbeEvidence(
  evidencePath: string = defaultFlyRenderOwnedObjectStagingProbeEvidencePath(),
): {
  readonly overall: FlyRenderOwnedObjectStagingProbeEvidenceDocument["overall"];
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
  writeFlyRenderOwnedObjectStagingProbeEvidence({
    evidencePath,
    document: createNotTestedFlyRenderOwnedObjectStagingProbeEvidence(),
  });
  return { overall: "NOT_TESTED", action: "initialized" };
}

export function ownedObjectStagingProbeCannotFalsePass(
  doc: FlyRenderOwnedObjectStagingProbeEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(doc)) {
      return { ok: false, message: "Hostile staging probe evidence rejected." };
    }
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall is not PASS." };
    }
    if (doc.cleanupStatus !== "ok" && doc.cleanupStatus !== "preserved") {
      return { ok: false, message: "PASS requires cleanup ok|preserved." };
    }
    if (doc.failureSubstage != null || doc.failureReasonId != null) {
      return {
        ok: false,
        message: "PASS must not carry failure substage/reason.",
      };
    }
    if (doc.stagedRecordCount < 1) {
      return { ok: false, message: "PASS requires staged records." };
    }
    for (const s of doc.substages) {
      if (!isOwnedObjectStagingSubstageId(s.substage)) {
        return { ok: false, message: "Unknown substage rejected." };
      }
      if (s.status === "failed") {
        return { ok: false, message: "PASS cannot include failed substages." };
      }
      if (
        s.reasonId != null &&
        !isOwnedObjectStagingReasonId(s.reasonId)
      ) {
        return { ok: false, message: "Unknown substage reason rejected." };
      }
    }
    if (
      sanitizeOwnedObjectStagingAttributionSnapshot(doc.stagingAttribution) ==
      null
    ) {
      return { ok: false, message: "PASS requires valid staging attribution." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Staging probe evidence PASS authority failed." };
  }
}

export function assertOwnedObjectStagingProbeEvidenceSafe(
  markdown: string,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const forbidden = [
    /postgres(ql)?:\/\//i,
    /rediss?:\/\//i,
    /DATABASE_URL/i,
    /UPSTASH_/i,
    /R2_/i,
    /sha256:[0-9a-f]{64}/i,
    /https:\/\/[^\s]+/i,
    /hslot:v2:/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(markdown)) {
      return {
        ok: false,
        message: "Staging probe evidence contains forbidden content.",
      };
    }
  }
  return { ok: true };
}
