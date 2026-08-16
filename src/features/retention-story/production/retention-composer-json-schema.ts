/**
 * Production composer Structured Outputs schema.
 * OpenAI strict mode requires every properties key to appear in required.
 * Prompt 9: narration is the primary model output. Support IDs are an
 * optional annotation constrained to supplied allowed IDs.
 */

import { RETENTION_MAX_SEGMENT_CLAIM_REFS } from "../composition/retention-narration-candidate.constants";

export interface RetentionComposerJsonSchemaRequest {
  readonly eligibleClaims: readonly unknown[];
  readonly allowedContentIds?: readonly string[];
  readonly contentAuthority?: {
    readonly orderedEssentialUnits?: readonly {
      readonly contentUnitId?: string;
      readonly claimId?: string | null;
    }[];
    readonly orderedOptionalUnits?: readonly {
      readonly contentUnitId?: string;
      readonly claimId?: string | null;
    }[];
  };
}

/**
 * Frozen Prompt 5 composer schema. Optional properties under strict:true
 * are rejected by OpenAI Structured Outputs.
 */
export const RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES =
  Object.freeze({
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "narration",
      "usedContentIds",
      "omittedContentIds",
      "hookClaimRefs",
    ],
    properties: Object.freeze({
      title: Object.freeze({ type: "string" }),
      narration: Object.freeze({ type: "string" }),
      usedContentIds: Object.freeze({
        type: "array",
        items: Object.freeze({ type: "string" }),
      }),
      omittedContentIds: Object.freeze({
        type: "array",
        items: Object.freeze({ type: "string" }),
      }),
      hookOpening: Object.freeze({ type: "string" }),
      payoffClosing: Object.freeze({ type: "string" }),
      requiredUncertaintyMarkersUsed: Object.freeze({
        type: "array",
        items: Object.freeze({ type: "string" }),
      }),
      factualSupport: Object.freeze({
        type: "array",
        items: Object.freeze({
          type: "object",
          additionalProperties: false,
          required: ["claimId"],
          properties: Object.freeze({
            claimId: Object.freeze({ type: "string" }),
          }),
        }),
      }),
      hookClaimRefs: Object.freeze({
        type: "array",
        items: Object.freeze({ type: "string" }),
        maxItems: RETENTION_MAX_SEGMENT_CLAIM_REFS,
      }),
    }),
  });

function collectAllowedIds(request: RetentionComposerJsonSchemaRequest): string[] {
  const ids = new Set<string>();
  for (const claim of request.eligibleClaims) {
    if (claim == null || typeof claim !== "object") continue;
    const record = claim as { claimId?: unknown; contentUnitId?: unknown };
    if (typeof record.claimId === "string" && record.claimId) {
      ids.add(record.claimId);
    }
    if (typeof record.contentUnitId === "string" && record.contentUnitId) {
      ids.add(record.contentUnitId);
    }
  }
  const units = [
    ...(request.contentAuthority?.orderedEssentialUnits ?? []),
    ...(request.contentAuthority?.orderedOptionalUnits ?? []),
  ];
  for (const unit of units) {
    if (typeof unit.contentUnitId === "string" && unit.contentUnitId) {
      ids.add(unit.contentUnitId);
    }
    if (typeof unit.claimId === "string" && unit.claimId) {
      ids.add(unit.claimId);
    }
  }
  for (const id of request.allowedContentIds ?? []) {
    if (id) ids.add(id);
  }
  return [...ids];
}

export function buildRetentionComposerJsonSchema(
  request: RetentionComposerJsonSchemaRequest,
): Record<string, unknown> {
  const allowedIds = collectAllowedIds(request);
  if (allowedIds.length === 0) {
    return {
      type: "object",
      additionalProperties: false,
      required: ["title", "narration", "support"],
      properties: {
        title: { type: "string" },
        narration: { type: "string" },
        support: {
          type: "array",
          maxItems: 0,
          items: { type: "string" },
        },
      },
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "narration", "support"],
    properties: {
      title: { type: "string" },
      narration: { type: "string" },
      support: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sentenceIndex", "contentUnitId"],
          properties: {
            sentenceIndex: { type: "integer" },
            contentUnitId: { type: "string", enum: allowedIds },
          },
        },
      },
    },
  };
}
