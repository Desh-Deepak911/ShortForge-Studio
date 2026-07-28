/**
 * Cleanup recovery evidence — never overwrites official live evidence.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FlyVerifyCleanupRecoveryPreview } from "./cleanup-recovery";
import type {
  FlyVerifyCleanupRecoveryAbsenceVerification,
  FlyVerifyCleanupRecoveryMutationDispositions,
} from "./cleanup-recovery-mutation";

export type FlyVerifyCleanupRecoveryEvidenceOverall =
  | "PASS"
  | "FAIL"
  | "PARTIAL"
  | "NOT_TESTED";

export type FlyVerifyCleanupRecoveryEvidenceDocument = {
  readonly title: string;
  readonly overall: FlyVerifyCleanupRecoveryEvidenceOverall;
  readonly failClass: string | null;
  readonly archivedLiveEvidenceSha256: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly preview: FlyVerifyCleanupRecoveryPreview | null;
  readonly neonLeftoverCount: number | null;
  readonly mutationDispositions: FlyVerifyCleanupRecoveryMutationDispositions | null;
  readonly postMutationAbsence: FlyVerifyCleanupRecoveryAbsenceVerification | null;
  readonly startedAtIso: string;
  readonly endedAtIso: string;
  readonly notes: readonly string[];
};

export function renderFlyVerifyCleanupRecoveryEvidenceMarkdown(
  doc: FlyVerifyCleanupRecoveryEvidenceDocument,
): string {
  const lines = [
    `# ${doc.title}`,
    "",
    `**Overall:** ${doc.overall}`,
    `**Fail class:** ${doc.failClass ?? "none"}`,
    `**Archived live evidence SHA-256:** \`${doc.archivedLiveEvidenceSha256}\``,
    `**Window start ms:** ${doc.windowStartMs}`,
    `**Window end ms:** ${doc.windowEndMs}`,
    `**Started:** ${doc.startedAtIso}`,
    `**Ended:** ${doc.endedAtIso}`,
    "",
    "## Preview (safe counts only)",
    "",
  ];
  if (doc.preview == null) {
    lines.push("- none");
  } else {
    lines.push(`- owner_count=1`);
    lines.push(`- job_count=1`);
    lines.push(`- object_count=${doc.preview.objectCount}`);
    lines.push(`- project_count=${doc.preview.projectCount}`);
    lines.push(`- r2_locator_count=${doc.preview.r2LocatorCount}`);
    lines.push(`- redis_stream_id_count=${doc.preview.redisStreamIdCount}`);
  }
  lines.push("", "## Mutation dispositions", "");
  if (doc.mutationDispositions == null) {
    lines.push("- not_executed");
  } else {
    lines.push(`- redis=${doc.mutationDispositions.redis}`);
    lines.push(`- r2=${doc.mutationDispositions.r2}`);
    lines.push(`- neon=${doc.mutationDispositions.neon}`);
  }
  lines.push("", "## Post-mutation absence", "");
  if (doc.postMutationAbsence == null) {
    lines.push("- not_verified");
  } else {
    lines.push(`- neon_job_count=${doc.postMutationAbsence.neonJobCount}`);
    lines.push(
      `- neon_owned_object_count=${doc.postMutationAbsence.neonObjectCount}`,
    );
    lines.push(
      `- neon_project_ownership_count=${doc.postMutationAbsence.neonOwnershipCount}`,
    );
    lines.push(`- r2_exact_absent=${doc.postMutationAbsence.r2Absent}`);
    lines.push(
      `- redis_stream_absent=${doc.postMutationAbsence.redisStreamAbsent}`,
    );
    lines.push(
      `- redis_pending_absent=${doc.postMutationAbsence.redisPendingAbsent}`,
    );
  }
  lines.push("", "## Post-cleanup Neon leftovers", "");
  lines.push(
    doc.neonLeftoverCount == null
      ? "- not_checked"
      : `- total=${doc.neonLeftoverCount}`,
  );
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeFlyVerifyCleanupRecoveryEvidence(options: {
  readonly evidencePath: string;
  readonly document: FlyVerifyCleanupRecoveryEvidenceDocument;
}): void {
  mkdirSync(path.dirname(options.evidencePath), { recursive: true });
  writeFileSync(
    options.evidencePath,
    renderFlyVerifyCleanupRecoveryEvidenceMarkdown(options.document),
    "utf8",
  );
}

export function defaultFlyVerifyCleanupRecoveryEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, "docs/evidence/headless/current/HEADLESS_11E_FLY_VERIFY_LIVE_CLEANUP_RECOVERY_EVIDENCE.md");
}
