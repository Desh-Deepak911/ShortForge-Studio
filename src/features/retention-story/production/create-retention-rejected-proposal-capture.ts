/**
 * Certification/development-only rejected-proposal capture — Prompt 9.
 * Disabled by default. Never enabled in production. Writes only under
 * gitignored `.tmp/story-quality-rejected-proposals/`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RETENTION_REJECTED_PROPOSAL_CAPTURE_VERSION =
  "rejected-proposal-capture/1" as const;

export const RETENTION_REJECTED_PROPOSAL_CAPTURE_DIR = path.join(
  ".tmp",
  "story-quality-rejected-proposals",
);

export type RetentionNarrationTransformStage =
  | "parsed_model_proposal"
  | "before_normalization"
  | "after_normalization"
  | "after_hook_promotion"
  | "after_repair"
  | "after_mapping"
  | "claim_reference_normalization"
  | "support_rebinding"
  | "hook_metadata_derivation"
  | "payoff_metadata_derivation"
  | "acceptance_trace"
  | "json_ndjson_serialization"
  | "hook_promotion"
  | "targeted_rewrite"
  | "duration_compression"
  | "deterministic_rescue";

const METADATA_ONLY_STAGES = new Set<RetentionNarrationTransformStage>([
  "claim_reference_normalization",
  "support_rebinding",
  "hook_metadata_derivation",
  "payoff_metadata_derivation",
  "acceptance_trace",
  "json_ndjson_serialization",
]);

const TEXT_CHANGING_STAGES = new Set<RetentionNarrationTransformStage>([
  "hook_promotion",
  "targeted_rewrite",
  "duration_compression",
  "deterministic_rescue",
]);

export function isRetentionRejectedProposalCaptureEnabled(input?: {
  readonly captureRejectedProposals?: boolean | null;
}): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return input?.captureRejectedProposals === true;
}

export function digestRetentionNarration(text: string): string {
  return createHash("sha256").update(text.normalize("NFC"), "utf8").digest("hex");
}

export function metadataOnlyStageMayChangeNarration(
  stage: RetentionNarrationTransformStage,
): boolean {
  return !METADATA_ONLY_STAGES.has(stage);
}

export function textChangingStageRequiresProvenance(
  stage: RetentionNarrationTransformStage,
): boolean {
  return TEXT_CHANGING_STAGES.has(stage);
}

export interface RetentionNarrationTransformProvenance {
  readonly stage: RetentionNarrationTransformStage;
  readonly mayChangeNarration: boolean;
  readonly inputDigest: string;
  readonly outputDigest: string;
  readonly changed: boolean;
  readonly reason: string;
  readonly changedRegion: "none" | "opening" | "body" | "payoff" | "full";
  readonly authority: string;
}

export interface RetentionRejectedProposalCaptureRecord {
  readonly sensitiveLocalCertificationEvidence: true;
  readonly doNotCommit: true;
  readonly version: typeof RETENTION_REJECTED_PROPOSAL_CAPTURE_VERSION;
  readonly caseId: string;
  readonly capturedAt: string;
  readonly parsedModelProposal: unknown;
  readonly narrationBeforeNormalization: string | null;
  readonly modelMetadata: unknown;
  readonly narrationAfterNormalization: string | null;
  readonly narrationAfterHookPromotion: string | null;
  readonly narrationAfterRepair: string | null;
  readonly finalMappedNarration: string | null;
  readonly canonicalRejectionStage: string | null;
  readonly canonicalRejectionReason: string | null;
  readonly clauseSupport: unknown;
  readonly hookBodyPayoff: unknown;
  readonly internalContentIds: readonly string[];
  readonly transformationProvenance: readonly RetentionNarrationTransformProvenance[];
}

export interface RetentionRejectedProposalCaptureSession {
  readonly enabled: true;
  readonly caseId: string;
  recordStage(stage: RetentionNarrationTransformStage, value: unknown): void;
  getRecordedStage(stage: RetentionNarrationTransformStage): unknown;
  recordProvenance(entry: RetentionNarrationTransformProvenance): void;
  recordRejection(stage: string | null, reason: string | null): void;
  recordClauseSupport(value: unknown): void;
  recordHookBodyPayoff(value: unknown): void;
  recordInternalContentIds(ids: readonly string[]): void;
  flush(): string | null;
}

function sanitizeCaptureValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeCaptureValue);
  const record = value as Record<string, unknown>;
  const blocked = /api[_-]?key|authorization|cookie|set-cookie|env|header|stack|secret|token/i;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (blocked.test(key)) continue;
    out[key] = sanitizeCaptureValue(entry);
  }
  return out;
}

export function createRetentionRejectedProposalCaptureSession(input: {
  readonly caseId: string;
  readonly rootDir?: string;
}): RetentionRejectedProposalCaptureSession {
  const stages = new Map<RetentionNarrationTransformStage, unknown>();
  const provenance: RetentionNarrationTransformProvenance[] = [];
  let rejectionStage: string | null = null;
  let rejectionReason: string | null = null;
  let clauseSupport: unknown = null;
  let hookBodyPayoff: unknown = null;
  let internalContentIds: string[] = [];

  return {
    enabled: true,
    caseId: input.caseId,
    recordStage(stage, value) {
      stages.set(stage, sanitizeCaptureValue(value));
    },
    getRecordedStage(stage) {
      return stages.get(stage);
    },
    recordProvenance(entry) {
      provenance.push(Object.freeze({ ...entry }));
    },
    recordRejection(stage, reason) {
      rejectionStage = stage;
      rejectionReason = reason;
    },
    recordClauseSupport(value) {
      clauseSupport = sanitizeCaptureValue(value);
    },
    recordHookBodyPayoff(value) {
      hookBodyPayoff = sanitizeCaptureValue(value);
    },
    recordInternalContentIds(ids) {
      internalContentIds = [...ids];
    },
    flush() {
      const root = input.rootDir ?? process.cwd();
      const dir = path.join(root, RETENTION_REJECTED_PROPOSAL_CAPTURE_DIR);
      mkdirSync(dir, { recursive: true });
      const record: RetentionRejectedProposalCaptureRecord = {
        sensitiveLocalCertificationEvidence: true,
        doNotCommit: true,
        version: RETENTION_REJECTED_PROPOSAL_CAPTURE_VERSION,
        caseId: input.caseId,
        capturedAt: new Date().toISOString(),
        parsedModelProposal: stages.get("parsed_model_proposal") ?? null,
        narrationBeforeNormalization:
          typeof stages.get("before_normalization") === "string"
            ? (stages.get("before_normalization") as string)
            : null,
        modelMetadata: stages.get("parsed_model_proposal") ?? null,
        narrationAfterNormalization:
          typeof stages.get("after_normalization") === "string"
            ? (stages.get("after_normalization") as string)
            : null,
        narrationAfterHookPromotion:
          typeof stages.get("after_hook_promotion") === "string"
            ? (stages.get("after_hook_promotion") as string)
            : null,
        narrationAfterRepair:
          typeof stages.get("after_repair") === "string"
            ? (stages.get("after_repair") as string)
            : null,
        finalMappedNarration:
          typeof stages.get("after_mapping") === "string"
            ? (stages.get("after_mapping") as string)
            : null,
        canonicalRejectionStage: rejectionStage,
        canonicalRejectionReason: rejectionReason,
        clauseSupport,
        hookBodyPayoff,
        internalContentIds: Object.freeze([...internalContentIds]),
        transformationProvenance: Object.freeze([...provenance]),
      };
      const file = path.join(
        dir,
        `${input.caseId.replace(/[^a-z0-9_-]+/gi, "_")}.json`,
      );
      writeFileSync(
        file,
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8",
      );
      return file;
    },
  };
}

let boundCapture: RetentionRejectedProposalCaptureSession | null = null;

export function bindRetentionRejectedProposalCapture(
  session: RetentionRejectedProposalCaptureSession | null,
): void {
  boundCapture = session;
}

export function getBoundRetentionRejectedProposalCapture():
  | RetentionRejectedProposalCaptureSession
  | null {
  return boundCapture;
}

export function recordRetentionNarrationTransform(input: {
  readonly stage: RetentionNarrationTransformStage;
  readonly inputNarration: string;
  readonly outputNarration: string;
  readonly reason: string;
  readonly changedRegion?: RetentionNarrationTransformProvenance["changedRegion"];
  readonly authority: string;
}): RetentionNarrationTransformProvenance {
  const mayChange = metadataOnlyStageMayChangeNarration(input.stage)
    ? TEXT_CHANGING_STAGES.has(input.stage) ||
      input.stage === "parsed_model_proposal" ||
      input.stage === "before_normalization" ||
      input.stage === "after_normalization" ||
      input.stage === "after_hook_promotion" ||
      input.stage === "after_repair" ||
      input.stage === "after_mapping"
    : false;
  const provenance: RetentionNarrationTransformProvenance = Object.freeze({
    stage: input.stage,
    mayChangeNarration: TEXT_CHANGING_STAGES.has(input.stage),
    inputDigest: digestRetentionNarration(input.inputNarration),
    outputDigest: digestRetentionNarration(input.outputNarration),
    changed: input.inputNarration !== input.outputNarration,
    reason: input.reason,
    changedRegion: input.changedRegion ?? (input.inputNarration === input.outputNarration ? "none" : "full"),
    authority: input.authority,
  });
  void mayChange;
  boundCapture?.recordProvenance(provenance);
  if (TEXT_CHANGING_STAGES.has(input.stage) || input.stage.startsWith("after_")) {
    boundCapture?.recordStage(input.stage, input.outputNarration);
  }
  return provenance;
}
