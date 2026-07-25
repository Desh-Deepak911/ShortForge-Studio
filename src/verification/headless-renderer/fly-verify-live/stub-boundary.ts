/**
 * Refuse gate-on runs when default matrix runners are stubs.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { REQUIRED_FLY_VERIFY_LIVE_CASE_IDS } from "./required-cases";

export function assertDefaultFlyVerifyLiveRunnersAreNotStubs(options: {
  readonly matrixSourcePath?: string;
} = {}): { readonly ok: true } | { readonly ok: false; readonly reasonId: string } {
  try {
    const sourcePath =
      options.matrixSourcePath ??
      path.join(__dirname, "live-matrix.ts");
    const body = readFileSync(sourcePath, "utf8");
    if (/STUB_RUNNER_NOT_IMPLEMENTED/.test(body)) {
      return { ok: false, reasonId: "stub_runners_present" };
    }
    for (const caseId of REQUIRED_FLY_VERIFY_LIVE_CASE_IDS) {
      if (!body.includes(`"${caseId}"`)) {
        return { ok: false, reasonId: "missing_case_runner" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reasonId: "matrix_source_unreadable" };
  }
}
