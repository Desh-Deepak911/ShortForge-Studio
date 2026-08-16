/**
 * Build the next canonical job for a claim-token-gated progress persist.
 * Queued → rendering. Other active states keep their state and only refresh
 * advisory progress. Never invents a terminal success.
 */

import { applyHeadlessJobTransition } from "../../domain/headless-job-lifecycle";
import { isHeadlessTerminalState } from "../../domain/headless-render-constants";
import { parseHeadlessProgress } from "../../domain/headless-field-validators";
import { validateHeadlessRenderJobCoherence } from "../../domain/validate-headless-coherence";
import type { HeadlessAdvisoryProgress } from "../../domain/headless-render.types";
import type { HeadlessCanonicalStoredJobRecord } from "../types/stored-job-record";

export type ApplyClaimedProgressResult =
  | {
      readonly ok: true;
      readonly record: Omit<HeadlessCanonicalStoredJobRecord, "storeVersion"> & {
        readonly storeVersion: number;
      };
    }
  | { readonly ok: false; readonly message: string };

export function applyClaimedProgressWrite(input: {
  readonly current: HeadlessCanonicalStoredJobRecord;
  readonly progress: HeadlessAdvisoryProgress;
  readonly nowMs: number;
}): ApplyClaimedProgressResult {
  const current = input.current;
  if (isHeadlessTerminalState(current.canonicalJob.state)) {
    return { ok: false, message: "Terminal job cannot accept progress." };
  }

  const parsed = parseHeadlessProgress(input.progress);
  if (!parsed.ok) {
    return { ok: false, message: "Progress payload rejected." };
  }

  const updatedAtMs = Math.max(
    input.nowMs,
    current.canonicalJob.updatedAtMs + 1,
  );

  if (current.canonicalJob.state === "queued") {
    const next = applyHeadlessJobTransition({
      jobValue: current.canonicalJob,
      requestValue: current.canonicalRequest,
      toState: "rendering",
      attempt: current.canonicalJob.attempt,
      updatedAtMs,
      progress: parsed.progress,
    });
    if (!next.ok) {
      return { ok: false, message: "Queued progress transition rejected." };
    }
    return {
      ok: true,
      record: {
        ...current,
        storeVersion: current.storeVersion + 1,
        updatedAtMs: next.job.updatedAtMs,
        canonicalJob: next.job,
      },
    };
  }

  const candidate = {
    ...current.canonicalJob,
    progress: parsed.progress,
    updatedAtMs,
  };
  const coherent = validateHeadlessRenderJobCoherence(
    candidate,
    current.canonicalRequest,
  );
  if (!coherent.ok) {
    return { ok: false, message: "Progress coherence rejected." };
  }
  return {
    ok: true,
    record: {
      ...current,
      storeVersion: current.storeVersion + 1,
      updatedAtMs: coherent.job.updatedAtMs,
      canonicalJob: coherent.job,
    },
  };
}
