/**
 * Sprint 11E Phase 2E.2D.8K — hosted 4K capacity evidence document.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import type { FlyRender4kCapacityConfigAttribution } from "./capacity-4k-qa-gate";
import type { Hosted4kProcessTreeMemoryObservation } from "./hosted-4k-process-tree-memory-observer";
import type { Capacity4kHeadroomEvaluation } from "./capacity-4k-headroom-authority";
import type { Capacity4kProfileId } from "./capacity-4k-profile-audit";
import type { Capacity4kCertificationLevel } from "./capacity-4k-frame-plan-authority";

export type FlyRender4kCapacityCaseStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type FlyRender4kCapacityCaseEvidence = {
  readonly caseId: string;
  readonly status: FlyRender4kCapacityCaseStatus;
  readonly failureCategory?: string;
};

export type FlyRender4kCapacityCertificationRecord = {
  readonly profileId: Capacity4kProfileId;
  readonly certificationLevel: Capacity4kCertificationLevel;
  readonly audioMode: "silent" | "with-voice-and-music";
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly contentFrames: number;
  readonly renderedFrames: number;
  readonly paddingTailFrames: number;
  readonly shortFunctional4kSupport: boolean;
  readonly operationalDuration4kCapacity: boolean;
};

export type FlyRender4kCapacityEvidenceDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly cases: readonly FlyRender4kCapacityCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly acceptedImageDigestSha256: string | null;
  readonly flyRenderTopology: {
    readonly verifyCount: number;
    readonly renderCount: number;
    readonly renderCpuKind: string | null;
    readonly renderCpus: number | null;
    readonly renderMemoryMb: number | null;
    readonly observedRegion: string;
  } | null;
  readonly certificationRecords: readonly FlyRender4kCapacityCertificationRecord[];
  readonly processTreeObservation: Hosted4kProcessTreeMemoryObservation | null;
  readonly headroomEvaluation: Capacity4kHeadroomEvaluation | null;
  readonly fullCapacityClaimJustified: boolean;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly configAttribution: FlyRender4kCapacityConfigAttribution | null;
  readonly notes: readonly string[];
};

export const FLY_RENDER_4K_CAPACITY_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_4K_CAPACITY_EVIDENCE.md";

export const FLY_RENDER_4K_OPERATIONAL_CAPACITY_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_4K_OPERATIONAL_CAPACITY_EVIDENCE.md";

export function defaultFlyRender4kCapacityEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, FLY_RENDER_4K_CAPACITY_EVIDENCE_RELATIVE_PATH);
}

export function defaultFlyRender4kOperationalCapacityEvidencePath(
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, FLY_RENDER_4K_OPERATIONAL_CAPACITY_EVIDENCE_RELATIVE_PATH);
}

export function createNotTestedFlyRender4kCapacityEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon, R2, Upstash, or Fly connection attempted.",
    "Prior PASS/FAIL 4K capacity evidence must not be overwritten by gate-off runs.",
    "Short functional smoke does not infer operational-duration 4K capacity.",
    "Hosted 4K matrix is separate from HEADLESS_FLY_RENDER_QA render-live matrix.",
  ],
): FlyRender4kCapacityEvidenceDocument {
  return {
    title: "Sprint 11E Phase 2E.2D.8K — Hosted 4K capacity evidence",
    overall: "NOT_TESTED",
    eligibilityVerdict:
      "NOT ELIGIBLE — hosted 4K capacity matrix has not been executed.",
    startedAtIso: null,
    endedAtIso: null,
    cases: [],
    schemaFingerprint: null,
    acceptedImageDigestSha256: null,
    flyRenderTopology: null,
    certificationRecords: [],
    processTreeObservation: null,
    headroomEvaluation: null,
    fullCapacityClaimJustified: false,
    cleanupStatus: "not_run",
    configAttribution: null,
    notes,
  };
}

export function renderFlyRender4kCapacityEvidenceMarkdown(
  doc: FlyRender4kCapacityEvidenceDocument,
): string {
  const lines: string[] = [
    `# ${doc.title}`,
    "",
    `**Overall:** ${doc.overall}`,
    `**Eligibility:** ${doc.eligibilityVerdict}`,
    `**Started:** ${doc.startedAtIso ?? "n/a"}`,
    `**Ended:** ${doc.endedAtIso ?? "n/a"}`,
    `**Cleanup:** ${doc.cleanupStatus}`,
    `**Full capacity claim justified:** ${doc.fullCapacityClaimJustified}`,
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
  lines.push("", "## Fly render topology", "");
  if (doc.flyRenderTopology == null) {
    lines.push("- none");
  } else {
    const t = doc.flyRenderTopology;
    lines.push(
      `- verify=${t.verifyCount} render=${t.renderCount} region=${t.observedRegion}`,
    );
    lines.push(
      `- render_vm=${t.renderCpuKind}/${t.renderCpus}cpu/${t.renderMemoryMb}mb`,
    );
  }
  lines.push("", "## Accepted image digest", "");
  lines.push(
    doc.acceptedImageDigestSha256 == null
      ? "- none"
      : `- \`${doc.acceptedImageDigestSha256}\``,
  );
  lines.push("", "## Certification records", "");
  if (doc.certificationRecords.length === 0) {
    lines.push("- none");
  } else {
    for (const rec of doc.certificationRecords) {
      lines.push(
        `- profile=${rec.profileId} level=${rec.certificationLevel} audio_mode=${rec.audioMode}`,
      );
      lines.push(
        `  content_ms=${rec.contentDurationMs} render_ms=${rec.renderDurationMs}`,
      );
      lines.push(
        `  content_frames=${rec.contentFrames} rendered_frames=${rec.renderedFrames} tail=${rec.paddingTailFrames}`,
      );
      lines.push(
        `  short_functional=${rec.shortFunctional4kSupport} operational_capacity=${rec.operationalDuration4kCapacity}`,
      );
    }
  }
  lines.push("", "## Process-tree memory observation", "");
  if (doc.processTreeObservation == null) {
    lines.push("- none");
  } else {
    const o = doc.processTreeObservation;
    lines.push(`- sample_interval_ms=${o.sampleIntervalMs}`);
    lines.push(`- sample_count=${o.sampleCount}`);
    lines.push(`- peak_rss_bytes=${o.peakProcessTreeRssBytes ?? "n/a"}`);
    lines.push(`- summed_rss_bytes=${o.summedProcessTreeRssBytes ?? "n/a"}`);
    lines.push(`- sampling_complete=${o.samplingComplete}`);
    lines.push(`- oom_or_restart=${o.oomOrRestartObserved}`);
    lines.push(`- unavailable_reason=${o.unavailableReason ?? "none"}`);
    if (o.cadence != null) {
      const c = o.cadence;
      lines.push(`- cadence_requested_interval_ms=${c.requestedIntervalMs}`);
      lines.push(`- cadence_average_interval_ms=${c.averageIntervalMs ?? "n/a"}`);
      lines.push(`- cadence_maximum_gap_ms=${c.maximumObservedGapMs ?? "n/a"}`);
      lines.push(`- cadence_completeness_class=${c.samplingCompletenessClass}`);
      lines.push(`- cadence_worker_tree_class=${c.workerTreeCorrelationClass}`);
      lines.push(`- cadence_malformed_sample_count=${c.malformedSampleCount}`);
    }
  }
  lines.push("", "## Headroom evaluation", "");
  if (doc.headroomEvaluation == null) {
    lines.push("- none");
  } else {
    const h = doc.headroomEvaluation;
    lines.push(`- verdict=${h.verdict}`);
    lines.push(`- vm_ceiling_bytes=${h.vmPeakRssCeilingBytes}`);
    lines.push(`- headroom_bytes=${h.headroomBytes ?? "n/a"}`);
    lines.push(`- full_capacity_claim=${h.fullCapacityClaimJustified}`);
  }
  lines.push("", "## Cases", "");
  if (doc.cases.length === 0) {
    lines.push("- none");
  } else {
    for (const c of doc.cases) {
      lines.push(
        `- \`${c.caseId}\` status=${c.status}${
          c.failureCategory != null ? ` failure=${c.failureCategory}` : ""
        }`,
      );
    }
  }
  lines.push("", "## Notes", "");
  for (const note of doc.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeFlyRender4kCapacityEvidence(input: {
  readonly evidencePath: string;
  readonly document: FlyRender4kCapacityEvidenceDocument;
}): void {
  const dir = path.dirname(input.evidencePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    input.evidencePath,
    renderFlyRender4kCapacityEvidenceMarkdown(input.document),
    "utf8",
  );
}

export function preserveOrInitializeFlyRender4kCapacityEvidence(input: {
  readonly evidencePath: string;
}): FlyRender4kCapacityEvidenceDocument {
  if (existsSync(input.evidencePath)) {
    try {
      const raw = readFileSync(input.evidencePath, "utf8");
      if (raw.includes("**Overall:** PASS") || raw.includes("**Overall:** FAIL")) {
        return createNotTestedFlyRender4kCapacityEvidence([
          "Existing PASS/FAIL evidence preserved — gate-off run did not overwrite.",
        ]);
      }
    } catch {
      // fall through to initialize
    }
  }
  const doc = createNotTestedFlyRender4kCapacityEvidence();
  writeFlyRender4kCapacityEvidence({
    evidencePath: input.evidencePath,
    document: doc,
  });
  return doc;
}

export function createNotTestedFlyRender4kOperationalCapacityEvidence(
  notes: readonly string[] = [
    "Gate off — no Neon, R2, Upstash, or Fly connection attempted.",
    "Prior PASS/FAIL operational 4K evidence must not be overwritten by gate-off runs.",
    "Operational-duration certification is separate from short functional 4K evidence.",
    "Hosted 4K operational matrix is separate from HEADLESS_FLY_RENDER_QA render-live matrix.",
  ],
): FlyRender4kCapacityEvidenceDocument {
  return {
    ...createNotTestedFlyRender4kCapacityEvidence(notes),
    title: "Sprint 11E Phase 2E.2D.8L — Hosted 4K operational capacity evidence",
  };
}

export function preserveOrInitializeFlyRender4kOperationalCapacityEvidence(input: {
  readonly evidencePath: string;
}): FlyRender4kCapacityEvidenceDocument {
  if (existsSync(input.evidencePath)) {
    try {
      const raw = readFileSync(input.evidencePath, "utf8");
      if (raw.includes("**Overall:** PASS") || raw.includes("**Overall:** FAIL")) {
        return createNotTestedFlyRender4kOperationalCapacityEvidence([
          "Existing PASS/FAIL operational evidence preserved — gate-off run did not overwrite.",
        ]);
      }
    } catch {
      // fall through to initialize
    }
  }
  const doc = createNotTestedFlyRender4kOperationalCapacityEvidence();
  writeFlyRender4kCapacityEvidence({
    evidencePath: input.evidencePath,
    document: doc,
  });
  return doc;
}

export function checksumPrefix(checksum: string): string {
  return checksum.slice(0, 12);
}
