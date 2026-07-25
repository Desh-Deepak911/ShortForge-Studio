/**
 * Targeted owned-object finalize probe evidence — never overwrites official live matrix.
 * Sprint 11E Phase 2E.2D.8E — stops before reconciliation, promotion, outbox, or enqueue.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  isOwnedObjectFinalizeReasonId,
  isOwnedObjectFinalizeSubstageId,
  sanitizeOwnedObjectFinalizeAttributionSnapshot,
  type FlyRenderOwnedObjectFinalizeAttributionSnapshot,
} from "./owned-object-finalize-attribution";
import type { OwnedObjectFinalizeSubstageResult } from "./owned-object-finalize-chain";

export const FLY_RENDER_OWNED_OBJECT_FINALIZE_PROBE_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_FLY_RENDER_OWNED_OBJECT_FINALIZE_PROBE.md";

export function defaultFlyRenderOwnedObjectFinalizeProbeEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(
    cwd,
    FLY_RENDER_OWNED_OBJECT_FINALIZE_PROBE_EVIDENCE_RELATIVE_PATH,
  );
}

export type FlyRenderOwnedObjectFinalizeProbeEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly failureSubstage: string | null;
  readonly failureReasonId: string | null;
  readonly substages: readonly OwnedObjectFinalizeSubstageResult[];
  readonly finalizeAttribution: FlyRenderOwnedObjectFinalizeAttributionSnapshot | null;
  readonly finalizedObjectCount: number;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

export const OWNED_OBJECT_FINALIZE_PROBE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2E.2D.8E — Fly render owned-object finalize probe" as const;

export const OWNED_OBJECT_FINALIZE_PROBE_ELIGIBILITY = Object.freeze({
  PASS:
    "ELIGIBLE — targeted owned-object finalize probe passed upload/finalize coherence.",
  FAIL: "NOT ELIGIBLE — targeted owned-object finalize probe failed or incomplete.",
  FAIL_CLEANUP:
    "NOT ELIGIBLE — targeted owned-object finalize probe cleanup failed.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_FINALIZE_PROBE=1 but Neon/R2 config missing or invalid.",
  NOT_TESTED:
    "NOT ELIGIBLE — targeted Fly render owned-object finalize probe has not been executed.",
} as const);

export function createNotTestedFlyRenderOwnedObjectFinalizeProbeEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon or R2 connection attempted.",
    "Prior PASS/FAIL finalize probe evidence must not be overwritten by gate-off runs.",
    "Stops before reconciliation, promotion, outbox, or enqueue.",
    "Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
  ],
): FlyRenderOwnedObjectFinalizeProbeEvidenceDocument {
  return {
    title: OWNED_OBJECT_FINALIZE_PROBE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: OWNED_OBJECT_FINALIZE_PROBE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    failureSubstage: null,
    failureReasonId: null,
    substages: [],
    finalizeAttribution: null,
    finalizedObjectCount: 0,
    cleanupStatus: "not_run",
    notes,
  };
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderFlyRenderOwnedObjectFinalizeProbeEvidenceMarkdown(
  doc: FlyRenderOwnedObjectFinalizeProbeEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${esc(doc.title)}`,
    "",
    `**Overall:** ${esc(doc.overall)}`,
    `**Eligibility:** ${esc(doc.eligibilityVerdict)}`,
    `**Started:** ${doc.startedAtIso != null ? esc(doc.startedAtIso) : "n/a"}`,
    `**Ended:** ${doc.endedAtIso != null ? esc(doc.endedAtIso) : "n/a"}`,
    `**Cleanup:** ${esc(doc.cleanupStatus)}`,
    `**Finalized object count:** ${doc.finalizedObjectCount}`,
    `**Failure substage:** ${
      doc.failureSubstage != null ? `\`${esc(doc.failureSubstage)}\`` : "n/a"
    }`,
    `**Failure reasonId:** ${
      doc.failureReasonId != null ? `\`${esc(doc.failureReasonId)}\`` : "n/a"
    }`,
    "",
    "## Finalize attribution",
    "",
  ];
  if (doc.finalizeAttribution == null) {
    lines.push("- none");
  } else {
    const f = doc.finalizeAttribution;
    lines.push(`- finalize_substage=${f.finalizeSubstage}`);
    lines.push(`- finalize_object_purpose_class=${f.objectPurposeClass}`);
    lines.push(`- finalize_slot_key_class=${f.slotKeyClass}`);
    lines.push(`- finalize_slot_key_length_class=${f.slotKeyLengthClass}`);
    lines.push(`- finalize_store_class=${f.storeClass}`);
    lines.push(
      `- finalize_failure_boundary_class=${f.failureBoundaryClass ?? "none"}`,
    );
    lines.push(
      `- finalize_safe_control_plane_code=${f.safeControlPlaneCode ?? "none"}`,
    );
    lines.push(
      `- finalize_allowlisted_sqlstate=${f.allowlistedSqlState ?? "none"}`,
    );
    lines.push(
      `- finalize_allowlisted_constraint=${f.allowlistedConstraint ?? "none"}`,
    );
    lines.push(`- finalize_result_kind=${f.resultKind}`);
    lines.push(
      `- finalize_store_version_delta=${f.storeVersionDelta ?? "none"}`,
    );
    lines.push(
      `- finalize_durable_object_stage_class=${f.durableObjectStageClass ?? "none"}`,
    );
    lines.push(
      `- finalize_revision_outcome_class=${f.r2RevisionOutcomeClass ?? "none"}`,
    );
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

export function writeFlyRenderOwnedObjectFinalizeProbeEvidence(input: {
  readonly evidencePath?: string;
  readonly document: FlyRenderOwnedObjectFinalizeProbeEvidenceDocument;
}): void {
  const evidencePath =
    input.evidencePath ?? defaultFlyRenderOwnedObjectFinalizeProbeEvidencePath();
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    renderFlyRenderOwnedObjectFinalizeProbeEvidenceMarkdown(input.document),
    "utf8",
  );
}

export function preserveOrInitializeFlyRenderOwnedObjectFinalizeProbeEvidence(
  evidencePath: string = defaultFlyRenderOwnedObjectFinalizeProbeEvidencePath(),
): {
  readonly overall: FlyRenderOwnedObjectFinalizeProbeEvidenceDocument["overall"];
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
  writeFlyRenderOwnedObjectFinalizeProbeEvidence({
    evidencePath,
    document: createNotTestedFlyRenderOwnedObjectFinalizeProbeEvidence(),
  });
  return { overall: "NOT_TESTED", action: "initialized" };
}

export function ownedObjectFinalizeProbeCannotFalsePass(
  doc: FlyRenderOwnedObjectFinalizeProbeEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(doc)) {
      return { ok: false, message: "Hostile finalize probe evidence rejected." };
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
    if (doc.finalizedObjectCount < 1) {
      return { ok: false, message: "PASS requires finalized objects." };
    }
    for (const s of doc.substages) {
      if (!isOwnedObjectFinalizeSubstageId(s.substage)) {
        return { ok: false, message: "Unknown substage rejected." };
      }
      if (s.status === "failed") {
        return { ok: false, message: "PASS cannot include failed substages." };
      }
      if (
        s.reasonId != null &&
        !isOwnedObjectFinalizeReasonId(s.reasonId)
      ) {
        return { ok: false, message: "Unknown substage reason rejected." };
      }
    }
    if (
      sanitizeOwnedObjectFinalizeAttributionSnapshot(doc.finalizeAttribution) ==
      null
    ) {
      return { ok: false, message: "PASS requires valid finalize attribution." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Finalize probe evidence PASS authority failed." };
  }
}

export function assertOwnedObjectFinalizeProbeEvidenceSafe(
  markdown: string,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const forbidden = [
    /postgres(ql)?:\/\//i,
    /rediss?:\/\//i,
    /DATABASE_URL/i,
    /UPSTASH_/i,
    /\bR2_(ACCOUNT|ACCESS|SECRET|BUCKET|ENDPOINT|ALLOWED)/i,
    /sha256:[0-9a-f]{64}/i,
    /https:\/\/[^\s]+/i,
    /hslot:v2:/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(markdown)) {
      return {
        ok: false,
        message: "Finalize probe evidence contains forbidden content.",
      };
    }
  }
  return { ok: true };
}
