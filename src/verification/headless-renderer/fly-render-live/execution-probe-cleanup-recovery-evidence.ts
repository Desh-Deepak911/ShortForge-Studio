/**
 * Execution-probe cleanup recovery evidence — never overwrites official probe evidence.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FlyRenderExecutionProbeCleanupRecoveryPreview } from "./execution-probe-cleanup-recovery";

export type FlyRenderExecutionProbeCleanupRecoveryEvidenceOverall =
  | "PASS"
  | "FAIL"
  | "PARTIAL"
  | "NOT_TESTED";

export type FlyRenderExecutionProbeCleanupRecoveryEvidenceDocument = {
  readonly title: string;
  readonly overall: FlyRenderExecutionProbeCleanupRecoveryEvidenceOverall;
  readonly failClass: string | null;
  readonly archivedLiveEvidenceSha256: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly preview: FlyRenderExecutionProbeCleanupRecoveryPreview | null;
  readonly globalNeonLeftoverCount: number | null;
  readonly mutationExecuted: boolean;
  readonly startedAtIso: string;
  readonly endedAtIso: string;
  readonly notes: readonly string[];
};

export function renderFlyRenderExecutionProbeCleanupRecoveryEvidenceMarkdown(
  doc: FlyRenderExecutionProbeCleanupRecoveryEvidenceDocument,
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
    lines.push("- owner_count=1");
    lines.push("- job_count=1");
    lines.push(`- object_count=${doc.preview.objectCount}`);
    lines.push(`- project_count=${doc.preview.projectCount}`);
    lines.push(`- r2_locator_count=${doc.preview.r2LocatorCount}`);
    lines.push(`- redis_stream_id_count=${doc.preview.redisStreamIdCount}`);
    lines.push(
      `- active_claim_present=${doc.preview.activeClaimPresent ? "true" : "false"}`,
    );
  }
  lines.push("", "## Global Neon leftovers (fep_owner probe scope)", "");
  lines.push(
    `- total_count=${doc.globalNeonLeftoverCount ?? "unavailable"}`,
  );
  lines.push("", "## Mutation", "");
  lines.push(`- executed=${doc.mutationExecuted ? "true" : "false"}`);
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function defaultFlyRenderExecutionProbeCleanupRecoveryEvidencePath(): string {
  return path.resolve(
    import.meta.dirname,
    "../../../../docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_EVIDENCE.md",
  );
}

export function writeFlyRenderExecutionProbeCleanupRecoveryEvidence(input: {
  readonly evidencePath: string;
  readonly document: FlyRenderExecutionProbeCleanupRecoveryEvidenceDocument;
}): void {
  mkdirSync(path.dirname(input.evidencePath), { recursive: true });
  writeFileSync(
    input.evidencePath,
    renderFlyRenderExecutionProbeCleanupRecoveryEvidenceMarkdown(input.document),
    "utf8",
  );
}
