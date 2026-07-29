import path from "node:path";

import { sha256FileSync } from "@/verification/support/evidence-hash";

/**
 * Canonical preserved local 60s 4K MP4 evidence anchor.
 * Phase 3.2 REAL_LOCAL_PASS JSON — same artifact digest referenced by Phase 3.3A.1.
 */
export const HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL =
  "src/verification/headless-renderer/support/archives/phase32-4k-mp4-60s-evidence.json";

export const HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_SHA256 =
  "fd5a64d54c240d108b3f6825cc4ffdc93dc157a6f09d6dc100e31c7d7d7b9bf3";

export const HEADLESS_PRESERVED_4K_60S_ARTIFACT_DIGEST =
  "sha256:273e4f7f346c8ac58dd8a85b545e79989c8986e575eb0e25c2b630133d2d4167";

export const HEADLESS_PRESERVED_4K_60S_ARTIFACT_BYTE_LENGTH = 58_498_941;

export function resolveHeadlessPreserved4k60sEvidencePath(
  rootDir: string = process.cwd(),
): string {
  return path.join(rootDir, HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL);
}

export function assertHeadlessPreserved4k60sEvidenceArchive(
  rootDir: string = process.cwd(),
): void {
  const sha = sha256FileSync(
    HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_REL,
    rootDir,
  );
  if (sha !== HEADLESS_PRESERVED_4K_60S_EVIDENCE_ARCHIVE_SHA256) {
    throw new Error("preserved 4k 60s evidence archive SHA mismatch");
  }
}
