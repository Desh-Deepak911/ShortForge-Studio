/**
 * Sprint 11E Phase 2E.2D.8K.1 — structural privacy authority for hosted 4K
 * capacity evidence. Mirrors fly-render-live/evidence-privacy-authority.ts.
 */

import type { FlyRender4kCapacityEvidenceDocument } from "./capacity-4k-evidence";

const FORBIDDEN =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|registry\.fly\.io\/shortforge)/i;

export function assertFlyRender4kCapacityEvidencePrivacyStructure(
  doc: FlyRender4kCapacityEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const parts: string[] = [
    doc.title,
    doc.eligibilityVerdict,
    doc.startedAtIso ?? "",
    doc.endedAtIso ?? "",
    ...doc.notes,
    ...doc.cases.map(
      (c) => `${c.caseId}:${c.status}:${c.failureCategory ?? ""}`,
    ),
  ];
  if (doc.acceptedImageDigestSha256 != null) {
    parts.push(doc.acceptedImageDigestSha256);
  }
  if (doc.configAttribution != null) {
    const a = doc.configAttribution;
    parts.push(
      a.neon_status,
      a.r2_status,
      a.upstash_rest_status,
      a.upstash_tcp_status,
      a.env_name_status,
      a.app_name_status,
    );
  }
  for (const rec of doc.certificationRecords) {
    parts.push(rec.profileId, rec.certificationLevel, rec.audioMode);
  }
  const joined = parts.join("\n");
  if (FORBIDDEN.test(joined)) {
    return { ok: false, message: "Evidence privacy violation." };
  }
  return { ok: true };
}
