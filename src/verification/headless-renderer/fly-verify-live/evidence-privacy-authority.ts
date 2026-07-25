/**
 * Structural privacy authority for Fly verify live evidence.
 */

import type { FlyVerifyLiveEvidenceDocument } from "./evidence";

const FORBIDDEN =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|registry\.fly\.io\/shortforge)/i;

export function assertFlyVerifyLiveEvidencePrivacyStructure(
  doc: FlyVerifyLiveEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const parts: string[] = [
    doc.title,
    doc.eligibilityVerdict,
    doc.startedAtIso ?? "",
    doc.endedAtIso ?? "",
    ...doc.notes,
    ...doc.cases.map((c) => `${c.caseId}:${c.status}:${c.failureCategory ?? ""}`),
  ];
  if (doc.acceptedImageDigestSha256 != null) {
    parts.push(doc.acceptedImageDigestSha256);
  }
  const joined = parts.join("\n");
  if (FORBIDDEN.test(joined)) {
    return { ok: false, message: "Evidence privacy violation." };
  }
  return { ok: true };
}
