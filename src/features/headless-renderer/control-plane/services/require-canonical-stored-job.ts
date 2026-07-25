/**
 * Fail-closed narrowing from discriminated stored records to canonical authority.
 */

import { cpFail, cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";
import type {
  HeadlessCanonicalStoredJobRecord,
  HeadlessStoredJobRecord,
} from "../types/stored-job-record";

export function requireCanonicalStoredJobRecord(
  record: HeadlessStoredJobRecord,
): HeadlessControlPlaneResult<HeadlessCanonicalStoredJobRecord> {
  if (record.stage !== "canonical") {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Provisional records cannot enter canonical render/dispatch paths.",
    );
  }
  return cpOk(record);
}
